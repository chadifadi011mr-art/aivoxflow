// Reads intrinsic pixel dimensions from image files without any dependency.
// Used by the Markdown renderer so every <img> ships width/height and the
// browser can reserve space before the bytes arrive (no layout shift).
import { readFileSync } from 'node:fs';

const png = (b) => (b.length > 24 && b.readUInt32BE(16) > 0
  ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null);

const gif = (b) => (b.length > 10 ? { width: b.readUInt16LE(6), height: b.readUInt16LE(8) } : null);

const webp = (b) => {
  if (b.length < 30) return null;
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') {
    return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  }
  if (kind === 'VP8 ') {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
};

const jpeg = (b) => {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
};

const svg = (text) => {
  const w = /\bwidth="([\d.]+)(px)?"/.exec(text);
  const h = /\bheight="([\d.]+)(px)?"/.exec(text);
  if (w && h) return { width: Math.round(Number(w[1])), height: Math.round(Number(h[1])) };
  const vb = /viewBox="([\d.\s-]+)"/.exec(text);
  if (vb) {
    const parts = vb[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: Math.round(parts[2]), height: Math.round(parts[3]) };
    }
  }
  return null;
};

export function imageSize(file) {
  let buf;
  try { buf = readFileSync(file); } catch { return null; }
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return png(buf);
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return jpeg(buf);
  if (buf.length > 6 && buf.toString('ascii', 0, 3) === 'GIF') return gif(buf);
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF'
      && buf.toString('ascii', 8, 12) === 'WEBP') return webp(buf);
  const head = buf.toString('utf8', 0, Math.min(buf.length, 4096));
  if (/<svg[\s>]/i.test(head)) return svg(head);
  return null;
}
