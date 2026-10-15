// Minimal, safe Markdown-subset renderer for AIVOXFLOW content.
// Safety model: escape ALL raw HTML first, then transform. No raw HTML
// passthrough by design — external/AI-generated content is untrusted input.
// Supported: ## / ### headings, paragraphs, - lists, > quotes, ``` fences,
// **bold**, *italic*, `code`, [text](http(s)|/relative links only).

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const slugify = (s) =>
  String(s).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/[\s-]+/g, '-').replace(/^-|-$/g, '');

const safeUrl = (url) => {
  const u = String(url).trim();
  if (/^(https?:\/\/|\/(?!\/)|#)/i.test(u)) return esc(u);
  return null; // reject javascript:, data:, protocol-relative, etc.
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
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
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

export function renderMarkdown(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const headings = [];
  let words = 0;
  let i = 0;

  const countWords = (text) => { words += text.trim().split(/\s+/).filter(Boolean).length; };

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(esc(lines[i])); i++; }
      i++; // closing fence
      out.push(`<pre class="code"><code>${buf.join('\n')}</code></pre>`);
      continue;
    }

    const h = line.match(/^(#{2,3})\s+(.*)$/);
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

    if (/^-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) {
        const item = lines[i].replace(/^-\s+/, '');
        countWords(item);
        items.push(`<li>${inline(item)}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\d+[.)]\s+/, '');
        countWords(item);
        items.push(`<li>${inline(item)}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

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

    const para = [];
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^(#{2,3}\s|-\s|\d+[.)]\s|>\s|```)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    countWords(para.join(' '));
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }

  const plain = String(src)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`>\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { html: out.join('\n'), headings, wordCount: words, plain };
}
