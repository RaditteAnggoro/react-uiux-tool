import { useState } from "react";
import type { AnalysisReport } from "../../src/engine/types";
import type { Key } from "./i18n";

export default function CssTokenEditor({ report, disabled, tr, onReview }: {
  report: AnalysisReport;
  disabled: boolean;
  tr: (key: Key) => string;
  onReview: (request: { file: string; name: string; value: string; expectedHash: string }) => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const counts = new Map<string, number>();
  for (const token of report.styleTokens) counts.set(token.name, (counts.get(token.name) ?? 0) + 1);
  const available = report.coverage.complete ? report.styleTokens.filter(token => token.editable && counts.get(token.name) === 1) : [];
  const token = available.find(token => token.name === name);
  const file = report.files.find(file => file.file === token?.source.file);
  if (!report.styleTokens.length) return null;
  return <details className="inspector-section">
    <summary>{tr("token")}</summary>
    <p className="small muted">{tr(available.length ? "cssTokenRule" : "cssTokenUnavailable")}</p>
    {available.length > 0 && <>
      <label className="field">
        <span>{tr("cssTokenName")}</span>
        <select value={token?.name ?? ""} disabled={disabled} onChange={event => {
          const next = available.find(item => item.name === event.target.value);
          setName(next?.name ?? "");
          setValue(next?.value ?? "");
        }}>
          <option value="">{tr("cssTokenChoose")}</option>
          {available.map(item => <option key={item.name} value={item.name}>{item.name} · {item.source.file}</option>)}
        </select>
      </label>
      {token && file && <>
        <p className="small muted"><code>{token.selector} · {token.source.file}:{token.source.line}</code></p>
        <label className="field"><span>{tr("cssTokenValue")}</span>
          <input value={value} maxLength={160} onChange={event => setValue(event.target.value)} disabled={disabled} />
        </label>
        <button type="button" className="button full" disabled={disabled || !value.trim() || value.trim() === token.value}
          onClick={() => onReview({ file: file.file, name: token.name, value, expectedHash: file.hash })}>{tr("cssTokenReview")}</button>
      </>}
    </>}
  </details>;
}
