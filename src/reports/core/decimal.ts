/** Exact decimal arithmetic for money. Values are integer units scaled by 10^-scale. */
export interface Decimal {
  units: bigint;
  scale: number;
}

const MAX_SCALE = 12;

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function assertScale(scale: number): number {
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) {
    throw new Error(`Decimal scale must be an integer between 0 and ${MAX_SCALE}`);
  }
  return scale;
}

const PARTS = /^([+-]?)(\d+)(?:\.(\d+))?$/;

export function parseDecimal(input: string | number | bigint, scale = 2): Decimal {
  const target = assertScale(scale);
  if (typeof input === "bigint") {
    return normalize({ units: input * pow10(target), scale: target }, target);
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("Decimal requires a finite number");
    return parseDecimal(input.toFixed(Math.min(MAX_SCALE, Math.max(target, 2))), target);
  }
  const text = input.trim();
  const match = PARTS.exec(text);
  if (!match) throw new Error(`Invalid decimal: ${text.slice(0, 40)}`);
  const [, sign, whole, fraction = ""] = match;
  const padded = fraction.padEnd(target, "0");
  const kept = padded.slice(0, target);
  let units = BigInt(whole + kept);
  const remainder = padded.slice(target);
  if (remainder && remainder[0] >= "5") units += 1n;
  return { units: sign === "-" ? -units : units, scale: target };
}

export function tryParseDecimal(
  input: unknown,
  scale = 2,
): Decimal | null {
  if (typeof input !== "string" && typeof input !== "number") return null;
  try {
    return parseDecimal(input, scale);
  } catch {
    return null;
  }
}

export function normalize(value: Decimal, scale: number): Decimal {
  const target = assertScale(scale);
  if (value.scale === target) return value;
  if (value.scale < target) {
    return { units: value.units * pow10(target - value.scale), scale: target };
  }
  const divisor = pow10(value.scale - target);
  const negative = value.units < 0n;
  const absolute = negative ? -value.units : value.units;
  let quotient = absolute / divisor;
  const remainder = absolute % divisor;
  if (remainder * 2n >= divisor) quotient += 1n;
  return { units: negative ? -quotient : quotient, scale: target };
}

export function add(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale);
  return { units: normalize(a, scale).units + normalize(b, scale).units, scale };
}

export function subtract(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale);
  return { units: normalize(a, scale).units - normalize(b, scale).units, scale };
}

export function multiply(a: Decimal, b: Decimal): Decimal {
  return { units: a.units * b.units, scale: a.scale + b.scale };
}

export function divide(a: Decimal, b: Decimal, scale = 4): Decimal {
  if (b.units === 0n) throw new Error("Division by zero");
  const target = assertScale(Math.max(scale, a.scale, b.scale));
  const numerator = a.units * pow10(target + b.scale - a.scale);
  const negative = numerator < 0n !== b.units < 0n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = b.units < 0n ? -b.units : b.units;
  let quotient = absoluteNumerator / absoluteDenominator;
  const remainder = absoluteNumerator % absoluteDenominator;
  if (remainder * 2n >= absoluteDenominator) quotient += 1n;
  return { units: negative ? -quotient : quotient, scale: target };
}

export function negate(value: Decimal): Decimal {
  return { units: -value.units, scale: value.scale };
}

export function compare(a: Decimal, b: Decimal): number {
  const scale = Math.max(a.scale, b.scale);
  const left = normalize(a, scale).units;
  const right = normalize(b, scale).units;
  return left === right ? 0 : left < right ? -1 : 1;
}

export function roundDecimal(value: Decimal, scale: number): Decimal {
  return normalize(value, scale);
}

export function toDecimalString(value: Decimal): string {
  const negative = value.units < 0n;
  const absolute = negative ? -value.units : value.units;
  const text = absolute.toString().padStart(value.scale + 1, "0");
  const whole = text.slice(0, text.length - value.scale) || "0";
  const fraction = value.scale > 0 ? `.${text.slice(-value.scale)}` : "";
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

const SAFE_INTEGER = 9_007_199_254_740_991n;

export function toNumber(value: Decimal): number {
  const normalized = normalize(value, 6);
  const limit = BigInt(Number.MAX_SAFE_INTEGER) / 1_000_000n;
  if (normalized.units > limit || normalized.units < -limit) {
    throw new Error("Decimal is too large to convert safely");
  }
  return Number(normalized.units) / 1e6;
}

export function formatDecimal(
  value: Decimal,
  options: {
    locale?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    currency?: string;
    style?: "decimal" | "currency" | "percent";
  } = {},
): string {
  const locale = options.locale ?? "id-ID";
  const style = options.style ?? (options.currency ? "currency" : "decimal");
  const digits = Math.min(value.scale, 6);
  const asNumber = Number(value.units) / 10 ** value.scale;
  if (!Number.isFinite(asNumber)) return toDecimalString(value);
  try {
    return new Intl.NumberFormat(locale, {
      style,
      currency: style === "currency" ? options.currency ?? "IDR" : undefined,
      minimumFractionDigits: options.minimumFractionDigits ?? (style === "decimal" ? digits : undefined),
      maximumFractionDigits: options.maximumFractionDigits ?? (style === "decimal" ? digits : undefined),
    }).format(asNumber);
  } catch {
    return toDecimalString(value);
  }
}

export const ZERO_DECIMAL: Decimal = { units: 0n, scale: 2 };

export function sumDecimals(values: Decimal[]): Decimal {
  return values.reduce((total, value) => add(total, value), { units: 0n, scale: 0 });
}
