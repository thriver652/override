// OVERRIDE backend — Cloudflare Worker. Free tier is plenty for launch.
//   KV  (BOARD)  : daily leaderboard              — 100k reads / 1k writes per day
//   D1  (DB)     : gameplay telemetry + errors    — 5M reads / 100k writes per day
//
// Routes
//   GET  /stats?day=YYYY-MM-DD          -> { players, top:[{name,score,nodes}] }
//   POST /submit {day,name,score,nodes} -> { ok, rank }
//   POST /event  {type,...}             -> { ok }             (sendBeacon from the game)
//   GET  /dash?key=DASH_KEY             -> private HTML dashboard
//   GET  /dash-data?key=DASH_KEY&days=7 -> JSON behind the dashboard

const ALLOWED_ORIGIN = '*';              // tighten to your Pages origin once live, e.g. 'https://thriver652.github.io'
const MAX_SCORE = 250000;
const MAX_PER_IP_PER_DAY = 3;
const TOP_N = 50;
const EVENT_TYPES = new Set(['run_start', 'run_end', 'reboot', 'share', 'error']);

const cors = { 'access-control-allow-origin': ALLOWED_ORIGIN, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...cors } });
const isDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const today = () => new Date().toISOString().slice(0, 10);
const dayOffset = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    /* ---------- leaderboard ---------- */
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
      board.top.sort((a, b) => b.score - a.score); board.top = board.top.slice(0, TOP_N);
      await env.BOARD.put(key, JSON.stringify(board), { expirationTtl: 60 * 60 * 24 * 30 });
      return json({ ok: true, rank: (board.top.findIndex(e => e.name === name) + 1) || null });
    }

    /* ---------- telemetry ---------- */
    if (req.method === 'POST' && url.pathname === '/event') {
      if (!env.DB) return json({ ok: false, reason: 'no db' }, 503);
      let b; try { b = await req.json(); } catch { return json({ ok: false }, 400); }
      const type = String(b.type || ''); if (!EVENT_TYPES.has(type)) return json({ ok: false }, 400);
      const row = {
        ts: Date.now(), day: today(), type,
        sid: String(b.sid || '').slice(0, 16),
        portal: ['crazygames', 'poki', 'none'].includes(b.portal) ? b.portal : 'none',
        daily: b.daily ? 1 : 0,
        nodes: Number.isFinite(+b.nodes) ? Math.min(500, Math.max(0, Math.floor(+b.nodes))) : null,
        score: Number.isFinite(+b.score) ? Math.min(MAX_SCORE, Math.max(0, Math.floor(+b.score))) : null,
        rebooted: b.rebooted ? 1 : 0,
        msg: type === 'error' ? String(b.msg || '').slice(0, 300) : null,
      };
      ctx.waitUntil(env.DB.prepare('INSERT INTO events (ts,day,type,sid,portal,daily,nodes,score,rebooted,msg) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(row.ts, row.day, row.type, row.sid, row.portal, row.daily, row.nodes, row.score, row.rebooted, row.msg).run().catch(() => {}));
      return json({ ok: true });
    }

    /* ---------- private dashboard ---------- */
    if (url.pathname === '/dash-data' || url.pathname === '/dash') {
      if (!env.DASH_KEY || url.searchParams.get('key') !== env.DASH_KEY) return new Response('forbidden', { status: 403 });
      if (url.pathname === '/dash') return new Response(DASH_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      if (!env.DB) return json({ error: 'no db' }, 503);
      const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') || 7)));
      const since = dayOffset(days - 1);
      const q = (sql, ...p) => env.DB.prepare(sql).bind(...p).all().then(r => r.results);
      const [perDay, curve, portals, errors, dailyMode] = await Promise.all([
        q(`SELECT day,
              SUM(type='run_start') AS starts, SUM(type='run_end') AS ends,
              SUM(type='reboot') AS reboots, SUM(type='share') AS shares, SUM(type='error') AS errors,
              COUNT(DISTINCT CASE WHEN type='run_start' THEN sid END) AS sessions,
              ROUND(AVG(CASE WHEN type='run_end' THEN nodes END),1) AS avg_nodes,
              MAX(CASE WHEN type='run_end' THEN score END) AS top_score
           FROM events WHERE day >= ? GROUP BY day ORDER BY day`, since),
        q(`SELECT SUM(nodes>=1) n1, SUM(nodes>=5) n5, SUM(nodes>=10) n10, SUM(nodes>=15) n15, SUM(nodes>=20) n20, SUM(nodes>=30) n30, SUM(nodes>=50) n50, COUNT(*) total
           FROM events WHERE type='run_end' AND day >= ?`, since),
        q(`SELECT portal, COUNT(*) runs, ROUND(AVG(nodes),1) avg_nodes FROM events WHERE type='run_end' AND day >= ? GROUP BY portal`, since),
        q(`SELECT ts, msg, COUNT(*) n FROM events WHERE type='error' AND day >= ? GROUP BY msg ORDER BY n DESC LIMIT 20`, since),
        q(`SELECT SUM(daily=1) daily_runs, SUM(daily=0) endless_runs FROM events WHERE type='run_end' AND day >= ?`, since),
      ]);
      // daily board sizes from KV
      const boards = {}; for (let i = 0; i < Math.min(days, 14); i++) { const d = dayOffset(i); const b = await env.BOARD.get('board:' + d, 'json'); boards[d] = b ? b.players : 0; }
      return json({ since, days, perDay, curve: curve[0], portals, errors, modes: dailyMode[0], boards, generated: new Date().toISOString() });
    }

    return json({ ok: true, service: 'override-backend', day: today(), telemetry: !!env.DB });
  }
};

const DASH_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OVERRIDE · ops</title>
<style>
body{margin:0;background:#05060a;color:#e8f1ff;font:14px/1.5 Inter,system-ui,sans-serif;padding:20px}
h1{font-size:20px;margin:0 0 4px;letter-spacing:-.02em}h1 b{color:#00f0ff}.sub{color:#7d879e;font:12px ui-monospace,Menlo,monospace;margin-bottom:18px}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}.tile{flex:1 1 130px;background:#0f1220;border:1px solid #1e2338;border-radius:12px;padding:12px}
.tile b{display:block;font-size:26px;font-weight:800;font-variant-numeric:tabular-nums}.tile span{font:11px ui-monospace,Menlo,monospace;letter-spacing:.12em;color:#7d879e;text-transform:uppercase}
h2{font:12px ui-monospace,Menlo,monospace;letter-spacing:.18em;color:#7d879e;text-transform:uppercase;margin:22px 0 8px}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:7px 8px;border-bottom:1px solid #1e2338;text-align:left;font-variant-numeric:tabular-nums}th{color:#7d879e;font-weight:600;font-size:11px;letter-spacing:.1em}
.bar{height:10px;background:#1e2338;border-radius:5px;overflow:hidden}.bar i{display:block;height:100%;background:linear-gradient(90deg,#00f0ff,#ff2bd6)}
.curve{display:grid;grid-template-columns:70px 1fr 60px;gap:10px;align-items:center;margin:4px 0;font:12px ui-monospace,Menlo,monospace}
.sel{background:#0f1220;color:#e8f1ff;border:1px solid #1e2338;border-radius:8px;padding:6px 10px;font:inherit}
.err{font:12px ui-monospace,Menlo,monospace;color:#ff3b5c;word-break:break-all}.muted{color:#7d879e}
</style></head><body>
<h1><b>OVERRIDE</b> · ops dashboard</h1><div class="sub" id="sub">loading…</div>
<div style="margin-bottom:14px"><select class="sel" id="days"><option value="1">today</option><option value="7" selected>last 7 days</option><option value="30">last 30 days</option><option value="90">last 90 days</option></select></div>
<div class="row" id="tiles"></div>
<h2>Death curve — % of runs reaching node…</h2><div id="curve"></div>
<h2>Per day</h2><table id="perday"><thead><tr><th>day</th><th>sessions</th><th>runs</th><th>avg nodes</th><th>top score</th><th>reboots</th><th>shares</th><th>board</th><th>errors</th></tr></thead><tbody></tbody></table>
<h2>By portal</h2><table id="portals"><thead><tr><th>portal</th><th>runs</th><th>avg nodes</th></tr></thead><tbody></tbody></table>
<h2>Errors (grouped)</h2><div id="errors"></div>
<script>
const key=new URLSearchParams(location.search).get('key');
async function load(){ const days=document.getElementById('days').value; const r=await fetch('/dash-data?key='+encodeURIComponent(key)+'&days='+days); const d=await r.json();
  document.getElementById('sub').textContent='since '+d.since+' · generated '+d.generated.replace('T',' ').slice(0,19)+' UTC';
  const sum=(k)=>d.perDay.reduce((a,x)=>a+(x[k]||0),0); const ends=sum('ends')||0; const starts=sum('starts')||0;
  const avgNodes=d.perDay.length? (d.perDay.reduce((a,x)=>a+(x.avg_nodes||0)*(x.ends||0),0)/(ends||1)).toFixed(1):'0';
  const tiles=[['sessions',sum('sessions')],['runs',ends],['avg nodes',avgNodes],['reboots',sum('reboots')],['reboot rate',ends?Math.round(sum('reboots')/ends*100)+'%':'—'],['shares',sum('shares')],['daily runs',d.modes.daily_runs||0],['abandoned',Math.max(0,starts-ends)],['errors',sum('errors')]];
  document.getElementById('tiles').innerHTML=tiles.map(([l,v])=>'<div class="tile"><b>'+v+'</b><span>'+l+'</span></div>').join('');
  const c=d.curve||{}; const t=c.total||0; const steps=[['node 1','n1'],['node 5','n5'],['node 10','n10'],['node 15','n15'],['node 20','n20'],['node 30','n30'],['node 50','n50']];
  document.getElementById('curve').innerHTML=t? steps.map(([l,k])=>{const p=Math.round((c[k]||0)/t*100);return '<div class="curve"><span>'+l+'</span><div class="bar"><i style="width:'+p+'%"></i></div><span>'+p+'%</span></div>'}).join('') : '<div class="muted">no runs yet</div>';
  document.querySelector('#perday tbody').innerHTML=d.perDay.slice().reverse().map(x=>'<tr><td>'+x.day+'</td><td>'+(x.sessions||0)+'</td><td>'+(x.ends||0)+'</td><td>'+(x.avg_nodes||0)+'</td><td>'+(x.top_score||0)+'</td><td>'+(x.reboots||0)+'</td><td>'+(x.shares||0)+'</td><td>'+(d.boards[x.day]??'')+'</td><td>'+(x.errors||0)+'</td></tr>').join('')||'<tr><td colspan=9 class="muted">nothing yet — play a run on the live site</td></tr>';
  document.querySelector('#portals tbody').innerHTML=d.portals.map(x=>'<tr><td>'+x.portal+'</td><td>'+x.runs+'</td><td>'+x.avg_nodes+'</td></tr>').join('')||'<tr><td colspan=3 class="muted">—</td></tr>';
  document.getElementById('errors').innerHTML=d.errors.length? d.errors.map(e=>'<div class="err">×'+e.n+' · '+String(e.msg).replace(/</g,'&lt;')+'</div>').join('') : '<div class="muted">none 🎉</div>';
}
document.getElementById('days').onchange=load; load();
</script></body></html>`;
