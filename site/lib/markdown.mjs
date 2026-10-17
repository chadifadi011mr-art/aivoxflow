// Minimal, safe Markdown-subset renderer for AIVOXFLOW content.
// Safety model: escape ALL raw HTML first, then transform. No raw HTML
// passthrough by design — external/AI-generated content is untrusted input.
//
// Supported: ## ### #### headings, paragraphs, nested - and 1. lists,
// > quotes, ``` fences (optional language), GFM pipe tables with alignment,
// ![images](src) with automatic width/height, --- rules, **bold**, *italic*,
// `code`, [text](https|/relative links).

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Unicode-aware slug: keeps Arabic/Cyrillic/CJK letters instead of stripping
// everything non-ASCII (which produced empty ids and broken anchors).
export const slugify = (s) => {
  const base = String(s).toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')          // Latin combining accents only
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim().replace(/[\s-]+/g, '-').replace(/^-|-$/g, '');
  return base || 'section';
};

const safeUrl = (url) => {
  const u = String(url).trim();
  // http(s), root-relative, hash, or a plain relative path. Everything else
  // (javascript:, data:, protocol-relative //host) is rejected.
  if (/^(https?:\/\/|\/(?!\/)|#)/i.test(u)) return esc(u);
  if (/^[\w.\-/]+$/.test(u) && !u.startsWith('//')) return esc(u);
  return null;
};

// Image resolution is injected by the caller so the renderer stays pure.
// Signature: (src) => { src, width, height } | null
let resolveImage = () => null;
export function setImageResolver(fn) { resolveImage = fn; }

const imgTag = (src, alt, title, { eager = false } = {}) => {
  const safe = safeUrl(src);
  if (!safe) return esc(alt);
  const meta = resolveImage(String(src).trim()) || {};
  const w = meta.width ? ` width="${meta.width}"` : '';
  const h = meta.height ? ` height="${meta.height}"` : '';
  const load = eager ? ' loading="eager" fetchpriority="high"' : ' loading="lazy"';
  const t = title ? ` title="${esc(title)}"` : '';
  return `<img src="${safe}" alt="${esc(alt)}"${w}${h}${t}${load} decoding="async">`;
};

const inline = (text) => {
  let t = esc(text);
  // inline code first (protect content inside backticks from other rules)
  const codeSpans = [];
  t = t.replace(/`([^`]+)`/g, (_, c) => {
    codeSpans.push(`<code>${c}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, '$1<em>$2</em>');
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
    (m, alt, url, title) => imgTag(url, alt, title));
  // Allow one level of balanced parentheses inside link targets so URLs like
  // .../Foo_(bar) survive, and so a rejected scheme never leaves a stray ")".
  t = t.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^)]*\))+)\)/g, (m, label, url) => {
    const u = safeUrl(url);
    if (!u) return label; // drop unsafe link, keep the label text
    const external = /^https?:\/\//i.test(url);
    const rel = external ? ' rel="noopener noreferrer external"' : '';
    const cls = external ? ' class="ext"' : '';
    return `<a href="${u}"${rel}${cls}>${label}</a>`;
  });
  t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => codeSpans[Number(i)]);
  return t;
};

const splitRow = (line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '')
  .split('|').map((c) => c.trim());

const isTableStart = (lines, i) =>
  /\|/.test(lines[i] || '') && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1] || '');

const alignOf = (cell) => {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return '';
};

export function renderMarkdown(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const headings = [];
  let words = 0;
  let i = 0;

  const countWords = (text) => { words += text.trim().split(/\s+/).filter(Boolean).length; };

  // Recursive list parser: supports nesting via indentation.
  const parseList = (start, indent, ordered) => {
    const re = ordered ? /^(\s*)\d+[.)]\s+/ : /^(\s*)[-*]\s+/;
    const items = [];
    let j = start;
    while (j < lines.length) {
      const m = lines[j].match(re);
      if (!m) break;
      const ind = m[1].length;
      if (ind < indent) break;
      if (ind > indent) {
        if (!items.length) break;
        const nested = parseList(j, ind, /^\s*\d+[.)]\s+/.test(lines[j]));
        items[items.length - 1].children.push(nested.html);
        j = nested.next;
        continue;
      }
      const text = lines[j].replace(re, '');
      countWords(text);
      items.push({ text, children: [] });
      j++;
    }
    const tag = ordered ? 'ol' : 'ul';
    const html = `<${tag}>${items.map((it) =>
      `<li>${inline(it.text)}${it.children.join('')}</li>`).join('')}</${tag}>`;
    return { html, next: j };
  };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, '').trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(esc(lines[i])); i++; }
      i++; // closing fence
      const cls = lang ? ` class="language-${esc(lang)}"` : '';
      out.push(`<pre class="code"><code${cls}>${buf.join('\n')}</code></pre>`);
      continue;
    }

    // headings h2..h4
    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      const id = slugify(text);
      headings.push({ level, text, id });
      countWords(text);
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }

    // horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // table
    if (isTableStart(lines, i)) {
      const head = splitRow(lines[i]);
      const aligns = splitRow(lines[i + 1]).map(alignOf);
      i += 2;
      const rows = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const cell = (tag, text, idx) => {
        const a = aligns[idx] ? ` class="ta-${aligns[idx]}"` : '';
        return `<${tag}${a}>${inline(text)}</${tag}>`;
      };
      const thead = `<thead><tr>${head.map((c, x) => cell('th', c, x)).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows.map((r) =>
        `<tr>${head.map((_, x) => cell('td', r[x] || '', x)).join('')}</tr>`).join('')}</tbody>`;
      rows.forEach((r) => countWords(r.join(' ')));
      head.forEach((c) => countWords(c));
      out.push(`<div class="table-wrap"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    // lists
    if (/^\s*[-*]\s+/.test(line)) {
      const res = parseList(i, line.match(/^\s*/)[0].length, false);
      out.push(res.html);
      i = res.next;
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const res = parseList(i, line.match(/^\s*/)[0].length, true);
      out.push(res.html);
      i = res.next;
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        const t = lines[i].replace(/^>\s?/, '');
        countWords(t);
        buf.push(inline(t));
        i++;
      }
      out.push(`<blockquote><p>${buf.join(' ')}</p></blockquote>`);
      continue;
    }

    if (line.trim() === '') { i++; continue; }

    // standalone image → figure with optional caption
    const img = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:"|&quot;)([^"]*?)(?:"|&quot;))?\)$/);
    if (img) {
      out.push(`<figure>${imgTag(img[2], img[1], img[3])}${img[3] ? `<figcaption>${esc(img[3])}</figcaption>` : ''}</figure>`);
      i++;
      continue;
    }

    // paragraph
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^(#{2,4}\s|[-*]\s|\d+[.)]\s|>\s|```|\s*-{3,}\s*$)/.test(lines[i]) &&
           !isTableStart(lines, i)) {
      para.push(lines[i]);
      i++;
    }
    countWords(para.join(' '));
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }

  const plain = String(src)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*`>|]/g, ' ')
    .replace(/^\s*[-–]\s+/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { html: out.join('\n'), headings, wordCount: words, plain };
}
