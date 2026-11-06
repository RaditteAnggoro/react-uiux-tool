import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  chmod,
  stat,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  analyzeProject,
  createPatch,
  createMultiStylePatch,
  applyPatch,
  undoPatch,
  readProjectFile,
  hashSource,
} from "../src/engine/index.js";
import type { PatchRequest, JsxElement } from "../src/engine/types.js";
async function fixture(source: string, extra: Record<string, string> = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-engine-"));
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "fixture",
      dependencies: { react: "19.0.0", vite: "7.0.0" },
      scripts: { dev: "vite" },
    }),
  );
  await writeFile(path.join(root, "src/App.tsx"), source);
  for (const [file, text] of Object.entries(extra)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  }
  return { root, cleanup: () => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
}
function req(
  el: JsxElement,
  operation: PatchRequest["operation"],
  value?: string | number | boolean,
  name?: string,
): PatchRequest {
  return {
    file: el.source.file,
    elementId: el.id,
    expectedHash: el.hash,
    operation,
    value,
    name,
    scope: "instance",
  };
}
const SIMPLE = `import React, { useState } from 'react';\r\n// Keep my comment exactly.\r\nexport default function App() {\r\n  const [count, setCount] = useState(0);\r\n  const submit = () => setCount(count + 1);\r\n  return <main><button className="primary" onClick={submit}>Search</button><p>Result</p></main>;\r\n}\r\n`;
test("analyzer is read-only and detects concrete evidence, handlers, aliases and dynamic editability", async () => {
  const f = await fixture(
    SIMPLE.replace(
      "<p>Result</p>",
      "<p>Result</p>{[1,2].map(n => <span>{n}</span>)}",
    ),
    {
      "tsconfig.json": '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}',
      "src/theme.css": ":root { --brand-color: #635BFF; }",
      "src/node_modules/skip.tsx":
        "const Skip = () => <div>Never scanned</div>;",
    },
  );
  try {
    const before = await readFile(path.join(f.root, "src/App.tsx"));
    const r = await analyzeProject(f.root);
    assert.equal(r.detected.framework, "vite-react");
    assert.deepEqual(r.detected.aliases, { "@/*": ["src/*"] });
    assert.ok(
      r.components
        .find((c) => c.name === "App")
        ?.behavior.includes("local-state"),
    );
    assert.equal(
      r.elements.find((e) => e.tag === "button")?.events[0]?.expression,
      "submit",
    );
    assert.equal(
      r.elements.find((e) => e.tag === "span")?.editability,
      "READ_ONLY",
    );
    assert.equal(r.styleTokens[0]?.name, "--brand-color");
    assert.ok(!r.files.some((f) => f.file.includes("node_modules")));
    assert.deepEqual(await readFile(path.join(f.root, "src/App.tsx")), before);
  } finally {
    await f.cleanup();
  }
});
test("literal edit stages without writes, apply preserves CRLF/comments/hooks/handlers, undo restores exact bytes", async () => {
  const f = await fixture(SIMPLE);
  try {
    const r = await analyzeProject(f.root);
    const button = r.elements.find((e) => e.tag === "button")!;
    const p = await createPatch(f.root, req(button, "text", "Find"));
    assert.equal(
      await readFile(path.join(f.root, "src/App.tsx"), "utf8"),
      SIMPLE,
    );
    assert.equal(p.after, SIMPLE.replace(">Search<", ">Find<"));
    assert.match(p.diff, /-.*Search/);
    await assert.rejects(applyPatch(f.root, p, false), /approval/);
    const checkpoint = await applyPatch(f.root, p, true);
    assert.equal(
      await readFile(path.join(f.root, "src/App.tsx"), "utf8"),
      p.after,
    );
    await undoPatch(f.root, checkpoint);
    assert.equal(
      await readFile(path.join(f.root, "src/App.tsx"), "utf8"),
      SIMPLE,
    );
  } finally {
    await f.cleanup();
  }
});
test("apply and undo reject external edits and never overwrite them", async () => {
  const f = await fixture(SIMPLE);
  try {
    const r = await analyzeProject(f.root);
    const p = await createPatch(
      f.root,
      req(
        r.elements.find((e) => e.tag === "button")!,
        "prop",
        "new",
        "className",
      ),
    );
    await writeFile(
      path.join(f.root, "src/App.tsx"),
      SIMPLE + "// external\r\n",
    );
    await assert.rejects(applyPatch(f.root, p, true), /conflict/);
    assert.equal(
      await readFile(path.join(f.root, "src/App.tsx"), "utf8"),
      SIMPLE + "// external\r\n",
    );
    await writeFile(path.join(f.root, "src/App.tsx"), SIMPLE);
    const checkpoint = await applyPatch(f.root, p, true);
    await writeFile(path.join(f.root, "src/App.tsx"), p.after + "// newer");
    await assert.rejects(undoPatch(f.root, checkpoint), /conflict/);
    assert.equal(
      await readFile(path.join(f.root, "src/App.tsx"), "utf8"),
      p.after + "// newer",
    );
  } finally {
    await f.cleanup();
  }
});
test("reject traversal, secrets and symlink escapes at source boundary", async () => {
  const f = await fixture(SIMPLE);
  const outside = await mkdtemp(path.join(os.tmpdir(), "uiux-outside-"));
  try {
    await writeFile(
      path.join(outside, "secret.tsx"),
      'const token = "private"',
    );
    await symlink(
      path.join(outside, "secret.tsx"),
      path.join(f.root, "src/escape.tsx"),
    );
    await writeFile(path.join(f.root, ".env"), "SECRET=true");
    await assert.rejects(readProjectFile(f.root, "../secret.tsx"), /Invalid/);
    await assert.rejects(
      readProjectFile(f.root, path.join(outside, "secret.tsx")),
      /Invalid/,
    );
    await assert.rejects(readProjectFile(f.root, "src/escape.tsx"), /Symlink/);
    await assert.rejects(readProjectFile(f.root, ".env"), /Unsupported|Secret/);
    const report = await analyzeProject(f.root);
    assert.ok(!report.files.some((f) => f.file.endsWith("escape.tsx")));
  } finally {
    await f.cleanup();
    await rm(outside, { recursive: true, force: true });
  }
});
test("analysis rejects the canonical home directory as an overbroad project root", async () => {
  await assert.rejects(
    analyzeProject(os.homedir()),
    /specific project directory/,
  );
});
test("type-safe custom literal prop edits resolve exact file and preserve shared implementation", async () => {
  const source = `import { Button } from './Button';\nexport default function App(){ return <main><Button variant="outline" onClick={submit}>Find</Button></main>; }`;
  const shared = `type Props = {variant: 'outline' | 'solid'; onClick: () => void; children: string};\nexport function Button(props: Props) { return <button>{props.children}</button>; }`;
  const f = await fixture(source, { "src/Button.tsx": shared });
  try {
    const r = await analyzeProject(f.root);
    const button = r.elements.find((e) => e.tag === "Button")!;
    assert.deepEqual(button.props.find((p) => p.name === "variant")?.options, [
      "outline",
      "solid",
    ]);
    await assert.rejects(
      createPatch(f.root, req(button, "prop", "other", "variant")),
      /Allowed values/,
    );
    const patch = await createPatch(
      f.root,
      req(button, "prop", "solid", "variant"),
    );
    assert.equal(
      patch.after,
      source.replace('variant="outline"', 'variant="solid"'),
    );
    assert.equal(
      await readFile(path.join(f.root, "src/Button.tsx"), "utf8"),
      shared,
    );
    await assert.rejects(
      createPatch(f.root, {
        ...req(button, "prop", "solid", "variant"),
        scope: "shared",
        confirmScope: true,
      }),
      /inside an exported shared component implementation/,
    );
    const native = r.elements.find((e) => e.tag === "button")!;
    await assert.rejects(
      createPatch(f.root, req(native, "prop", "x", "className")),
      /shared/,
    );
    await assert.rejects(
      createPatch(f.root, {
        ...req(native, "prop", "x", "className"),
        scope: "shared",
      }),
      /confirmation/,
    );
    const sharedPatch = await createPatch(f.root, {
      ...req(native, "prop", "x", "className"),
      scope: "shared",
      confirmScope: true,
    });
    assert.equal(sharedPatch.file, "src/Button.tsx");
    assert.equal(sharedPatch.impact.knownUsages, 1);
    assert.deepEqual(sharedPatch.impact.files, ["src/Button.tsx"]);
    assert.deepEqual(sharedPatch.impact.usageFiles, ["src/App.tsx"]);
  } finally {
    await f.cleanup();
  }
});
test("exported component implementations require shared scope even with zero indexed usages", async () => {
  const f = await fixture(
    "export default function App(){return <main>Route</main>}",
    {
      "src/Exported.tsx":
        'export function Exported(){return <button className="base">Shared</button>}',
    },
  );
  try {
    const r = await analyzeProject(f.root);
    const button = r.elements.find(
      (e) => e.source.file === "src/Exported.tsx" && e.tag === "button",
    )!;
    assert.equal(button.references.knownCount, 0);
    await assert.rejects(
      createPatch(f.root, req(button, "prop", "changed", "className")),
      /exported Exported implementation/,
    );
    const patch = await createPatch(f.root, {
      ...req(button, "prop", "changed", "className"),
      scope: "shared",
      confirmScope: true,
    });
    assert.equal(patch.impact.knownUsages, 0);
    assert.deepEqual(patch.impact.usageFiles, []);
  } finally {
    await f.cleanup();
  }
});
test("blocks map/conditional/spread, expression and event editing", async () => {
  const f = await fixture(
    `export default function App(){return <main>{[1].map(n=><button title="row">Row</button>)}{ok && <p>Conditional</p>}<input {...props} /><button title={name} onClick={submit}>Static</button></main>}`,
  );
  try {
    const r = await analyzeProject(f.root);
    for (const el of r.elements.filter((e) => e.dynamic))
      await assert.rejects(
        createPatch(f.root, req(el, "prop", "bad", "title")),
        /expression|Repeated|Conditional|Spread/i,
      );
    const staticButton = r.elements.find(
      (e) => e.tag === "button" && !e.dynamic,
    )!;
    await assert.rejects(
      createPatch(f.root, req(staticButton, "prop", "bad", "title")),
      /Expression/,
    );
    await assert.rejects(
      createPatch(f.root, req(staticButton, "prop", "bad", "onClick")),
      /code-owned/,
    );
    await assert.rejects(
      createPatch(f.root, {
        ...req(staticButton, "text", "x"),
        elementId: "src/App.tsx:99999",
      }),
      /Unknown/,
    );
  } finally {
    await f.cleanup();
  }
});
test("static reorder, insertion, removal, text escaping and nesting constraints", async () => {
  const f = await fixture(
    "export default function App(){return <main><p>First</p><p>Second</p><aside>Remove me</aside><button onClick={submit}>Keep event</button><ul><li>Item</li></ul></main>}",
  );
  try {
    let r = await analyzeProject(f.root);
    const p = r.elements.find((e) => e.text === "Second")!;
    const moved = await createPatch(f.root, {
      ...req(p, "move"),
      direction: "up",
    });
    assert.match(moved.after, /<p>Second<\/p><p>First<\/p>/);
    const main = r.elements.find((e) => e.tag === "main")!;
    const insert = await createPatch(f.root, {
      ...req(main, "insert", "<New {text}>", "p"),
      position: "inside",
    });
    assert.match(insert.after, /&lt;New &#123;text&#125;&gt;/);
    const removed = await createPatch(
      f.root,
      req(r.elements.find((e) => e.tag === "aside")!, "remove"),
    );
    assert.doesNotMatch(removed.after, /Remove me/);
    await assert.rejects(
      createPatch(
        f.root,
        req(r.elements.find((e) => e.tag === "button")!, "remove"),
      ),
      /event handlers/,
    );
    const ul = r.elements.find((e) => e.tag === "ul")!;
    await assert.rejects(
      createPatch(f.root, req(ul, "insert", "wrong", "div")),
      /Lists/,
    );
    await assert.rejects(
      createPatch(f.root, req(main, "insert", "bad", "script")),
      /registered/,
    );
  } finally {
    await f.cleanup();
  }
});
test("event bindings can be added, changed and removed without rewriting handler logic", async () => {
  const source = "export default function App(){const first=()=>{};const second=()=>{};return <main><button>Save</button><button onClick={() => first()}>Custom</button></main>}";
  const f = await fixture(source);
  try {
    const button = async () => (await analyzeProject(f.root)).elements.find((element) => element.tag === "button" && element.text === "Save")!;
    const add = await createPatch(f.root, req(await button(), "event", "first", "onClick"));
    await applyPatch(f.root, add, true);
    assert.match(await readFile(path.join(f.root, "src/App.tsx"), "utf8"), /onClick=\{first\}/);
    const change = await createPatch(f.root, req(await button(), "event", "second", "onClick"));
    await applyPatch(f.root, change, true);
    assert.match(await readFile(path.join(f.root, "src/App.tsx"), "utf8"), /onClick=\{second\}/);
    const removal = await createPatch(f.root, req(await button(), "remove-event", undefined, "onClick"));
    const checkpoint = await applyPatch(f.root, removal, true);
    const after = await readFile(path.join(f.root, "src/App.tsx"), "utf8");
    assert.doesNotMatch(after, /onClick=\{second\}/);
    assert.match(after, /const second=\(\)=>\{\}/);
    await undoPatch(f.root, checkpoint);
    assert.match(await readFile(path.join(f.root, "src/App.tsx"), "utf8"), /onClick=\{second\}/);
    const custom = (await analyzeProject(f.root)).elements.find((element) => element.tag === "button" && element.text === "Custom")!;
    await assert.rejects(createPatch(f.root, req(custom, "remove-event", undefined, "onClick")), /source-owned|read.only/i);
    await assert.rejects(createPatch(f.root, req(custom, "event", "first", "onClick")), /source-owned|read.only/i);
    await assert.rejects(createPatch(f.root, req(await button(), "event", "missing", "onClick")), /not an existing callable/);
  } finally { await f.cleanup(); }
});

test("configured insertion validates specific values and existing event functions", async () => {
  const source =
    "import {useCallback} from 'react';export default function App(){const handleSave=useCallback(()=>{},[]);return <main></main>}";
  const f = await fixture(source);
  try {
    const report = await analyzeProject(f.root);
    const main = report.elements.find((element) => element.tag === "main")!;
    const patch = await createPatch(f.root, {
      ...req(main, "insert", "Save draft", "button"),
      position: "inside",
      insertProps: [
        { name: "title", value: "Save safely" },
        { name: "tabIndex", value: 2 },
      ],
      insertEvent: { name: "onClick", handler: "handleSave" },
    });
    assert.match(
      patch.after,
      /<button title="Save safely" tabIndex=\{2\} onClick=\{handleSave\}>Save draft<\/button>/,
    );
    assert.equal(
      await readFile(path.join(f.root, "src/App.tsx"), "utf8"),
      source,
    );
    await assert.rejects(
      createPatch(f.root, {
        ...req(main, "insert", "Unsafe", "button"),
        insertEvent: { name: "onClick", handler: "missingHandler" },
      }),
      /not an existing callable/,
    );
    await assert.rejects(
      createPatch(f.root, {
        ...req(main, "insert", "Unsafe", "button"),
        insertProps: [{ name: "dangerouslySetInnerHTML", value: "x" }],
      }),
      /Unsupported inserted property/,
    );
  } finally {
    await f.cleanup();
  }
});
test("project components insert with imports and existing JSX duplicates with a new nested identity", async () => {
  const source =
    "import Field from './Field';const registry:any={};const{CodeCombo,Form}=registry;export default function App(){return <main><Form><Field name=\"customerId\"><input name=\"customerCode\" /></Field></Form></main>}";
  const f = await fixture(source, {
    "src/Field.tsx":
      "export default function Field({children}:{children:React.ReactNode}){return <label>{children}</label>}",
    "src/DateField.tsx":
      "import{forwardRef,memo}from'react';const DateField=(props:any,ref:any)=><input ref={ref} type=\"date\"/>;const Wrapped=memo(forwardRef(DateField));export default Wrapped;",
    "src/CodeCombo.tsx":
      "export default function CodeCombo(){return <select></select>}",
  });
  try {
    const report = await analyzeProject(f.root);
    const dateField = report.components.find(
      (component) => component.name === "DateField",
    )!;
    assert.equal(dateField.exported, true);
    assert.equal(dateField.defaultExported, true);
    const main = report.elements.find((element) => element.tag === "main")!;
    const inserted = await createPatch(f.root, {
      ...req(main, "insert"),
      position: "inside",
      insertComponent: {
        name: dateField.name,
        sourceFile: dateField.source.file,
        defaultExported: true,
      },
    });
    assert.match(inserted.after, /import DateField from "\.\/DateField";/);
    assert.match(inserted.after, /<DateField \/>/);

    const form = report.elements.find((element) => element.tag === "Form")!;
    assert.ok(form.operations.includes("insert"));
    const codeCombo = report.components.find(
      (component) => component.name === "CodeCombo",
    )!;
    const registryInserted = await createPatch(f.root, {
      ...req(form, "insert"),
      position: "inside",
      insertComponent: {
        name: codeCombo.name,
        sourceFile: codeCombo.source.file,
        defaultExported: true,
      },
    });
    assert.match(registryInserted.after, /<CodeCombo \/>/);
    assert.doesNotMatch(registryInserted.after, /import CodeCombo/);

    const field = report.elements.find((element) => element.tag === "Field")!;
    const input = report.elements.find((element) => element.tag === "input")!;
    const duplicated = await createPatch(f.root, {
      ...req(field, "duplicate"),
      duplicateProp: {
        elementId: input.id,
        name: "name",
        value: "customerCodeCopy",
      },
    });
    assert.match(
      duplicated.after,
      /<Field name="customerId"><input name="customerCodeCopy" \/><\/Field>/,
    );
    assert.equal(
      duplicated.after.match(/<Field name="customerId">/g)?.length,
      2,
    );
  } finally {
    await f.cleanup();
  }
});
test("component contracts expose properties, events and callables for direct visual binding", async () => {
  const source = `import React from "react";
type WidgetProps = { mode?: "day" | "month"; disabled?: boolean; onChange?: () => void };
export function Widget({ mode = "day", disabled = false, onChange }: WidgetProps) {
  return <button disabled={disabled} onClick={onChange}>{mode}</button>;
}
export default function App() {
  const handleSave = () => {};
  const handleOther = () => {};
  return <main><Widget mode="day" onChange={handleSave} /></main>;
}`;
  const f = await fixture(source);
  try {
    const report = await analyzeProject(f.root);
    const definition = report.components.find(
      (component) => component.name === "Widget",
    )!;
    assert.deepEqual(
      definition.props.find((prop) => prop.name === "mode")?.options,
      ["day", "month"],
    );
    assert.equal(
      definition.props.find((prop) => prop.name === "disabled")?.defaultValue,
      false,
    );
    assert.equal(
      definition.props.find((prop) => prop.name === "onChange")?.type,
      "() => void",
    );
    assert.ok(definition.events.includes("onChange"));
    const owner = report.components.find((component) => component.name === "App")!;
    assert.ok(owner.callables.includes("handleSave"));
    assert.ok(owner.callables.includes("handleOther"));

    const widget = report.elements.find((element) => element.tag === "Widget")!;
    assert.equal(widget.componentId, definition.id);
    const eventPatch = await createPatch(f.root, {
      ...req(widget, "event", "handleOther", "onChange"),
    });
    assert.match(eventPatch.after, /onChange=\{handleOther\}/);

    const propPatch = await createPatch(f.root, {
      ...req(widget, "prop", true, "disabled"),
    });
    assert.match(propPatch.after, /<Widget disabled=\{true\} mode="day"/);

    await assert.rejects(
      createPatch(f.root, req(widget, "event", "missingHandler", "onChange")),
      /not an existing callable/,
    );
    await assert.rejects(
      createPatch(f.root, req(widget, "event", "handleOther", "onUnknown")),
      /not declared/,
    );
  } finally {
    await f.cleanup();
  }
});
test("analyzer offers insertion only for containers with static JSX children", async () => {
  const source = `import React from "react";
export function Panel({ children }) { return <div className="panel">{children}</div>; }
export default function App() { return <Panel><p>Static child</p></Panel>; }`;
  const f = await fixture(source);
  try {
    const report = await analyzeProject(f.root);
    const implementation = report.elements.find(
      (element) => element.tag === "div",
    )!;
    const usage = report.elements.find((element) => element.tag === "Panel")!;
    assert.equal(implementation.operations.includes("insert"), false);
    assert.equal(usage.operations.includes("insert"), true);
  } finally {
    await f.cleanup();
  }
});
test("grouped positioning moves multiple source elements atomically and undo restores both", async () => {
  const source =
    'export default function App(){return <main><input name="first" /><input name="second" /></main>}';
  const f = await fixture(source);
  try {
    const report = await analyzeProject(f.root);
    const inputs = report.elements.filter((element) => element.tag === "input");
    assert.equal(inputs.length, 2);
    const patch = await createMultiStylePatch(
      f.root,
      inputs.map((element) => ({
        file: element.source.file,
        elementId: element.id,
        expectedHash: element.hash,
        name: "marginTop",
        value: "-8px",
        scope: "instance" as const,
      })),
    );
    assert.equal((patch.after.match(/marginTop: "-8px"/g) ?? []).length, 2);
    const checkpoint = await applyPatch(f.root, patch, true);
    assert.equal(
      ((await readFile(path.join(f.root, "src/App.tsx"), "utf8")).match(
        /marginTop: "-8px"/g,
      ) ?? []).length,
      2,
    );
    await undoPatch(f.root, checkpoint);
    assert.equal(
      await readFile(path.join(f.root, "src/App.tsx"), "utf8"),
      source,
    );
  } finally {
    await f.cleanup();
  }
});
test("direct canvas movement updates both axes of one element atomically", async () => {
  const source =
    'export default function App(){return <main><button>Move me</button></main>}';
  const f = await fixture(source);
  try {
    const report = await analyzeProject(f.root);
    const button = report.elements.find((element) => element.tag === "button")!;
    const patch = await createMultiStylePatch(f.root, [
      {
        file: button.source.file,
        elementId: button.id,
        expectedHash: button.hash,
        name: "marginLeft",
        value: "12px",
        scope: "instance",
      },
      {
        file: button.source.file,
        elementId: button.id,
        expectedHash: button.hash,
        name: "marginTop",
        value: "-4px",
        scope: "instance",
      },
    ]);
    assert.match(patch.after, /marginLeft: "12px"/);
    assert.match(patch.after, /marginTop: "-4px"/);
  } finally {
    await f.cleanup();
  }
});
test("style patch is minimal, type constraints reject unsafe changes and no permission write is rejected", async () => {
  const source =
    'export default function App(){return <div style={{ color: "red", padding: 8 }}><input disabled /></div>}';
  const f = await fixture(source);
  try {
    const r = await analyzeProject(f.root);
    const div = r.elements.find((e) => e.tag === "div")!;
    const p = await createPatch(f.root, req(div, "style", "blue", "color"));
    assert.equal(p.after, source.replace('"red"', '"blue"'));
    const input = r.elements.find((e) => e.tag === "input")!;
    await assert.rejects(
      createPatch(f.root, req(input, "prop", "true", "disabled")),
      /boolean/,
    );
    await assert.rejects(
      createPatch(f.root, {
        ...req(div, "style", "x", "color"),
        expectedHash: hashSource("stale"),
      }),
      /conflict/,
    );
    await chmod(path.join(f.root, "src/App.tsx"), 0o444);
    await assert.rejects(applyPatch(f.root, p, true), /permission/);
  } finally {
    await chmod(path.join(f.root, "src/App.tsx"), 0o644);
    await f.cleanup();
  }
});
test("unknown frameworks, Next router evidence, stories and cancellation are truthful", async () => {
  const f = await fixture("export default function Page(){return <p>Hi</p>}", {
    "app/customers/page.tsx":
      "export default function Page(){return <p>Customers</p>}",
    "src/Button.stories.tsx":
      "export const Default = {args: {disabled: false}};",
  });
  try {
    await writeFile(
      path.join(f.root, "package.json"),
      JSON.stringify({ dependencies: { next: "15", react: "19", antd: "5" } }),
    );
    const r = await analyzeProject(f.root);
    assert.equal(r.detected.framework, "nextjs");
    assert.equal(r.detected.router, "app");
    assert.ok(r.routes.some((p) => p.path === "/customers"));
    assert.ok(r.routes.every((route) => route.previewState === "UNSUPPORTED"));
    assert.equal(r.readiness.state, "UNSUPPORTED");
    assert.equal(r.readiness.previewCommand, null);
    assert.ok(r.stories.includes("src/Button.stories.tsx"));
    assert.ok(r.detected.componentLibraries.includes("antd"));
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      analyzeProject(f.root, { signal: controller.signal }),
      /cancelled/,
    );
  } finally {
    await f.cleanup();
  }
});
test("root route App remains instance editable with one render entry; same-name components resolve imports", async () => {
  const f = await fixture(
    "export default function App(){return <main><h1>Heading</h1></main>}",
    {
      "src/main.tsx": "import App from './App'; const root = <App />;",
      "src/other/Button.tsx":
        "export function Button(){return <button>Other</button>}",
      "src/Button.tsx":
        "export function Button(){return <button>Shared</button>}",
      "src/Consumer.tsx":
        "import {Button} from './Button';export function Consumer(){return <Button />}",
    },
  );
  try {
    const r = await analyzeProject(f.root);
    const heading = r.elements.find((e) => e.tag === "h1")!;
    await createPatch(f.root, req(heading, "text", "Updated"));
    const referenced = r.components.find(
      (c) => c.id === "src/Button.tsx#Button",
    )!;
    assert.equal(referenced.references.length, 1);
    assert.equal(
      r.components.find((c) => c.id === "src/other/Button.tsx#Button")
        ?.references.length,
      0,
    );
  } finally {
    await f.cleanup();
  }
});
test("path aliases resolve exact components and exported arrow implementations enforce shared scope", async () => {
  const f = await fixture(
    "import { Button } from '@/components/Button'; export default function App(){return <Button tone=\"calm\">Use</Button>}",
    {
      "tsconfig.json":
        '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}',
      "src/components/Button.tsx":
        "type Props={tone:'calm'|'strong';children:string}; export const Button=(props:Props)=><button className=\"base\">{props.children}</button>",
    },
  );
  try {
    const r = await analyzeProject(f.root);
    const usage = r.elements.find((e) => e.tag === "Button")!;
    assert.equal(usage.componentId, "src/components/Button.tsx#Button");
    assert.deepEqual(usage.props.find((p) => p.name === "tone")?.options, [
      "calm",
      "strong",
    ]);
    const implementation = r.elements.find((e) => e.tag === "button")!;
    assert.equal(
      r.components.find((c) => c.id === "src/components/Button.tsx#Button")
        ?.exported,
      true,
    );
    await assert.rejects(
      createPatch(f.root, req(implementation, "prop", "updated", "className")),
      /shared/,
    );
    const shared = await createPatch(f.root, {
      ...req(implementation, "prop", "updated", "className"),
      scope: "shared",
      confirmScope: true,
    });
    assert.equal(shared.impact.knownUsages, 1);
  } finally {
    await f.cleanup();
  }
});
test("static Vite aliases resolve without executing project config", async () => {
  const f = await fixture(
    "import { Button } from '@/components/Button'; export default function App(){return <Button />}",
    {
      "vite.config.js":
        "import path from 'path'; export default {resolve:{alias:{'@':path.resolve(__dirname,'src')}}}; throw new Error('must not execute');",
      "src/components/Button.tsx":
        "export function Button(){return <button>Vite alias</button>}",
    },
  );
  try {
    const r = await analyzeProject(f.root);
    assert.deepEqual(r.detected.aliases, { "@": ["src"] });
    assert.equal(
      r.elements.find((e) => e.tag === "Button")?.componentId,
      "src/components/Button.tsx#Button",
    );
  } finally {
    await f.cleanup();
  }
});
test("local intersection prop contracts expose their safe literal members", async () => {
  const f = await fixture(
    "import Button from './Button'; export default function App(){return <Button variant=\"secondary\">Open</Button>}",
    {
      "src/Button.tsx":
        "type Native={disabled?:boolean};type Props=Native & {variant?:'primary'|'secondary'};export default function Button(props:Props){return <button>{props.variant}</button>}",
    },
  );
  try {
    const r = await analyzeProject(f.root);
    const usage = r.elements.find((e) => e.tag === "Button")!;
    assert.deepEqual(usage.props.find((p) => p.name === "variant")?.options, [
      "primary",
      "secondary",
    ]);
    assert.equal(
      r.components
        .find((c) => c.id === "src/Button.tsx#Button")
        ?.props.find((p) => p.name === "disabled")?.type,
      "boolean",
    );
    const patch = await createPatch(
      f.root,
      req(usage, "prop", "primary", "variant"),
    );
    assert.match(patch.after, /variant="primary"/);
  } finally {
    await f.cleanup();
  }
});
test("UTF-8 BOM and executable permissions survive apply; malformed UTF-8 is isolated safely", async () => {
  const source =
    "\uFEFFexport default function App(){return <h1>Original</h1>}";
  const f = await fixture(source);
  try {
    await chmod(path.join(f.root, "src/App.tsx"), 0o754);
    const originalMode = (await stat(path.join(f.root, "src/App.tsx"))).mode & 0o777;
    if (process.platform !== "win32") assert.equal(originalMode, 0o754);
    const r = await analyzeProject(f.root);
    const patch = await createPatch(
      f.root,
      req(r.elements.find((e) => e.tag === "h1")!, "text", "Changed"),
    );
    const cp = await applyPatch(f.root, patch, true);
    assert.equal((await readFile(path.join(f.root, "src/App.tsx")))[0], 0xef);
    assert.equal(
      (await stat(path.join(f.root, "src/App.tsx"))).mode & 0o777,
      originalMode,
    );
    await undoPatch(f.root, cp);
    assert.equal(
      await readFile(path.join(f.root, "src/App.tsx"), "utf8"),
      source,
    );
    await writeFile(
      path.join(f.root, "src/legacy.tsx"),
      Buffer.from([0xff, 0xfe, 0xfd]),
    );
    await assert.rejects(
      readProjectFile(f.root, "src/legacy.tsx"),
      /src\/legacy\.tsx: Source is not valid UTF-8/,
    );
    const isolated = await analyzeProject(f.root);
    assert.ok(isolated.files.some((file) => file.file === "src/App.tsx"));
    assert.ok(!isolated.files.some((file) => file.file === "src/legacy.tsx"));
    assert.ok(
      isolated.warnings.some((warning) => warning.includes("src/legacy.tsx")),
    );
    assert.equal(isolated.coverage.complete, false);
    assert.ok(isolated.coverage.filesSkipped >= 1);
  } finally {
    await f.cleanup();
  }
});
