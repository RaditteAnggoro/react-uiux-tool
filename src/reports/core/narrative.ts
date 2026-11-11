/** Conservative wrap for simple narrative text, using a shared measured estimate for HTML/PDF. */
export function narrativeLines(text: string, widthMm: number, fontSize: number): string[] {
  const size = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 9;
  const maxChars = Math.max(1, Math.floor(widthMm * 72 / 25.4 / (size * 0.65)));
  const result: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) { result.push(""); continue; }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      if (current && current.length + 1 + word.length > maxChars) { result.push(current); current = ""; }
      let remaining = word;
      while (remaining.length > maxChars) { result.push(remaining.slice(0, maxChars)); remaining = remaining.slice(maxChars); }
      current += `${current ? " " : ""}${remaining}`;
    }
    if (current) result.push(current);
  }
  return result.length ? result : [""];
}
export function narrativeLineHeight(fontSize: number): number {
  return (Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 9) * 1.2 * 25.4 / 72;
}
