import {
  add,
  compare,
  divide,
  multiply,
  negate,
  normalize,
  parseDecimal,
  roundDecimal,
  subtract,
  sumDecimals,
  toDecimalString,
  type Decimal,
} from "./decimal.js";
import { tableCellText } from "./table.js";

export type ExpressionValue = Decimal | string | boolean | null;

export interface EvalContext {
  row?: Record<string, unknown>;
  datasets?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  page?: number;
  totalPages?: number;
  locale?: string;
}

export type EvalResult =
  | { ok: true; value: ExpressionValue }
  | { ok: false; error: string };

const MAX_LENGTH = 2000;
const MAX_DEPTH = 32;

type Token =
  | { type: "number"; value: string }
  | { type: "string"; value: string }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "eof" };

class ExpressionError extends Error {}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }
    const number = /^\d+(?:\.\d+)?/.exec(rest);
    if (number) {
      tokens.push({ type: "number", value: number[0] });
      index += number[0].length;
      continue;
    }
    const quote = rest[0];
    if (quote === '"' || quote === "'") {
      let cursor = 1;
      let value = "";
      while (cursor < rest.length && rest[cursor] !== quote) {
        if (rest[cursor] === "\\" && cursor + 1 < rest.length) {
          value += rest[cursor + 1];
          cursor += 2;
          continue;
        }
        value += rest[cursor];
        cursor += 1;
      }
      if (cursor >= rest.length) throw new ExpressionError("Unterminated string literal");
      tokens.push({ type: "string", value });
      index += cursor + 1;
      continue;
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(rest);
    if (identifier) {
      tokens.push({ type: "ident", value: identifier[0] });
      index += identifier[0].length;
      continue;
    }
    const operator = /^(<=|>=|==|!=|<>|&&|\|\||[-+*/()<>=,])/.exec(rest);
    if (operator) {
      tokens.push({ type: "op", value: operator[0] });
      index += operator[0].length;
      continue;
    }
    throw new ExpressionError(`Unexpected character "${rest[0]}"`);
  }
  tokens.push({ type: "eof" });
  return tokens;
}

type Ast =
  | { kind: "literal"; value: ExpressionValue }
  | { kind: "path"; path: string }
  | { kind: "unary"; operator: "NOT" | "-"; operand: Ast }
  | { kind: "binary"; operator: string; left: Ast; right: Ast }
  | { kind: "call"; name: string; args: Ast[] };

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.position]!;
  }

  private next(): Token {
    return this.tokens[this.position++]!;
  }

  private isOp(value: string): boolean {
    const token = this.peek();
    return token.type === "op" && token.value === value;
  }

  private isKeyword(value: string): boolean {
    const token = this.peek();
    return token.type === "ident" && token.value.toUpperCase() === value;
  }

  parse(): Ast {
    const ast = this.expression(0);
    if (this.peek().type !== "eof") {
      throw new ExpressionError("Unexpected trailing content");
    }
    return ast;
  }

  private expression(depth: number): Ast {
    if (depth > MAX_DEPTH) throw new ExpressionError("Expression is too deeply nested");
    return this.or(depth);
  }

  private or(depth: number): Ast {
    let left = this.and(depth);
    while (this.isKeyword("OR") || this.isOp("||")) {
      this.next();
      left = { kind: "binary", operator: "OR", left, right: this.and(depth) };
    }
    return left;
  }

  private and(depth: number): Ast {
    let left = this.comparison(depth);
    while (this.isKeyword("AND") || this.isOp("&&")) {
      this.next();
      left = { kind: "binary", operator: "AND", left, right: this.comparison(depth) };
    }
    return left;
  }

  private comparison(depth: number): Ast {
    let left = this.addition(depth);
    const token = this.peek();
    const operators = ["<=", ">=", "==", "!=", "<>", "<", ">", "="];
    if (token.type === "op" && operators.includes(token.value)) {
      this.next();
      const operator = token.value === "=" ? "==" : token.value === "<>" ? "!=" : token.value;
      left = { kind: "binary", operator, left, right: this.addition(depth) };
    }
    return left;
  }

  private addition(depth: number): Ast {
    let left = this.multiplication(depth);
    while (this.isOp("+") || this.isOp("-")) {
      const operator = this.next();
      if (operator.type !== "op") break;
      left = {
        kind: "binary",
        operator: operator.value,
        left,
        right: this.multiplication(depth),
      };
    }
    return left;
  }

  private multiplication(depth: number): Ast {
    let left = this.unary(depth);
    while (this.isOp("*") || this.isOp("/")) {
      const operator = this.next();
      if (operator.type !== "op") break;
      left = { kind: "binary", operator: operator.value, left, right: this.unary(depth) };
    }
    return left;
  }

  private unary(depth: number): Ast {
    if (this.isKeyword("NOT")) {
      this.next();
      return { kind: "unary", operator: "NOT", operand: this.unary(depth) };
    }
    if (this.isOp("-")) {
      this.next();
      return { kind: "unary", operator: "-", operand: this.unary(depth) };
    }
    return this.primary(depth);
  }

  private primary(depth: number): Ast {
    const token = this.next();
    if (token.type === "number") {
      return { kind: "literal", value: parseDecimal(token.value, 6) };
    }
    if (token.type === "string") {
      return { kind: "literal", value: token.value };
    }
    if (token.type === "op" && token.value === "(") {
      const inner = this.expression(depth + 1);
      if (!this.isOp(")")) throw new ExpressionError("Missing closing parenthesis");
      this.next();
      return inner;
    }
    if (token.type === "ident") {
      if (this.isOp("(")) {
        this.next();
        const args: Ast[] = [];
        if (!this.isOp(")")) {
          args.push(this.expression(depth + 1));
          while (this.isOp(",")) {
            this.next();
            args.push(this.expression(depth + 1));
          }
        }
        if (!this.isOp(")")) throw new ExpressionError("Missing closing parenthesis");
        this.next();
        return { kind: "call", name: token.value.toUpperCase(), args };
      }
      if (token.value.toUpperCase() === "PAGE") return { kind: "call", name: "PAGE", args: [] };
      if (token.value.toUpperCase() === "TOTAL_PAGES") {
        return { kind: "call", name: "TOTAL_PAGES", args: [] };
      }
      return { kind: "path", path: token.value };
    }
    throw new ExpressionError("Unexpected token");
  }
}

