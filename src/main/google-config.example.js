// ── One-time developer setup ──────────────────────────────────────────────
// Copy this file to `google-config.js` (same folder) and paste your own
// Google OAuth client credentials below.
//
// 1. Google Cloud Console → APIs & Services → Credentials
// 2. Create credentials → OAuth client ID → Application type: "Desktop app"
// 3. Enable the Google Drive API for the project.
// 4. Copy the Client ID + Client secret into the values below.
//
// These ship inside the app so every user just clicks "Connect Google Drive"
// (Google states the secret for Desktop OAuth clients is not confidential).
//
// `google-config.js` is git-ignored so real credentials stay out of the repo.
// Backup is optional — the library works fully offline without this file.
export const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com'
export const GOOGLE_CLIENT_SECRET = 'YOUR_CLIENT_SECRET'
