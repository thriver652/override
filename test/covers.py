"""Renders the three CrazyGames cover images (landscape 1920x1080, portrait 800x1200, square 800x800)
plus a 512x512 icon, into covers/. Title only on the art, per CrazyGames cover rules."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'covers'); os.makedirs(OUT, exist_ok=True)

def html(w, h, scale, tagline=True):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{{margin:0;width:{w}px;height:{h}px;overflow:hidden;background:#05060a;font-family:Inter,"Segoe UI",system-ui,Arial,sans-serif}}
    .bg{{position:absolute;inset:0;background:
      radial-gradient({w*0.7}px {h*0.6}px at 30% 20%, rgba(0,240,255,.22), transparent 60%),
      radial-gradient({w*0.6}px {h*0.6}px at 80% 90%, rgba(255,43,214,.22), transparent 60%),#05060a}}
    .grid{{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:{int(64*scale)}px {int(64*scale)}px;
      mask-image:radial-gradient(circle at 50% 50%,#000 20%,transparent 75%);-webkit-mask-image:radial-gradient(circle at 50% 50%,#000 20%,transparent 75%)}}
    .scan{{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(0,0,0,.28) 3px 4px);opacity:.5}}
    .wrap{{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:{int(18*scale)}px}}
    .eye{{position:relative;width:{int(150*scale)}px;height:{int(150*scale)}px;border-radius:50%;border:{int(12*scale)}px solid #00f0ff;box-shadow:0 0 {int(60*scale)}px #00f0ff,inset 0 0 {int(40*scale)}px rgba(0,240,255,.4)}}
    .eye::after{{content:"";position:absolute;left:50%;top:50%;width:{int(46*scale)}px;height:{int(46*scale)}px;margin:{int(-23*scale)}px;border-radius:50%;background:#ff2bd6;box-shadow:0 0 {int(50*scale)}px #ff2bd6}}
    .eye::before{{content:"";position:absolute;left:-{int(60*scale)}px;right:-{int(60*scale)}px;top:50%;height:{int(4*scale)}px;margin-top:-{int(2*scale)}px;background:linear-gradient(90deg,transparent,#00f0ff,transparent);opacity:.7}}
    .logo{{font-size:{int(190*scale)}px;font-weight:900;letter-spacing:-.05em;line-height:.9;margin-top:{int(10*scale)}px}}
    .logo span{{color:#00f0ff;text-shadow:0 0 {int(40*scale)}px rgba(0,240,255,.8),0 0 {int(90*scale)}px rgba(0,240,255,.35)}}
    .logo .b{{color:#ff2bd6;text-shadow:0 0 {int(40*scale)}px rgba(255,43,214,.8),0 0 {int(90*scale)}px rgba(255,43,214,.35)}}
    .tag{{font-family:Consolas,Menlo,monospace;font-size:{int(34*scale)}px;letter-spacing:.35em;color:#e8f1ff;opacity:.9;text-transform:uppercase}}
    .tag b{{color:#ff2bd6;font-weight:800}}
    .corner{{position:absolute;font-family:Consolas,monospace;font-size:{int(18*scale)}px;letter-spacing:.3em;color:rgba(232,241,255,.35)}}
    </style></head><body>
    <div class="bg"></div><div class="grid"></div>
    <div class="wrap">
      <div class="eye"></div>
      <div class="logo"><span>OVER</span><span class="b">RIDE</span></div>
      {'<div class="tag">the AI <b>lies</b></div>' if tagline else ''}
    </div>
    <div class="scan"></div>
    </body></html>"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        specs = [('cover_landscape_1920x1080.png',1920,1080,1.0,False),('cover_portrait_800x1200.png',800,1200,0.62,False),
                 ('cover_square_800x800.png',800,800,0.56,False),('icon_512.png',512,512,0.36,False),
                 ('social_landscape_tagline.png',1920,1080,1.0,True),('social_portrait_tagline.png',800,1200,0.62,True)]
        for name,w,h,sc,tag in specs:
            page = await b.new_page(viewport={'width':w,'height':h})
            await page.set_content(html(w,h,sc,tag)); await page.wait_for_timeout(200)
            await page.screenshot(path=os.path.join(OUT,name)); await page.close(); print('wrote',name)
        await b.close()
asyncio.run(main())