function asDecimal(value: unknown): Decimal | null {
  if (typeof value === "object" && value !== null && "units" in value && "scale" in value) {
    return value as Decimal;
  }
  if (typeof value === "number") return tryDecimal(value);
  if (typeof value === "string") return tryDecimal(value);
  return null;
}

function tryDecimal(value: number | string): Decimal | null {
  try {
    return parseDecimal(value, 6);
  } catch {
    return null;
  }
}

function truthy(value: ExpressionValue): boolean {
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 0;
  return value.units !== 0n;
}

function resolveFromContext(context: EvalContext, path: string): unknown {
  for (const scope of [context.row, context.datasets, context.parameters]) {
    const resolved = resolvePath(scope, path);
    if (resolved !== undefined) return resolved;
  }
  return undefined;
}

function resolvePath(root: unknown, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = root;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (Array.isArray(current)) {
      return current.map((entry) => resolvePath(entry, segments.slice(index).join(".")));
    }
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function toValue(raw: unknown): ExpressionValue {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string" || typeof raw === "boolean") return raw;
  const decimal = asDecimal(raw);
  return decimal;
}

function requireDecimal(value: ExpressionValue, operation: string): Decimal {
  const decimal = asDecimal(value);
  if (!decimal) throw new ExpressionError(`${operation} expects numbers`);
  return decimal;
}

function evaluateAst(ast: Ast, context: EvalContext): ExpressionValue {
  switch (ast.kind) {
    case "literal":
      return ast.value;
    case "path": {
      const raw = resolveFromContext(context, ast.path);
      return Array.isArray(raw) ? (raw.map(toValue) as unknown as ExpressionValue) : toValue(raw);
    }
    case "unary": {
      const value = evaluateAst(ast.operand, context);
      if (ast.operator === "NOT") return !truthy(value);
      return negate(requireDecimal(value, "Unary minus"));
    }
    case "binary": {
      if (ast.operator === "AND") {
        return truthy(evaluateAst(ast.left, context)) ? truthy(evaluateAst(ast.right, context)) : false;
      }
      if (ast.operator === "OR") {
        return truthy(evaluateAst(ast.left, context)) ? true : truthy(evaluateAst(ast.right, context));
      }
      const left = evaluateAst(ast.left, context);
      const right = evaluateAst(ast.right, context);
      if (["==", "!="].includes(ast.operator)) {
        const equal = valuesEqual(left, right);
        return ast.operator === "==" ? equal : !equal;
      }
      if (["<", "<=", ">", ">="].includes(ast.operator)) {
        const order = compare(requireDecimal(left, "Comparison"), requireDecimal(right, "Comparison"));
        if (ast.operator === "<") return order < 0;
        if (ast.operator === "<=") return order <= 0;
        if (ast.operator === ">") return order > 0;
        return order >= 0;
      }
      const a = requireDecimal(left, `Operator ${ast.operator}`);
      const b = requireDecimal(right, `Operator ${ast.operator}`);
      if (ast.operator === "+") return add(a, b);
      if (ast.operator === "-") return subtract(a, b);
      if (ast.operator === "*") return multiply(a, b);
      if (ast.operator === "/") return divide(a, b, 6);
      throw new ExpressionError(`Unsupported operator ${ast.operator}`);
    }
    case "call":
      return evaluateCall(ast.name, ast.args, context);
    default:
      throw new ExpressionError("Unsupported expression node");
  }
}

function valuesEqual(left: ExpressionValue, right: ExpressionValue): boolean {
  if (left === null || right === null) return left === right;
  if (typeof left === "string" || typeof right === "string") {
    if (typeof left === "string" && typeof right === "string") return left === right;
    return false;
  }
  if (typeof left === "boolean" || typeof right === "boolean") return left === right;
  return compare(left, right) === 0;
}

function collectDecimals(value: ExpressionValue): Decimal[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => asDecimal(entry))
      .filter((entry): entry is Decimal => entry !== null);
  }
  const single = asDecimal(value);
  return single ? [single] : [];
}

