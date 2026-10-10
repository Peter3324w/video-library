# Video Library

An offline library for the movies and shows you download. It remembers where you stopped in every
episode, keeps a history of everything you've watched — on this PC or long since deleted — and
dresses the lot in real cover art.

**It is not a video player.** Playback stays in the player you already use (PotPlayer first); the
library watches it from the outside and keeps the records. A game-time tracker doesn't run your
games, it notices them; this does the same for what you watch.

Windows only — the player tracking talks to Windows windows. Electron + React, one JSON file for
data, no account, no server.

---

## What it does

**Library**
- Point it at folders (Downloads and Videos are added on first run) and every video in them becomes
  a **movie or a show with its poster, background, logo, description, genres and IMDb rating**
- Shows are grouped: a season folder of 24 files is one card, *"2 seasons · 26 episodes"*
- Rescans on every launch, and on demand — the Rescan button answers with what changed:
  *Found 106 videos · 2 new · 1 back · 3 gone*
- **Deleted titles become history, not holes.** A movie or show with nothing left on disk drops to a
  greyed *Not on this PC* shelf at the bottom of its library, cover and all, the way a game
  launcher keeps an uninstalled game's hours. Download it again into a library folder and it picks up exactly
  where you were

**Watching**
- Plays in PotPlayer, **resuming from where you stopped**
- Tracks position every 2 seconds while PotPlayer has a file open — whether the library launched it
  or you double-clicked it in Explorer
- **Finished = 85% watched** — the last stretch is credits
- **Up next**: Play on a show opens the episode you're partway through, else the one after the last
  you finished, else the first on disk

**Title page**
- Backdrop, logo, description, Resume / Start over / Favourite / Mark watched / Trailer / More info
  (cast, director, awards) / Open folder
- **Every episode of every season**, including ones you haven't downloaded (dimmed, *Not
  downloaded*), with names, summaries, stills, and *Watched 3 days ago* on the ones you have

**History**
- Every watch: when, how long, from where to where, finished or not — kept after the file is gone.
  Clicking a deleted one opens its title page rather than failing to play

**Home**
- A hero rotating through what you're watching and what just arrived, then
  Continue watching and Recently added. Only what you can actually play right now

**Backup**
- Optional **Google Drive backup** to a hidden app folder in *your own* Drive. Restores across PCs:
  a show you finished on the laptop is finished on the desktop

**Look**
- Five themes plus a custom accent colour

---

## Run

```powershell
cd C:\Projects\Video-library
npm install
npm run dev
```

From WSL, start it detached, so closing the WSL terminal doesn't take the app with it:

```bash
explorer.exe 'C:\Projects\Video-library\run-dev-hidden.vbs'
```

Dev runs keep their data in `%APPDATA%\video-library-dev\` — separate from an installed build, so
tinkering never touches the real library. Drive backup in dev writes `videolibrary-dev.json`, not
the real backup file, for the same reason.

---

## Why it is built this way

### Why not build a player

PotPlayer took fifteen years to get where it is: every codec, subtitle format, hardware decoder and
audio quirk. Rebuilding that would be the whole project and still be worse. What PotPlayer *doesn't*
have is memory: a library, covers, history that survives a deleted file. That part is small, and
it's this app.

### Why weight matters

The music player before this (Airwave, a fork of an existing app) turned out heavy next to Windows
Media Player. So the rule here: **the library stays out of the player's way.** Tracking is one
system call every 2 seconds into Windows itself — no helper process, no plugin inside PotPlayer, no
background service.

---

## Architecture

Think of it as a tree.

- **The roots** are three outside sources the app drinks from: **your folders** (what exists),
  **PotPlayer** (what you're watching), and **Cinemeta** (what it all *is*)
- **The trunk** is the main process (`src/main/`). It owns the one data file and is the only thing
  that touches disk, network, or PotPlayer
- **The branches** are the screens (`src/renderer/`): Home, the libraries, a title page, History,
  Settings. They never fetch or save anything themselves — they ask the trunk over IPC and redraw
  when it says the library changed
- **The leaves** are the art: covers and stills, which grow from the network once and are then kept
  on disk

```
src/main/
  index.js        window, IPC handlers, startup order
  store.js        the data file: load, atomic save, .bak fallback
  scan.js         walk library folders → file records; present / gone
  metadata.js     file name → title (Cinemeta), the art URLs, episode lists
  embedded.js     read a title written INSIDE an .mkv/.mp4
  tracker.js      poll the player → resume positions + history
  players/
    potplayer.js  the PotPlayer adapter (Windows messages via koffi)
  artcache.js     vlart:// — every picture saved to disk once
  drive.js        Google sign-in + upload/download
  sync.js         what a backup MEANS when it comes back (pure, tested)
