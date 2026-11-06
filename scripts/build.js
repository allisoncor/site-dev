#!/usr/bin/env node
// Builds the whole site into _site/ from the source files in this repo.
//
//   node scripts/build.js
//
// - Copies the hand-written pages and assets (index/resume/contact/art-glass, css, js, images, files).
// - Generates the homepage project cards (between the PROJECT CARDS markers in index.html).
// - Generates one page per project folder: projects/<name>/  ->  _site/work/<name>.html
// - Copies each project's hero, numbered images and PDF into _site/projects/<name>/.
//
// A project folder (see projects/README.md):
//   project.txt   card + page text
//   hero.jpg      homepage card image, also first image on the project page
//   1.jpg 2.jpg … gallery images, in number order
//   anything else is ignored (working files, originals/, …)
//
// Plain Node, no dependencies. A GitHub Action runs this same script on every push.

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_PROJECTS = path.join(ROOT, 'projects');
const OUT = path.join(ROOT, '_site');
const IMG = /\.(jpe?g|png|webp|gif)$/i;
const MARK_START = '<!-- PROJECT CARDS -->';
const MARK_END = '<!-- /PROJECT CARDS -->';
// top-level things that are NOT part of the published site
const SKIP = new Set(['.git', '.github', '.gitignore', '_site', 'scripts', 'design', 'projects', 'node_modules', 'README.md']);

const warnings = [];
const warn = m => { warnings.push(m); console.warn('! ' + m); };

// ---------- helpers ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const urlPath = p => p.split('/').map(encodeURIComponent).join('/');
// Keep the last three words together so a paragraph never ends on a lone word.
const noOrphan = s => esc(s).replace(/ (\S+) (\S+)$/, '&nbsp;$1&nbsp;$2');
// Titles with descenders (g, j, p, q, y, J) need the .project--desc spacing tweak (see style.css).
const hasDescender = t => /[gjpqyJ]/.test(t);

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === '.DS_Store' || e.name.startsWith('._')) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

// Width/height of a JPEG, PNG, GIF or WebP, read from the file header (no libraries).
function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.toString('ascii', 0, 3) === 'GIF') return [b.readUInt16LE(6), b.readUInt16LE(8)];
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
    if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + len;
    }
  }
  return null;
}

// project.txt: "key: value" lines, a blank line, then the page description (blank lines = new paragraph).
function readProjectFile(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const meta = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^([a-z-]+):\s*(.*)$/i);
    if (!m) break;
    meta[m[1].toLowerCase()] = m[2].trim();
  }
  const paragraphs = lines.slice(i).join('\n').trim()
    .split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  return { meta, paragraphs };
}

