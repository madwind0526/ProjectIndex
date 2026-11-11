# Project Index

Card-style catalogue of every Claude project on this PC (C:\Claude, E:\Claude, G:\Claude) and on GitHub (madwind0526). UI/theme follows `C:\Claude\MusicAutomation`.

## Tech Stack

React + Vite + TypeScript frontend, plain Node `http` backend (`server/`), no database (JSON in `data/runtime/`, git-ignored). ComfyUI image code is copied from MusicAutomation's `cover-art.mjs` (`server/comfy.mjs`).

## Commands

```bash
start.bat      # frees ports 4319/5189, starts API + Vite, opens http://127.0.0.1:5189
stop.bat       # stops both
npm run typecheck   # tsc -b
npm test            # node --check on server files
```

Ports: API 4319, UI 5189 (see `C:\Claude\PORTS.md`).

## Behaviour notes

- Card "run" = project's `stop.bat nopause`, then `start.bat` in a new console window. Every project `start.bat` calls `C:\Claude\open-url.bat <url>`, which waits for the port and opens the browser.
- Card "delete" only hides the card (`hidden` in `data/runtime/projects.json`); folders and repos are never touched. Settings can restore hidden cards.
- Refresh re-scans facts, asks the LLM for summary/detail/category unless the card was hand-edited (`edited`), and makes a ComfyUI image if none exists.
- Git remote URLs can contain tokens; `scan.mjs` strips credentials before anything reaches the UI or disk.

## Memory Bank

See `memory-bank/` (active-context.md, STATE.md, CACHE.md, knowledge/).