src/preload/      the bridge: exactly which calls the UI may make
src/renderer/src/
  views/          Home, Library, Title, History, Favourites, Settings
  components/     cards, rows, hero, sidebar, folders, backup
  lib/media.js    "what's next", "what's on disk", progress maths
  styles/00–13    the shared design system
  styles/20-media this app's own rules
```

### Startup order (and why it's that order)

1. **Load the store**, falling back to `data.json.bak` before ever falling back to empty
2. **Sweep finished flags** if the "finished" threshold changed since last run — before the first
   paint, so nothing renders under the old rule
3. **Open the window** and show what's already known — instant, no network
4. **Start the metadata matcher, Drive, and the tracker**
5. **Scan folders, then sync Drive** — in that order, so a file the backup knows and this PC has
   folds into the local record *with its real path*, instead of flashing up as "Not on this PC"
   until the next scan

---

## How a file becomes a title — and why the covers are right

This is the part that makes or breaks the app: `Youjo_Senki_-_01_BD_1080p.mp4` has to become
*Saga of Tanya the Evil, Season 1, Episode 1*, with that show's poster. It happens in three steps.

### 1. Find a name to search for

`parseFileName` in `metadata.js` reads the file name:

| File name | Becomes |
|---|---|
| `The.Expanse.S02E07.720p.WEB.x265-GRP.mkv` | *The Expanse*, S2 E7 |
| `Inception.2010.1080p.BluRay.x264.mkv` | *Inception*, year 2010 |
| `AnimePahe_Youjo_Senki_-_01_BD_1080p.mp4` | *Youjo Senki*, E1 |
| `Youjo Senki II - 03.mkv` | *Youjo Senki*, **S2** E3 |
| `Youjo Senki Movie.mkv` | *Youjo Senki*, a **movie** |
| `[Frieren Season 1] [ Episode 10] [720p] [ @Tv_Series_ETY ].mp4` | *Frieren*, E10 |

The rules that matter:
- **Everything after the first quality tag is noise.** `1080p`, `BluRay`, `x265`, `WEB-DL` and
  friends mark where the title ends
- **Release-site prefixes are cut** (`AnimePahe`, `YTS`, `TGx`, `SubsPlease`…). This list exists
  because of a real bug: *"AnimePahe Youjo Senki"* matched *Symphogear GX* on the word "Senki"
- **`II`, `Season 2`, `2nd Season` become the season**, not part of the search. But a bare number
  doesn't: *Toy Story 3* is a title
- **"Movie" is removed from the search** — left in, *"Youjo Senki Movie"* finds *Scary Movie*
- **Game footage and YouTube downloads are rejected outright.** *"RESIDENT EVIL 9 … All Cutscenes"*
  once became the film *Resident Evil*
- **Clips under 15 MB, samples and trailers are skipped** by the scan before they get this far, and
  so are Windows' Captures / Screen Recordings folders

When the file name has nothing usable (scrambled names like `tfpdl-tno10172x.mkv`):
- **The title inside the file is read** (`embedded.js`) — release groups often write the real name
  into the MKV/MP4 metadata even when the file name is junk. That file says *"The.Night.Of.S01E01"*.
  It reads a few KB from the file; no ffprobe, no decoding. Adverts stamped in there ("Download
  movies on …") are ignored
- **Then the folder name**, up to two levels up — skipping folders that say nothing (`s1`, `Season
  2`, `Downloads`) and **never climbing past a library folder**. (Without that limit, a file
  sitting in `C:\Users\peter` was matched to *Peter Pan*.)

And when nothing has a real word in it at all, the file stays **unmatched rather than wrong**.

### 2. Search Cinemeta

[Cinemeta](https://v3-cinemeta.strem.io) is Stremio's public catalogue of movies and shows. It
needs **no account and no API key**, so neither does this app. A search returns
candidates, each with an **IMDb id** (`tt26545992`).

Picking the right candidate:
- **The expected type first.** A file with an episode number searches *series* before *movie*
- **The year wins** when the file name had one — *Dune (1984)* vs *Dune (2021)*
- **Then an exact name match**, then the top result
- **On a miss, drop the first word and retry** (twice at most) — catches a leftover prefix the list
  doesn't know yet
- **One search per name per run.** A season folder is 24 files with the same query; that's one
  request against a free service, not 24. Files are matched one at a time for the same reason

### 3. The IMDb id is the whole trick

Once a file has an IMDb id, the art isn't *searched for* — it's **looked up by that id**, from
metahub, Stremio's image service:

```
https://images.metahub.space/poster/medium/tt26545992/img
https://images.metahub.space/background/large/tt26545992/img
https://images.metahub.space/logo/medium/tt26545992/img
```

That's why the covers are accurate: **the poster belongs to the exact title the file matched**, not
to whatever an image search thought looked similar. Episode names, summaries and stills come the
same way, from the show's full record on Cinemeta (stills are
`episodes.metahub.space/<imdb id>/<season>/<episode>/w780.jpg`, which redirects to TMDB's image
CDN).

The honest corollary: **a wrong match means a wrong cover.** The art is never the weak link; the
match is. That's why so much of `metadata.js` is about getting the *name* right, and why a "Fix
match" button is on the list below.

### When the matcher improves

Titles the app matched on its own are marked `auto: true`. Bumping `MATCHER_VERSION` unlinks every
auto match and redoes it with the new rules on next launch. A title set by hand (`auto: false`, which
Fix match will write) is never touched.

---

## Tracking PotPlayer

PotPlayer is closed-source freeware with no official API. But it answers **Windows messages** sent
to its window, which was verified by probing it directly:

| `SendMessage(hwnd, WM_USER, code, 0)` | Returns |
|---|---|
| `0x5006` | status: `-1` stopped, `1` paused, `2` playing |
| `0x5002` | duration, ms |
| `0x5004` | position, ms |

The **file name** comes from the window title, `<file> - PotPlayer`. That has no folder — which is
why the folder scan matters: the scan knows every file's full path, and the tracker finds the file
by name.

The calls go through [koffi](https://koffi.dev/), a prebuilt FFI, straight into `user32.dll`. No
compiler, no helper process.

### What counts as a watch

`tracker.js`, polling every 2 seconds:
- A **watch** runs from a file appearing in PotPlayer's title to it leaving — window closed, next
  episode in the playlist, or stopped
- **Only playing time counts.** Paused overnight is not an eight-hour watch, and a long gap between
  polls (the laptop slept) is capped, not counted
- **Under 10 seconds is a peek**, not a watch — it updates the position but doesn't write history
- **Position is saved every 15 seconds**, so a crash loses at most 15 seconds
- **Quitting mid-episode** still records where you were

### Finished means 85%

Past 85% of the duration, the credits are rolling. One constant (`DONE_FRACTION`) drives the
*finished* flag, Up next, and History's label.

Changing that number has a catch: positions already saved were judged by the old rule. So a
version stamp (`DONE_VERSION`) triggers a **one-time sweep** of stored positions. The sweep **only
ever marks things finished, never un-finished** — because *Mark watched* sets the flag without
moving the position, and recomputing from scratch would wipe every episode you marked by hand.

### Resume

Play launches `PotPlayerMini64.exe "<path>" /seek=hh:mm:ss`. A finished file starts from the top;
*Start over* always does.

---

## Data model

One file, `data.json` in the app's data folder. Written **atomically** (write a temp file, flush to
disk, rename over the old one) with a `.bak` of the last good copy, and retried when Windows
Defender briefly locks the file, which otherwise loses saves silently.

Three lists, and **the split is the point**:

| List | Is | Keyed by | Holds |
|---|---|---|---|
| `titles` | what a thing **is** | IMDb id | name, year, art, genres, episode list, favourite |
| `files` | what's **on disk** | file name | path, season/episode, **resume position**, finished, present |
| `history` | what you **watched** | its own id | when, how long, from → to, finished |

Because history points at the *title*, deleting the file can't delete the fact you watched it.

### Present, gone, and back

Each scan:
- A file found on disk is `present`. One that was gone and is back gets its old record — position,
  finished flag, history — reconnected automatically
- A known file **not found** is checked on disk; if it's gone it's marked `present: false` with
  `missingAt`, the time it went
- A file you **never watched**, deleted from a library folder, is simply forgotten — it was
  inventory, not history
- A title is kept while anything points at it: a file, a history entry, or your favourite

The libraries then split on that: titles with a file on disk in the grid, titles with none on the
*Not on this PC* shelf.

---

## Art, and the disk cache

Every picture loads through a small custom protocol, `vlart://`, handled in `artcache.js`:

