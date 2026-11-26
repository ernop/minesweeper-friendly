'use strict';
// Structural checks preventing cold-start agent documentation drift and
// cross-page/worker cache-tag mismatches (AGENTS.md).
//
// Usage: node tests/agent-docs-test.js

const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
const MAX_AGENTS_BYTES = 18 * 1024;

let checks = 0;
function check(name, condition, detail = '') {
  checks++;
  if (!condition) {
    throw new Error(detail ? `${name}: ${detail}` : name);
  }
}

function readText(rel) {
  return fs.readFileSync(path.join(repo, rel), 'utf8');
}

function githubSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

const headingsCache = new Map();
function headingsOf(absPath) {
  if (!headingsCache.has(absPath)) {
    const text = fs.readFileSync(absPath, 'utf8');
    const counts = new Map();
    const set = new Set();
    let inFence = false;
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const m = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
      if (!m) continue;
      const base = githubSlug(m[1]);
      const seen = counts.get(base) || 0;
      counts.set(base, seen + 1);
      set.add(seen === 0 ? base : `${base}-${seen}`);
    }
    headingsCache.set(absPath, set);
  }
  return headingsCache.get(absPath);
}

// 1. AGENTS.md size cap (< 18 KB so no agent harness truncates startup rules)
const agentsBuf = fs.readFileSync(path.join(repo, 'AGENTS.md'));
const agentsText = agentsBuf.toString('utf8');
check(
  'AGENTS.md stays under 18 KB startup budget',
  agentsBuf.length <= MAX_AGENTS_BYTES,
  `${agentsBuf.length} bytes > ${MAX_AGENTS_BYTES}`
);

// 2. AGENTS.md game/ table matches index.html exact load order
const indexHtml = readText('index.html');
const indexScripts = [...indexHtml.matchAll(/<script\b[^>]*\bsrc="([^"?]+)(?:\?v=[^"]*)?"/g)]
  .map((m) => m[1]);
const indexGameFiles = indexScripts
  .filter((s) => s.startsWith('game/'))
  .map((s) => s.slice('game/'.length));
const indexNonGameFiles = indexScripts.filter((s) => !s.startsWith('game/'));

const tableGameFiles = [...agentsText.matchAll(/^\| `([a-z0-9-]+\.js)` \|/gm)]
  .map((m) => m[1]);
check(
  'AGENTS.md game/ load-order table matches index.html',
  JSON.stringify(tableGameFiles) === JSON.stringify(indexGameFiles),
  `AGENTS=[${tableGameFiles.join(', ')}] vs index.html=[${indexGameFiles.join(', ')}]`
);

// 3. AGENTS.md Game page bullet matches index.html exact non-game script order
const gamePageBullet = agentsText.match(/- \*\*Game page \(`index\.html` \+ `style\.css`\):\*\*([\s\S]*?)\n- \*\*Companion pages:\*\*/);
check('AGENTS.md has Game page runtime bullet', Boolean(gamePageBullet));
const documentedNonGame = [...gamePageBullet[1].matchAll(/`([a-z0-9-]+\.js)`/g)]
  .map((m) => m[1]);
check(
  'AGENTS.md Game page script list matches index.html non-game order',
  JSON.stringify(documentedNonGame) === JSON.stringify(indexNonGameFiles),
  `AGENTS=[${documentedNonGame.join(', ')}] vs index.html=[${indexNonGameFiles.join(', ')}]`
);

// 4. Every shipped runtime file (outside game/ and favicon.svg) appears in AGENTS.md
const runtimeFiles = JSON.parse(readText('deploy/runtime-files.json'));
const missingRuntime = runtimeFiles.filter(
  (file) => !file.startsWith('game/') && file !== 'favicon.svg' && !agentsText.includes(file)
);
check(
  'AGENTS.md mentions every non-game file in deploy/runtime-files.json',
  missingRuntime.length === 0,
  `missing: ${missingRuntime.join(', ')}`
);

// 5. Every docs/product/*.md and docs/implementation/*.md is indexed in AGENTS.md,
//    and docs/ root holds no stray unindexed markdown files
const productDocs = fs.readdirSync(path.join(repo, 'docs/product')).filter((f) => f.endsWith('.md')).sort();
const implDocs = fs.readdirSync(path.join(repo, 'docs/implementation')).filter((f) => f.endsWith('.md')).sort();
const unindexedProduct = productDocs.filter((f) => !agentsText.includes(`docs/product/${f}`));
const unindexedImpl = implDocs.filter((f) => !agentsText.includes(`docs/implementation/${f}`));
const strayDocsRoot = fs.readdirSync(path.join(repo, 'docs')).filter((f) => f.endsWith('.md'));
check(
  'every docs/product/*.md is indexed in AGENTS.md',
  unindexedProduct.length === 0,
  `unindexed: ${unindexedProduct.join(', ')}`
);
check(
  'every docs/implementation/*.md is indexed in AGENTS.md',
  unindexedImpl.length === 0,
  `unindexed: ${unindexedImpl.join(', ')}`
);
check(
  'docs/ root contains no stray markdown files outside product/ and implementation/',
  strayDocsRoot.length === 0,
  `stray: ${strayDocsRoot.join(', ')}`
);

