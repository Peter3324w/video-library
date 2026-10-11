import { store } from './store'
import { backupReceipt, localPayload as payloadOf, mergeRemote as mergeInto } from '../shared/sync'

/* What rides to Drive, and what a backup means when it comes back down. The
   rules are in src/shared/sync.js, shared with the web build; this binds them
   to the desktop's store. */
export const localPayload = () => payloadOf(store)
export const mergeRemote = (remote) => mergeInto(store, remote)
export { backupReceipt }
