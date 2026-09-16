# OVERRIDE Launch Playbook

From the folder on your Desktop to a game that's live on CrazyGames, updated from GitHub, and earning. Seven stages, in order. Tick things off as you go; the ticks stay in this browser.

Set expectations first. Web-game ad revenue is roughly $1–4 per 1,000 plays. A game sitting in CrazyGames' Basic tier earns pocket change; the money starts when playtime and return rate get it promoted to Full placement and rewarded ads kick in. Everything below is arranged to make that promotion likely, and to have a second income path (an Android app) ready if the portals are slow. Treat OVERRIDE as game one of three: the engine is reusable, and the data from this launch is what makes the next one better.

## STAGE 1 Get it on GitHub

~20 minutes · once

GitHub becomes the single source of truth: every change goes there, the live site deploys from it automatically, and CrazyGames points at the live URL so you never need to re-upload.

1. Create a free account at github.com if you don't have one. Install GitHub Desktop (desktop.github.com), which avoids the command line entirely on Windows.

1. In GitHub Desktop: File → Add local repository → pick Desktop\override. It will say it isn't a repo yet; click create a repository. Name: override. Leave "Git ignore" as None.

1. Click Publish repository. Untick "Keep this code private" (Pages is free only on public repos). Publish.

1. On github.com open the repo → Settings → Pages. Source: Deploy from a branch. Branch: main, folder: /dist. Save. Wait 1–2 minutes; the page shows your URL, e.g. https://YOURNAME.github.io/override/.

1. Open that URL on your phone. It's your game, live. This URL is what you'll give CrazyGames, put on social, and print on the share card.

1. Back in src/core.js, set SHARE_URL to that exact URL. Run node build.js. In GitHub Desktop, write a summary ("set share url") and click Commit to main, then Push origin. Pages redeploys in about a minute.

That last step is the loop you'll use forever: edit src/ → node build.js → commit → push → live. Never edit dist/index.html by hand; the build overwrites it.

## STAGE 2 Switch on the leaderboard

~15 minutes · once · free

The daily run only matters if people can see where they stand. This is the retention hook, so do it before submitting anywhere.

1. Create a free Cloudflare account (cloudflare.com). No card needed for Workers' free tier.

1. Open a terminal in Desktop\override\worker (in the folder: right-click → Open in Terminal). Run:

```
npx wrangler login
npx wrangler kv namespace create BOARD
```

It prints an id = "…" line. Paste that id into wrangler.toml where it says PASTE_KV_NAMESPACE_ID_HERE.

1. Run npx wrangler deploy. It prints a URL like https://override-board.YOURNAME.workers.dev. Open it; you should see {"ok":true,…}.

1. In src/core.js, set BACKEND_URL to that URL (no trailing slash). Rebuild, commit, push.