1. The page asks for `vlart://art/?u=<the real image URL>`
2. If a copy is on disk (`art-cache/<sha1 of the URL>.webp`), it's served **straight from disk** —
   the network isn't touched
3. Otherwise it's downloaded (up to 3 tries), saved, then served

Why it exists: the development machine is on a phone hotspot behind carrier NAT, which
intermittently can't reach some CDN addresses — TMDB's image servers among them. Pages came up with
black boxes where stills should be. Now a picture has to load **once, ever**.

Details that matter:
- **Only a successful download is saved.** An unaired episode's still is a real 404 today and a
  real picture next week, so it's asked for again next time
- **Ten cards of the same poster are one download** — concurrent requests share it
- On the page, the `Art` component draws over a **placeholder** (gradient + initials, or the episode
  number) and fades in only once loaded, so a slow or failed picture is never a black box or a
  broken-image icon

---

## Google Drive backup

The backup lives in Drive's **hidden app-data folder** — the app can only see its own file there,
not the rest of your Drive.

- `drive.js` owns the token and the upload/download
- `sync.js` owns **what a merge means**. It touches no network, so it can be tested on its own:
  `node scripts/test-sync.mjs` runs 18 cases

The hard part: **a backup from another PC knows none of this PC's internal ids.** So things match
on what's the same everywhere:
- titles on their **IMDb id**
- files on their **file name** (the same thing PotPlayer's title gives the tracker)
- history entries on their own id, and are **unioned**, never merged away

Remote ids are remapped on the way in, or history would point at files this library never had.

Merge rules:
- **Resume position: whichever PC watched it last.** Not the furthest — the furthest would drag a
  rewatch back into the credits
- **Finished only ever turns on**
- **Only files with watch state are uploaded.** A file merely sitting on disk is inventory; the
  other PC finds its own by scanning
- **Paths and library folders never sync** — they're absolute paths on one machine's drives. A file
  that only exists in the backup arrives with no path, as *Not on this PC*

`src/main/google-config.js` holds the OAuth keys and is gitignored;
`google-config.example.js` shows its shape.

---

## Development

### Toolchain gotchas, learned the hard way

- **Build through Windows npm.** `node_modules` is a Windows install, so from WSL run
  `cmd.exe /c "cd /d C:\Projects\Video-library && npm.cmd run build"`. WSL's own npm
  fails: Rollup ships a native binary per platform and only the Windows one is installed
- **Install scripts don't run on this machine** (npm's allow-scripts). Electron's binary therefore
  never downloads; copy `node_modules/electron/dist` and `path.txt` from another project on the
  same Electron version (33.4.11), or download the zip from a mirror and extract it there. koffi is fine — its binaries are prebuilt and don't need the script
