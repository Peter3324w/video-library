# Plan

Scoped 2026-09-23.

## What it is

A library around the player, not a player. PotPlayer took ~15 years to get
where it is; nothing here tries to rebuild that. The library launches the
file in the player, watches it through a small **player adapter**, and
records where you stopped.

## Features

| Feature | Notes |
|---|---|
| Resume where you left off | Position per file, from the player adapter |
| Continue watching / Recently added | Home: hero + poster rows |
| Trending + by-genre recommendations | TMDB `trending` and `discover` |
| Libraries: Movies, TV Shows | Later: Anime, Cartoons — each split series / movies |
| History | Everything watched, **including files no longer on disk** |
| Ratings + reviews | Stars and a written review per title |
| Favourites | Ranked or unranked; page name TBD |

## Player adapters

Each adapter answers three things: which file, what time, and when it stopped.

| Player | Open source | How | Status |
|---|---|---|---|
| **PotPlayer** | No (Kakao freeware) | Windows messages to its window | ✅ Probe works (below) |
| mpv | Yes | JSON IPC (named pipe) | Planned — the solid fallback |
| MPC-HC | Yes | Built-in web interface | Maybe |
| VLC | Yes | Built-in HTTP interface | Maybe |

### PotPlayer, verified 2026-09-23

`SendMessage(hwnd, WM_USER (0x0400), code, 0)` on the `PotPlayerMini64`
window:

| Code | Returns |
|---|---|
| `0x5006` | status: `-1` stopped, `1` paused, `2` playing |
| `0x5002` | duration, ms |
| `0x5004` | current position, ms |

Polled every 2s while playing, the position rose by exactly 2000ms each time.
The file name comes from the window title (`<file> - PotPlayer`), which has no
folder — fine for matching, and the library knows the full path of anything it
launched itself.

## Data model

One JSON store (`data.json` in userData), atomic writes + `.bak`.

- **titles** — what a thing *is*: movie or series, category, TMDB id, poster,
  genres, your stars / review / favourite / rank.
- **files** — what is on disk: path, title, season/episode, duration,
  **resume position**, present-or-missing.
- **history** — what you watched and when, keyed by **title** (not path), so it
  outlives the file.

## Hard parts

1. **Recognising files.** `Show.Name.S02E07.720p.x265-GRP.mkv` → show, season,
   episode. A parser gets most of it; a "Fix match" action covers the rest.
2. **Anime vs Cartoons vs TV.** TMDB genre + origin country, with a manual
   override.
3. **PotPlayer is unofficial.** The message API is undocumented; an update
   could change it. mpv is the fallback for exactly that reason.

## Order

1. Foundation — shell, design system, store ✅
2. PotPlayer adapter + resume (built; needs a live run)
3. Folder scan + filename parsing → Movies / TV Shows
4. TMDB metadata (posters, genres) → Home rows
5. History, ratings, reviews, favourites
6. Trending / recommendations
7. Anime + Cartoons libraries