// ---------- read projects ----------
function loadProjects() {
  const list = [];
  for (const e of fs.readdirSync(SRC_PROJECTS, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const name = e.name, dir = path.join(SRC_PROJECTS, name);
    if (!fs.existsSync(path.join(dir, 'project.txt'))) { warn(`projects/${name}: no project.txt, skipped`); continue; }
    if (!/^[a-z0-9-]+$/.test(name)) { warn(`projects/${name}: folder names must be lowercase letters, numbers and dashes — skipped`); continue; }

    const { meta, paragraphs } = readProjectFile(path.join(dir, 'project.txt'));
    const files = fs.readdirSync(dir);
    const hero = files.find(f => /^hero\./i.test(f) && IMG.test(f));
    const gallery = files.filter(f => /^\d+\./.test(f) && IMG.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
    const layout = (meta.layout || 'tile').toLowerCase();

    if (!meta.title) warn(`projects/${name}: no "title:" line`);
    if (!hero) warn(`projects/${name}: no hero image (hero.jpg) — homepage card will have no picture`);
    if (!['hero', 'tile', 'wide', 'hidden'].includes(layout)) warn(`projects/${name}: layout "${layout}" should be hero, tile, wide or hidden`);
    if (meta.pdf && !files.includes(meta.pdf)) warn(`projects/${name}: pdf "${meta.pdf}" not found in the folder`);

    list.push({
      name, meta, paragraphs, hero, gallery, layout,
      title: meta.title || name,
      order: Number.isFinite(parseFloat(meta.order)) ? parseFloat(meta.order) : 999,
      card: meta.card || paragraphs[0] || '',
      button: meta.button || 'View Project',
      alt: meta.alt || meta.title || name,
      showHero: !/^(no|false)$/i.test(meta['show-hero'] || ''),
    });
  }
  return list.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

// ---------- homepage cards ----------
function card(p, indent) {
  const cls = ['project'];
  if (p.layout === 'hero') cls.push('project--hero');
  if (p.layout === 'wide') cls.push('project--wide');
  if (hasDescender(p.title)) cls.push('project--desc');
  const href = `work/${p.name}.html`;
  let img = '';
  if (p.hero) {
    const src = `projects/${p.name}/${p.hero}`;
    const size = imageSize(path.join(SRC_PROJECTS, p.name, p.hero));
    img = `<img src="${urlPath(src)}" alt="${esc(p.alt)}"${size ? ` width="${size[0]}" height="${size[1]}"` : ''}>`;
  }
  const i = indent;
  return `${i}<article class="${cls.join(' ')}">
${i}  <a class="project-image" href="${href}">
${i}    ${img}
${i}  </a>
${i}  <div class="project-meta">
${i}    <div class="project-text">
${i}      <h2>${esc(p.title)}</h2>
${i}      <p>${noOrphan(p.card)}</p>
${i}    </div>
${i}    <a class="btn" href="${href}">${esc(p.button)} <img class="arrow" src="images/Icons/Arrow down.png" alt="" width="62" height="62"></a>
${i}  </div>
${i}</article>`;
}

function homepageCards(projects) {
  // Hero cards stand alone; runs of tile/wide cards share one 2-column grid.
  const out = [];
  let grid = [];
  const flush = () => {
    if (!grid.length) return;
    out.push(`      <div class="project-grid">\n\n${grid.map(p => card(p, '        ')).join('\n\n')}\n\n      </div>`);
    grid = [];
  };
  for (const p of projects.filter(p => p.layout !== 'hidden')) {
    if (p.layout === 'hero') { flush(); out.push(card(p, '      ')); } else grid.push(p);
  }
  flush();
  return out.join('\n\n');
}

// ---------- project page ----------
function projectPage(p, prev, next, shell) {
  const images = [...(p.showHero && p.hero ? [p.hero] : []), ...p.gallery].map(f => `projects/${p.name}/${f}`);
  const gallery = images.map((src, n) => {
    const size = imageSize(path.join(ROOT, src));
    return `
      <figure class="work-figure">
        <a href="../${urlPath(src)}" target="_blank" rel="noopener"><img src="../${urlPath(src)}" alt="${esc(p.title)} — image ${n + 1} of ${images.length}"${size ? ` width="${size[0]}" height="${size[1]}"` : ''} loading="${n < 2 ? 'eager' : 'lazy'}"></a>
      </figure>`;
  }).join('');

  const links = [];
  if (p.meta.pdf) links.push(`<a class="btn" href="../${urlPath(`projects/${p.name}/${p.meta.pdf}`)}" target="_blank" rel="noopener">${esc(p.meta['pdf-label'] || 'View PDF')}</a>`);
  if (p.meta.behance) links.push(`<a class="work-link" href="${esc(p.meta.behance)}" target="_blank" rel="noopener">View on Behance</a>`);
  const pager = (q, cls, label) => q
    ? `<a class="work-pager__${cls}" href="${q.name}.html"><span>${label}</span>${esc(q.title)}</a>`
    : '<span></span>';
  const paragraphs = p.paragraphs.length ? p.paragraphs : [p.card];

  const main = `  <main class="work">
    <a class="work-back" href="../index.html">&larr; All projects</a>
    <h1 class="site-title work-title">${esc(p.title)}</h1>

    <div class="work-intro">
${paragraphs.map(t => `      <p>${noOrphan(t)}</p>`).join('\n')}${links.length ? `
      <div class="work-links">${links.join(' ')}</div>` : ''}
    </div>

    <div class="work-gallery">${gallery}
    </div>

    <nav class="work-pager" aria-label="More projects">
      ${pager(prev, 'prev', '&larr; Previous')}
      ${pager(next, 'next', 'Next &rarr;')}
    </nav>
  </main>`;

  return shell
    .replace('<!-- TITLE -->', `${esc(p.title)} — Allison Correnti`)
    .replace('<!-- DESCRIPTION -->', esc((paragraphs[0] || p.title).slice(0, 155)))
    .replace('<!-- MAIN -->', main);
}

// The project-page shell is built from art-glass.html, so the banner, footer, fonts and
// stylesheet version always match the hand-written pages. Paths get a ../ prefix.
function pageShell() {
  let h = fs.readFileSync(path.join(ROOT, 'art-glass.html'), 'utf8');
  h = h.replace(/<title>[\s\S]*?<\/title>/, '<title><!-- TITLE --></title>')
       .replace(/(<meta name="description" content=")[^"]*/, '$1<!-- DESCRIPTION -->')
       .replace(/  <main>[\s\S]*?<\/main>/, '<!-- MAIN -->')
       .replace(/(href|src)="(?!https?:|mailto:|#|\/|\.\.\/)([^"]+)"/g, '$1="../$2"');
  return h;
}

// ---------- build ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);

for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
  const s = path.join(ROOT, e.name), d = path.join(OUT, e.name);
  e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
}

const projects = loadProjects();

// project files that are published: hero, numbered images, the PDF
for (const p of projects) {
  const dst = path.join(OUT, 'projects', p.name);
  fs.mkdirSync(dst, { recursive: true });
  for (const f of [p.hero, ...p.gallery, p.meta.pdf].filter(Boolean)) {
    const s = path.join(SRC_PROJECTS, p.name, f);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(dst, f));
  }
}

