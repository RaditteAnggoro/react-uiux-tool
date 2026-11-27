import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { readProjectFile } from "./safety.js";

export function nextBasePathFromConfig(file: string, text: string): string | undefined {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  let config: ts.Expression | undefined;
  for (const node of source.statements) {
    if (ts.isExportAssignment(node) && !node.isExportEquals) config = node.expression;
    if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression) &&
        node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        node.expression.left.getText(source) === "module.exports") config = node.expression.right;
  }
  const unwrap = (value: ts.Expression): ts.Expression =>
    ts.isAsExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value) ? unwrap(value.expression) : value;
  if (!config) return undefined;
  config = unwrap(config);
  if (ts.isIdentifier(config)) {
    const name = config.text;
    const bindings = source.statements.filter(ts.isVariableStatement)
      .filter(statement => (statement.declarationList.flags & ts.NodeFlags.Const) !== 0)
      .flatMap(statement => [...statement.declarationList.declarations])
      .filter(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name);
    if (bindings.length !== 1 || !bindings[0]?.initializer) return undefined;
    config = unwrap(bindings[0].initializer);
  }
  if (!ts.isObjectLiteralExpression(config) || config.properties.some(property =>
    ts.isSpreadAssignment(property) || !!property.name && ts.isComputedPropertyName(property.name),
  )) return undefined;
  const candidates = config.properties.filter(property => property.name &&
    (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === "basePath");
  const result = candidates[0];
  if (candidates.length !== 1 || !result || !ts.isPropertyAssignment(result)) return undefined;
  const value = unwrap(result.initializer);
  return ts.isStringLiteralLike(value) && /^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(value.text)
    ? value.text : undefined;
}

export async function readNextBasePath(root: string): Promise<string | undefined> {
  for (const file of ["next.config.js", "next.config.mjs", "next.config.ts"]) {
    try {
      return nextBasePathFromConfig(file, await readProjectFile(root, file));
    } catch { /* No readable config with this name. */ }
  }
  return undefined;
}

export async function findNextCli(root: string): Promise<string | null> {
  try {
    const cli = await realpath(path.join(root, "node_modules", "next", "dist", "bin", "next"));
    const relative = path.relative(root, cli);
    if (path.isAbsolute(relative) || !relative.startsWith(`node_modules${path.sep}`) || !(await stat(cli)).isFile()) return null;
    return cli;
  } catch {
    return null;
  }
}

export function nextRouteFromFile(file: string): string | null {
  const app = /^(?:src\/)?app\/(?:(.*)\/)?page\.[jt]sx?$/.exec(file);
  if (app) {
    const segments = (app[1] ?? "").split("/").filter(Boolean);
    if (segments.some(segment => segment.startsWith("@") || segment.startsWith("_") ||
      /^\(\.{1,3}\)/.test(segment))) return null;
    return "/" + segments.filter(segment => !/^\([^/]+\)$/.test(segment)).join("/");
  }
  const pages = /^(?:src\/)?pages\/(.+)\.[jt]sx?$/.exec(file);
  if (!pages) return null;
  const parts = pages[1]!.split("/");
  if (/^(?:api$|_)/.test(parts[0]!)) return null;
  if (parts.at(-1) === "index") parts.pop();
  return "/" + parts.join("/");
}
