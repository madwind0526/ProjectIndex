# Project Index

Card-style catalogue of every Claude project on this PC (C:\Claude, E:\Claude, G:\Claude) and on GitHub (madwind0526). UI/theme follows `C:\Claude\MusicAutomation`. See `README.md` for the user-facing description.

## Tech Stack

React + Vite + TypeScript frontend, plain Node `http` backend (`server/`), no database (JSON in `data/runtime/`, git-ignored). ComfyUI image code is copied from MusicAutomation's `cover-art.mjs` (`server/comfy.mjs`). Markdown viewer: `react-markdown`.

## Commands

```bash
start.bat           # frees ports 4319/5189, starts API + Vite, opens http://127.0.0.1:5189
stop.bat            # stops both
npm run typecheck   # tsc -b
npm run check       # node --check on server files
npm test            # check + node:test unit tests (server/*.test.mjs)
```

Ports: API 4319, UI 5189 (see `C:\Claude\PORTS.md`). Remote: `madwind0526/ProjectIndex` (private).

## Behaviour notes

- Card "run" = project's `stop.bat nopause`, then `start.bat` (full path) in a new console window. Every project `start.bat` calls `C:\Claude\open-url.bat <url>`, which waits for the port and opens the browser.
- Card "delete" only hides the card (`hidden` in `data/runtime/projects.json`); folders and repos are never touched. Settings can restore hidden cards.
- Refresh = LLM summary/detail/category (skipped for hand-edited cards, `edited`) + image when missing or when the summary differs from `imageSummary`. Update All adds `changed=1`: the LLM is skipped when the README/description hash (`sourceHash`) is unchanged.
- Category falls back to keyword guessing (`guessCategory` in `server/index.mjs`) until the LLM has analysed a card.
- Ollama calls must send `think: false` and `format: "json"`, otherwise thinking models return no JSON.
- Git remote URLs can contain tokens; `scan.mjs` strips credentials before anything reaches the UI or disk.
- "GitHub에 반영" (`POST /api/git/push`) commits everything not git-ignored and pushes to `origin`; it creates a private repo if missing.
- `data/runtime/settings.json` is user data: never overwrite it from scripts without reading it first.

## Memory Bank

See `memory-bank/` (active-context.md, STATE.md, CACHE.md, knowledge/).
