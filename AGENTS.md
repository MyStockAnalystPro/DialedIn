# AGENTS.md

## Cursor Cloud specific instructions

This repo is **DialedIn** (a.k.a. "FocusQuest"), a gamified productivity dashboard. It is a **zero-dependency, zero-build static site**: plain HTML/CSS/JS (`index.html`, `css/`, `js/`). There is no package manager, no backend, no database, and no build step. All state persists in the browser's `localStorage`.

### Running the app (development)
Serve the repo root as static files and open it in a browser. The README documents the canonical command:

```bash
python3 -m http.server 8080   # then visit http://localhost:8080
```

Any static file server works (`npx serve`, `php -S localhost:8080`, etc.). Python 3 is preinstalled.

### Non-obvious notes
- **No install/lint/test/build tooling exists.** There is no `package.json`, linter config, or test suite in the repo. "Building" means just serving the static files.
- **Focus-session modal on load:** if there is a current/active task, the app opens into a full-screen focus-session overlay (dark screen with the task title and a 25:00 timer) instead of the dashboard. Press `Escape` (or use the on-screen buttons) to dismiss it and reveal the main dashboard.
- **State is per-browser `localStorage`.** To reset the app to a clean state, clear the site's `localStorage` in the browser (there is no server-side data).
- Quick-add task syntax (see README): e.g. `Finish essay /today /high /45m #school @coding`. Press `n` to open the quick-add input.
