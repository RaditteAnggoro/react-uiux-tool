export interface YrfRichTextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

interface RtfState {
  hidden: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  unicodeFallbackLength: number;
}

const hiddenDestinations = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "field",
  "header", "footer", "annotation", "datastore", "xmlnstbl", "listtable", "listoverridetable",
]);
const literalSymbols: Readonly<Record<string, string>> = {
  "\\": "\\", "{": "{", "}": "}", "~": "\u00a0", "-": "\u00ad", "_": "\u2011",
};

/** Preview the supported text and character styling without rewriting the RTF source. */
export function yrfRichText(input: string): YrfRichTextRun[] | null {
  const source = input.trim();
  if (source.length > 16_000 || !/^\{\\rtf1\b/i.test(source)) return null;
  const states: RtfState[] = [];
  const runs: YrfRichTextRun[] = [];
  const decoder = new TextDecoder("windows-1252");
  const token = /[{}]|\\([a-z]+)(-?\d+)? ?|\\'([a-f\d]{2})|\\([^'\r\n])|[^{}\\\r\n]+|[\r\n]+/iy;
  let index = 0;
  let fallbackLeft = 0;
  while (index < source.length) {
    token.lastIndex = index;
    const match = token.exec(source);
    if (!match) return null;
    index = token.lastIndex;
    const [raw, control, numeric, hex, symbol] = match;
    const state = states.at(-1);
    if (raw === "{") {
      if (states.length >= 64) return null;
      states.push(state ? { ...state } : {
        hidden: false, bold: false, italic: false, underline: false, unicodeFallbackLength: 1,
      });
      fallbackLeft = 0;
      continue;
    }
    if (raw === "}") {
      if (!states.pop()) return null;
      if (!states.length && index !== source.length) return null;
      fallbackLeft = 0;
      continue;
    }
    if (!state) return null;
    const word = control?.toLowerCase();
    const number = numeric === undefined ? undefined : Number(numeric);
    if (word === "bin") {
      if (number === undefined || !Number.isSafeInteger(number) || number < 0 || index + number > source.length) return null;
      index += number;
      continue;
    }
    if (symbol === "*" || (word && hiddenDestinations.has(word))) state.hidden = true;
    if (state.hidden || /^[\r\n]+$/.test(raw)) continue;
    let text = "";
    if (word) {
      switch (word) {
        case "ansicpg": if (number !== 1252) return null; break;
        case "b": state.bold = number !== 0; break;
        case "i": state.italic = number !== 0; break;
        case "ul": state.underline = number !== 0; break;
        case "ulnone": state.underline = false; break;
        case "plain": state.bold = state.italic = state.underline = false; break;
        case "uc":
          if (number === undefined || !Number.isInteger(number) || number < 0 || number > 8) return null;
          state.unicodeFallbackLength = number;
          break;
        case "u":
          if (number === undefined || !Number.isInteger(number) || number < -32768 || number > 65535) return null;
          text = String.fromCharCode(number & 0xffff);
          fallbackLeft = 0;
          break;
        case "par":
        case "line": text = "\n"; break;
        case "tab": text = "\t"; break;
      }
    } else if (hex) {
      text = decoder.decode(Uint8Array.of(Number.parseInt(hex, 16)));
    } else {
      text = symbol ? Object.hasOwn(literalSymbols, symbol) ? literalSymbols[symbol]! : "" : raw;
    }
    if (fallbackLeft && text) {
      const skip = Math.min(fallbackLeft, text.length);
      text = text.slice(skip);
      fallbackLeft -= skip;
    }
    if (word === "u") fallbackLeft = state.unicodeFallbackLength;
    if (!text) continue;
    const { bold, italic, underline } = state;
    const last = runs.at(-1);
    if (last && last.bold === bold && last.italic === italic && last.underline === underline) last.text += text;
    else {
      if (runs.length >= 500) return null;
      runs.push({ text, bold, italic, underline });
    }
  }
  return states.length === 0 && runs.length ? runs : null;
}
