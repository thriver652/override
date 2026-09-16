// OVERRIDE leaderboard — Cloudflare Worker + KV (free tier is plenty: 100k reads/day, 1k writes/day).
// Routes:
//   GET  /stats?day=YYYY-MM-DD   -> { players, top:[{name,score,nodes}] }
//   POST /submit {day,name,score,nodes} -> { ok, rank }
// Bind a KV namespace called BOARD (see wrangler.toml).

const ALLOWED_ORIGIN = '*';              // tighten to your domain once live, e.g. 'https://override.yourdomain.com'
const MAX_SCORE = 250000;                 // sanity cap (a perfect 60-node run is well under this)
const MAX_PER_IP_PER_DAY = 3;             // submit attempts per IP per day
const TOP_N = 50;

const cors = { 'access-control-allow-origin': ALLOWED_ORIGIN, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...cors } });
const isDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const today = () => new Date().toISOString().slice(0, 10);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (req.method === 'GET' && url.pathname === '/stats') {
      const day = url.searchParams.get('day') || today();
      if (!isDay(day)) return json({ error: 'bad day' }, 400);
      const board = (await env.BOARD.get('board:' + day, 'json')) || { players: 0, top: [] };
      return json(board);
    }

    if (req.method === 'POST' && url.pathname === '/submit') {
      let b; try { b = await req.json(); } catch { return json({ ok: false, reason: 'bad json' }, 400); }
      const day = b.day, name = String(b.name || '').replace(/[^\w\-]/g, '').slice(0, 12);
      const score = Math.floor(Number(b.score)), nodes = Math.floor(Number(b.nodes));
      if (!isDay(day) || day !== today()) return json({ ok: false, reason: 'day closed' }, 400);
      if (!name) return json({ ok: false, reason: 'bad name' }, 400);
      if (!(score >= 0 && score <= MAX_SCORE) || !(nodes >= 0 && nodes <= 500)) return json({ ok: false, reason: 'bad score' }, 400);
      // plausibility: score can't wildly exceed what N nodes could produce
      if (score > (nodes + 1) * 1400) return json({ ok: false, reason: 'implausible' }, 400);

      const ip = req.headers.get('cf-connecting-ip') || 'unknown';
      const ipKey = `ip:${day}:${ip}`;
      const used = Number((await env.BOARD.get(ipKey)) || 0);
      if (used >= MAX_PER_IP_PER_DAY) return json({ ok: false, reason: 'limit' }, 429);
      await env.BOARD.put(ipKey, String(used + 1), { expirationTtl: 60 * 60 * 36 });

      const key = 'board:' + day;
      const board = (await env.BOARD.get(key, 'json')) || { players: 0, top: [] };
      board.players += 1;
      const existing = board.top.findIndex(e => e.name === name);
      if (existing >= 0) { if (score > board.top[existing].score) board.top[existing] = { name, score, nodes }; }
      else board.top.push({ name, score, nodes });
      board.top.sort((a, b) => b.score - a.score);
      board.top = board.top.slice(0, TOP_N);
      await env.BOARD.put(key, JSON.stringify(board), { expirationTtl: 60 * 60 * 24 * 30 });
      const rank = board.top.findIndex(e => e.name === name) + 1;
      return json({ ok: true, rank: rank || null });
    }

    return json({ ok: true, service: 'override-board', day: today() });
  }
};
