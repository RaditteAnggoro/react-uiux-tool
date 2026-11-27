import ts from "typescript";
import type { AnalysisReport, StoryPreset } from "./types.js";
import { boardArgs } from "./board-args.js";

function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

function properties(node: ts.Expression) {
  const value = unwrap(node);
  if (!ts.isObjectLiteralExpression(value)) return null;
  const fields = new Map<string, ts.Expression>();
  for (const property of value.properties) {
    if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) return null;
    if (fields.has(property.name.text)) return null;
    fields.set(property.name.text, property.initializer);
  }
  return fields;
}

function literal(node: ts.Expression, depth = 0): unknown {
  if (depth > 6) throw new Error("Nested story args");
  node = unwrap(node);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node) && Number.isFinite(Number(node.text))) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
    return -Number(node.operand.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node) && node.elements.length <= 100) return node.elements.map(item => literal(item, depth + 1));
  const fields = properties(node);
  if (fields && fields.size <= 100) return Object.fromEntries([...fields].map(([key, value]) => [key, literal(value, depth + 1)]));
  throw new Error("Story args are not literal values");
}

export function readStoryPresets(sf: ts.SourceFile, file: AnalysisReport["files"][number], components: AnalysisReport["components"]): StoryPreset[] {
  const metaExport = sf.statements.find((node): node is ts.ExportAssignment => ts.isExportAssignment(node) && !node.isExportEquals);
  if (!metaExport) return [];
  const entries = sf.statements.filter(ts.isVariableStatement).flatMap(statement =>
    [...statement.declarationList.declarations].map(declaration => ({ declaration, exported: statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) })),
  );
  const expression = unwrap(metaExport.expression);
  const metaNode = ts.isIdentifier(expression)
    ? entries.find(({ declaration }) => ts.isIdentifier(declaration.name) && declaration.name.text === expression.text)?.declaration.initializer
    : expression;
  const meta = metaNode && properties(metaNode);
  const binding = meta?.get("component");
  if (!meta || !binding || !ts.isIdentifier(binding) || ["render", "decorators", "loaders"].some(key => meta.has(key))) return [];
  const importedFile = file.imports.find(item => item.name === binding.text)?.resolved;
  if (!importedFile) return [];
  const importDeclaration = sf.statements.filter(ts.isImportDeclaration).find(node => {
    const clause = node.importClause;
    return clause?.name?.text === binding.text || clause?.namedBindings && ts.isNamedImports(clause.namedBindings) &&
      clause.namedBindings.elements.some(item => item.name.text === binding.text);
  });
  const clause = importDeclaration?.importClause;
  const isDefault = clause?.name?.text === binding.text;
  const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
    ? clause.namedBindings.elements.find(item => item.name.text === binding.text) : undefined;
  const component = components.find(item => item.source.file === importedFile && item.exported &&
    (isDefault ? item.defaultExported : item.name === (named?.propertyName ?? named?.name)?.text));
  if (!component) return [];
  const presets: StoryPreset[] = [];
  for (const { declaration, exported } of entries) {
    if (!exported || !declaration.initializer || !ts.isIdentifier(declaration.name)) continue;
    const story = properties(declaration.initializer);
    if (!story || ["render", "decorators", "loaders", "play"].some(key => story.has(key))) continue;
    const args = story.get("args");
    const inherited = meta.get("args");
    if (!args && !inherited) continue;
    try {
      const props = boardArgs({
        ...(inherited ? boardArgs(literal(inherited)) : {}),
        ...(args ? boardArgs(literal(args)) : {}),
      });
      presets.push({ file: file.file, name: declaration.name.text, componentId: component.id, args: props });
    } catch { /* Unresolved args remain discoverable as story files. */ }
    if (presets.length >= 50) break;
  }
  return presets;
}
