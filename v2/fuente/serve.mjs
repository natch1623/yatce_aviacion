// Servidor local mínimo para previsualizar la presentación (http://localhost:5178)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const file = new URL('../index.html', import.meta.url);
createServer(async (req, res) => {
  try {
    const html = await readFile(file);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(5178, () => console.log('http://localhost:5178'));
