// Empaqueta todo (Three.js incluido) en un único HTML que funciona sin internet.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

const out = new URL('../index.html', import.meta.url);
const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile('src/style.css', 'utf8');
const html = (await readFile('src/index.html', 'utf8'))
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => js);
await writeFile(out, html);
console.log(`v2/index.html · ${(html.length / 1024).toFixed(0)} KB`);