function evaluateCall(name: string, args: Ast[], context: EvalContext): ExpressionValue {
  const values = () => args.map((arg) => evaluateAst(arg, context));
  switch (name) {
    case "PAGE": {
      const page = context.page ?? 1;
      return parseDecimal(String(page), 0);
    }
    case "TOTAL_PAGES": {
      const total = context.totalPages ?? 1;
      return parseDecimal(String(total), 0);
    }
    case "COALESCE": {
      for (const value of values()) if (value !== null) return value;
      return null;
    }
    case "IF": {
      if (args.length !== 3) throw new ExpressionError("IF expects three arguments");
      const [condition, whenTrue, whenFalse] = values();
      return truthy(condition ?? null) ? whenTrue ?? null : whenFalse ?? null;
    }
    case "ROUND": {
      if (args.length < 1 || args.length > 2) throw new ExpressionError("ROUND expects 1 or 2 arguments");
      const [value, digits] = values();
      const scale = digits ? Number(normalize(digits as Decimal, 0).units.toString()) : 2;
      return roundDecimal(requireDecimal(value ?? null, "ROUND"), Math.max(0, Math.min(6, scale)));
    }
    case "ABS": {
      const [value] = values();
      const decimal = requireDecimal(value ?? null, "ABS");
      return { units: decimal.units < 0n ? -decimal.units : decimal.units, scale: decimal.scale };
    }
    case "SUM":
    case "COUNT":
    case "MIN":
    case "MAX":
    case "AVG": {
      if (args.length !== 1) throw new ExpressionError(`${name} expects one argument`);
      const raw =
        args[0]!.kind === "path"
          ? resolveFromContext(context, args[0]!.path)
          : evaluateAst(args[0]!, context);
      if (name === "COUNT") {
        const count = Array.isArray(raw)
          ? raw.filter((entry) => entry !== null && entry !== undefined).length
          : raw === null || raw === undefined
            ? 0
            : 1;
        return parseDecimal(String(count), 0);
      }
      const decimals = Array.isArray(raw)
        ? raw
            .map((entry) => asDecimal(entry))
            .filter((entry): entry is Decimal => entry !== null)
        : collectDecimals(toValue(raw));
      if (decimals.length === 0) return parseDecimal("0", 6);
      if (name === "SUM") return sumDecimals(decimals);
      if (name === "MIN" || name === "MAX") {
        const sorted = [...decimals].sort(compare);
        return name === "MIN" ? sorted[0]! : sorted[sorted.length - 1]!;
      }
      return divide(sumDecimals(decimals), parseDecimal(String(decimals.length), 0), 6);
    }
    case "FORMAT_NUMBER": {
      if (args.length < 1 || args.length > 2) {
        throw new ExpressionError("FORMAT_NUMBER expects 1 or 2 arguments");
      }
      const [value, digits] = values();
      const scale = digits ? Math.max(0, Math.min(6, Number(normalize(digits as Decimal, 0).units.toString()))) : 2;
      const decimal = requireDecimal(value ?? null, "FORMAT_NUMBER");
      return tableCellText(toDecimalString(decimal), { format: "decimal", decimals: scale }, context.locale ?? "id-ID");
    }
    case "FORMAT_DATE": {
      if (args.length < 1 || args.length > 2) {
        throw new ExpressionError("FORMAT_DATE expects 1 or 2 arguments");
      }
      const [value] = values();
      if (value === null || value === undefined) return "";
      const text = typeof value === "string" ? value : String(value);
      const date = new Date(text);
      if (Number.isNaN(date.getTime())) return text;
      try {
        return new Intl.DateTimeFormat(context.locale ?? "id-ID", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(date);
      } catch {
        return text;
      }
    }
    default:
      throw new ExpressionError(`Unknown function "${name}"`);
  }
}

/** Evaluate a whitelisted expression. Never uses eval or Function. */
export function evaluateExpression(source: string, context: EvalContext = {}): EvalResult {
  if (typeof source !== "string" || source.trim().length === 0) {
    return { ok: false, error: "Expression is empty" };
  }
  if (source.length > MAX_LENGTH) {
    return { ok: false, error: "Expression is too long" };
  }
  try {
    const ast = new Parser(tokenize(source)).parse();
    return { ok: true, value: evaluateAst(ast, context) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Expression could not be evaluated",
    };
  }
}

export function evaluateNumber(source: string, context: EvalContext = {}): number | null {
  const result = evaluateExpression(source, context);
  if (!result.ok) return null;
  const value = result.value;
  if (typeof value === "boolean" || value === null || typeof value === "string") return null;
  try {
    return Number(value.units) / 10 ** value.scale;
  } catch {
    return null;
  }
}