// homepage
const indexSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const a = indexSrc.indexOf(MARK_START), b = indexSrc.indexOf(MARK_END);
if (a < 0 || b < a) {
  warn(`index.html: ${MARK_START} … ${MARK_END} markers not found — homepage cards not generated`);
} else {
  const html = indexSrc.slice(0, a + MARK_START.length) + '\n' + homepageCards(projects) + '\n      ' + indexSrc.slice(b);
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
}

// project pages (Previous / Next follow homepage order; hidden projects still get a page)
const shell = pageShell();
fs.mkdirSync(path.join(OUT, 'work'), { recursive: true });
projects.forEach((p, i) => {
  fs.writeFileSync(path.join(OUT, 'work', `${p.name}.html`), projectPage(p, projects[i - 1], projects[i + 1], shell));
  console.log(`+ ${p.layout.padEnd(6)} ${String(p.order).padStart(3)}  work/${p.name}.html  (${(p.showHero && p.hero ? 1 : 0) + p.gallery.length} images)`);
});

// Dev/preview copies: SITE_NOINDEX=1 asks search engines to stay away (meta tag + robots.txt).
if (/^(1|true|yes)$/i.test(process.env.SITE_NOINDEX || '')) {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const f = path.join(d, e.name);
    if (e.isDirectory()) return walk(f);
    if (!f.endsWith('.html')) return;
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('<head>', '<head>\n  <meta name="robots" content="noindex, nofollow">'));
  });
  walk(OUT);
  fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  console.log('noindex: on (dev copy)');
}

console.log(`\nBuilt ${projects.length} projects into _site/${warnings.length ? ` with ${warnings.length} warning(s)` : ''}.`);