- **Restarting the dev app from a script:** kill processes by **name** (`electron.exe`, `node.exe`,
  `cmd.exe`) *and* command line. Filtering by command line alone also kills the PowerShell running
  the kill
- **Launch with `run-dev-hidden.vbs`, not PowerShell's `Start-Process` from WSL** — the latter ties
  the app to the WSL session, and closing the terminal closes the app
- **Never `git checkout` files while the dev server runs.** Hot reload silently drops stylesheets.
  Merge with `git fetch . dev:main` instead of switching branches

### Packaging

```bash
cmd.exe /c "cd /d C:\Projects\Video-library && npm.cmd run dist"
```

Produces `release/Video Library Setup 0.1.0.exe` (~81 MB): a per-user install with Start Menu and
desktop shortcuts, a choice of folder, and an uninstaller. The installed app keeps its data in
`%APPDATA%\Video Library`, apart from dev's.

- **The icon** is `build/icon.svg`. `build/icon.ico` (16–256px) and `build/icon.png` (512px) are
  rendered from it; the in-app mark (`AppMark` in `common.jsx`) is the same drawing. `build/` is
  electron-builder's resources folder, so it is committed, not ignored
- **Packaging reuses the Electron in `node_modules`** (`electronDist`) instead of downloading one.
  If NSIS or 7zip ever need fetching and stall, set `ELECTRON_BUILDER_BINARIES_MIRROR` to
  `https://registry.npmmirror.com/-/binary/electron-builder-binaries/`