1. Open the live game. Home screen should show "0 HUMANS BREACHED TODAY" (it's zero until someone plays). Play a Daily Breach, enter a tag, submit, then open GLOBAL BOARD and confirm you're on it.

1. Optional hardening once live: in worker.js change ALLOWED_ORIGIN from * to your GitHub Pages origin, and redeploy. Keeps random sites from posting to your board.

## STAGE 3 Ship to CrazyGames

~45 minutes · then 3–10 days review

The README in your folder has the description and controls text to paste. The order here matters: URL first, so fixes don't need a resubmission.

1. Sign up at developer.crazygames.com. Complete the payout profile (PayPal or bank transfer; India is supported). You won't be paid until the game is in Full launch, but do it now so it never blocks a payout.

1. Games → Submit a game → HTML5. Delivery: choose URL / iframe and paste your GitHub Pages URL. Orientation: portrait, landscape also fine. Tick mobile-compatible.

1. Paste Title, Description and Controls from the README. Category: Casual. Tags: reaction, brain, arcade, quick, one-tap, AI.

1. Upload the three covers from covers/: landscape 1920×1080, portrait 800×1200, square 800×800. Add 3–4 screenshots from test/mobile_game.png, test/mobile_over.png, test/mobile_profile.png (re-run python test/play.py if you want fresh ones).

1. SDK section: confirm gameplay events, midgame ads and rewarded ads. Open the QA tool on the game page and run it. It loads your URL and checks the SDK calls automatically; it should pass green.

1. Open the preview link they give you. Play a run, die, press REBOOT and confirm a test ad plays and the run continues with one integrity. That single check is the difference between "SDK integrated" and "rewarded ads actually earning".

1. Submit. You'll get an email. Basic launch first (no ads, no money), then Full when their numbers say players stick around.

What decides Full launch: average playtime and D1/D7 return rate, both visible in your developer dashboard after a few days. The daily run, streaks, FIREWALL, patches, ranks and achievements exist specifically to move those two numbers. If they're weak, Stage 5 tells you what to tune.

## STAGE 4 Same day: the free extra reach

~40 minutes

1. GameDistribution (gamedistribution.com) — sign up, submit the same URL and covers. They syndicate to hundreds of small sites with ad revenue share. Low traffic per site, but it adds up and costs nothing.

1. itch.io — create a project, upload a zip containing index.html (from dist/), set "This file will be played in the browser", viewport 520×860, mobile on. No revenue, but a free page Gen Z actually browses, and it's where you can accept tips (itch has a built-in "pay what you want").

1. Hold Poki until you have 7 days of CrazyGames data. Poki is curated and your application is far stronger with "X thousand plays, Y minutes average session" in it.

1. Post the tagline cover (covers/social_portrait_tagline.png) plus your URL: r/WebGames, r/incremental_games (Sunday thread), two Discord servers you're already in. Record one 15-second vertical clip of a lie node ending in IT LIED and post it to Shorts/Reels/TikTok with the URL in the caption. That moment is the clip.

## STAGE 5 Week 1–2: read the data, tune, push

30 minutes every couple of days

Your CrazyGames dashboard and the worker's "humans today" count are your instruments. Each row below is a symptom, the knob that fixes it, and where it lives. Every change is: edit → node build.js → commit → push. Live in a minute, no resubmission.

| Symptom | Change | Where |
|---|---|---|

| Avg session under 2 min; most runs die before node 8 | Slow the ramp: speedFactor 0.018 → 0.014. Move FIREWALL to node 8. | games.js |

| Players survive 40+ nodes easily | Faster ramp 0.018 → 0.022; lie chance ceiling 0.4 → 0.5. | games.js |

| Low D1 return | Daily rewards: give a free patch for playing the daily; show yesterday's top 3 on the home screen. | games.js refreshHome |

| Rewarded-ad views low | Lower the REBOOT threshold nodes>=3 → >=1; mention REBOOT in the AI's game-over taunt. | games.js gameOver |

| Accuracy stats show one challenge far below the rest | That type is confusing, not hard. Lengthen its base ms by 20%. | GAMES[type].base |

| Board being spammed | Drop MAX_PER_IP_PER_DAY to 1; set ALLOWED_ORIGIN. | worker.js |

Work on a branch for anything bigger than a number change: in GitHub Desktop, Branch → New branch, make the change, push, open a Pull Request, and merge when the play-test bot (python test/play.py) passes with no errors. Pages only deploys main, so half-finished work never goes live.

## STAGE 6 Month 1–2: content cadence

One evening a week

Portals reward games that keep changing, and players come back for new things to unlock. Cheap, high-impact drops, in the order I'd do them:

1. Weekly theme drop — one new colour set in THEMES every Monday (ten lines). Announce it in the AI's home-screen line.

1. One new challenge type a month — an entry in GAMES with a base and a setup(ctx). Ideas that fit: "which appeared first", "mirror swipe", "tap the moving target", "type the code" (desktop).

1. Yesterday's winner on the home screen — the worker already stores each day; show top[0] from yesterday with a taunt. Costs one fetch.

1. Weekly Breach — a seven-day seeded ladder with a bigger board; same code path as daily with a different seed key.

1. Seasonal ranks / achievements — add 3–4 achievements per month; they're two lines each in ACH.

1. Tag the release on GitHub each time (Releases → Draft a new release, tag v1.2 etc.) so you can roll back and so CrazyGames sees an active project when you message them.

## STAGE 7 Turn it into an app SECOND INCOME

~1 day · after 2–3 weeks of web data

The same HTML runs as an Android app with no rewrite, and AdMob rewarded ads on Android pay more than web ads. Do this once the web version has shown people stay.

1. Add a PWA manifest and a service worker (I can generate both in five minutes when you're ready) so the game installs to the home screen and works offline. Put icon_512.png in the manifest.

1. Go to pwabuilder.com, paste your GitHub Pages URL, choose Android. It produces a signed-ready Android package (a Trusted Web Activity wrapping your live URL, so updates still come from GitHub).

1. Google Play developer account: one-time $25. Create the app, upload the package, add the covers as store graphics, and write a privacy policy page (a short one on GitHub Pages is fine; Play requires the URL).

1. Monetize: swap Portal.rewarded() to call AdMob rewarded through the TWA bridge, or the simpler route, keep the web ads and add a one-time "Remove ads + all themes" ₹99 in-app purchase. For an Indian Gen Z audience, a small one-time unlock converts better than a subscription.

1. Later, the same package ships to the Samsung Galaxy Store and Amazon Appstore for free; both are less crowded than Play.

## MONEY Where the revenue actually comes from

| Source | When | Realistic at 10k plays/mo | Realistic at 200k plays/mo |
|---|---|---|---|

| CrazyGames midgame ads | After Full launch | $10–30 | $300–700 |

| CrazyGames rewarded (REBOOT) | After Full launch | $10–40 | $400–1,200 |

| GameDistribution syndication | Immediately | $5–15 | $100–300 |

| Android app (AdMob + ₹99 unlock) | Stage 7 | $20–60 | $500–2,000 |

| Poki | Month 2+, if accepted | — | often the largest single line |

Ranges are from public web-game monetization write-ups and portal developer reports; your numbers depend almost entirely on retention and on getting Full placement. The rewarded row is why REBOOT exists.

The compounding move: once OVERRIDE is stable, build game two on the same engine (same loop, timer, scoring, SDK, worker; new challenge set and skin) in a weekend. Two games cross-promote through the AI's taunts and share the leaderboard worker. Portals treat a developer with several retained games very differently from one with one.

## CHECKLIST Before you press Submit

- [ ] Game live on GitHub Pages; opens on my phone; sound works after first tap

- [ ] SHARE_URL set; the share text prints the right link

- [ ] Worker deployed; BACKEND_URL set; I'm on the Daily Breach board

- [ ] Played 10 runs on my phone; ramp feels fair; first FIREWALL is reachable

- [ ] CrazyGames payout profile complete

- [ ] Three covers uploaded; QA tool green; REBOOT plays a test ad in preview

- [ ] Submitted to GameDistribution and itch.io the same day

- [ ] One IT LIED clip posted with the URL

Ticks are saved in this browser only.
