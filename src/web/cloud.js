import { backupReceipt, localPayload, mergeRemote } from '../shared/sync'

/* Accounts and sync for the web build.

   The library is local first: it lives in this browser and works with nobody
   signed in. An account adds one thing, a copy of the records (what you
   watched, where you stopped, history, favourites, theme) kept in Supabase, so
   another browser you sign in on picks them up. The video files never leave
   the computer they are on.

   It is the desktop app's Drive backup with a different place to keep the
   copy: one JSON document per person, merged by the same rules
   (src/shared/sync.js). There the document is a file in Google Drive; here it
   is a row in Postgres that only its owner can read (supabase/schema.sql).

   Configured by two build-time variables. Without them there are no accounts
   and nothing here loads. */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const cloudConfigured = !!(SUPABASE_URL && SUPABASE_KEY)
// Google sign-in needs its provider switched on in Supabase; off until it is.
const googleEnabled = import.meta.env.VITE_AUTH_GOOGLE === '1'

const TABLE = 'libraries'
const SYNC_DELAY = 20000 // a session's worth of 15s position saves is one upload

// Supabase's messages are written for developers. These are the ones a person
// actually runs into.
function friendly(error) {
  const msg = String((error && error.message) || error || '')
  if (/invalid login credentials/i.test(msg)) return 'That email and password don’t match.'
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first: the link is in your inbox.'
  if (/already registered|already been registered/i.test(msg)) return 'There is already an account with that email. Log in instead.'
  if (/password should be at least/i.test(msg)) return 'That password is too short.'
  if (/rate limit|too many|security purposes/i.test(msg)) return 'Too many tries. Wait a minute, then try again.'
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Couldn’t reach the server. Check your connection.'
  if (/could not find the table|does not exist|PGRST205/i.test(msg)) return 'Sync isn’t set up on the server yet.'
  if (/provider is not enabled/i.test(msg)) return 'Google sign-in isn’t switched on yet.'
  return msg || 'Something went wrong.'
}
const fail = (error) => ({ ok: false, error: friendly(error) })

// Where Supabase sends people back to: this page, without the query or hash.
const here = () => window.location.origin + window.location.pathname

/* `getStore`       the live library
   `syncView`       the part of it that is the person's own (no sample films)
   `resetRecords`   forget watch records, for when a different person signs in
   `changed`        the library changed: save it and tell the UI */
