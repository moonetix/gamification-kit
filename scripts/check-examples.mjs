// Keeps the README honest: every js and php block in README.md must be one of the files in
// examples/, and each `// -> value` comment must be what that file really prints.
// Usage: node scripts/check-examples.mjs js|php
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const lang = process.argv[2];
if (lang !== 'js' && lang !== 'php') throw new Error('usage: check-examples.mjs js|php');
const root = new URL('../', import.meta.url);
const ext = lang === 'js' ? '.mjs' : '.php';
const readmeRequire = "require 'vendor/autoload.php';";
const fileRequire = "require __DIR__ . '/../vendor/autoload.php';";

const readme = readFileSync(new URL('README.md', root), 'utf8');
const blocks = [...readme.matchAll(new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'g'))].map((m) => m[1]);
const files = readdirSync(new URL('examples/', root)).filter((f) => f.endsWith(ext));
const sources = Object.fromEntries(files.map((f) => [f, readFileSync(new URL(`examples/${f}`, root), 'utf8')]));

let failures = 0;
blocks.forEach((block, i) => {
  const asFile = lang === 'php' ? `<?php\n\n${block.replace(readmeRequire, fileRequire)}` : block;
  if (!Object.values(sources).includes(asFile)) {
    failures++;
    console.log(`README ${lang} block ${i + 1} does not match any file in examples/`);
  }
});

for (const [file, source] of Object.entries(sources)) {
  const path = new URL(`examples/${file}`, root).pathname;
  const out = execFileSync(lang === 'js' ? process.execPath : 'php', [path], { encoding: 'utf8' }).trimEnd().split('\n');
  const expected = [...source.matchAll(/^\/\/ -> (.*)$/gm)].map((m) => m[1]);
  if (JSON.stringify(out) !== JSON.stringify(expected)) {
    failures++;
    console.log(`examples/${file}: output differs\n  expected ${JSON.stringify(expected)}\n  got      ${JSON.stringify(out)}`);
  }
}

console.log(`${failures === 0 ? 'OK' : 'FAILED'}: ${blocks.length} README ${lang} blocks, ${files.length} example files`);
process.exit(failures === 0 ? 0 : 1);
