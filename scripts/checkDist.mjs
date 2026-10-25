// Fails when dist/ was not built from the current src/: every bundle must
// carry the DEFAULT_DELEGATE_URL that src/types.ts defines. Runs after the
// build in prepublishOnly, so a stale dist/ is never published.
import { readFileSync, readdirSync } from 'node:fs';

const types = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');
const match = types.match(/DEFAULT_DELEGATE_URL\s*=\s*'([^']+)'/);
if (!match) {
  console.error('checkDist: DEFAULT_DELEGATE_URL not found in src/types.ts');
  process.exit(1);
}
const expected = match[1];

const dist = new URL('../dist/', import.meta.url);
const bundles = ['index.js', 'content.js', 'widget.js', 'id.iife.js'];
const problems = [];
for (const name of bundles) {
  let text;
  try {
    text = readFileSync(new URL(name, dist), 'utf8');
  } catch {
    problems.push(`${name} is missing`);
    continue;
  }
  if (!text.includes(expected)) problems.push(`${name} does not contain ${expected}`);
}
for (const name of readdirSync(dist).filter((f) => f.endsWith('.js'))) {
  const text = readFileSync(new URL(name, dist), 'utf8');
  for (const [, value] of text.matchAll(/DEFAULT_DELEGATE_URL\s*=\s*"([^"]+)"/g)) {
    if (value !== expected) problems.push(`${name} defines DEFAULT_DELEGATE_URL = ${value}`);
  }
}

if (problems.length) {
  console.error(`checkDist: dist/ does not match src/ (expected ${expected}):`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('Run npm run build.');
  process.exit(1);
}
console.log(`checkDist: dist/ uses ${expected}`);
