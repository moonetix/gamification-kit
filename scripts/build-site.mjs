// Assembles the GitHub Pages demo in _site/: the static page from site/, the library from
// src/ (comments removed, code unchanged) and the header facts from test-vectors/, package.json,
// composer.json and the build environment.
// Node built-ins only. Run: node scripts/build-site.mjs
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '_site');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'src'), { recursive: true });

for (const name of readdirSync(join(root, 'site')).sort()) {
  if (name === 'index.html') continue;
  cpSync(join(root, 'site', name), join(out, name), { recursive: true });
}

function stripComments(code, file) {
  const lines = code.split('\n');
  const kept = [];
  let inBlock = false;
  for (const line of lines) {
    const t = line.trim();
    if (inBlock) {
      if (t.endsWith('*/')) inBlock = false;
      continue;
    }
    if (t.startsWith('/*')) {
      if (!t.endsWith('*/')) inBlock = true;
      continue;
    }
    if (t.startsWith('//')) continue;
    kept.push(line.replace(/;\s+\/\/ .*$/, ';'));
  }
  const result = kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
  if (/\/\/|\/\*/.test(result)) throw new Error(`${file}: comment left after stripping; extend stripComments`);
  return result;
}

for (const name of readdirSync(join(root, 'src')).sort()) {
  if (!name.endsWith('.js')) continue;
  const code = readFileSync(join(root, 'src', name), 'utf8');
  writeFileSync(join(out, 'src', name), stripComments(code, name));
}

const vectors = JSON.parse(readFileSync(join(root, 'test-vectors', 'vectors.json'), 'utf8'));
const vectorGroups = Object.values(vectors).filter((v) => Array.isArray(v));
const vectorCount = vectorGroups.reduce((n, v) => n + v.length, 0);

const lib = await import(pathToFileURL(join(out, 'src', 'index.js')).href);
const { result } = lib.checkIn({ lastDate: '2026-11-09', streak: 4, longest: 9, freezes: 1 }, { at: 1794450600, timeZone: 'America/New_York' });
if (result.streak !== 5 || result.usedFreezes !== 1) throw new Error('stripped library copy does not reproduce the README example');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const composer = JSON.parse(readFileSync(join(root, 'composer.json'), 'utf8'));
function minVersion(range, what) {
  const m = /^>=\s*(\d+(?:\.\d+)*)$/.exec(String(range ?? '').trim());
  if (!m) throw new Error(`${what}: expected a ">=x.y" range, got ${JSON.stringify(range)}`);
  return `${m[1]}+`;
}
const commit = (process.env.GITHUB_SHA || '').slice(0, 7);
const fill = {
  VECTOR_COUNT: vectorCount,
  VECTOR_GROUPS: vectorGroups.length,
  FUNCTIONS: Object.values(lib).filter((v) => typeof v === 'function').length,
  NODE_MIN: minVersion(pkg.engines?.node, 'package.json engines.node'),
  PHP_MIN: minVersion(composer.require?.php, 'composer.json require.php'),
  VERSION: pkg.version,
  BUILT: new Date().toISOString().slice(0, 10),
  NODE: process.version,
  COMMIT: commit ? `<a class="mono" href="https://github.com/moonetix/gamification-kit/commit/${commit}">${commit}</a>` : 'local build',
};
let html = readFileSync(join(root, 'site', 'index.html'), 'utf8');
for (const [name, value] of Object.entries(fill)) {
  if (value === undefined || value === null || value === '' || value === 0) throw new Error(`site/index.html: no value for {{${name}}}`);
  html = html.replaceAll(`{{${name}}}`, String(value));
}
const left = html.match(/\{\{[A-Z_]+\}\}/g);
if (left) throw new Error(`site/index.html: unknown placeholders ${[...new Set(left)].join(', ')}`);
writeFileSync(join(out, 'index.html'), html);

console.log(`_site built: ${readdirSync(join(out, 'src')).length} library files, ${vectorCount} test vectors`);
