// Inlines src/style.css + src/core.js + src/games.js into a single dist/index.html (portal-ready),
// and writes dist/artifact.html (same page without the document skeleton, for claude.ai artifact publishing).
const fs = require('fs'), path = require('path');
const src = p => fs.readFileSync(path.join(__dirname, 'src', p), 'utf8');
const html = src('index.src.html'), css = src('style.css'), js = src('core.js') + '\n' + src('games.js');
const out = html.replace('/* __CSS__ */', () => css).replace('/* __JS__ */', () => js);
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), out);
// artifact variant: strip doctype/html/head/body wrappers, keep title+style+content+script
const bodyInner = out.match(/<body>([\s\S]*)<\/body>/)[1];
const artifact = `<title>OVERRIDE</title>\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<style>\n${css}\n</style>\n${bodyInner}`;
fs.writeFileSync(path.join(__dirname, 'dist', 'artifact.html'), artifact);
console.log('built dist/index.html', (out.length/1024).toFixed(1)+'KB');
