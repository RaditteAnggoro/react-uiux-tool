export function sourceLineRange(text: string, line: number): { start: number; end: number } | null {
  let start = 0;
  for (let current = 1; current < line; current++) {
    const end = text.indexOf("\n", start);
    if (end === -1) return null;
    start = end + 1;
  }
  const end = text.indexOf("\n", start);
  return { start, end: end === -1 ? text.length : end };
}