// 6. All relative markdown links and heading anchors resolve across core docs
const mdFilesToCheck = [
  'AGENTS.md',
  'PRODUCT.md',
  'BACKLOG.md',
  'README.md',
  'reference/README.md',
  ...productDocs.map((f) => `docs/product/${f}`),
  ...implDocs.map((f) => `docs/implementation/${f}`),
];
const cursorRulesDir = path.join(repo, '.cursor/rules');
if (fs.existsSync(cursorRulesDir)) {
  for (const f of fs.readdirSync(cursorRulesDir)) {
    if (f.endsWith('.mdc') || f.endsWith('.md')) mdFilesToCheck.push(`.cursor/rules/${f}`);
  }
}

const brokenLinks = [];
for (const rel of mdFilesToCheck) {
  const abs = path.join(repo, rel);
  const text = fs.readFileSync(abs, 'utf8');
  let inFence = false;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const m of line.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = m[1].trim();
      if (/^(?:https?:|mailto:|file:|#)/.test(target)) {
        if (target.startsWith('#')) {
          const anchor = target.slice(1);
          if (!headingsOf(abs).has(anchor)) {
            brokenLinks.push(`${rel}:${i + 1} -> ${target} (missing local anchor)`);
          }
        }
        continue;
      }
      const [filePart, anchor] = target.split('#');
      const resolved = path.resolve(path.dirname(abs), filePart);
      if (!fs.existsSync(resolved)) {
        brokenLinks.push(`${rel}:${i + 1} -> ${target} (missing target file)`);
      } else if (anchor && resolved.endsWith('.md')) {
        if (!headingsOf(resolved).has(anchor)) {
          brokenLinks.push(`${rel}:${i + 1} -> ${target} (missing anchor #${anchor})`);
        }
      }
    }
  }
}
check(
  'all relative markdown links and heading anchors resolve',
  brokenLinks.length === 0,
  brokenLinks.slice(0, 10).join('; ')
);

// 7. Shared ?v= cache-tag parity across all root HTML pages, workers, and worker creators
const rootEntries = fs.readdirSync(repo);
const htmlFiles = rootEntries.filter((f) => f.endsWith('.html')).sort();
const workerAndCreatorJs = rootEntries
  .filter((f) => f.endsWith('-worker.js') || ['analysis-client.js', 'training-page.js', 'board-metrics-ui.js', 'archive.js'].includes(f))
  .sort();

const tagsByAsset = new Map();
function recordAsset(asset, file, tag) {
  if (/^(?:https?:|data:|\/)/.test(asset)) return;
  if (!tagsByAsset.has(asset)) tagsByAsset.set(asset, []);
  const list = tagsByAsset.get(asset);
  if (!list.some((e) => e.file === file && e.tag === tag)) {
    list.push({ file, tag });
  }
}

for (const file of htmlFiles) {
  const html = readText(file);
  for (const m of html.matchAll(/\b(?:src|href)="([^"?]+\.(?:js|css))(?:\?v=([^"]*))?"/g)) {
    recordAsset(m[1], file, m[2] || '(none)');
  }
}
for (const file of workerAndCreatorJs) {
  const js = readText(file);
  for (const m of js.matchAll(/\bnew Worker\(\s*['"]([^'"?]+\.js)(?:\?v=([^'"]*))?['"]\s*\)/g)) {
    recordAsset(m[1], file, m[2] || '(none)');
  }
  for (const block of js.matchAll(/\bimportScripts\(([\s\S]*?)\)/g)) {
    for (const m of block[1].matchAll(/['"]([^'"?]+\.js)(?:\?v=([^'"]*))?['"]/g)) {
      recordAsset(m[1], file, m[2] || '(none)');
    }
  }
}

const tagMismatches = [];
for (const [asset, refs] of tagsByAsset.entries()) {
  if (refs.length < 2) continue;
  const distinct = new Set(refs.map((r) => r.tag));
  if (distinct.size > 1) {
    tagMismatches.push(`${asset}: ${refs.map((r) => `${r.file}=${r.tag}`).join(', ')}`);
  }
}
check(
  'shared JS/CSS assets use matching ?v= cache tags across HTML pages and workers',
  tagMismatches.length === 0,
  tagMismatches.join('; ')
);

// 8. Cold-start hygiene in docs/product/: no chronological chat-transcript tags
const hygieneViolations = [];
const FORBIDDEN_DOC_PATTERNS = [
  /\bcreator (?:request|decision|direction|report) 202\d-\d\d-\d\d/i,
  /\bverbatim\b/i,
];
for (const f of productDocs) {
  const text = readText(`docs/product/${f}`);
  for (const re of FORBIDDEN_DOC_PATTERNS) {
    const match = text.match(re);
    if (match) hygieneViolations.push(`docs/product/${f} matched ${JSON.stringify(match[0])}`);
  }
}
check(
  'docs/product/*.md stay free of dated creator-request tags and verbatim chat quotes',
  hygieneViolations.length === 0,
  hygieneViolations.join('; ')
);

console.log(`agent-docs-test: all ${checks} checks passed`);
