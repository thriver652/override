# OVERRIDE — launch guide

You vs. a rogue AI. Endless rapid-fire micro-challenges that speed up as you survive. Daily seeded run with a global board. Single HTML file, no build step needed to run, no runtime AI cost.

## What's in the box

```
dist/index.html      the whole game, one file (~50 KB). Upload this anywhere.
dist/artifact.html   same game without the document wrapper (used for the claude.ai preview)
src/                 editable source (index.src.html, style.css, core.js, games.js)
build.js             node build.js  -> rebuilds dist/ from src/
worker/              free Cloudflare Worker for the daily leaderboard
test/play.py         headless play-test bot (python3 test/play.py)
```

## Step 1 — host your own copy (10 minutes, free)

Option A, GitHub Pages: create a repo, push `dist/index.html` renamed to `index.html`, enable Pages in Settings. Done: `https://<you>.github.io/<repo>/`.

Option B, Cloudflare Pages / Netlify / Vercel: drag the `dist` folder onto their dashboard.

Then set `CONFIG.SHARE_URL` in `src/core.js` to that URL (it's what the share card prints) and run `node build.js`.

## Step 2 — the leaderboard (15 minutes, free)

```
cd worker
npx wrangler login
npx wrangler kv namespace create BOARD        # paste the printed id into wrangler.toml
npx wrangler deploy                            # prints https://override-board.<you>.workers.dev
```

Put that URL into `CONFIG.BACKEND_URL` in `src/core.js`, rebuild, redeploy the page. The home screen now shows "N HUMANS BREACHED TODAY", the daily run gets a submit box, and GLOBAL BOARD works. Free tier limits (100k reads / 1k writes per day) cover roughly 1,000 daily submissions; the board is one KV key per day so reads are cheap.

Anti-cheat is deliberately light (score cap, plausibility check, 3 submits per IP per day). It's enough for a launch; if the board gets abused later, add a signed session token.

## Step 3 — submit to portals (this is where the money is)

Portals monetize with ads and share revenue with you. You need: the game, a title, a description, screenshots, and a cover image.

**CrazyGames** (developer.crazygames.com) — upload `dist/index.html` as an HTML5 game. Their SDK is already wired in: it loads automatically when the game is served from a crazygames domain or with `?portal=crazygames` in the URL. Ad breaks play every 3rd game over (`CONFIG.ADS_EVERY_N_RUNS`); `gameplayStart/Stop` and `happytime` are called at the right moments. Cover art: 512×512 and 1920×1080 PNG (see below). Fill in the form, pick "Casual / Skill / Arcade" tags. Review usually takes a few days; they approve into "Basic" first, then promote based on player retention, so the daily loop matters.

**Poki** (developers.poki.com) — same file, same SDK auto-detection (`?portal=poki`). Poki is curated and takes longer; apply with your CrazyGames stats once you have a week of data.

**GameDistribution** (gamedistribution.com) — same upload, syndicates to hundreds of sites. Lowest effort, extra reach.

**itch.io** — zip `dist/index.html` as `index.html` inside a folder, upload as an HTML game, set viewport 520×860 and enable mobile. No ad revenue, but it's a free landing page and Gen Z finds things there.

To test the portal path locally, open the game with `?portal=crazygames` — the SDK loads from their CDN and logs to the console; ads won't fill outside their domain, which is expected.

## Cover art & screenshots

Run `python3 test/play.py` — it plays the game headlessly and drops `test/mobile_*.png` and `test/desktop_*.png` screenshots you can crop for the store listing. For the 512×512 icon, the favicon SVG in `index.html` (cyan ring, magenta core on black) scales cleanly; export it from any vector tool.

## Tuning knobs (all in `src/games.js`)

- `speedFactor(n)` — how fast rounds shrink (currently 1.8% per node, floor 42%)
- `tier(n)` — when grids grow and zones shrink
- `isLieNode(n)` — from node 6, chance the AI lies (12% → 35%)
- `GAMES[x].base` — base milliseconds per challenge type
- XP: `gained = score/30 + nodes*4`; theme unlock levels in `core.js` THEMES

Add a new micro-challenge by adding an entry to `GAMES` with a `base` and a `setup(ctx)` that calls `ctx.done(ok, event)`. That's all; the loop, timer, scoring and FX are shared.

## First-week checklist

1. Host the page, deploy the worker, set both URLs, rebuild.
2. Play 20 runs yourself on a phone. Adjust `speedFactor` if runs feel too long or too short (target: first-time players die around node 8–15; good players 30+).
3. Submit to CrazyGames and GameDistribution the same day.
4. Post the share card to a couple of subreddits / Discords (r/WebGames, r/incremental_games crossposts do fine) and one TikTok/Short of the "the AI lied to me" moment.
5. Check the CrazyGames dashboard after 7 days: they surface retention and playtime; that's what gets you promoted from Basic to Full.
