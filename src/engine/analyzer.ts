// Copyright (c) 2026 RA. MIT License.
import ts from "typescript";
import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  projectRoot,
  readProjectFile,
  hashSource,
  MAX_FILE_BYTES,
  InvalidUtf8Error,
} from "./safety.js";
import type {
  AnalysisReport,
  JsxElement,
  ComponentInfo,
  PropInfo,
  SourceLocation,
} from "./types.js";
const exec = promisify(execFile);
const EXCLUDED = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".turbo",
  ".react-uiux-tool",
  "vendor",
  "out",
]);
const SOURCE = /\.[cm]?[jt]sx?$/;
const PRIMITIVE_PROPS: Record<string, string> = {
  className: "string",
  id: "string",
  title: "string",
  role: "string",
  name: "string",
  placeholder: "string",
  type: "string",
  href: "string",
  src: "string",
  alt: "string",
  htmlFor: "string",
  disabled: "boolean",
  required: "boolean",
  checked: "boolean",
  readOnly: "boolean",
  multiple: "boolean",
  autoFocus: "boolean",
  tabIndex: "number",
  min: "number",
  max: "number",
  step: "number",
  rows: "number",
  cols: "number",
  width: "number",
  height: "number",
  value: "string",
  defaultValue: "string",
};
export function parseSource(file: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    /tsx$/.test(file)
      ? ts.ScriptKind.TSX
      : /jsx$/.test(file)
        ? ts.ScriptKind.JSX
        : /\.[cm]?ts$/.test(file)
          ? ts.ScriptKind.TS
          : ts.ScriptKind.JS,
  );
}
export function parseErrors(sf: ts.SourceFile): string[] {
  return (
    (sf as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] })
      .parseDiagnostics ?? []
  ).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}
