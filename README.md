# OVERRIDE — launch guide

You vs. a rogue AI. Endless rapid-fire micro-challenges that speed up as you survive — and from node 3 the AI starts lying to you. Daily seeded run with a global board. Single HTML file, no runtime AI cost.

## What's in the game (v1.2)

- **11 challenge types**: tap, odd-one-out, timing bar, memory sequence, order, swipe, math, Stroop, hold, count, reflex.
- **The AI lies** from node 3 (18% → 40% of eligible nodes). A struck-through instruction means the opposite is true. Big "IT LIED" / "CAUGHT IT" reveal after each one.
- **FIREWALL** every 10 nodes: 3 challenges in a row, 15% faster, 1.5× points. Clear all three and you get +1 integrity back.
- **Patches** (power-ups) earned every 8-combo: SLOW-MO (timer 60% slower for 3 nodes), SHIELD (absorb one miss), SCAN (AI can't lie for 3 nodes). Tap them in the HUD or press 1/2/3.
- **REBOOT**: once per run, on game over, continue with 1 integrity and keep your score. On CrazyGames/Poki this plays a **rewarded ad** (their best-paying format); elsewhere it's free.
- **Personal-best ghost** in the HUD and a "NEW BEST" moment when you pass it.
- **Weakness analysis** on game over ("WEAKNESS: STROOP 40% · STRENGTH: MEMORY 100%") and a full accuracy breakdown on the profile screen.
- **Ranks** by level (INTERN → SCRIPT KIDDIE → OPERATOR → NETRUNNER → GHOST → ROOT → OVERLORD → THE GLITCH), **14 achievements** with XP, **8 unlockable themes**.
- Daily Breach (same seeded run for everyone, one attempt), streaks, share card, synth audio, haptics, reduced-motion support.
- Portal SDK auto-detection (CrazyGames v3 / Poki) with gameplay events, midgame ads with the 3-minute cooldown respected, rewarded ads, AdBlock-safe.

## What's in the box

```
dist/index.html      the whole game, one file (~70 KB). Upload this anywhere.
covers/              CrazyGames cover images (1920×1080, 800×1200, 800×800), 512 icon, tagline variants for social
dist/artifact.html   same game without the document wrapper (used for the claude.ai preview)
src/                 editable source (index.src.html, style.css, core.js, games.js)
build.js             node build.js  -> rebuilds dist/ from src/
worker/              free Cloudflare Worker for the daily leaderboard
test/play.py         headless play-test bot (python3 test/play.py)
test/covers.py       re-renders the cover images (python3 test/covers.py)
```

## Step 1 — host your own copy (10 minutes, free)

Option A, GitHub Pages: push this repo, then Settings → Pages → Source: **GitHub Actions**. The included `.github/workflows/pages.yml` publishes `dist/` on every push to `main`. Done: `https://<you>.github.io/<repo>/`.

Option B, Cloudflare Pages / Netlify / Vercel: drag the `dist` folder onto their dashboard.

Then set `CONFIG.SHARE_URL` in `src/core.js` to that URL (it's what the share card prints) and run `node build.js`.

## Step 2 — the leaderboard (15 minutes, free)

```
cd worker
npx wrangler login
npx wrangler kv namespace create BOARD                       # paste the printed id into wrangler.toml
npx wrangler d1 create override-db                           # paste database_id into wrangler.toml
npx wrangler d1 execute override-db --remote --file=schema.sql
#  …and change DASH_KEY in wrangler.toml to something private
npx wrangler deploy                                          # prints https://override-board.<you>.workers.dev
```

The worker also receives gameplay telemetry (run_start / run_end / reboot / share / error) into D1 and serves a private dashboard at `/dash?key=<DASH_KEY>` with a death curve, per-day totals, reboot rate, per-portal averages and grouped player-side JS errors. Free tiers: KV 1k writes/day (leaderboard only), D1 100k writes/day (events).

Put that URL into `CONFIG.BACKEND_URL` in `src/core.js`, rebuild, redeploy the page. The home screen now shows "N HUMANS BREACHED TODAY", the daily run gets a submit box, and GLOBAL BOARD works. Free tier limits (100k reads / 1k writes per day) cover roughly 1,000 daily submissions; the board is one KV key per day so reads are cheap.

Anti-cheat is deliberately light (score cap, plausibility check, 3 submits per IP per day). It's enough for a launch; if the board gets abused later, add a signed session token.

## Step 3 — submit to CrazyGames (the money step)

CrazyGames monetizes with ads and shares revenue. You need a hosted URL first (Step 1) — they accept an HTML5 upload too, but a URL lets you push fixes without resubmitting.

1. **Account**: go to developer.crazygames.com and sign up as a developer (free). Fill in the payout profile when it asks (PayPal or bank; India is supported).
2. **New game → HTML5**. Choose "Upload" and drop `dist/index.html`, or choose "Iframe / URL" and paste your hosted URL. Orientation: **portrait**, also works landscape. Mark it **mobile-friendly** (it is).
3. **Details**: Title `OVERRIDE`. Category: Casual / Skill / Arcade. Tags: reaction, brain, arcade, quick, one-tap. Description (paste): *"A rogue AI is testing your reflexes — and it lies. Survive an endless run of 2-second challenges that get faster every node: tap the lit cell, stop the bar, repeat the sequence, disobey the AI when it's bluffing. Beat the FIREWALL every 10 nodes to restore integrity, earn patches to bend the rules, and take on the Daily Breach: the same seeded run for every player on Earth."* Controls: *"Tap / click. Swipe or arrow keys for direction rounds. 1/2/3 to use patches."*
4. **Covers**: upload the three files from `covers/` (landscape, portrait, square). They're title-only, which is what their guidelines require.
5. **SDK**: it's already integrated. In the "SDK" section tick that you use gameplay events, midgame ads and rewarded ads. Their QA tool (Developer Portal → your game → QA) checks these automatically; run it and it should pass.
6. **Preview & test**: use their preview link (crazygames.com/preview) — the SDK reports `environment: "crazygames"` there and ads run in test mode. Play a full run, die, press REBOOT, confirm the rewarded ad plays and the run continues.
7. **Submit**. Review takes a few days. You land in **Basic launch** first (no monetization yet); they promote to **Full launch** based on playtime and return rate. The daily run and streaks exist to push those numbers.

Local testing tip: open the game with `?portal=crazygames` — the SDK loads and logs; ads won't fill off their domain, which is expected. Without the SDK, REBOOT is simply free.

**Also submit the same file to** GameDistribution (syndication to hundreds of sites, lowest effort) and itch.io (free landing page). Hold Poki until you have a week of CrazyGames data — they're curated and like to see numbers.

## Cover art & screenshots

Covers are in `covers/` already. Run `python3 test/play.py` for gameplay screenshots (`test/mobile_*.png`, `test/desktop_*.png`) — CrazyGames asks for a few; pick the game screen, a FIREWALL, and the game-over screen. `python3 test/covers.py` re-renders the covers if you change the name or colours.

## Tuning knobs (all in `src/games.js`)

- `speedFactor(n)` — how fast rounds shrink (currently 1.8% per node, floor 42%)
- `tier(n)` — when grids grow and zones shrink
- `isLieNode(n)` — from node 3, chance the AI lies (18% → 40%)
- FIREWALL cadence (`n%10===0`), patch cadence (`combo%8===0`), reboot condition (`nodes>=3`) — all in `games.js`
- `GAMES[x].base` — base milliseconds per challenge type
- XP: `gained = score/30 + nodes*4`; theme unlock levels in `core.js` THEMES

Add a new micro-challenge by adding an entry to `GAMES` with a `base` and a `setup(ctx)` that calls `ctx.done(ok, event)`. That's all; the loop, timer, scoring and FX are shared.

## First-week checklist

1. Host the page, deploy the worker, set both URLs, rebuild.
2. Play 20 runs yourself on a phone. Adjust `speedFactor` if runs feel too long or too short (target: first-time players die around node 8–15; good players 30+).
3. Submit to CrazyGames and GameDistribution the same day.
4. Post the share card to a couple of subreddits / Discords (r/WebGames, r/incremental_games crossposts do fine) and one TikTok/Short of the "the AI lied to me" moment.
5. Check the CrazyGames dashboard after 7 days: they surface retention and playtime; that's what gets you promoted from Basic to Full.
