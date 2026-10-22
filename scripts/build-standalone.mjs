import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path, encoding = 'utf8') => readFile(new URL(path, root), encoding);
const [markup, css, js, vector] = await Promise.all([
  read('src/ticket.html'), read('src/styles.css'), read('src/ticket.js'), read('public/assets/golden-ticket.svg'),
]);

const readyMarkup = markup.replace('<!-- VECTOR_ARTWORK -->', vector.replace('<svg ', '<svg class="artwork" '));
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#fefefc" />
  <title>Té Company — Golden Ticket</title>
  <link rel="icon" href="data:," />
  <style>${css}</style>
</head>
<body>
${readyMarkup}
<script>${js.replace('export function initGoldenTicket', 'function initGoldenTicket')}
initGoldenTicket(document);
</script>
</body>
</html>
`;
const output = new URL('golden-ticket.html', root);
await writeFile(output, html);
console.log(`Portable HTML saved to ${fileURLToPath(output)}`);
