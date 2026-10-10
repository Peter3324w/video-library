import React, { useEffect, useState } from 'react'
import { applyTheme, nextAccentRecents, THEMES } from '../lib/util'
import { AccentPicker } from '../components/AccentPicker'
import { FoldersCard } from '../components/Folders'
import { BackupCard } from '../components/Backup'

const api = window.api

export function Settings() {
  const [settings, setSettings] = useState(null)
  useEffect(() => {
    api.getSettings().then(setSettings)
  }, [])
  // The sidebar's Theme menu changes the same setting from outside this page.
  useEffect(() => {
    const onTheme = (e) => setSettings((s) => (s ? { ...s, theme: e.detail } : s))
    window.addEventListener('vl-theme', onTheme)
    return () => window.removeEventListener('vl-theme', onTheme)
  }, [])
  const update = async (patch) => setSettings(await api.setSettings(patch))
  const pickTheme = (id) => {
    applyTheme(id)
    update({ theme: id })
  }
  const pickAccent = (hex) =>
    update({ accent: hex, accentRecents: nextAccentRecents(settings.accentRecents, hex) })

  if (!settings) return <div className="page" />
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="page-sub">How the library looks and which player it uses</p>
        </div>
      </header>
      <div className="settings-group">
        <div className="settings-group-title">Library</div>
        <FoldersCard />
      </div>
      <div className="settings-group">
        <div className="settings-group-title">Back up and sync</div>
        <BackupCard />
      </div>
      <div className="settings-group">
        <div className="settings-group-title">Appearance</div>
        <div className="settings-card">
          <div className="setting-row stack">
            <div>
              <div className="setting-title">Theme</div>
              <div className="page-sub">
                The ground the app is drawn on. Layout, spacing and type don’t move — only the
                colour underneath them.
              </div>
            </div>
            <div className="theme-picker">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={`btn-soft theme-swatch ${(settings.theme || 'midnight') === t.id ? 'on' : ''}`}
                  onClick={() => pickTheme(t.id)}
                >
                  <span className="theme-chip" style={{ background: t.dot }} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row stack">
            <div>
              <div className="setting-title">Accent</div>
              <div className="page-sub">
                The one colour on top of the ground — selected rows and primary buttons. Auto uses
                whatever the theme was drawn with.
              </div>
            </div>
            <AccentPicker
              value={settings.accent || null}
              recents={settings.accentRecents || []}
              onChange={pickAccent}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
