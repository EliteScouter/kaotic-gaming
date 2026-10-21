# Kaotic Gaming site

The Kaotic Gaming website, live at **https://kaotic.strictgaming.com** (the Kaotic section of Strict
Gaming): player accounts, a game list, per-game saves, high scores, the 99¢ Supporter Pack shop, and an
admin page that shows who is playing what and how each player is doing in each game.

The games themselves live in their own GitHub repos. The site downloads each one into its data
volume and checks for new commits every few minutes, so a push to a game's repo goes live on its own.

## What's in this repo

| File | What it does |
|---|---|
| `server.js` | The whole site server. Needs Node.js 22.13 or newer; no other installs. |
| `games.json` | The list of games on the site, and the GitHub repo each one comes from. |
| `public/` | Site pages: home, sign in, admin, high scores, the shop (`shop.html`, the 99¢ Supporter Pack through PayPal), first-time setup, and `sdk.js` (the game plug-in). |

## The live site

**https://kaotic.strictgaming.com** runs on Strict Gaming's server with Docker (Portainer), built
from this GitHub repo. Every push to `main` redeploys it automatically, and its player data lives in
the server's Docker volume. How it's set up, the settings, backups and taking payments:
[`DEPLOY.md`](DEPLOY.md).

## Running a copy on this PC (for testing)

```bash
GITHUB_TOKEN=$(gh auth token) node server.js
```

Then open <http://localhost:8088>. `GITHUB_TOKEN` is only needed for games in private repos.
First time only: open <http://localhost:8088/setup> on this computer and create your admin account.

This local copy's data (accounts, saves, stats, downloaded games) is **not** in this folder: it lives in
`%LOCALAPPDATA%\KaoticGaming` (Windows) or `~/.local/share/KaoticGaming`, or wherever `KG_DATA_DIR`
points. It is separate from the live site's data.

## Adding another game

1. Put the game in its own GitHub repo, with its page at `index.html` (or say where it is with `entry`).
   It should load its other files from `/play/<slug>/` when `window.KG_BOOT` exists (the slug is
   `KG_BOOT.game`), and from `./` otherwise, like Color Magic does.
2. Add an entry to `games.json`:

   ```json
   {
     "slug": "my-game",
     "title": "My Game",
     "tagline": "One line about it",
     "description": "A sentence or two for the game card.",
     "source": { "repo": "TimLeitch/my-game", "branch": "main" },
     "color": "#3fa9f5",
     "status": "live",
     "leaderboard": [{ "key": "bestLevel", "label": "Best level" }]
   }
   ```

   - `slug`: lowercase letters, numbers and dashes; it becomes the address `/play/my-game`.
     **Never change a game's slug**: saves, progress and high scores are stored under it.
   - `source.repo`: the game's GitHub repo. Optional: `branch` (default `main`), `folder` (use only
     that part of the repo), `files` (only these files, e.g. `["index.html"]`), `entry` (the page
     to open, default `index.html`). Files starting with a dot (`.github`, `.gitignore`) are skipped.
   - `leaderboard` (optional): numbers the game sends with `KG.report()` that get a high-score table.
   - `status`: `live`, `beta` (shows a Beta tag) or `hidden` (not listed, can't be played).

   Push the change to this repo; the site redeploys, downloads the game, and its card appears.
   A game in a private repo needs `GITHUB_TOKEN` (see [`DEPLOY.md`](DEPLOY.md)).
3. In the game, use `window.KG` when it exists (see the top of `public/sdk.js`):
   `KG.save(data)` / `KG.initialSave` for saves, `KG.report({...})` for the numbers the admin
   page and high scores show, `KG.event(type, data)` for moments like a level finished, and
   `KG.setStatus(text)` for the "Playing now" line. Errors are reported automatically.

After that, every push to the game's repo is live within `GAME_SYNC_MINUTES` (5 by default).
A game can also live inside this repo instead: use `"entry": "games/my-game/index.html"` and
`"assets": "games/my-game"` in place of `source`.
