"""Records CrazyGames preview videos: covers/preview_landscape_1920x1080.mp4 and covers/preview_portrait_1080x1620.mp4.
15-20 s, silent, no cursor, opens on the cover frame. Requires ffmpeg.  Run: python3 test/video.py"""
import asyncio, os, subprocess, shutil, glob
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'dist', 'index.html')
OUT = os.path.join(ROOT, 'covers'); TMP = os.path.join(ROOT, 'test', '_video'); os.makedirs(TMP, exist_ok=True)

async def play(page, seconds):
    import time; t_end = time.time() + seconds
    while time.time() < t_end:
        if not await page.evaluate('Run.active'): break
        await page.wait_for_timeout(260)   # a human-ish pause before acting, so viewers can read each round
        info = await page.evaluate('({key:Run.lastType, lie:!!document.querySelector(".instr .lie")})'); key = info['key']
        try:
            if key == 'tap': await page.click('.cell:not(.on)' if info['lie'] else '.cell.on', timeout=1200)
            elif key == 'odd': await page.evaluate('''() => { const c=[...document.querySelectorAll(".cell")]; const n={}; c.forEach(x=>n[x.textContent]=(n[x.textContent]||0)+1); c.find(x=>n[x.textContent]===1).click(); }''')
            elif key == 'bar':
                await page.wait_for_function('''() => { const z=document.querySelector(".bar-zone"), c=document.querySelector(".bar-cursor"); if(!z||!c) return true; const zr=z.getBoundingClientRect(), cr=c.getBoundingClientRect(); const cx=cr.left+cr.width/2; return cx>zr.left+4 && cx<zr.right-4; }''', timeout=2500)
                await page.dispatch_event('.tap-any', 'pointerdown')
            elif key == 'seq':
                seq = await page.evaluate('document.querySelector(".seq") ? document.querySelector(".seq").textContent.split(" ") : null')
                if seq:
                    await page.wait_for_selector('.grid', timeout=3000)
                    for g in seq:
                        await page.evaluate(f'''() => {{ [...document.querySelectorAll(".cell")].find(c=>c.textContent==={g!r}).click(); }}'''); await page.wait_for_timeout(140)
            elif key == 'order':
                n = await page.evaluate('document.querySelectorAll(".node:not(.decoy)").length')
                for k in (range(n, 0, -1) if info['lie'] else range(1, n + 1)):
                    await page.evaluate(f'''() => {{ const b=[...document.querySelectorAll(".node:not(.decoy)")].find(b=>b.textContent==="{k}"); b&&b.click(); }}'''); await page.wait_for_timeout(120)
            elif key == 'arrow':
                sym = await page.evaluate('document.querySelector(".arrow").textContent'); d = {'↑':'up','↓':'down','←':'left','→':'right'}[sym]
                if info['lie']: d = {'up':'down','down':'up','left':'right','right':'left'}[d]
                await page.keyboard.press('Arrow' + d.capitalize())
            elif key == 'math':
                expr = await page.evaluate('document.querySelector(".instr .hi").textContent'); lhs, rhs = expr.split('=')
                val = eval(lhs.replace('×','*').replace('−','-')); await page.click(f'.choice:has-text("{"TRUE" if val==int(rhs) else "FALSE"}")')
            elif key == 'stroop':
                await page.evaluate('''() => { const w=document.querySelector(".bigword"); const lie=document.querySelector(".instr").textContent.includes("SAYS"); const ink=getComputedStyle(w).color; const ch=[...document.querySelectorAll(".choice")]; (lie? ch.find(c=>c.textContent===w.textContent) : ch.find(c=>getComputedStyle(c).color===ink)).click(); }''')
            elif key == 'count':
                target = await page.evaluate('document.querySelector(".instr .hi").textContent')
                n = await page.evaluate(f'''() => [...document.querySelectorAll("#arena span")].filter(s=>s.textContent==={target!r}).length''')
                await page.click(f'.choice:text-is("{n}")')
            elif key == 'react':
                await page.wait_for_function('document.querySelector(".bigword") && document.querySelector(".bigword").textContent==="TAP!"', timeout=3500); await page.dispatch_event('.tap-any', 'pointerdown')
            elif key == 'hold':
                line = await page.evaluate('parseFloat(document.querySelector(".bar-line").style.left)/100')
                await page.dispatch_event('.tap-any', 'pointerdown', {'pointerId': 1})
                await page.wait_for_function(f'''() => parseFloat(document.querySelector(".bar-fill").style.width||"0")/100 >= {line}''', timeout=3000)
                await page.dispatch_event('.tap-any', 'pointerup', {'pointerId': 1})
        except Exception: pass
        await page.wait_for_timeout(200)

async def record(pw, tag, vw, vh, out_w, out_h, cover):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': out_w, 'height': out_h}, device_scale_factor=1, record_video_dir=TMP, record_video_size={'width': out_w, 'height': out_h})
    page = await ctx.new_page(); await page.goto(URL)
    await page.evaluate(f"document.documentElement.style.zoom='{out_w/vw}'"); await page.wait_for_timeout(600)   # zoom so the game fills the frame
    # a lie early on makes for a better clip
    await page.evaluate("isLieNode = n => n>=2 && Run.rng()<0.5")
    await page.click('#btn-play'); await play(page, 17)
    await page.wait_for_timeout(300); await ctx.close(); await b.close()
    webm = sorted(glob.glob(os.path.join(TMP, '*.webm')), key=os.path.getmtime)[-1]
    out = os.path.join(OUT, f'preview_{tag}.mp4')
    # 1 s of the cover, then gameplay from just after the click; trim to 19 s; silent h264
    subprocess.run(['ffmpeg','-y','-loglevel','error',
        '-loop','1','-t','1','-i',cover,
        '-ss','0.9','-i',webm,
        '-filter_complex', f'[0:v]scale={out_w}:{out_h},format=yuv420p,fps=30[c];[1:v]scale={out_w}:{out_h},format=yuv420p,fps=30[g];[c][g]concat=n=2:v=1:a=0[v]',
        '-map','[v]','-t','19','-an','-c:v','libx264','-preset','medium','-crf','21','-movflags','+faststart', out], check=True)
    os.remove(webm); print('wrote', out, round(os.path.getsize(out)/1e6,1), 'MB')

async def main():
    async with async_playwright() as pw:
        await record(pw, 'landscape_1920x1080', 960, 540, 1920, 1080, os.path.join(OUT, 'cover_landscape_1920x1080.png'))
        await record(pw, 'portrait_1080x1620', 540, 810, 1080, 1620, os.path.join(OUT, 'cover_portrait_800x1200.png'))
    shutil.rmtree(TMP, ignore_errors=True)
asyncio.run(main())
