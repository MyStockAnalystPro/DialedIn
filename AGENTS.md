# DialedIn — Aarush's Productivity RPG

A gamified anti-procrastination dashboard. Pure HTML/CSS/JS with no build step and no
runtime dependencies; all state is persisted in the browser via `localStorage`.

## Cursor Cloud specific instructions

- This is a static, zero-dependency, zero-build app. There is nothing to `npm install` or
  compile. The update script is intentionally a no-op.
- To run it, serve the repo root over HTTP and open `index.html` (opening via `file://`
  can break relative asset loading in some browsers). Standard command:
  `python3 -m http.server 8080` from the repo root, then visit `http://localhost:8080`.
- Application logic lives in `js/*.js` (loaded as classic, non-module scripts in a fixed
  order defined at the bottom of `index.html`; there is no bundler, so load order matters).
  Styles are in `css/style.css`.
- There is no test suite, linter, or build configured in this repo. "Testing" means
  loading the page and exercising features in the browser.
- All user data (tasks, XP, notes, settings) is stored in `localStorage`, so a fresh
  browser/profile starts with an empty/first-run state.