export function createCloud({ getStore, syncView, resetRecords, changed }) {
  const listeners = new Set()
  let client = null
  let user = null
  let ready = false // has the saved session been looked up yet
  let recovery = false // arrived from a password-reset email
  let syncing = null
  let timer = null

  const emit = () => listeners.forEach((cb) => cb(status()))
  function status() {
    const meta = (user && user.user_metadata) || {}
    const s = getStore().settings
    return {
      available: cloudConfigured,
      google: googleEnabled,
      ready,
      recovery,
      signedIn: !!user,
      email: user ? user.email : null,
      name: meta.full_name || meta.name || null,
      avatar: meta.avatar_url || meta.picture || null,
      syncing: !!syncing,
      lastSync: (user && s.lastSync) || null,
      lastBackup: (user && s.lastBackup) || null
    }
  }

  // Loaded on its own, so the page never waits on it and a build with no
  // accounts never downloads it.
  const loading = cloudConfigured
    ? import('@supabase/supabase-js').then(({ createClient }) => {
        client = createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        })
        client.auth.onAuthStateChange((event, session) => {
          const next = (session && session.user) || null
          const arrived = !!next && (!user || user.id !== next.id)
          user = next
          ready = true
          if (event === 'PASSWORD_RECOVERY') recovery = true
          if (!user) recovery = false
          emit()
          // Not from inside the callback: the client is still holding its lock.
          if (arrived) setTimeout(() => sync(), 0)
        })
        return client
      })
    : null
  if (loading)
    loading.catch((e) => {
      console.error('[cloud] could not load', e)
      ready = true
      emit()
    })

  /* Pull, merge, push. Merging first is what makes two browsers safe: neither
     uploads over the other without having folded it in. */
  function sync() {
    if (!client || !user) return Promise.resolve({ ok: false, error: 'Sign in first.' })
    if (syncing) return syncing
    clearTimeout(timer)
    const me = user.id
    syncing = (async () => {
      try {
        const store = getStore()
        /* This browser last synced as somebody else. Their records are not
           this person's to inherit, so start from the cloud copy alone. */
        if (store.settings.syncUser && store.settings.syncUser !== me) resetRecords()
        const { data: row, error: readError } = await client.from(TABLE).select('data').eq('user_id', me).maybeSingle()
        if (readError) return fail(readError)
        const merged = row ? mergeRemote(getStore(), row.data) : null
        const payload = localPayload(syncView())
        const { error: writeError } = await client
          .from(TABLE)
          .upsert({ user_id: me, data: payload, updated_at: new Date().toISOString() })
        if (writeError) return fail(writeError)
        const s = getStore().settings
        s.syncUser = me
        s.lastSync = Date.now()
        s.lastBackup = backupReceipt(payload)
        return { ok: true, merged }
      } catch (e) {
        return fail(e)
      } finally {
        syncing = null
        changed({ fromSync: true })
        emit()
      }
    })()
    emit()
    return syncing
  }

  return {
    available: cloudConfigured,
    status,
    onChange: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },

    signIn: async (email, password) => {
      try {
        const sb = await loading
        const { error } = await sb.auth.signInWithPassword({ email, password })
        return error ? fail(error) : { ok: true }
      } catch (e) {
        return fail(e)
      }
    },
    /* Whether a new account has to confirm its email is a setting on the
       Supabase project, so both answers are handled: signed in straight away,
       or told to go and click the link. */
    signUp: async (email, password) => {
      try {
        const sb = await loading
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: here() } })
        if (error) return fail(error)
        if (data.session) return { ok: true }
        // Supabase answers a taken email with a user that has no identities,
        // rather than saying so (it would tell a stranger who has an account).
        if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length)
          return fail('already registered')
        return { ok: true, confirm: true }
      } catch (e) {
        return fail(e)
      }
    },
    // Leaves the page for Google and comes back signed in.
    signInWithGoogle: async () => {
      try {
        const sb = await loading
        const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: here() } })
        return error ? fail(error) : { ok: true }
      } catch (e) {
        return fail(e)
      }
    },
    requestPasswordReset: async (email) => {
      try {
        const sb = await loading
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: here() })
        return error ? fail(error) : { ok: true }
      } catch (e) {
        return fail(e)
      }
    },
    // The second half of a reset: the email's link signed them in, now the new password.
    setPassword: async (password) => {
      try {
        const sb = await loading
        const { error } = await sb.auth.updateUser({ password })
        if (error) return fail(error)
        recovery = false
        emit()
        return { ok: true }
      } catch (e) {
        return fail(e)
      }
    },
    dismissRecovery: () => {
      recovery = false
      emit()
    },
    // The library stays in this browser; only the connection to the account goes.
    signOut: async () => {
      clearTimeout(timer)
      try {
        const sb = await loading
        if (syncing) await syncing
        await sb.auth.signOut()
      } catch {
        /* signed out locally either way */
      }
      user = null
      emit()
      return { ok: true }
    },
    sync,
    // Removes the copy kept in the cloud and signs out. The library in this
    // browser is untouched.
    deleteCloudCopy: async () => {
      if (!client || !user) return fail('Sign in first.')
      clearTimeout(timer)
      if (syncing) await syncing
      const { error } = await client.from(TABLE).delete().eq('user_id', user.id)
      if (error) return fail(error)
      const s = getStore().settings
      delete s.lastBackup
      delete s.lastSync
      delete s.syncUser
      // Signed out too: staying signed in would only upload it all again.
      await client.auth.signOut().catch(() => {})
      user = null
      changed({ fromSync: true })
      emit()
      return { ok: true }
    },

    // Called whenever the library changes; a quiet moment later, it goes up.
    schedule: () => {
      if (!client || !user) return
      clearTimeout(timer)
      timer = setTimeout(() => sync(), SYNC_DELAY)
    }
  }
}