export function location(
  sf: ts.SourceFile,
  node: ts.Node,
  file: string,
): SourceLocation {
  const start = node.getStart(sf);
  const p = sf.getLineAndCharacterOfPosition(start);
  return {
    file,
    line: p.line + 1,
    column: p.character + 1,
    start,
    end: node.end,
  };
}
function nameOf(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name))
    return node.name.text;
  if (ts.isClassDeclaration(node) && node.name) return node.name.text;
  return null;
}
function defaultExportWraps(name: string, sf: ts.SourceFile): boolean {
  const declarations = new Map<string, ts.Expression>();
  for (const statement of sf.statements)
    if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations)
        if (ts.isIdentifier(declaration.name) && declaration.initializer)
          declarations.set(declaration.name.text, declaration.initializer);
  const followsWrapper = (expression: ts.Expression, seen: Set<string>): boolean => {
    if (ts.isIdentifier(expression)) {
      if (expression.text === name) return true;
      if (seen.has(expression.text)) return false;
      const initializer = declarations.get(expression.text);
      if (!initializer) return false;
      seen.add(expression.text);
      return followsWrapper(initializer, seen);
    }
    if (!ts.isCallExpression(expression)) return false;
    const called = ts.isIdentifier(expression.expression)
      ? expression.expression.text
      : ts.isPropertyAccessExpression(expression.expression)
        ? expression.expression.name.text
        : "";
    if (!["memo", "forwardRef"].includes(called)) return false;
    return expression.arguments.some((argument) =>
      followsWrapper(argument, new Set(seen)),
    );
  };
  return sf.statements.some(
    (statement) =>
      ts.isExportAssignment(statement) &&
      !statement.isExportEquals &&
      followsWrapper(statement.expression, new Set()),
  );
}
function isExported(node: ts.Node, name: string, sf: ts.SourceFile): boolean {
  let current: ts.Node | undefined = node;
  while (current && !ts.isSourceFile(current)) {
    if (ts.canHaveModifiers(current)) {
      const modifiers = ts.getModifiers(current);
      if (
        modifiers?.some(
          (modifier) =>
            modifier.kind === ts.SyntaxKind.ExportKeyword ||
            modifier.kind === ts.SyntaxKind.DefaultKeyword,
        )
      )
        return true;
    }
    current = current.parent;
  }
  return defaultExportWraps(name, sf) || sf.statements.some((statement) => {
    if (ts.isExportAssignment(statement))
      return (
        ts.isIdentifier(statement.expression) &&
        statement.expression.text === name
      );
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    )
      return false;
    return statement.exportClause.elements.some(
      (element) => (element.propertyName ?? element.name).text === name,
    );
  });
}
function isDefaultExported(
  node: ts.Node,
  name: string,
  sf: ts.SourceFile,
): boolean {
  if (
    ts.canHaveModifiers(node) &&
    ts
      .getModifiers(node)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
  )
    return true;
  return defaultExportWraps(name, sf) || sf.statements.some(
    (statement) =>
      ts.isExportAssignment(statement) &&
      !statement.isExportEquals &&
      ts.isIdentifier(statement.expression) &&
      statement.expression.text === name,
  );
}
function jsxOpen(
  node: ts.Node,
): ts.JsxOpeningElement | ts.JsxSelfClosingElement | null {
  return ts.isJsxElement(node)
    ? node.openingElement
    : ts.isJsxSelfClosingElement(node)
      ? node
      : null;
}
function owner(node: ts.Node): ts.Node | undefined {
  let p = node.parent;
  while (p && !ts.isSourceFile(p)) {
    if (
      (ts.isFunctionDeclaration(p) ||
        ts.isVariableDeclaration(p) ||
        ts.isClassDeclaration(p)) &&
      /^[A-Z]/.test(nameOf(p) ?? "")
    )
      return p;
    p = p.parent;
  }
  return undefined;
}
function hasJsx(node: ts.Node): boolean {
  let found = false;
  function walk(n: ts.Node) {
    if (jsxOpen(n)) found = true;
    if (!found) ts.forEachChild(n, walk);
  }
  walk(node);
  return found;
}
function typeProps(node: ts.Node, sf: ts.SourceFile): ComponentInfo["props"] {
  let fn: ts.FunctionLikeDeclaration | undefined;
  if (ts.isFunctionDeclaration(node)) fn = node;
  const unwrap = (expression: ts.Expression, visited: Set<string>): ts.FunctionLikeDeclaration | undefined => {
    if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return expression;
    if (ts.isParenthesizedExpression(expression)) return unwrap(expression.expression, visited);
    if (ts.isCallExpression(expression)) {
      const name = ts.isIdentifier(expression.expression) ? expression.expression.text : ts.isPropertyAccessExpression(expression.expression) ? expression.expression.name.text : "";
      if (["memo", "forwardRef"].includes(name) && expression.arguments[0]) return unwrap(expression.arguments[0], visited);
    }
    if (ts.isIdentifier(expression) && !visited.has(expression.text)) {
      visited.add(expression.text);
      for (const statement of sf.statements) if (ts.isVariableStatement(statement))
        for (const declaration of statement.declarationList.declarations)
          if (ts.isIdentifier(declaration.name) && declaration.name.text === expression.text && declaration.initializer)
            return unwrap(declaration.initializer, visited);
    }
    return undefined;
  };
  if (ts.isVariableDeclaration(node) && node.initializer) fn = unwrap(node.initializer, new Set());
  const seen = new Set<string>();
  function declared(
    name: string,
  ): ts.InterfaceDeclaration | ts.TypeAliasDeclaration | undefined {
    return sf.statements.find(
      (s): s is ts.InterfaceDeclaration | ts.TypeAliasDeclaration =>
        (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) &&
        s.name.text === name,
    );
  }
  function collect(
    type:
      | ts.TypeNode
      | ts.InterfaceDeclaration
      | ts.TypeAliasDeclaration
      | undefined,
  ): ts.TypeElement[] {
    if (!type) return [];
    if (ts.isTypeReferenceNode(type)) {
      const name = type.typeName.getText(sf);
      if (seen.has(name)) return [];
      seen.add(name);
      return collect(declared(name));
    }
    if (ts.isInterfaceDeclaration(type)) {
      const inherited =
        type.heritageClauses?.flatMap((clause) =>
          clause.types.flatMap((item) =>
            collect(declared(item.expression.getText(sf))),
          ),
        ) ?? [];
      return [...inherited, ...type.members];
    }
    if (ts.isTypeAliasDeclaration(type)) return collect(type.type);
    if (ts.isTypeLiteralNode(type)) return [...type.members];
    if (ts.isIntersectionTypeNode(type))
      return type.types.flatMap((part) => collect(part));
    return [];
  }
  const props = new Map<string, ComponentInfo["props"][number]>();
  for (const member of collect(fn?.parameters[0]?.type))
    if (ts.isPropertySignature(member)) {
      const name = member.name.getText(sf).replace(/^['"]|['"]$/g, "");
      const options =
        member.type && ts.isUnionTypeNode(member.type)
          ? member.type.types
              .filter(ts.isLiteralTypeNode)
              .map((literalType) =>
                ts.isStringLiteral(literalType.literal)
                  ? literalType.literal.text
                  : "",
              )
              .filter(Boolean)
          : undefined;
      props.set(name, {
        name,
        type: member.type?.getText(sf) ?? "unknown",
        optional: !!member.questionToken,
        requiredProven: !member.questionToken,
        ...(options?.length ? { options } : {}),
      });
    }
  const parameter = fn?.parameters[0];
  if (parameter && ts.isObjectBindingPattern(parameter.name))
    for (const element of parameter.name.elements) {
      if (!ts.isIdentifier(element.name) || element.dotDotDotToken) continue;
      const name = element.propertyName && (ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName))
        ? element.propertyName.text
        : element.name.text;
      const value = element.initializer
        ? literal(element.initializer)
        : { value: null, kind: "expression" as const };
      const previous = props.get(name);
      const inferredType =
        value.kind === "string" ||
        value.kind === "number" ||
        value.kind === "boolean"
          ? value.kind
          : "unknown";
      props.set(name, {
        name,
        type:
          previous?.type && previous.type !== "unknown"
            ? previous.type
            : inferredType,
        optional: !!element.initializer || previous?.optional === true,
        requiredProven: previous?.requiredProven === true && !element.initializer,
        ...(value.value !== null && value.kind !== "expression"
          ? { defaultValue: value.value }
          : {}),
        ...(previous?.options ? { options: previous.options } : {}),
      });
    }
  return [...props.values()];
}
function callableNames(node: ts.Node): string[] {
  const result = new Set<string>();
  const visit = (current: ts.Node) => {
    if (
      ts.isFunctionDeclaration(current) &&
      current !== node &&
      current.name
    )
      result.add(current.name.text);
    if (ts.isVariableDeclaration(current)) {
      if (ts.isIdentifier(current.name)) {
        const initializer = current.initializer;
        if (
          initializer &&
          (ts.isArrowFunction(initializer) ||
            ts.isFunctionExpression(initializer) ||
            (ts.isCallExpression(initializer) &&
              ts.isIdentifier(initializer.expression) &&
              initializer.expression.text === "useCallback"))
        )
          result.add(current.name.text);
      }
      if (
        ts.isArrayBindingPattern(current.name) &&
        current.initializer &&
        ts.isCallExpression(current.initializer) &&
        ts.isIdentifier(current.initializer.expression) &&
        ["useState", "useReducer"].includes(current.initializer.expression.text)
      ) {
        const setter = current.name.elements[1];
        if (setter && ts.isBindingElement(setter) && ts.isIdentifier(setter.name))
          result.add(setter.name.text);
      }
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return [...result].sort();
}
function behaviors(text: string, client: boolean, next: boolean): string[] {
  const list: string[] = [];
  if (/\buse(?:State|Reducer)\s*\(/.test(text)) list.push("local-state");
  if (/\buse(?:Layout)?Effect\s*\(/.test(text)) list.push("effect-on-mount");
  if (/\buseContext\s*\(|Provider\b/.test(text))
    list.push("provider-dependent");
  if (/\bfetch\s*\(|\baxios\b|useQuery\b|useMutation\b/.test(text))
    list.push("api-dependent");
  if (/\bvalue\s*=\s*\{/.test(text) && /onChange\s*=/.test(text))
    list.push("controlled-form");
  if (/\bon(?:Click|Submit|Change)\s*=/.test(text)) list.push("event-handler");
  if (/\.map\s*\(|createPortal\s*\(/.test(text)) list.push("dynamic-render");
  if (next)
    list.push(client ? "client-component" : "server-component-candidate");
  return list.length ? list : ["stateless"];
}
function dynamicContext(node: ts.Node): string[] {
  const reasons: string[] = [];
  let p = node.parent;
  const boundary = owner(node);
  while (p && p !== boundary && !ts.isSourceFile(p)) {
    if (ts.isJsxExpression(p))
      reasons.push(
        "JSX is rendered inside an expression; per-instance editing is unresolved.",
      );
    if (
      ts.isCallExpression(p) &&
      /\.(map|flatMap)\s*$/.test(p.expression.getText())
    )
      reasons.push(
        "Repeated JSX shares one source; editing an individual rendered row is unsupported.",
      );
    if (
      ts.isConditionalExpression(p) ||
      (ts.isBinaryExpression(p) &&
        [
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(p.operatorToken.kind))
    )
      reasons.push("Conditional JSX is code-controlled.");
    p = p.parent;
  }
  return [...new Set(reasons)];
}
function literal(expr: ts.Expression | undefined): {
  value: string | number | boolean | null;
  kind: PropInfo["kind"];
  expression?: string;
} {
  if (!expr) return { value: true, kind: "boolean" };
  if (ts.isStringLiteralLike(expr)) return { value: expr.text, kind: "string" };
  if (ts.isNumericLiteral(expr))
    return { value: Number(expr.text), kind: "number" };
  if (
    expr.kind === ts.SyntaxKind.TrueKeyword ||
    expr.kind === ts.SyntaxKind.FalseKeyword
  )
    return { value: expr.kind === ts.SyntaxKind.TrueKeyword, kind: "boolean" };
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expr.operand)
  )
    return { value: -Number(expr.operand.text), kind: "number" };
  return { value: null, kind: "expression", expression: expr.getText() };
}
function staticPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return null;
}
function safeRelativePath(value: string): string | null {
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  if (
    !normalized ||
    normalized === "." ||
    path.posix.isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../")
  )
    return null;
  return normalized.replace(/^\.\//, "");
}
function isImportMetaProperty(node: ts.Expression, name: string): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === name &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword
  );
}
function staticAliasTarget(
  expression: ts.Expression,
  variables: Map<string, string>,
): string | null {
  if (ts.isStringLiteralLike(expression))
    return safeRelativePath(expression.text);
  if (ts.isIdentifier(expression))
    return variables.get(expression.text) ?? null;
  if (
    ts.isCallExpression(expression) &&
    ((ts.isPropertyAccessExpression(expression.expression) &&
      ["resolve", "join"].includes(expression.expression.name.text)) ||
      (ts.isIdentifier(expression.expression) &&
        ["resolve", "join"].includes(expression.expression.text)))
  ) {
    const [anchor, ...segments] = expression.arguments;
    if (
      !anchor ||
      !(
        (ts.isIdentifier(anchor) && anchor.text === "__dirname") ||
        isImportMetaProperty(anchor, "dirname")
      ) ||
      !segments.length ||
      !segments.every(ts.isStringLiteralLike)
    )
      return null;
    return safeRelativePath(
      path.posix.join(...segments.map((segment) => segment.text)),
    );
  }
  let urlExpression: ts.Expression | undefined;
  if (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "fileURLToPath"
  )
    urlExpression = expression.arguments[0];
  else if (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "pathname"
  )
    urlExpression = expression.expression;
  else urlExpression = expression;
  if (
    urlExpression &&
    ts.isNewExpression(urlExpression) &&
    ts.isIdentifier(urlExpression.expression) &&
    urlExpression.expression.text === "URL" &&
    urlExpression.arguments?.length === 2 &&
    ts.isStringLiteralLike(urlExpression.arguments[0]) &&
    isImportMetaProperty(urlExpression.arguments[1], "url")
  )
    return safeRelativePath(urlExpression.arguments[0].text);
  return null;
}
export function parseViteAliases(
  file: string,
  source: string,
): Record<string, string[]> {
  const aliases: Record<string, string[]> = {};
  const sf = parseSource(file, source);
  const variables = new Map<string, string>();
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer)
        continue;
      const target = staticAliasTarget(declaration.initializer, variables);
      if (target) variables.set(declaration.name.text, target);
    }
  }
  const addObjectAlias = (property: ts.ObjectLiteralElementLike) => {
    if (!ts.isPropertyAssignment(property)) return;
    const key = staticPropertyName(property.name);
    if (!key) return;
    const target = staticAliasTarget(property.initializer, variables);
    if (target) aliases[key] = [target];
  };
  const addArrayAlias = (element: ts.Expression) => {
    if (!ts.isObjectLiteralExpression(element)) return;
    const find = element.properties.find(
      (property) =>
        ts.isPropertyAssignment(property) &&
        staticPropertyName(property.name) === "find",
    );
    const replacement = element.properties.find(
      (property) =>
        ts.isPropertyAssignment(property) &&
        staticPropertyName(property.name) === "replacement",
    );
    if (
      !find ||
      !replacement ||
      !ts.isPropertyAssignment(find) ||
      !ts.isPropertyAssignment(replacement) ||
      !ts.isStringLiteralLike(find.initializer)
    )
      return;
    const target = staticAliasTarget(replacement.initializer, variables);
    if (target) aliases[find.initializer.text] = [target];
  };
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      staticPropertyName(node.name) === "alias" &&
      ts.isPropertyAssignment(node.parent.parent) &&
      staticPropertyName(node.parent.parent.name) === "resolve"
    ) {
      if (ts.isObjectLiteralExpression(node.initializer))
        node.initializer.properties.forEach(addObjectAlias);
      else if (ts.isArrayLiteralExpression(node.initializer))
        node.initializer.elements.forEach(addArrayAlias);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return aliases;
}
async function readCompilerAliases(
  root: string,
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  const visited = new Set<string>();
  const resolveConfigReference = (
    fromFile: string,
    reference: unknown,
  ): string[] => {
    if (
      typeof reference !== "string" ||
      (!reference.startsWith("./") && !reference.startsWith("../"))
    )
      return [];
    const joined = path.posix.normalize(
      path.posix.join(path.posix.dirname(fromFile), reference),
    );
    if (
      joined === ".." ||
      joined.startsWith("../") ||
      path.posix.isAbsolute(joined)
    )
      return [];
    if (/\.json$/i.test(joined)) return [joined];
    return [`${joined}.json`, `${joined}/tsconfig.json`];
  };
  const visit = async (file: string, depth: number): Promise<boolean> => {
    if (depth > 8 || visited.has(file)) return false;
    visited.add(file);
    let config: any;
    try {
      config = ts.parseConfigFileTextToJson(
        file,
        await readProjectFile(root, file),
      ).config;
    } catch {
      return false;
    }
    if (!config || typeof config !== "object") return false;
    const inherited = Array.isArray(config.extends)
      ? config.extends
      : [config.extends];
    for (const reference of inherited)
      for (const candidate of resolveConfigReference(file, reference))
        if (await visit(candidate, depth + 1)) break;
    for (const reference of Array.isArray(config.references)
      ? config.references
      : []) {
      const value =
        reference && typeof reference === "object"
          ? (reference as { path?: unknown }).path
          : undefined;
      for (const candidate of resolveConfigReference(file, value))
        if (await visit(candidate, depth + 1)) break;
    }
    const compilerOptions = config.compilerOptions;
    if (!compilerOptions || typeof compilerOptions !== "object") return true;
    const configDirectory = path.posix.dirname(file);
    const baseUrl =
      typeof compilerOptions.baseUrl === "string"
        ? compilerOptions.baseUrl
        : ".";
    const base = path.posix.normalize(
      path.posix.join(configDirectory, baseUrl),
    );
    const paths = compilerOptions.paths;
    if (!paths || typeof paths !== "object") return true;
    for (const [key, targets] of Object.entries(paths)) {
      if (!key || !Array.isArray(targets)) continue;
      const normalizedTargets = targets
        .filter((target): target is string => typeof target === "string")
        .map((target) =>
          safeRelativePath(path.posix.join(base, target.replaceAll("\\", "/"))),
        )
        .filter((target): target is string => !!target);
      if (normalizedTargets.length) result[key] = normalizedTargets;
    }
    return true;
  };
  let configFiles: string[] = [];
  try {
    configFiles = (await readdir(root))
      .filter((file) => /^(?:ts|js)config(?:\.[\w.-]+)?\.json$/i.test(file))
      .sort((a, b) => {
        const priority = (file: string) =>
          file === "jsconfig.json" ? 0 : file === "tsconfig.json" ? 2 : 1;
        return priority(a) - priority(b) || a.localeCompare(b);
      })
      .slice(0, 12);
  } catch {
    return result;
  }
  for (const configFile of configFiles) await visit(configFile, 0);
  return result;
}
export async function analyzeProject(
  inputRoot: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (count: number, file: string) => void;
  } = {},
): Promise<AnalysisReport> {
  const root = await projectRoot(inputRoot);
  const manifest = JSON.parse(await readProjectFile(root, "package.json")) as {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    engines?: { node?: string };
  };
  const deps = { ...manifest.dependencies, ...manifest.devDependencies };
  const warnings: string[] = [];
  const reasons: string[] = [];
  let skipped = 0;
  let complete = true;
  let totalBytes = 0;
  const paths: string[] = [];
  async function scan(dir: string) {
    for (const entry of await readdir(path.join(root, dir), {
      withFileTypes: true,
    })) {
      if (options.signal?.aborted) throw new Error("Analysis cancelled.");
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        skipped++;
        reasons.push(`${rel}: symlink excluded`);
        continue;
      }
      if (entry.isDirectory()) {
        if (
          EXCLUDED.has(entry.name) ||
          (entry.name.startsWith(".") && entry.name !== ".storybook")
        ) {
          skipped++;
          continue;
        }
        await scan(rel);
      } else if (
        SOURCE.test(entry.name) ||
        /\.(css|scss|sass|less)$/.test(entry.name)
      ) {
        if (paths.length >= 3000) {
          complete = false;
          skipped++;
          continue;
        }
        const size = (await stat(path.join(root, rel))).size;
        if (size > MAX_FILE_BYTES || totalBytes + size > 32 * MAX_FILE_BYTES) {
          skipped++;
          complete = false;
          reasons.push(`${rel}: source size or 32 MiB scan budget exceeded`);
        } else {
          paths.push(rel);
          totalBytes += size;
        }
      }
    }
  }
  await scan("");
  let aliases = await readCompilerAliases(root);
  for (const configFile of [
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mts",
    "vite.config.mjs",
    "vite.config.cts",
    "vite.config.cjs",
    "webpack.config.ts",
    "webpack.config.js",
    "webpack.config.mjs",
    "webpack.config.cjs",
  ]) {
    try {
      aliases = {
        ...aliases,
        ...parseViteAliases(
          configFile,
          await readProjectFile(root, configFile),
        ),
      };
      break;
    } catch {
      /* Optional Vite config is parsed as text and never executed. */
    }
  }
  const framework = deps.next
    ? "nextjs"
    : deps.vite && (deps.react || deps["@vitejs/plugin-react"])
      ? "vite-react"
      : deps.react
        ? "react"
        : "unknown";
  const styling: string[] = [];
  if (deps.tailwindcss) styling.push("tailwind");
  if (paths.some((f) => f.endsWith(".module.css"))) styling.push("css-modules");
  if (paths.some((f) => /\.(css|scss|sass|less)$/.test(f))) styling.push("css");
  if (deps["styled-components"] || deps["@emotion/react"])
    styling.push("css-in-js");
  const libs = Object.keys(deps).filter((d) =>
    /^(?:@mui\/|antd$|@chakra-ui\/|@radix-ui\/)/.test(d),
  );
  if (paths.some((f) => /components\/ui\//.test(f)))
    libs.push("local-ui-components (unverified)");
  const report: AnalysisReport = {
    schemaVersion: 1,
    projectRoot: root,
    name: manifest.name ?? path.basename(root),
    analyzedAt: new Date().toISOString(),
    detected: {
      framework,
      router:
        framework === "nextjs"
          ? paths.some((f) => /^(src\/)?app\//.test(f))
            ? "app"
            : "pages"
          : deps["react-router"] || deps["react-router-dom"]
            ? "react-router"
            : "unknown",
      typescript: paths.some((f) => /\.tsx?$/.test(f)),
      styling,
      componentLibraries: libs,
      packageManager: "npm",
      dependencies: deps,
      scripts: manifest.scripts ?? {},
      aliases,
      nodeEngine: manifest.engines?.node,
    },
    files: [],
    elements: [],
    components: [],
    routes: [],
    stories: [],
    styleTokens: [],
    warnings,
    coverage: {
      filesInspected: 0,
      filesSkipped: 0,
      elementsEditable: 0,
      elementsLimited: 0,
      elementsReadOnly: 0,
      reasons,
      complete,
    },
    git: { available: false, dirty: false, files: [] },
    readiness: {
      dependenciesInstalled: false,
      previewCommand: manifest.scripts?.dev ? "dev" : null,
      state: "CONFIG_REQUIRED",
      reason:
        "Project scripts have not been executed. Approve local preview explicitly.",
    },
  };
  for (const pm of ["pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"])
    try {
      await stat(path.join(root, pm));
      report.detected.packageManager = pm.startsWith("pnpm")
        ? "pnpm"
        : pm.startsWith("yarn")
          ? "yarn"
          : "bun";
      break;
    } catch {}
  try {
    report.readiness.dependenciesInstalled = (
      await stat(path.join(root, "node_modules"))
    ).isDirectory();
  } catch {}
  const sources = new Map<string, ts.SourceFile>();
  let processed = 0;
  for (const file of paths) {
    if (options.signal?.aborted) throw new Error("Analysis cancelled.");
    options.onProgress?.(++processed, file);
    let text: string;
    try {
      text = await readProjectFile(root, file);
    } catch (error) {
      if (error instanceof InvalidUtf8Error) {
        const warning = `${file}: source is not valid UTF-8; excluded from analysis and editing.`;
        warnings.push(warning);
        reasons.push(warning);
        skipped++;
        complete = false;
        continue;
      }
      throw error;
    }
    const hash = hashSource(text);
    if (!SOURCE.test(file)) {
      const sf = parseSource(file, text);
      const imports: never[] = [];
      report.files.push({
        file,
        hash,
        bytes: Buffer.byteLength(text),
        imports,
        errors: [],
      });
      for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)[;]/g)) {
        const offset = m.index ?? 0;
        const p = sf.getLineAndCharacterOfPosition(offset);
        report.styleTokens.push({
          name: m[1]!,
          value: m[2]!.trim(),
          source: {
            file,
            line: p.line + 1,
            column: p.character + 1,
            start: offset,
            end: offset + m[0].length,
          },
          consumers: [],
        });
      }
      continue;
    }
    const sf = parseSource(file, text);
    sources.set(file, sf);
    const imports: AnalysisReport["files"][number]["imports"] = [];
    for (const s of sf.statements)
      if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)) {
        const from = s.moduleSpecifier.text;
        const bindings = s.importClause;
        const names: string[] = [];
        if (bindings?.name) names.push(bindings.name.text);
        if (bindings?.namedBindings) {
          if (ts.isNamedImports(bindings.namedBindings))
            names.push(
              ...bindings.namedBindings.elements.map((e) => e.name.text),
            );
          else names.push(bindings.namedBindings.name.text);
        }
        for (const name of names) imports.push({ name, from });
      }
    // Recognize only the direct, literal React.lazy(() => import("...")) form.
    // Dynamic expressions, wrappers and named-export adapters remain unresolved.
    const reactImports = sf.statements.filter((s): s is ts.ImportDeclaration =>
      ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === "react");
    const reactNamespaces = new Set<string>();
    const lazyBindings = new Set<string>();
    for (const declaration of reactImports) {
      const clause = declaration.importClause;
      if (clause?.name) reactNamespaces.add(clause.name.text);
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) reactNamespaces.add(clause.namedBindings.name.text);
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings))
        for (const item of clause.namedBindings.elements)
          if ((item.propertyName?.text ?? item.name.text) === "lazy") lazyBindings.add(item.name.text);
    }
    for (const statement of sf.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
        const call = declaration.initializer;
        const callee = call.expression;
        const isLazy = (ts.isIdentifier(callee) && lazyBindings.has(callee.text)) ||
          (ts.isPropertyAccessExpression(callee) && callee.name.text === "lazy" && ts.isIdentifier(callee.expression) && reactNamespaces.has(callee.expression.text));
        const callback = call.arguments[0];
        if (!isLazy || call.arguments.length !== 1 || !callback || !ts.isArrowFunction(callback) || !ts.isCallExpression(callback.body)) continue;
        const imported = callback.body;
        if (imported.expression.kind !== ts.SyntaxKind.ImportKeyword || imported.arguments.length !== 1 || !ts.isStringLiteral(imported.arguments[0]!)) continue;
        imports.push({ name: declaration.name.text, from: imported.arguments[0]!.text, kind: "lazy-default" });
      }
    }
    report.files.push({
      file,
      hash,
      bytes: Buffer.byteLength(text),
      imports,
      errors: parseErrors(sf),
    });
    if (parseErrors(sf).length)
      warnings.push(`${file}: syntax errors; source editing disabled.`);
    if (/\.stories\.[jt]sx?$/.test(file)) report.stories.push(file);
    const client = /^\s*['"]use client['"]/.test(text);
    function findComponents(n: ts.Node) {
      const name = nameOf(n);
      if (name && /^[A-Z]/.test(name) && hasJsx(n)) {
        const props = typeProps(n, sf);
        const info: ComponentInfo = {
          id: `${file}#${name}`,
          name,
          source: location(sf, n, file),
          exported: isExported(n, name, sf),
          defaultExported: isDefaultExported(n, name, sf),
          props,
          events: props
            .map((prop) => prop.name)
            .filter((propName) => /^on[A-Z]/.test(propName)),
          callables: callableNames(n),
          behavior: behaviors(n.getText(sf), client, framework === "nextjs"),
          references: [],
          confidence: "high",
          editability: "LIMITED",
        };
        report.components.push(info);
        // Exports such as `export default memo(Component)` may have a public
        // binding distinct from the implementation declaration.
        const exportedAlias = sf.statements.find((statement): statement is ts.ExportAssignment =>
          ts.isExportAssignment(statement) && !statement.isExportEquals && ts.isIdentifier(statement.expression),
        );
        const alias = exportedAlias && ts.isIdentifier(exportedAlias.expression) ? exportedAlias.expression.text : undefined;
        if (alias && alias !== name && /^[A-Z]/.test(alias) && info.defaultExported && defaultExportWraps(name, sf) &&
            !report.components.some((candidate) => candidate.id === `${file}#${alias}`)) {
          report.components.push({ ...info, id: `${file}#${alias}`, name: alias, props: info.props.map((prop) => ({ ...prop })), events: [...info.events], callables: [...info.callables], references: [] });
        }
      }
      ts.forEachChild(n, findComponents);
    }
    findComponents(sf);
    function compoundProps(node: ts.Node): ComponentInfo["props"] {
      const findFunction = (value: ts.Node): ts.FunctionLikeDeclaration | undefined => {
        if (ts.isArrowFunction(value) || ts.isFunctionExpression(value) || ts.isFunctionDeclaration(value)) return value;
        if (ts.isParenthesizedExpression(value)) return findFunction(value.expression);
        if (ts.isCallExpression(value) && value.arguments[0]) {
          const callee = value.expression;
          const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
          if (["memo", "forwardRef"].includes(name)) return findFunction(value.arguments[0]);
        }
        return undefined;
      };
      const fn = findFunction(node);
      const parameter = fn?.parameters[0];
      if (!parameter || !ts.isObjectBindingPattern(parameter.name)) return [];
      return parameter.name.elements.flatMap((element) => {
        if (!ts.isBindingElement(element)) return [];
        const name = element.propertyName && ts.isIdentifier(element.propertyName)
          ? element.propertyName.text
          : ts.isIdentifier(element.name) ? element.name.text : "";
        return name ? [{ name, type: "string", optional: true }] : [];
      });
    }

    function findCompoundComponents(n: ts.Node) {
      if (
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(n.left) &&
        ts.isIdentifier(n.left.expression) &&
        hasJsx(n.right)
      ) {
        const base = n.left.expression.text;
        const name = `${base}.${n.left.name.text}`;
        const props = compoundProps(n.right);
        if (!report.components.some((candidate) => candidate.id === `${file}#${name}`)) {
          report.components.push({
            id: `${file}#${name}`,
            name,
            source: location(sf, n, file),
            exported: true,
            defaultExported: false,
            props,
            events: [],
            callables: [],
            behavior: [],
            references: [],
            confidence: "medium",
            editability: "LIMITED",
          });
        }
      }
      ts.forEachChild(n, findCompoundComponents);
    }
    findCompoundComponents(sf);
    function findElements(n: ts.Node, parentId: string | null) {
      const open = jsxOpen(n);
      let nextParent = parentId;
      if (open) {
        const loc = location(sf, n, file);
        const id = `${file}:${loc.start}`;
        const tag = open.tagName.getText(sf);
        const dyn = dynamicContext(n);
        const spread = open.attributes.properties.some(ts.isJsxSpreadAttribute);
        if (spread) dyn.push("Spread props have unresolved ownership.");
        if (parseErrors(sf).length) dyn.push("Source contains syntax errors.");
        const props: PropInfo[] = [];
        const events: JsxElement["events"] = [];
        const styleOrigins: JsxElement["styleOrigins"] = [];
        for (const attr of open.attributes.properties) {
          if (!ts.isJsxAttribute(attr)) continue;
          const name = attr.name.getText(sf);
          const expr =
            attr.initializer && ts.isJsxExpression(attr.initializer)
              ? attr.initializer.expression
              : attr.initializer;
          const lit = literal(expr as ts.Expression | undefined);
          if (/^on[A-Z]/.test(name)) {
            events.push({ name, expression: expr?.getText(sf) ?? "true" });
            props.push({
              name,
              ...lit,
              editable: false,
              reason: "Event handler is owned by project code.",
            });
            continue;
          }
          if (name === "style" && expr && ts.isObjectLiteralExpression(expr)) {
            props.push({
              name,
              value: null,
              kind: "style",
              expression: expr.getText(sf),
              editable: false,
              reason: "Use individual literal style controls.",
            });
            for (const p of expr.properties)
              if (ts.isPropertyAssignment(p)) {
                const v = literal(p.initializer);
                props.push({
                  name: `style.${p.name.getText(sf).replace(/^['"]|['"]$/g, "")}`,
                  ...v,
                  editable: !dyn.length && v.kind !== "expression",
                });
                styleOrigins.push({
                  property: p.name.getText(sf),
                  origin: "inline",
                  source: location(sf, p, file),
                  value: p.initializer.getText(sf),
                  scope: "instance",
                  confidence: "high",
                });
              }
            continue;
          }
          const primitive = /^[a-z]/.test(tag);
          const known =
            primitive &&
            (!!PRIMITIVE_PROPS[name] || /^(aria-|data-)/.test(name));
          props.push({
            name,
            ...lit,
            editable:
              !dyn.length &&
              lit.kind !== "expression" &&
              known &&
              !["value", "checked"].includes(name),
            reason: ["value", "checked"].includes(name)
              ? "Controlled input bindings are code-owned."
              : lit.kind === "expression"
                ? "Expression is code-controlled."
                : !known
                  ? "Prop type is unresolved."
                  : undefined,
          });
          if (name === "className")
            styleOrigins.push({
              property: "className",
              origin: lit.kind === "string" ? "className" : "unknown",
              source: location(sf, attr, file),
              value: lit.value?.toString() ?? lit.expression,
              scope: "instance",
              confidence: lit.kind === "string" ? "high" : "low",
            });
        }
        const textChildren =
          ts.isJsxElement(n) &&
          (n.children.length > 0 || /^(?:p|span|h[1-6]|button|label|a|li|legend)$/.test(tag)) &&
          n.children.every(ts.isJsxText)
            ? n.children.map((c) => c.getText(sf)).join("")
            : null;
        // Appending a sibling does not rewrite any existing expression children.
        const acceptsStaticChildren = ts.isJsxElement(n);
        const own = owner(n);
        const el: JsxElement = {
          id,
          tag,
          source: loc,
          hash,
          parentId,
          children: [],
          text: textChildren,
          props,
          events,
          editability: dyn.length ? "READ_ONLY" : "LIMITED",
          reasons: dyn,
          operations: dyn.length
            ? []
            : [
                "prop",
                "event",
                "style",
                ...(textChildren !== null ? ["text"] : []),
                ...(acceptsStaticChildren ? ["insert"] : []),
                "duplicate",
                "move",
                "remove",
              ],
          dynamic: !!dyn.length,
          ownerComponent: own ? `${file}#${nameOf(own)}` : undefined,
          styleOrigins,
          behavior: behaviors(n.getText(sf), client, framework === "nextjs"),
          sourceOwnership: "jsx-instance",
          references: { knownCount: 0, analysisComplete: false },
        };
        report.elements.push(el);
        if (parentId)
          report.elements.find((e) => e.id === parentId)?.children.push(id);
        nextParent = id;
      }
      ts.forEachChild(n, (c) => findElements(c, nextParent));
    }
    findElements(sf, null);
    if (framework === "nextjs" && /(^|\/)(?:page|index)\.[jt]sx?$/.test(file)) {
      let route =
        file
          .replace(/^(src\/)?(?:app|pages)/, "")
          .replace(/\/(?:page|index)\.[jt]sx?$/, "")
          .replace(/\/\([^/]+\)/g, "") || "/";
      report.routes.push({
        path: route,
        file,
        previewState: "UNSUPPORTED",
        reason:
          "Next.js runtime preview is unavailable in this release; static inspection remains available.",
      });
    }
  }
  const existing = new Set(report.files.map((file) => file.file));
  for (const f of report.files)
    for (const imp of f.imports) {
      const bases: string[] = [];
      if (imp.from.startsWith("."))
        bases.push(
          path.posix.normalize(
            path.posix.join(path.posix.dirname(f.file), imp.from),
          ),
        );
      else
        for (const [alias, targets] of Object.entries(aliases)) {
          if (alias.endsWith("*")) {
            const prefix = alias.slice(0, -1);
            if (imp.from.startsWith(prefix)) {
              for (const target of targets)
                if (target.endsWith("*"))
                  bases.push(
                    target.slice(0, -1) + imp.from.slice(prefix.length),
                  );
              break;
            }
          } else if (imp.from === alias || imp.from.startsWith(alias + "/")) {
            for (const target of targets)
              if (!target.includes("*"))
                bases.push(
                  path.posix.join(target, imp.from.slice(alias.length)),
                );
            break;
          }
        }
      for (const base of bases) {
        const moduleExtensions = [
          ".tsx",
          ".ts",
          ".jsx",
          ".js",
          ".mts",
          ".cts",
          ".mjs",
          ".cjs",
        ];
        for (const candidate of [
          base,
          ...moduleExtensions.map((extension) => base + extension),
          ...moduleExtensions.map((extension) => `${base}/index${extension}`),
        ])
          if (existing.has(candidate)) {
            imp.resolved = candidate;
            break;
          }
        if (imp.resolved) break;
      }
    }
  for (const el of report.elements) {
    const file = report.files.find((f) => f.file === el.source.file)!;
    const local = report.components.find(
      (c) => c.name === el.tag && c.source.file === el.source.file,
    );
    const imp = file.imports.find((i) => i.name === el.tag);
    const sameName = report.components.filter(
      (component) => component.name === el.tag && component.exported,
    );
    const definition =
      local ??
      report.components.find(
        (c) => c.source.file === imp?.resolved && (c.name === el.tag || (imp?.kind === "lazy-default" && c.defaultExported)),
      ) ??
      (sameName.length === 1 ? sameName[0] : undefined);
    if (definition) {
      el.componentId = definition.id;
      definition.references.push({
        file: el.source.file,
        line: el.source.line,
      });
      for (const event of el.events)
        if (!definition.events.includes(event.name))
          definition.events.push(event.name);
      for (const prop of el.props) {
        if (
          !definition.props.some((candidate) => candidate.name === prop.name) &&
          prop.kind !== "expression" &&
          prop.kind !== "style" &&
          !/^on[A-Z]/.test(prop.name)
        )
          definition.props.push({
            name: prop.name,
            type: prop.kind,
            optional: true,
          });
        const shape = definition.props.find((p) => p.name === prop.name);
        if (
          shape &&
          prop.kind !== "expression" &&
          prop.kind !== "style" &&
          !el.dynamic &&
          !/^on[A-Z]/.test(prop.name)
        ) {
          prop.editable =
            !!shape.options ||
            /^(string|number|boolean|unknown)$/.test(shape.type);
          prop.options = shape.options;
          prop.reason = prop.editable
            ? undefined
            : "Complex prop type requires a registry.";
        }
      }
    } else if (/^[A-Z]/.test(el.tag)) {
      el.editability = "UNRESOLVED";
      el.reasons.push(
        "Custom component definition or prop contract is unresolved.",
      );
      for (const p of el.props) p.editable = false;
      el.operations = el.dynamic ? [] : ["insert", "duplicate"];
    }
    if (!el.dynamic && el.editability !== "UNRESOLVED") {
      const editable = el.props.some((p) => p.editable) || el.text !== null;
      el.editability = editable ? "EDITABLE" : "LIMITED";
    }
    const own = report.components.find((c) => c.id === el.ownerComponent);
    if (own) {
      el.references = {
        knownCount: own.references.length,
        analysisComplete: false,
      };
      el.sourceOwnership = own.exported ? "shared-component" : "jsx-instance";
    }
  }
  for (const el of report.elements) {
    const own = report.components.find((c) => c.id === el.ownerComponent);
    if (own) el.references.knownCount = own.references.length;
  }
  for (const c of report.components) {
    c.editability = report.elements.some(
      (e) => e.ownerComponent === c.id && e.editability === "EDITABLE",
    )
      ? "LIMITED"
      : "READ_ONLY";
  }
  for (const token of report.styleTokens)
    for (const f of report.files) {
      const sf = sources.get(f.file);
      if (sf?.text.includes(token.name)) token.consumers.push(f.file);
    }
  if (framework === "vite-react")
    report.routes.push({
      path: "/",
      file:
        report.files.find((f) => /(^|\/)App\.[jt]sx?$/.test(f.file))?.file ??
        report.files.find((f) => /main\.[jt]sx?$/.test(f.file))?.file ??
        "",
      previewState: "CONFIG_REQUIRED",
      reason: "Approve trusted local Vite preview to render this route.",
    });
  if (framework === "nextjs") {
    report.readiness = {
      ...report.readiness,
      previewCommand: null,
      state: "UNSUPPORTED",
      reason:
        "Next.js runtime preview is unavailable in this release. Static inspection remains available.",
    };
    warnings.push(
      "Next.js runtime preview is unavailable in this release. Static inspection remains available.",
    );
  }
  if (framework === "unknown") {
    warnings.push(
      "No supported React framework detected. Static inspection only.",
    );
    report.readiness.state = "UNSUPPORTED";
  }
  if (libs.length)
    warnings.push(
      "Recognized UI libraries are inspectable; editing requires resolved prop contracts.",
    );
  if (report.stories.length)
    warnings.push(
      "Stories were discovered without execution. Dynamic args and decorators are not imported.",
    );
  warnings.push(
    "Static analysis cannot prove all runtime references, style cascade, or network effects.",
  );
  try {
    const [{ stdout: branch }, { stdout: status }] = await Promise.all([
      exec("git", ["-C", root, "branch", "--show-current"], {
        timeout: 2500,
        maxBuffer: 100000,
      }),
      exec(
        "git",
        ["-C", root, "status", "--porcelain", "--untracked-files=no"],
        { timeout: 2500, maxBuffer: 100000 },
      ),
    ]);
    report.git = {
      available: true,
      branch: branch.trim(),
      dirty: !!status.trim(),
      files: status
        .split(/\r?\n/)
        .filter(Boolean)
        .map((s) => s.slice(3)),
    };
  } catch {}
  report.coverage = {
    filesInspected: report.files.length,
    filesSkipped: skipped,
    elementsEditable: report.elements.filter(
      (e) => e.editability === "EDITABLE",
    ).length,
    elementsLimited: report.elements.filter((e) => e.editability === "LIMITED")
      .length,
    elementsReadOnly: report.elements.filter(
      (e) => !["EDITABLE", "LIMITED"].includes(e.editability),
    ).length,
    reasons: [
      ...new Set([
        ...reasons,
        "node_modules, build outputs, hidden folders and symlinks excluded",
      ]),
    ],
    complete,
  };
  return report;
}
export { PRIMITIVE_PROPS, jsxOpen };