- **koffi's Windows addon is unpacked from the asar automatically**; Windows can't load a DLL from
  inside an archive. It lands in `resources/app.asar.unpacked/`
- **Only `koffi` is a runtime dependency.** React and the icon set are bundled into the renderer
  at build time, so they're dev dependencies; listing them as runtime deps shipped ~2,000 unused
  icon files
- **`productName` moves the default data folder.** Dev's folder is therefore named outright in
  `index.js`, or setting the installer's name would have put dev on an empty library
- Unsigned, so Windows SmartScreen warns on first run: *More info → Run anyway*

### Branches

- `main` — the reviewed line
- `dev` — where work lands, every change pushed

CI (`.github/workflows/ci.yml`) builds every push.

### Design

`src/renderer/src/styles/00–13` are the shared design system — tokens, themes, layout and
components — and `lib/util.js` carries the themes and accent picker. This app's own rules live in
`20-media.css`, so the shared partials stay untouched and can be updated as a block.

---

## Not built yet

- **Fix match** — correct a title the matcher got wrong, or pick one for an unmatched file
- **Ratings and reviews**, and the **Favourites** page (ranked or unranked; name still open)
- **Anime and Cartoons** libraries — the sidebar list is built for them; matching needs a way to tell
  them from TV
- **More players** — mpv (JSON IPC) is the solid fallback if a PotPlayer update breaks the
  messages; MPC-HC and VLC have web interfaces
- **Trending / recommendations** on Home

Untested on real use: **resume via `/seek=`**, and **Drive sign-in end to end** (the merge logic is
tested; the Google consent screen needs a person to click through).

The original scope is in [`docs/PLAN.md`](docs/PLAN.md).

---

## Credits

Metadata from [Cinemeta](https://v3-cinemeta.strem.io) and art from metahub, both by Stremio; episode
stills ultimately from [TMDB](https://www.themoviedb.org/). Not affiliated with, endorsed by, or
connected to Stremio, TMDB, IMDb, or Kakao (PotPlayer).
