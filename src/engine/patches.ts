// Copyright (c) 2026 RA. MIT License.
import ts from "typescript";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { stat, open, rename, unlink } from "node:fs/promises";
import {
  analyzeProject,
  parseSource,
  parseErrors,
  PRIMITIVE_PROPS,
  jsxOpen,
} from "./analyzer.js";
import { hashSource, readProjectFile, resolveProjectPath } from "./safety.js";
import type {
  PatchRequest,
  SourcePatch,
  Checkpoint,
  JsxElement,
  ComponentInfo,
  AnalysisReport,
} from "./types.js";
const INSERT_TAGS = new Set([
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "main",
  "nav",
  "p",
  "span",
  "h1",
  "h2",
  "h3",
  "h4",
  "button",
  "label",
  "input",
  "textarea",
  "ul",
  "ol",
  "li",
  "form",
  "fieldset",
  "legend",
  "a",
  "img",
]);
const VOID = new Set([
  "input",
  "img",
  "br",
  "hr",
  "area",
  "base",
  "col",
  "embed",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const STYLE_KEYS = new Set([
  "color",
  "background",
  "backgroundColor",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "gap",
  "rowGap",
  "columnGap",
  "fontSize",
  "fontFamily",
  "fontStyle",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textDecorationLine",
  "whiteSpace",
  "transform",
  "border",
  "borderColor",
  "borderWidth",
  "borderStyle",
  "borderRadius",
  "boxShadow",
  "opacity",
  "overflow",
  "overflowX",
  "overflowY",
  "flex",
  "flexDirection",
  "flexWrap",
  "alignItems",
  "justifyContent",
  "gridTemplateColumns",
  "gridTemplateRows",
]);
const STYLE_ENUMS: Record<string, string[]> = {
  display: [
    "none",
    "block",
    "inline",
    "inline-block",
    "flex",
    "inline-flex",
    "grid",
    "inline-grid",
    "contents",
    "table",
  ],
  position: ["static", "relative", "absolute", "fixed", "sticky"],
  flexDirection: ["row", "row-reverse", "column", "column-reverse"],
  textAlign: ["left", "right", "center", "justify", "start", "end"],
  fontStyle: ["normal", "italic", "oblique"],
  textDecorationLine: ["none", "underline", "line-through", "underline line-through"],
  whiteSpace: ["normal", "nowrap", "pre", "pre-wrap", "pre-line"],
  overflow: ["visible", "hidden", "clip", "scroll", "auto"],
};
const BLOCK = new Set([
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "main",
  "nav",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "form",
  "fieldset",
  "table",
]);
const INSERT_EVENTS = new Set([
  "onClick",
  "onChange",
  "onSubmit",
  "onBlur",
  "onFocus",
  "onInput",
  "onKeyDown",
  "onKeyUp",
  "onDoubleClick",
  "onMouseEnter",
  "onMouseLeave",
  "onPointerDown",
  "onPointerUp",
  "onDragStart",
  "onDragOver",
  "onDrop",
  "onScroll",
  "onLoad",
  "onError",
]);
function fail(message: string): never {
  throw new Error(message);
}
function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}
function attrValue(value: string | number | boolean, quote = '"'): string {
  if (typeof value === "string")
    return (
      quote +
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(new RegExp(quote, "g"), quote === '"' ? "&quot;" : "&apos;") +
      quote
    );
  return `{${JSON.stringify(value)}}`;
}
function importSpecifier(fromFile: string, sourceFile: string): string {
  let relative = path.posix.relative(path.posix.dirname(fromFile), sourceFile);
  relative = relative.replace(/\.(?:tsx?|jsx?|mts|cts|mjs|cjs)$/, "");
  if (relative.endsWith("/index")) relative = relative.slice(0, -6);
  return relative.startsWith(".") ? relative : `./${relative}`;
}
function jsxAttributeLiteral(
  attribute: ts.JsxAttribute,
): string | number | boolean | undefined {
  const initializer = attribute.initializer;
  if (!initializer) return true;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (!ts.isJsxExpression(initializer) || !initializer.expression)
    return undefined;
  const expression = initializer.expression;
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}
function hasTopLevelBinding(sf: ts.SourceFile, name: string): boolean {
  const bindingContains = (binding: ts.BindingName): boolean => {
    if (ts.isIdentifier(binding)) return binding.text === name;
    return binding.elements.some(
      (element) => ts.isBindingElement(element) && bindingContains(element.name),
    );
  };
  return sf.statements.some((statement) => {
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      statement.name?.text === name
    )
      return true;
    if (ts.isVariableStatement(statement))
      return statement.declarationList.declarations.some((declaration) =>
        bindingContains(declaration.name),
      );
    return false;
  });
}
function applySpan(
  source: string,
  start: number,
  end: number,
  replacement: string,
): string {
  return source.slice(0, start) + replacement + source.slice(end);
}
export function unifiedDiff(
  before: string,
  after: string,
  file: string,
): string {
  const a = before.split(/\r?\n/),
    b = after.split(/\r?\n/);
  let first = 0;
  while (first < a.length && first < b.length && a[first] === b[first]) first++;
  if (first === a.length && first === b.length) return "";
  let endA = a.length,
    endB = b.length;
  while (endA > first && endB > first && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const start = Math.max(0, first - 3);
  const tail = Math.min(3, a.length - endA, b.length - endB);
  return [
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${start + 1},${endA + tail - start} +${start + 1},${endB + tail - start} @@`,
    ...a.slice(start, first).map((l) => " " + l),
    ...a.slice(first, endA).map((l) => "-" + l),
    ...b.slice(first, endB).map((l) => "+" + l),
    ...a.slice(endA, endA + tail).map((l) => " " + l),
  ].join("\n");
}
function staticChildren(n: ts.Node): n is ts.JsxElement {
  return (
    ts.isJsxElement(n) &&
    n.children.every(
      (c) =>
        ts.isJsxText(c) || ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c),
    )
  );
}
function validateNesting(parent: string, child: string): void {
  if (VOID.has(parent)) fail("Void HTML elements cannot contain children.");
  if (["ul", "ol"].includes(parent) && child !== "li")
    fail("Lists accept li children only.");
  if (child === "li" && !["ul", "ol"].includes(parent))
    fail("li requires an ul or ol parent.");
  if (
    ["p", "span", "button", "a", "label", "h1", "h2", "h3", "h4"].includes(
      parent,
    ) &&
    BLOCK.has(child)
  )
    fail("Invalid HTML nesting for this container.");
  if (["p", "h1", "h2", "h3", "h4"].includes(parent) && /^[A-Z]/.test(child))
    fail("This text element cannot safely accept an unresolved project component. Select a form or section instead.");
  if (
    parent === "button" &&
    (["button", "input", "a", "textarea", "select", "form"].includes(child) || /^[A-Z]/.test(child))
  )
    fail("Interactive or unresolved project components cannot be nested in a button. Select a form or section instead.");
  if (parent === "a" && child === "a") fail("Links cannot be nested.");
  if (parent === "form" && child === "form") fail("Forms cannot be nested.");
  if (["table", "thead", "tbody", "tr", "select"].includes(parent))
    fail("This structured container requires an explicit registry adapter.");
}
/** Infer only observed, direct compound-component relationships. */
function compoundWrapper(
  report: AnalysisReport,
  target: JsxElement,
  tag: string,
  component: ComponentInfo | undefined,
): string | undefined {
  if (!/^[A-Z][\w$]*$/.test(target.tag)) return undefined;
  const byId = new Map(report.elements.map((item) => [item.id, item]));
  const wrappers = report.elements.filter((item) => {
    if (!item.tag.startsWith(`${target.tag}.`)) return false;
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    if (!parent || parent.tag !== target.tag) return false;
    return target.componentId ? parent.componentId === target.componentId : parent.source.file === target.source.file;
  });
  if (!wrappers.length) return undefined;
  const wrapperIds = new Set(wrappers.map((item) => item.id));
  const examples = report.elements.filter((item) =>
    !!item.parentId && wrapperIds.has(item.parentId) && item.tag === tag &&
    (component ? item.componentId === component.id : !item.componentId),
  );
  const local = examples.filter((item) => item.source.file === target.source.file);
  const matching = local.length ? local : examples;
  const members = new Set(matching.map((item) => byId.get(item.parentId!)!.tag));
  if (members.size !== 1)
    fail(`Cannot determine a unique ${target.tag} wrapper for ${tag}. Select the intended section or configure it in source.`);
  const member = [...members][0];
  const memberExamples = examples.map((item) => byId.get(item.parentId!)!).filter((item) =>
    item.tag === member &&
    !item.props.some((prop) => !["label", "style"].includes(prop.name) && !prop.name.startsWith("style.")) &&
    !item.props.some((prop) => prop.name === "label" && prop.kind !== "string"),
  );
  if (!memberExamples.length)
    fail(`The ${member} wrapper needs project-specific properties; select it directly or configure it in source.`);
  const labels = memberExamples.flatMap((item) => item.props.filter((prop) => prop.name === "label"));
  return `<${member}${labels.length ? ' label="New field"' : ""}>`;
}
function sfDefaultExport(source: string, file: string, name: string): boolean {
  const sf = parseSource(file, source);
  return sf.statements.some(
    (s) =>
      (ts.isFunctionDeclaration(s) &&
        s.name?.text === name &&
        !!(ts.getCombinedModifierFlags(s) & ts.ModifierFlags.Default)) ||
      (ts.isExportAssignment(s) && s.expression.getText(sf) === name),
  );
}
function findNode(sf: ts.SourceFile, id: string, file: string): ts.Node {
  let found: ts.Node | undefined;
  function walk(n: ts.Node) {
    if (jsxOpen(n) && `${file}:${n.getStart(sf)}` === id) found = n;
    ts.forEachChild(n, walk);
  }
  walk(sf);
  if (!found) fail("Unknown source node; re-analyze the project.");
  return found!;
}
function knownType(
  el: JsxElement,
  name: string,
  value: string | number | boolean,
  definition?: ComponentInfo,
): void {
  const prop = el.props.find((p) => p.name === name);
  if (prop) {
    if (!prop.editable) fail(prop.reason ?? "This property is read-only.");
    if (prop.options && !prop.options.includes(String(value)))
      fail(`Allowed values: ${prop.options.join(", ")}.`);
    if (
      ["string", "number", "boolean"].includes(prop.kind) &&
      typeof value !== prop.kind
    )
      fail(`Expected a ${prop.kind} value for ${name}.`);
  } else {
    const contract = definition?.props.find((item) => item.name === name);
    if (!/^[a-z]/.test(el.tag) && !contract)
      fail("New custom component props require a known component contract.");
    if (contract?.options && !contract.options.includes(String(value)))
      fail(`Allowed values: ${contract.options.join(", ")}.`);
    const contractKind = contract?.type.match(/^(string|number|boolean)$/)?.[1];
    const kind = contractKind ??
      PRIMITIVE_PROPS[name] ??
      (contract?.type === "unknown" && ["string", "number", "boolean"].includes(typeof value) ? typeof value : undefined) ??
      (/^(aria-|data-)[a-zA-Z0-9_-]+$/.test(name) ? "string" : undefined);
    if (!kind)
      fail("Unknown prop type. Add a supported registry contract first.");
    if (typeof value !== kind) fail(`Expected ${kind} for ${name}.`);
  }
  if (typeof value === "number" && !Number.isFinite(value))
    fail("Number must be finite.");
  if (name === "value" || name === "checked")
    fail(
      "Controlled input bindings are code-owned; use defaultValue or source editing.",
    );
}
function validateInsertedProp(
  name: string,
  value: string | number | boolean,
): void {
  if (
    !/^[A-Za-z_][\w:-]*$/.test(name) ||
    /^on[A-Z]/.test(name) ||
    ["dangerouslySetInnerHTML", "ref", "key", "style", "children"].includes(
      name,
    )
  )
    fail("Unsupported inserted property.");
  const kind =
    PRIMITIVE_PROPS[name] ??
    (/^(aria-|data-)[a-zA-Z0-9_-]+$/.test(name) ? "string" : undefined);
  if (!kind) fail("Unknown inserted property type.");
  if (typeof value !== kind) fail(`Expected ${kind} for inserted ${name}.`);
  if (typeof value === "number" && !Number.isFinite(value))
    fail("Number must be finite.");
  if (name === "value" || name === "checked")
    fail("Controlled values are code-owned; use defaultValue instead.");
}
function callableInScope(
  sf: ts.SourceFile,
  node: ts.Node,
  name: string,
): boolean {
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return false;
  const nearestScope = (value: ts.Node): ts.Node => {
    let current = value.parent;
    while (current && !ts.isSourceFile(current)) {
      if (ts.isFunctionLike(current)) return current;
      current = current.parent;
    }
    return sf;
  };
  const targetScope = nearestScope(node);
  let found = false;
  const walk = (current: ts.Node) => {
    if (found) return;
    if (
      ts.isFunctionDeclaration(current) &&
      current.name?.text === name &&
      (nearestScope(current) === targetScope || nearestScope(current) === sf)
    )
      found = true;
    if (
      ts.isVariableDeclaration(current) &&
      ts.isIdentifier(current.name) &&
      current.name.text === name &&
      (nearestScope(current) === targetScope || nearestScope(current) === sf)
    ) {
      const init = current.initializer;
      found =
        !!init &&
        (ts.isArrowFunction(init) ||
          ts.isFunctionExpression(init) ||
          (ts.isCallExpression(init) &&
            ((ts.isIdentifier(init.expression) &&
              init.expression.text === "useCallback") ||
              (ts.isPropertyAccessExpression(init.expression) &&
                init.expression.name.text === "bind"))));
    }
    if (
      ts.isBindingElement(current) &&
      ts.isIdentifier(current.name) &&
      current.name.text === name &&
      ts.isArrayBindingPattern(current.parent) &&
      current.parent.elements.indexOf(current) === 1 &&
      ts.isVariableDeclaration(current.parent.parent) &&
      (nearestScope(current) === targetScope || nearestScope(current) === sf)
    ) {
      const init = current.parent.parent.initializer;
      found =
        !!init &&
        ts.isCallExpression(init) &&
        ts.isIdentifier(init.expression) &&
        ["useState", "useReducer"].includes(init.expression.text);
    }
    if (!found) ts.forEachChild(current, walk);
  };
  walk(sf);
  return found;
}
export async function createPatch(
  root: string,
  request: PatchRequest,
): Promise<SourcePatch> {
  if (
    !request ||
    ![
      "text",
      "prop",
      "event",
      "remove-event",
      "style",
      "insert",
      "duplicate",
      "move",
      "remove",
    ].includes(
      request.operation,
    )
  )
    fail("Unknown edit operation.");
  if (!["instance", "shared", "token"].includes(request.scope))
    fail("Choose a valid edit scope.");
  if (request.scope === "token")
    fail(
      "Global token editing is inspect-only until token ownership and cascade are reliably resolved.",
    );
  if (request.scope === "shared" && request.confirmScope !== true)
    fail("Shared component editing requires explicit scope confirmation.");
  const before = await readProjectFile(root, request.file);
  if (hashSource(before) !== request.expectedHash)
    fail(
      "Source conflict: file changed externally. Re-analyze before editing.",
    );
  const report = await analyzeProject(root);
  const element = report.elements.find(
    (e) => e.id === request.elementId && e.source.file === request.file,
  );
  if (!element) fail("Unknown source node; re-analyze the project.");
  if (
    !["insert", "duplicate"].includes(request.operation) &&
    !["EDITABLE", "LIMITED"].includes(element.editability)
  )
    fail(element.reasons.join(" ") || "Element is read-only.");
  if (["insert", "duplicate"].includes(request.operation) && element.dynamic)
    fail("Dynamic or repeated JSX cannot be changed structurally.");
  const component = report.components.find(
    (c) => c.id === element.ownerComponent,
  );
  const knownUsages = component?.references.length ?? 0;
  const routeOwner =
    !!component &&
    report.routes.some((r) => r.file === component.source.file) &&
    ((component.name === "App" && knownUsages <= 1) ||
      sfDefaultExport(before, request.file, component.name));
  const sharedImplementation =
    !!component &&
    !routeOwner &&
    element.sourceOwnership === "shared-component";
  if (request.scope === "shared" && !sharedImplementation)
    fail(
      "Shared scope requires selecting a node inside an exported shared component implementation. Select the consuming JSX usage for an instance-only change.",
    );
  if (request.scope === "instance" && sharedImplementation)
    fail(
      `This node belongs to exported ${component.name} implementation (${knownUsages} detected usages; indexing may be incomplete). Select a JSX usage or confirm shared scope.`,
    );
  const sf = parseSource(request.file, before);
  const node = findNode(sf, request.elementId, request.file);
  const opening = jsxOpen(node)!;
  let after = before;
  if (request.operation === "text") {
    if (
      !ts.isJsxElement(node) ||
      (node.children.length === 0 && !/^(?:p|span|h[1-6]|button|label|a|li|legend)$/.test(opening.tagName.getText(sf))) ||
      !node.children.every(ts.isJsxText)
    )
      fail("Only a static text child can be edited.");
    if (typeof request.value !== "string") fail("Text must be a string.");
    const start = node.openingElement.end,
      end = node.closingElement.getStart(sf);
    const previous = before.slice(start, end);
    const leading = previous.match(/^\s*/)?.[0] ?? "",
      trailing = previous.match(/\s*$/)?.[0] ?? "";
    after = applySpan(
      before,
      start,
      end,
      leading + escapeText(request.value) + trailing,
    );
  } else if (request.operation === "prop") {
    const name = request.name ?? "";
    if (
      !/^[A-Za-z_][\w:-]*$/.test(name) ||
      /^on[A-Z]/.test(name) ||
      ["dangerouslySetInnerHTML", "ref", "key", "style", "children"].includes(
        name,
      )
    )
      fail("This property is code-owned or unsupported.");
    if (request.value === undefined) fail("A property value is required.");
    knownType(
      element,
      name,
      request.value,
      report.components.find((candidate) => candidate.id === element.componentId),
    );
    const attrs = opening.attributes.properties.filter(
      (a): a is ts.JsxAttribute =>
        ts.isJsxAttribute(a) && a.name.getText(sf) === name,
    );
    if (attrs.length > 1) fail("Duplicate JSX props require source editing.");
    const attr = attrs[0];
    if (attr) {
      const quote =
        attr.initializer && ts.isStringLiteral(attr.initializer)
          ? before[attr.initializer.getStart(sf)]
          : '"';
      if (attr.initializer)
        after = applySpan(
          before,
          attr.initializer.getStart(sf),
          attr.initializer.end,
          attrValue(request.value, quote),
        );
      else
        after = applySpan(
          before,
          attr.end,
          attr.end,
          "=" + attrValue(request.value),
        );
    } else
      after = applySpan(
        before,
        opening.tagName.end,
        opening.tagName.end,
        ` ${name}=${attrValue(request.value)}`,
      );
  } else if (request.operation === "event" || request.operation === "remove-event") {
    const name = request.name ?? "";
    const handler = request.value;
    if (!/^on[A-Z][A-Za-z0-9_$]*$/.test(name))
      fail("Choose a valid React event property.");
    if (request.operation === "event" && (typeof handler !== "string" || !callableInScope(sf, node, handler)))
      fail(
        `Event handler ${String(handler || "")} is not an existing callable in this component scope.`,
      );
    const existing = element.events.find((event) => event.name === name);
    const definition = report.components.find(
      (candidate) => candidate.id === element.componentId,
    );
    if (/^[a-z]/.test(element.tag)) {
      if (!INSERT_EVENTS.has(name)) fail("Unsupported native React event.");
    } else if (!existing && !definition?.events.includes(name)) {
      fail("This event is not declared by the selected component contract.");
    }
    const attrs = opening.attributes.properties.filter(
      (attribute): attribute is ts.JsxAttribute =>
        ts.isJsxAttribute(attribute) && attribute.name.getText(sf) === name,
    );
    if (attrs.length > 1) fail("Duplicate JSX events require source editing.");
    const attr = attrs[0];
    if (attr && (!attr.initializer || !ts.isJsxExpression(attr.initializer) || !attr.initializer.expression || !ts.isIdentifier(attr.initializer.expression)))
      fail("Event expressions are source-owned; edit them in source.");
    if (request.operation === "remove-event") {
      if (!attr) fail("This event binding no longer exists.");
      after = applySpan(before, attr.getStart(sf), attr.end, "");
    } else if (attr?.initializer)
      after = applySpan(
        before,
        attr.initializer.getStart(sf),
        attr.initializer.end,
        `{${handler}}`,
      );
    else if (attr)
      after = applySpan(before, attr.end, attr.end, `={${handler}}`);
    else
      after = applySpan(
        before,
        opening.tagName.end,
        opening.tagName.end,
        ` ${name}={${handler}}`,
      );
  } else if (request.operation === "style") {
    const name = (request.name ?? "").replace(/^style\./, "");
    if (!STYLE_KEYS.has(name)) fail("Unsupported style property.");
    if (typeof request.value !== "string" && typeof request.value !== "number")
      fail("Style value must be a string or number.");
    if (typeof request.value === "number" && !Number.isFinite(request.value))
      fail("Style number must be finite.");
    if (
      STYLE_ENUMS[name] &&
      !STYLE_ENUMS[name]!.includes(String(request.value))
    )
      fail(`Allowed style values: ${STYLE_ENUMS[name]!.join(", ")}.`);
    const attr = opening.attributes.properties.find(
      (a): a is ts.JsxAttribute =>
        ts.isJsxAttribute(a) && a.name.getText(sf) === "style",
    );
    if (!attr)
      after = applySpan(
        before,
        opening.tagName.end,
        opening.tagName.end,
        ` style={{ ${name}: ${JSON.stringify(request.value)} }}`,
      );
    else {
      const init = attr.initializer;
      const expr =
        init && ts.isJsxExpression(init) ? init.expression : undefined;
      if (
        !expr ||
        !ts.isObjectLiteralExpression(expr) ||
        expr.properties.some((p) => !ts.isPropertyAssignment(p))
      )
        fail("Dynamic or spread styles are read-only.");
      const props = expr.properties.filter(ts.isPropertyAssignment);
      const prop = props.find(
        (p) => p.name.getText(sf).replace(/^['"]|['"]$/g, "") === name,
      );
      if (prop) {
        if (!element.props.find((p) => p.name === `style.${name}`)?.editable)
          fail("This style expression is code-owned.");
        after = applySpan(
          before,
          prop.initializer.getStart(sf),
          prop.initializer.end,
          JSON.stringify(request.value),
        );
      } else {
        const offset = expr.end - 1;
        const text = expr.getText(sf).slice(1, -1).trim();
        const comma = text && !text.endsWith(",") ? "," : "";
        after = applySpan(
          before,
          offset,
          offset,
          `${comma} ${name}: ${JSON.stringify(request.value)} `,
        );
      }
    }
  } else if (request.operation === "insert") {
    const requestedComponent = request.insertComponent;
    const tag = requestedComponent?.name ?? request.name ?? "div";
    if (!requestedComponent && !INSERT_TAGS.has(tag))
      fail("Only registered HTML primitives or indexed project components can be inserted.");
    let indexedComponent: ComponentInfo | undefined;
    if (requestedComponent) {
      if (!/^[A-Z][A-Za-z0-9_$]*$/.test(requestedComponent.name))
        fail("Invalid project component name.");
      indexedComponent = report.components.find(
        (candidate) =>
          candidate.name === requestedComponent.name &&
          candidate.source.file === requestedComponent.sourceFile,
      );
      if (!indexedComponent?.exported)
        fail("Only an exported indexed project component can be inserted.");
      if (
        !!indexedComponent.defaultExported !== requestedComponent.defaultExported
      )
        fail("The component export changed; re-analyze before inserting it.");
    }
    const props = request.insertProps ?? [];
    if (props.length > 8)
      fail("At most eight static properties can be inserted.");
    const seenProps = new Set<string>();
    let attributes = "";
    for (const prop of props) {
      if (seenProps.has(prop.name))
        fail("Duplicate inserted properties are unsupported.");
      seenProps.add(prop.name);
      if (indexedComponent) {
        const contract = indexedComponent.props.find(
          (candidate) => candidate.name === prop.name,
        );
        if (!contract)
          fail("Unknown property for the inserted project component contract.");
        if (contract.options && !contract.options.includes(String(prop.value)))
          fail(`Allowed values: ${contract.options.join(", ")}.`);
        const kind = contract.type.match(/^(string|number|boolean)$/)?.[1];
        if (kind && typeof prop.value !== kind)
          fail(`Expected ${kind} for inserted ${prop.name}.`);
      } else validateInsertedProp(prop.name, prop.value);
      attributes += ` ${prop.name}=${attrValue(prop.value)}`;
    }
    if (request.insertEvent) {
      const { name, handler } = request.insertEvent;
      if (
        !(indexedComponent
          ? indexedComponent.events.includes(name)
          : INSERT_EVENTS.has(name))
      )
        fail("Unsupported inserted event.");
      if (!callableInScope(sf, node, handler))
        fail(
          `Event handler ${handler} is not an existing callable in this component scope.`,
        );
      attributes += ` ${name}={${handler}}`;
    }
    if (indexedComponent) {
      const missing = indexedComponent.props.filter((prop) =>
        prop.requiredProven && !seenProps.has(prop.name) && request.insertEvent?.name !== prop.name,
      );
      if (missing.length)
        fail(`Component ${tag} is not supported for direct insertion: required ${missing.map((prop) => prop.name).join(", ")} must be configured first.`);
    }
    const content = typeof request.value === "string" ? escapeText(request.value) : "";
    let markup = requestedComponent
      ? `<${tag}${attributes} />`
      : VOID.has(tag)
        ? `<${tag}${attributes} />`
        : `<${tag}${attributes}>${content}</${tag}>`;
    const position = request.position ?? "inside";
    let parent: ts.Node = node;
    if (position === "inside") {
      if (!ts.isJsxElement(node))
        fail(
          "Insertion requires a JSX container with a closing tag.",
        );
      validateNesting(opening.tagName.getText(sf), tag);
      const parentTag = opening.tagName.getText(sf);
      if (/^(?:TabPane|Tabs|TabPanel)$/.test(parentTag))
        fail("Select the form inside the tab before adding a component; inserting directly into the tab container is not supported.");
      const wrapper = compoundWrapper(report, element, tag, indexedComponent);
      if (wrapper) {
        const wrapperTag = wrapper.slice(1).split(/[\s>]/, 1)[0];
        markup = `${wrapper}${markup}</${wrapperTag}>`;
      }
      const offset = node.closingElement.getStart(sf);
      const lineStart = before.lastIndexOf("\n", offset - 1) + 1;
      const closingIndent = before.slice(lineStart, offset);
      if (lineStart > node.openingElement.end && /^[\t ]*$/.test(closingIndent)) {
        const previousChild = [...node.children].reverse().find((child) => ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child));
        const childStart = previousChild?.getStart(sf);
        const childLine = childStart === undefined ? -1 : before.lastIndexOf("\n", childStart - 1) + 1;
        const observedIndent = childStart === undefined || childLine < 0 ? "" : before.slice(childLine, childStart);
        const indent = /^[\t ]+$/.test(observedIndent) && observedIndent.length > closingIndent.length
          ? observedIndent : `${closingIndent}  `;
        const newline = before.includes("\r\n") ? "\r\n" : "\n";
        after = applySpan(before, lineStart, lineStart, `${indent}${markup}${newline}`);
      } else {
        after = applySpan(before, offset, offset, markup);
      }
    } else {
      parent = node.parent;
      if (!staticChildren(parent))
        fail("Sibling insertion requires a static JSX container.");
      validateNesting(parent.openingElement.tagName.getText(sf), tag);
      const offset = position === "before" ? node.getStart(sf) : node.end;
      after = applySpan(before, offset, offset, markup);
    }
    if (
      requestedComponent &&
      requestedComponent.sourceFile !== request.file
    ) {
      const analyzedFile = report.files.find((file) => file.file === request.file);
      const sameBinding = analyzedFile?.imports.find(
        (item) => item.name === requestedComponent.name,
      );
      if (sameBinding && sameBinding.resolved !== requestedComponent.sourceFile)
        fail(`The name ${requestedComponent.name} is already imported from another module.`);
      if (!sameBinding && !hasTopLevelBinding(sf, requestedComponent.name)) {
        const imports = sf.statements.filter(ts.isImportDeclaration);
        const offset = imports.length ? imports.at(-1)!.end : 0;
        const specifier = importSpecifier(
          request.file,
          requestedComponent.sourceFile,
        );
        const declaration = requestedComponent.defaultExported
          ? `import ${requestedComponent.name} from ${JSON.stringify(specifier)};`
          : `import { ${requestedComponent.name} } from ${JSON.stringify(specifier)};`;
        after = applySpan(
          after,
          offset,
          offset,
          `${offset ? "\n" : ""}${declaration}\n`,
        );
      }
    }
  } else if (request.operation === "duplicate") {
    const duplicate = request.duplicateProp;
    if (!duplicate) {
      let hasIdentity = false;
      const inspect = (item: ts.Node) => {
        if (ts.isJsxSpreadAttribute(item) || (ts.isJsxAttribute(item) && /^(?:key|id|name|fromName|toName|[A-Za-z_$][\w$]*(?:Id|ID))$/.test(item.name.getText(sf)))) hasIdentity = true;
        ts.forEachChild(item, inspect);
      };
      inspect(node);
      if (hasIdentity) fail("Choose an ID or name property for the copied component; dynamic identities and spreads require source review.");
      if (request.targetId) {
        const target = report.elements.find((candidate) => candidate.id === request.targetId && candidate.source.file === request.file);
        if (!target || target.dynamic || !target.operations.includes("insert") || target.ownerComponent !== element.ownerComponent)
          fail("Choose an editable destination in the same component and source file.");
        const targetNode = findNode(sf, target.id, request.file);
        if (!ts.isJsxElement(targetNode) || (targetNode.getStart(sf) >= node.getStart(sf) && targetNode.end <= node.end))
          fail("Choose a destination outside the copied component.");
        const scopes = (current: ts.Node) => {
          const result: ts.Node[] = [];
          for (let parent = current.parent; parent; parent = parent.parent)
            if (ts.isBlock(parent) || ts.isFunctionLike(parent)) result.push(parent);
          return result;
        };
        const sourceScopes = scopes(node), targetScopes = scopes(targetNode);
        if (sourceScopes.length !== targetScopes.length || sourceScopes.some((scope, index) => scope !== targetScopes[index]))
          fail("Copying across different variable scopes requires source review.");
        validateNesting(targetNode.openingElement.tagName.getText(sf), opening.tagName.getText(sf));
        after = applySpan(before, targetNode.closingElement.getStart(sf), targetNode.closingElement.getStart(sf), node.getText(sf));
      } else {
      if (!staticChildren(node.parent)) fail("Copying requires static siblings in one container.");
      const lineStart = before.lastIndexOf("\n", node.getStart(sf) - 1) + 1;
      const indent = before.slice(lineStart, node.getStart(sf)).match(/^\s*/)?.[0] ?? "";
      const newline = before.includes("\r\n") ? "\r\n" : "\n";
      after = applySpan(before, node.end, node.end, `${newline}${indent}${node.getText(sf)}`);
      }
    } else {
    if (request.targetId) fail("Copying identified components to another container requires source review.");
    if (!staticChildren(node.parent)) fail("Copying requires static siblings in one container.");
    let identities = 0;
    let hasSpread = false;
    const inspectIdentities = (item: ts.Node) => {
      if (ts.isJsxSpreadAttribute(item)) hasSpread = true;
      if (ts.isJsxAttribute(item) && /^(?:key|id|name|fromName|toName|[A-Za-z_$][\w$]*(?:Id|ID))$/.test(item.name.getText(sf))) identities++;
      ts.forEachChild(item, inspectIdentities);
    };
    inspectIdentities(node);
    if (hasSpread || identities !== 1)
      fail("Copying multiple or dynamic identities requires source review; no changes were made.");
    if (!/^(?:id|name|fromName|toName|[A-Za-z_$][\w$]*(?:Id|ID))$/.test(duplicate.name))
      fail("Choose a supported identity property such as id, name, or *Id.");
    const descendants = new Set<string>();
    const collect = (id: string) => {
      if (descendants.has(id)) return;
      descendants.add(id);
      report.elements
        .find((candidate) => candidate.id === id)
        ?.children.forEach(collect);
    };
    collect(element.id);
    if (!descendants.has(duplicate.elementId))
      fail("The selected identity property is outside the copied component.");
    const identityElement = report.elements.find(
      (candidate) => candidate.id === duplicate.elementId,
    );
    const knownProperty = identityElement?.props.find(
      (prop) => prop.name === duplicate.name && prop.kind !== "expression",
    );
    if (!identityElement || !knownProperty)
      fail("The copied identity must be a literal property.");
    if (duplicate.name === "id" && typeof knownProperty.value === "string") {
      let referenced = false;
      const inspectReferences = (item: ts.Node) => {
        if (ts.isJsxAttribute(item) && /^(?:htmlFor|aria-labelledby|aria-describedby|aria-controls)$/.test(item.name.getText(sf))) {
          const value = jsxAttributeLiteral(item);
          if (typeof value !== "string" || value.split(/\s+/).includes(knownProperty.value as string)) referenced = true;
        }
        ts.forEachChild(item, inspectReferences);
      };
      inspectReferences(node);
      if (referenced) fail("Copying identity references requires source review; no changes were made.");
    }
    if (typeof duplicate.value !== typeof knownProperty.value)
      fail("The copied identity must keep its original value type.");
    if (duplicate.value === knownProperty.value)
      fail("The copied component needs a different identity value.");
    if (
      report.elements.some(
        (candidate) =>
          candidate.source.file === request.file &&
          candidate.props.some(
            (prop) =>
              prop.name === duplicate.name && prop.value === duplicate.value,
          ),
      )
    )
      fail("That identity value already exists in this source file.");
    const identityNode = findNode(sf, duplicate.elementId, request.file);
    if (
      identityNode.getStart(sf) < node.getStart(sf) ||
      identityNode.end > node.end
    )
      fail("The selected identity is not inside the copied JSX subtree.");
    const identityOpening = jsxOpen(identityNode)!;
    const attribute = identityOpening.attributes.properties.find(
      (property): property is ts.JsxAttribute =>
        ts.isJsxAttribute(property) && property.name.getText(sf) === duplicate.name,
    );
    if (!attribute?.initializer || jsxAttributeLiteral(attribute) === undefined)
      fail("The copied identity must be a literal property.");
    const quote = ts.isStringLiteral(attribute.initializer)
      ? before[attribute.initializer.getStart(sf)]
      : '"';
    const rootStart = node.getStart(sf);
    let clone = node.getText(sf);
    clone = applySpan(
      clone,
      attribute.initializer.getStart(sf) - rootStart,
      attribute.initializer.end - rootStart,
      attrValue(duplicate.value, quote),
    );
    const lineStart = before.lastIndexOf("\n", rootStart - 1) + 1;
    const indent = before.slice(lineStart, rootStart).match(/^\s*/)?.[0] ?? "";
    const newline = before.includes("\r\n") ? "\r\n" : "\n";
    after = applySpan(before, node.end, node.end, `${newline}${indent}${clone}`);
    }
  } else if (request.operation === "move") {
    if (request.direction !== "up" && request.direction !== "down")
      fail("Choose move up or down.");
    const parent = node.parent;
    if (!staticChildren(parent))
      fail("Reorder requires static siblings in one container.");
    const siblings = parent.children.filter(
      (c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c),
    );
    const index = siblings.indexOf(
      node as ts.JsxElement | ts.JsxSelfClosingElement,
    );
    const other = siblings[index + (request.direction === "up" ? -1 : 1)];
    if (!other) fail("No sibling in that direction.");
    if (
      report.elements.find(
        (e) => e.id === `${request.file}:${other.getStart(sf)}`,
      )?.dynamic
    )
      fail("Cannot cross a dynamic source boundary.");
    const first = node.getStart(sf) < other.getStart(sf) ? node : other;
    const second = first === node ? other : node;
    after = applySpan(
      before,
      first.getStart(sf),
      second.end,
      second.getText(sf) +
        before.slice(first.end, second.getStart(sf)) +
        first.getText(sf),
    );
  } else {
    const parent = node.parent;
    if (
      !staticChildren(parent) ||
      (!staticChildren(node) && !ts.isJsxSelfClosingElement(node))
    )
      fail("Only static nested JSX nodes can be removed.");
    if (element.events.length)
      fail("Removing a component with event handlers requires source review.");
    after = applySpan(before, node.getStart(sf), node.end, "");
  }
  if (Buffer.byteLength(after) > 1024 * 1024)
    fail("Proposed source exceeds the 1 MiB safety limit.");
  if (after === before) fail("The proposed value does not change source.");
  const errors = parseErrors(parseSource(request.file, after));
  if (errors.length) fail(`Patch rejected: ${errors[0]}`);
  return {
    id: randomUUID(),
    file: request.file,
    beforeHash: hashSource(before),
    afterHash: hashSource(after),
    before,
    after,
    diff: unifiedDiff(before, after, request.file),
    scope: request.scope,
    impact: {
      knownUsages,
      files: [request.file],
      usageFiles: [...new Set(component?.references.map((r) => r.file) ?? [])],
      analysisComplete: false,
      warning:
        "Only known static references are indexed; runtime and unscanned impact may exist.",
    },
    warnings:
      request.scope === "shared"
        ? [
            "Shared implementation change affects all detected and potentially unindexed usages.",
          ]
        : [],
    operation: request.operation,
    state: "PATCH_PREVIEW",
  };
}

export async function createMultiStylePatch(
  root: string,
  requests: Array<{
    file: string;
    elementId: string;
    expectedHash: string;
    name: string;
    value: string | number;
    scope: "instance" | "shared";
    confirmScope?: boolean;
  }>,
): Promise<SourcePatch> {
  if (requests.length < 2 || requests.length > 50)
    fail("Choose between two and fifty items to move together.");
  const file = requests[0]!.file;
  if (requests.some((request) => request.file !== file))
    fail("Grouped positioning is limited to items in the same source file.");
  const before = await readProjectFile(root, file);
  const beforeHash = hashSource(before);
  if (requests.some((request) => request.expectedHash !== beforeHash))
    fail("Source conflict: file changed externally. Re-analyze before editing.");
  const report = await analyzeProject(root);
  const resolved = requests.map((request) => {
    const element = report.elements.find(
      (candidate) =>
        candidate.id === request.elementId && candidate.source.file === file,
    );
    if (!element) fail("Unknown grouped source node; re-analyze the project.");
    if (!element.operations.includes("style"))
      fail("One of the selected items cannot be positioned safely.");
    const component = report.components.find(
      (candidate) => candidate.id === element.ownerComponent,
    );
    const knownUsages = component?.references.length ?? 0;
    const routeOwner =
      !!component &&
      report.routes.some((route) => route.file === component.source.file) &&
      ((component.name === "App" && knownUsages <= 1) ||
        sfDefaultExport(before, file, component.name));
    const sharedImplementation =
      !!component &&
      !routeOwner &&
      element.sourceOwnership === "shared-component";
    if (sharedImplementation && request.scope !== "shared")
      fail("A grouped item requires confirmed shared scope.");
    if (request.scope === "shared" && request.confirmScope !== true)
      fail("Shared component positioning requires explicit scope confirmation.");
    if (!STYLE_KEYS.has(request.name)) fail("Unsupported style property.");
    if (
      typeof request.value !== "string" &&
      typeof request.value !== "number"
    )
      fail("Style value must be a string or number.");
    if (
      STYLE_ENUMS[request.name] &&
      !STYLE_ENUMS[request.name]!.includes(String(request.value))
    )
      fail(`Allowed style values: ${STYLE_ENUMS[request.name]!.join(", ")}.`);
    return { request, element, component, knownUsages };
  });
  const uniqueChanges = new Set(
    requests.map((request) => `${request.elementId}\0${request.name}`),
  );
  if (uniqueChanges.size !== requests.length)
    fail("Each style property can be changed only once per action.");

  let after = before;
  for (const { request } of [...resolved].sort(
    (left, right) => right.element.source.start - left.element.source.start,
  )) {
    const sf = parseSource(file, after);
    const node = findNode(sf, request.elementId, file);
    const opening = jsxOpen(node)!;
    const attribute = opening.attributes.properties.find(
      (candidate): candidate is ts.JsxAttribute =>
        ts.isJsxAttribute(candidate) &&
        candidate.name.getText(sf) === "style",
    );
    if (!attribute) {
      after = applySpan(
        after,
        opening.tagName.end,
        opening.tagName.end,
        ` style={{ ${request.name}: ${JSON.stringify(request.value)} }}`,
      );
      continue;
    }
    const expression =
      attribute.initializer && ts.isJsxExpression(attribute.initializer)
        ? attribute.initializer.expression
        : undefined;
    if (
      !expression ||
      !ts.isObjectLiteralExpression(expression) ||
      expression.properties.some((property) =>
        !ts.isPropertyAssignment(property),
      )
    )
      fail("Dynamic or spread styles are read-only.");
    const property = expression.properties
      .filter(ts.isPropertyAssignment)
      .find(
        (candidate) =>
          candidate.name.getText(sf).replace(/^['"]|['"]$/g, "") ===
          request.name,
      );
    if (property) {
      after = applySpan(
        after,
        property.initializer.getStart(sf),
        property.initializer.end,
        JSON.stringify(request.value),
      );
    } else {
      const offset = expression.end - 1;
      const text = expression.getText(sf).slice(1, -1).trim();
      const comma = text && !text.endsWith(",") ? "," : "";
      after = applySpan(
        after,
        offset,
        offset,
        `${comma} ${request.name}: ${JSON.stringify(request.value)} `,
      );
    }
  }
  if (after === before) fail("The grouped position does not change source.");
  const errors = parseErrors(parseSource(file, after));
  if (errors.length) fail(`Grouped patch rejected: ${errors[0]}`);
  const components = resolved
    .map((item) => item.component)
    .filter((item): item is ComponentInfo => !!item);
  return {
    id: randomUUID(),
    file,
    beforeHash,
    afterHash: hashSource(after),
    before,
    after,
    diff: unifiedDiff(before, after, file),
    scope: requests.some((request) => request.scope === "shared")
      ? "shared"
      : "instance",
    impact: {
      knownUsages: Math.max(0, ...resolved.map((item) => item.knownUsages)),
      files: [file],
      usageFiles: [
        ...new Set(
          components.flatMap((component) =>
            component.references.map((reference) => reference.file),
          ),
        ),
      ],
      analysisComplete: false,
      warning:
        "Only known static references are indexed; runtime and unscanned impact may exist.",
    },
    warnings: requests.some((request) => request.scope === "shared")
      ? ["Grouped positioning includes a shared implementation."]
      : [],
    operation: "style",
    state: "PATCH_PREVIEW",
  };
}
async function atomicWrite(
  root: string,
  file: string,
  expectedHash: string,
  next: string,
): Promise<void> {
  const full = await resolveProjectPath(root, file);
  const current = await readProjectFile(root, file);
  if (hashSource(current) !== expectedHash)
    fail("Source conflict: external edits detected; no file was changed.");
  const info = await stat(full);
  if (!(info.mode & 0o222))
    fail("File has no write permission. Update permissions before applying.");
  const temp = path.join(
    path.dirname(full),
    `.${path.basename(full)}.uiux-${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await open(temp, "wx", info.mode);
    await handle.writeFile(next, "utf8");
    await handle.chmod(info.mode);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await resolveProjectPath(root, file);
    if (hashSource(await readProjectFile(root, file)) !== expectedHash)
      fail("Source conflict during apply; no file was changed.");
    await rename(temp, full);
    if (hashSource(await readProjectFile(root, file)) !== hashSource(next))
      fail(
        "Source changed immediately after writing. Re-analyze; external changes were not overwritten.",
      );
  } catch (error) {
    await handle?.close();
    await unlink(temp).catch(() => {});
    throw error;
  }
}
export async function applyPatch(
  root: string,
  patch: SourcePatch,
  approved: boolean,
): Promise<Checkpoint> {
  if (approved !== true)
    fail("Explicit review approval is required before writing source.");
  if (
    hashSource(patch.before) !== patch.beforeHash ||
    hashSource(patch.after) !== patch.afterHash
  )
    fail("Patch integrity check failed.");
  if (parseErrors(parseSource(patch.file, patch.after)).length)
    fail("Invalid syntax; patch was not applied.");
  await atomicWrite(root, patch.file, patch.beforeHash, patch.after);
  return {
    id: patch.id,
    file: patch.file,
    before: patch.before,
    beforeHash: patch.beforeHash,
    afterHash: patch.afterHash,
    appliedAt: new Date().toISOString(),
  };
}
export async function undoPatch(
  root: string,
  checkpoint: Checkpoint,
): Promise<void> {
  if (hashSource(checkpoint.before) !== checkpoint.beforeHash)
    fail("Checkpoint integrity check failed.");
  await atomicWrite(
    root,
    checkpoint.file,
    checkpoint.afterHash,
    checkpoint.before,
  );
}
