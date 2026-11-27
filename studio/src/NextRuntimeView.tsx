import { useRef, useState } from "react";
import { api } from "./api";
import type { AnalysisReport } from "../../src/engine/types";
import { fillRoute, routeParameters } from "../../src/engine/next-path";
import type { Key } from "./i18n";

export default function NextRuntimeView({ origin, projectRoot, routes, basePath, tr, busy, error, onStop }: {
  origin: string;
  projectRoot: string;
  routes: AnalysisReport["routes"];
  basePath?: string;
  tr: (key: Key) => string;
  busy: boolean;
  error: string;
  onStop: () => void;
}) {
  const [path, setPath] = useState(basePath ?? "/");
  const [input, setInput] = useState(basePath ?? "/");
  const [pattern, setPattern] = useState("");
  const [parameters, setParameters] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [invalid, setInvalid] = useState(false);
  const routeNames = [...new Set(routes.map(route => route.path))];
  const files = [...new Set(routes.filter(route => route.path === pattern).map(route => route.file))];
  const sourceFile = files.length === 1 ? files[0] : undefined;
  const [source, setSource] = useState<{ text?: string; error?: string } | null>(null);
  const sourceRequest = useRef(0);
  const closeSource = () => { sourceRequest.current++; setSource(null); };
  const showSource = async () => {
    if (!sourceFile) return;
    const request = ++sourceRequest.current;
    setSource({});
    try {
      const query = new URLSearchParams({ file: sourceFile, expectedProject: projectRoot });
      const result = await api<{ source: string }>("source?" + query);
      if (request === sourceRequest.current) setSource({ text: result.source });
    } catch (error) {
      if (request === sourceRequest.current) setSource({ error: (error as Error).message });
    }
  };
  const navigate = (value: string) => {
    let target: URL;
    try {
      if (!value.startsWith("/") || /[\\\[\]\u0000-\u001f]/.test(value)) throw new Error();
      target = new URL(value, origin);
      if (target.origin !== origin) throw new Error();
    } catch {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setPath(target.pathname + target.search + target.hash);
  };
  return (
    <main className="next-runtime-page">
      <header className="next-runtime-bar">
        <div>
          <h1>{tr("nextRuntimeTitle")}</h1>
          <p>{tr("nextRuntimeScope")}</p>
        </div>
        <button className="button" disabled={busy} onClick={onStop}>{tr("nextStopRuntime")}</button>
      </header>
      <form className="next-runtime-nav" onSubmit={event => { event.preventDefault(); navigate(input.trim()); }}>
        <label>
          {tr("nextDetectedRoutes")}
          <select value={pattern} onChange={event => {
            const value = event.target.value;
            closeSource();
            setPattern(value);
            setParameters(new Map());
            if (!value) return;
            setInput(fillRoute(value, new Map()) ?? value);
            setInvalid(false);
            if (!value.includes("[")) navigate(value);
          }}>
            <option value="">{tr("nextChooseRoute")}</option>
            {routeNames.map(entry => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </label>
        {routeParameters(pattern).map(({ name, kind }) => (
          <label key={name}>
            {name}{kind === "optional" ? ` (${tr("nextOptionalParameter")})` : ""}
            <input value={parameters.get(name) ?? ""}
              placeholder={kind === "single" ? undefined : "category/item"}
              onChange={event => {
                const next = new Map(parameters).set(name, event.target.value);
                setParameters(next);
                setInput(fillRoute(pattern, next) ?? pattern);
                setInvalid(false);
              }} />
          </label>
        ))}
        <label>{tr("nextRuntimePath")}
          <input value={input} onChange={event => { setInput(event.target.value); setInvalid(false); }} />
        </label>
        <button className="button accent" type="submit">{tr("nextOpenRoute")}</button>
        {sourceFile && <button className="button" type="button" aria-expanded={source !== null}
          onClick={() => source ? closeSource() : void showSource()}>{tr(source ? "nextCloseSource" : "nextShowSource")}</button>}
      </form>
      {pattern.includes("[") && <p className="muted">{tr("nextDynamicHint")}</p>}
      {invalid && <p className="notice" role="alert">{tr("nextInvalidPath")}</p>}
      {error && <p className="notice" role="alert">{error}</p>}
      {source && <section className="next-route-source" aria-label={tr("nextShowSource")}>
        <strong>{sourceFile}</strong>
        {source.error ? <p role="alert">{source.error}</p> : source.text === undefined
          ? <p role="status">{tr("nextSourceLoading")}</p>
          : <pre tabIndex={0}><code>{source.text}</code></pre>}
      </section>}
      <iframe title={tr("nextRuntimeFrame")} src={new URL(path, origin).href}
        sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-downloads" />
    </main>
  );
}
