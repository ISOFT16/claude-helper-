// Склеивает собранные файлы в одну страницу для claude.ai: standalone/umny-urok.html
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, 'dist');
const js = fs.readFileSync(path.join(dir, 'app.js'), 'utf8').replaceAll('</script', '<\\/script');
const css = fs.readFileSync(path.join(dir, 'app.css'), 'utf8');

const html = `<title>Умный урок</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${css}
</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>
${js}
</script>
`;
const out = path.join(import.meta.dirname, 'umny-urok.html');
fs.writeFileSync(out, html);
console.log(`Готово: ${out} (${(html.length / 1024).toFixed(0)} КБ)`);
