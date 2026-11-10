import { deflateSync, inflateSync } from "node:zlib";

export interface PdfImageData {
  width: number;
  height: number;
  colors: number;
  bytes: Buffer;
  filter: "DCTDecode" | "FlateDecode";
  alpha?: Buffer;
}

/** Decode bounded 8-bit PNGs or preserve JPEG bytes for the PDF writer. */
export function decodePdfImage(source: string): PdfImageData | null {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
  if (!match || source.length > 3 * 1024 * 1024) return null;
  try {
    const bytes = Buffer.from(match[2]!, "base64");
    if (match[1] === "jpeg") {
      if (bytes.readUInt16BE(0) !== 0xffd8) return null;
      for (let pos = 2; pos + 4 < bytes.length;) {
        if (bytes[pos++] !== 0xff) return null;
        while (bytes[pos] === 0xff) pos++;
        const marker = bytes[pos++]!;
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        const length = bytes.readUInt16BE(pos);
        if (length < 2 || pos + length > bytes.length) return null;
        if ([0xc0, 0xc1, 0xc2].includes(marker)) {
          const height = bytes.readUInt16BE(pos + 3), width = bytes.readUInt16BE(pos + 5), colors = bytes[pos + 7]!;
          if (!width || !height || width * height > 10_000_000 || ![1, 3].includes(colors) || bytes[pos + 2] !== 8) return null;
          return { width, height, colors, bytes, filter: "DCTDecode" };
        }
        pos += length;
      }
      return null;
    }
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
    let width = 0, height = 0, type = -1, depth = 0, interlace = 0;
    const chunks: Buffer[] = [];
    let palette: Buffer | undefined, transparency: Buffer | undefined;
    for (let pos = 8; pos + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(pos), end = pos + length + 12;
      if (end > bytes.length) return null;
      const name = bytes.toString("ascii", pos + 4, pos + 8), data = bytes.subarray(pos + 8, pos + 8 + length);
      if (name === "IHDR" && length === 13) { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]!; type = data[9]!; interlace = data[12]!; }
      if (name === "PLTE") palette = data;
      if (name === "tRNS") transparency = data;
      if (name === "IDAT") chunks.push(data);
      pos = end;
      if (name === "IEND") break;
    }
    const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
    if (!width || !height || width * height > 10_000_000 || depth !== 8 || interlace !== 0 || !channels || !chunks.length || (type === 3 && !palette)) return null;
    // tRNS for grayscale/RGB needs additional sample comparison; do not silently lose transparency.
    if (transparency && type !== 3) return null;
    const stride = width * channels, expected = (stride + 1) * height;
    const raw = inflateSync(Buffer.concat(chunks), { maxOutputLength: expected });
    if (raw.length !== expected) return null;
    const pixels = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)]!;
      if (filter > 4) return null;
      for (let x = 0; x < stride; x++) {
        const index = y * stride + x, value = raw[y * (stride + 1) + x + 1]!;
        const left = x >= channels ? pixels[index - channels]! : 0, up = y ? pixels[index - stride]! : 0;
        const upperLeft = y && x >= channels ? pixels[index - stride - channels]! : 0;
        const estimate = left + up - upperLeft, a = Math.abs(estimate - left), b = Math.abs(estimate - up), c = Math.abs(estimate - upperLeft);
        const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : a <= b && a <= c ? left : b <= c ? up : upperLeft;
        pixels[index] = (value + predictor) & 255;
      }
    }
    const gray = type === 0 || type === 4, colors = gray ? 1 : 3;
    const color = Buffer.alloc(width * height * colors), alpha = Buffer.alloc(width * height, 255);
    let hasAlpha = false;
    for (let i = 0; i < width * height; i++) {
      const src = i * channels, dst = i * colors;
      if (type === 3) {
        const index = pixels[src]!;
        if (!palette || index * 3 + 2 >= palette.length) return null;
        color[dst] = palette[index * 3]!; color[dst + 1] = palette[index * 3 + 1]!; color[dst + 2] = palette[index * 3 + 2]!;
        alpha[i] = transparency?.[index] ?? 255;
      } else {
        for (let j = 0; j < colors; j++) color[dst + j] = pixels[src + j]!;
        if (type === 4 || type === 6) alpha[i] = pixels[src + channels - 1]!;
      }
      if (alpha[i] !== 255) hasAlpha = true;
    }
    return { width, height, colors, bytes: deflateSync(color), filter: "FlateDecode", ...(hasAlpha ? { alpha: deflateSync(alpha) } : {}) };
  } catch {
    return null;
  }
}
