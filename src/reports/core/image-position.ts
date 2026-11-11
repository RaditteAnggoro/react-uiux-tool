/** Percent position of the image within its frame, as in CSS object-position. */
export function imagePosition(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 50;
}
