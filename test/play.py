import asyncio, sys, os
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'dist', 'index.html')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errors = []
        async def run(viewport, tag, mobile):
            ctx = await b.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile, device_scale_factor=2)
            page = await ctx.new_page()
            page.on('pageerror', lambda e: errors.append(f'[{tag}] pageerror: {e}'))
            page.on('console', lambda m: errors.append(f'[{tag}] console.{m.type}: {m.text}') if m.type in ('error',) else None)
            await page.goto(URL)
            await page.wait_for_timeout(300)
            await page.screenshot(path=f'{ROOT}/test/{tag}_home.png')
            await page.click('#btn-play')
            await page.wait_for_timeout(2300)  # countdown
            # bot: play up to 25 nodes by always taking a legal action for the current game type
            for i in range(34):
                if not await page.evaluate('Run.active'): break
                await page.wait_for_timeout(120)
                info = await page.evaluate('({key:Run.lastType, node:Run.node, lie:!!document.querySelector(".instr .lie")})')
                key = info['key']
                try:
                    if key == 'tap':
                        sel = '.cell:not(.on)' if info['lie'] else '.cell.on'
                        await page.click(sel, timeout=1500)
                    elif key == 'odd':
                        await page.evaluate('''() => { const cells=[...document.querySelectorAll(".cell")]; const counts={}; cells.forEach(c=>counts[c.textContent]=(counts[c.textContent]||0)+1); const odd=cells.find(c=>counts[c.textContent]===1); odd.click(); }''')
                    elif key == 'bar':
                        # wait until cursor is inside zone then tap
                        await page.wait_for_function('''() => { const z=document.querySelector(".bar-zone"), c=document.querySelector(".bar-cursor"); if(!z||!c) return true; const zr=z.getBoundingClientRect(), cr=c.getBoundingClientRect(); const cx=cr.left+cr.width/2; return cx>zr.left+4 && cx<zr.right-4; }''', timeout=2500)
                        await page.dispatch_event('.tap-any', 'pointerdown')
                    elif key == 'seq':
                        seq = await page.evaluate('document.querySelector(".seq") ? document.querySelector(".seq").textContent.split(" ") : null')
                        if seq:
                            await page.wait_for_selector('.grid', timeout=3000)
                            for g in seq:
                                await page.evaluate(f'''() => {{ [...document.querySelectorAll(".cell")].find(c=>c.textContent==={g!r}).click(); }}''')
                                await page.wait_for_timeout(60)
                    elif key == 'order':
                        n = await page.evaluate('document.querySelectorAll(".node:not(.decoy)").length')
                        order = range(n, 0, -1) if info['lie'] else range(1, n + 1)
                        for k in order:
                            await page.evaluate(f'''() => {{ [...document.querySelectorAll(".node:not(.decoy)")].find(b=>b.textContent==="{k}").click(); }}''')
                            await page.wait_for_timeout(50)
                    elif key == 'arrow':
                        sym = await page.evaluate('document.querySelector(".arrow").textContent')
                        d = {'↑':'up','↓':'down','←':'left','→':'right'}[sym]
                        if info['lie']: d = {'up':'down','down':'up','left':'right','right':'left'}[d]
                        await page.keyboard.press('Arrow' + d.capitalize())
                    elif key == 'math':
                        expr = await page.evaluate('document.querySelector(".instr .hi").textContent')
                        lhs, rhs = expr.split('=')
                        val = eval(lhs.replace('×','*').replace('−','-'))
                        await page.click(f'.choice:has-text("{"TRUE" if val==int(rhs) else "FALSE"}")')
                    elif key == 'stroop':
                        want = await page.evaluate('''() => { const w=document.querySelector(".bigword"); const lie=!!document.querySelector(".instr .hi") && document.querySelector(".instr").textContent.includes("SAYS"); const ink=getComputedStyle(w).color; const choices=[...document.querySelectorAll(".choice")]; const target = lie ? choices.find(c=>c.textContent===w.textContent) : choices.find(c=>getComputedStyle(c).color===ink); target.click(); }''')
                    elif key == 'count':
                        target = await page.evaluate('document.querySelector(".instr .hi").textContent')
                        n = await page.evaluate(f'''() => [...document.querySelectorAll("#arena span")].filter(s=>s.textContent==={target!r}).length''')
                        await page.click(f'.choice:text-is("{n}")')
                    elif key == 'react':
                        await page.wait_for_function('document.querySelector(".bigword") && document.querySelector(".bigword").textContent==="TAP!"', timeout=3500)
                        await page.dispatch_event('.tap-any', 'pointerdown')
                    elif key == 'hold':
                        line = await page.evaluate('parseFloat(document.querySelector(".bar-line").style.left)/100')
                        await page.dispatch_event('.tap-any', 'pointerdown', {'pointerId': 1})
                        await page.wait_for_function(f'''() => parseFloat(document.querySelector(".bar-fill").style.width||"0")/100 >= {line}''', timeout=3000)
                        await page.dispatch_event('.tap-any', 'pointerup', {'pointerId': 1})
                except Exception as ex:
                    errors.append(f'[{tag}] bot failed on {key} node {info["node"]}: {type(ex).__name__}: {str(ex)[:120]}')
                if i == 4: await page.screenshot(path=f'{ROOT}/test/{tag}_game.png')
                await page.wait_for_timeout(350)
            state = await page.evaluate('({score:Run.score,node:Run.node,lives:Run.lives,active:Run.active})')
            print(tag, 'after bot:', state)
            # force game over to test the results screen
            if state['active']:
                await page.evaluate('Run.lives=0; gameOver()')
            await page.wait_for_timeout(1200)
            await page.screenshot(path=f'{ROOT}/test/{tag}_over.png')
            # reboot (free outside portals) -> run resumes with 1 life
            await page.click('#btn-reboot'); await page.wait_for_timeout(2400)
            print(tag, 'after reboot:', await page.evaluate('({active:Run.active,lives:Run.lives,node:Run.node,rebooted:Run.rebooted})'))
            await page.evaluate('Run.lives=0; gameOver()'); await page.wait_for_timeout(800)
            print(tag, 'runs counted:', await page.evaluate('save.runs'), '| reboot hidden:', await page.evaluate('document.querySelector("#btn-reboot").classList.contains("hidden")'))
            print(tag, 'over screen score:', await page.inner_text('#over-score'), '| xp label:', await page.inner_text('#xp-label'))
            await page.click('#btn-home'); await page.wait_for_timeout(200)
            await page.click('#btn-profile'); await page.wait_for_timeout(200)
            await page.screenshot(path=f'{ROOT}/test/{tag}_profile.png')
            await ctx.close()
        await run({'width': 390, 'height': 844}, 'mobile', True)
        await run({'width': 1280, 'height': 800}, 'desktop', False)
        await b.close()
        print('ERRORS:' if errors else 'no console/page errors'); [print(' ', e) for e in errors]

asyncio.run(main())
