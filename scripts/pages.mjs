// Après `vite build` : renomme dist/dev.html en dist/index.html et écrit à la racine du dépôt un index.html
// autonome (CSS et JS intégrés) pour que GitHub Pages fonctionne même s'il publie la branche du code source.
import { readFileSync, writeFileSync, renameSync, existsSync, readdirSync } from 'node:fs';

if (existsSync('dist/dev.html')) renameSync('dist/dev.html', 'dist/index.html');
let html = readFileSync('dist/index.html', 'utf8');
const assets = readdirSync('dist/assets');
html = html.replace(/<script type="module" crossorigin src="\.\/assets\/([^"]+)"><\/script>/, (_, f) => '');
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/assets\/([^"]+)">/, (_, f) => `<style>${readFileSync(`dist/assets/${f}`, 'utf8')}</style>`);
const js = assets.find((f) => f.endsWith('.js'));
const code = readFileSync(`dist/assets/${js}`, 'utf8').replace(/<\/script/g, '<\\/script');
html = html.replace('<head>', '<head>\n    <script>window.__ASSET_BASE = \'./public/\';</script>');
html = html.replace('</body>', () => `<script type="module">\n${code}\n</script>\n</body>`);
html = html.replace('<link rel="icon" href="./favicon.svg" />', '<link rel="icon" href="./public/favicon.svg" />').replace('<link rel="manifest" href="./manifest.webmanifest" />', '');
writeFileSync('index.html', html.replace('<!doctype html>', '<!doctype html>\n<!-- Fichier généré par « npm run build » (scripts/pages.mjs) : jeu compilé autonome. Sources : src/, page de développement : dev.html -->'));
console.log(`index.html autonome écrit (${Math.round(html.length / 1024)} ko)`);
