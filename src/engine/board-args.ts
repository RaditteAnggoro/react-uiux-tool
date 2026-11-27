const reserved = new Set(["__proto__", "prototype", "constructor", "ref", "key", "dangerouslySetInnerHTML"]);

export function isBoardArgName(key: string): boolean {
  return !/^on[A-Z]/.test(key) && !reserved.has(key);
}

export function boardArgs(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(value).length > 12_000) {
    throw new Error("invalid-size");
  }
  const args = value as Record<string, unknown>;
  if (Object.keys(args).some(key => !isBoardArgName(key))) throw new Error("invalid-props");
  return args;
}
