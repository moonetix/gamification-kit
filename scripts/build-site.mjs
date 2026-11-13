// Assembles the GitHub Pages demo in _site/: the static page from site/, the library from
// src/ (comments removed, code unchanged) and the test vector count from test-vectors/.
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
const vectorCount = Object.values(vectors).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
const html = readFileSync(join(root, 'site', 'index.html'), 'utf8').replaceAll('{{VECTOR_COUNT}}', String(vectorCount));
writeFileSync(join(out, 'index.html'), html);

const lib = await import(pathToFileURL(join(out, 'src', 'index.js')).href);
const { result } = lib.checkIn({ lastDate: '2026-11-09', streak: 4, longest: 9, freezes: 1 }, { at: 1794450600, timeZone: 'America/New_York' });
if (result.streak !== 5 || result.usedFreezes !== 1) throw new Error('stripped library copy does not reproduce the README example');

console.log(`_site built: ${readdirSync(join(out, 'src')).length} library files, ${vectorCount} test vectors`);
