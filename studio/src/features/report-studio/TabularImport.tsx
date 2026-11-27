import { useState } from "react";
import ReportDialog from "./ReportDialog";
import SampleIssues from "./SampleIssues";
import type { ReportKey } from "./i18n";
import type { ReportDataset } from "../../../../src/reports/core/types";
import { validateSampleData } from "../../../../src/reports/core/sample-validation";

export type ImportSheet = {
  name: string;
  headers: string[];
  rows: Array<Array<string | boolean | null>>;
};

export default function TabularImport({ sheets, dataset, fields, schema, tr, onCancel, onApply }: {
  sheets: ImportSheet[];
  dataset: string;
  fields: string[];
  schema?: ReportDataset;
  tr: (key: ReportKey) => string;
  onCancel: () => void;
  onApply: (records: Array<Record<string, string | boolean | null>>) => void;
}) {
  const [sheetIndex, setSheetIndex] = useState(0);
  const [renamed, setRenamed] = useState<Record<number, string>>({});
  const [diagnostics, setDiagnostics] = useState<ReturnType<typeof validateSampleData> | null>(null);
  const sheet = sheets[sheetIndex]!;
  const keys = sheet.headers.map((header, index) => (renamed[index] ?? header).trim());
  const invalid = keys.some(key => !key || key === "__proto__" || key === "prototype" || key === "constructor") ||
    new Set(keys).size !== keys.length;
  return (
    <ReportDialog label={tr("mapColumns")} className="rs-import-dialog" onCancel={onCancel}>
      <h3>{tr("mapColumns")}</h3>
      <p>{tr("mapColumnsHint").replace("{dataset}", dataset).replace("{count}", String(sheet.rows.length))}</p>
      {sheets.length > 1 && (
        <label className="rs-field">
          <span>{tr("worksheet")}</span>
          <select value={sheetIndex} onChange={event => { setSheetIndex(Number(event.target.value)); setRenamed({}); setDiagnostics(null); }}>
            {sheets.map((entry, index) => <option key={entry.name} value={index}>{entry.name}</option>)}
          </select>
        </label>
      )}
      <datalist id="rs-import-target-fields">
        {fields.map(field => <option key={field} value={field} />)}
      </datalist>
      <div className="rs-import-columns">
        {sheet.headers.map((header, index) => (
          <label className="rs-field" key={index}>
            <span>{tr("mapField").replace("{column}", !header || sheet.headers.filter(item => item === header).length > 1
              ? [header, tr("mapColumnNumber").replace("{number}", String(index + 1))].filter(Boolean).join(" · ")
              : header)}</span>
            <input list="rs-import-target-fields" maxLength={120} value={renamed[index] ?? header}
              onChange={event => { setRenamed(current => ({ ...current, [index]: event.target.value })); setDiagnostics(null); }} />
          </label>
        ))}
      </div>
      {invalid && <p role="alert" className="rs-error">{tr("mapInvalid")}</p>}
      <div className="rs-import-preview" tabIndex={0} aria-label={tr("importPreview")}>
        <table>
          <thead><tr>{keys.map((key, index) => <th key={index} scope="col">{key}</th>)}</tr></thead>
          <tbody>{sheet.rows.slice(0, 4).map((row, index) => (
            <tr key={index}>{row.map((cell, column) => <td key={column}>{String(cell ?? "")}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
      {diagnostics && <SampleIssues result={diagnostics} tr={tr} />}
      <div className="rs-modal-actions">
        <button className="rs-ghost" onClick={onCancel}>{tr("cancel")}</button>
        <button className="rs-primary" disabled={invalid} onClick={() => {
          const rows = sheet.rows.map(row => Object.fromEntries(keys.map((key, index) => [key, row[index] ?? null])));
          const result = validateSampleData(schema ? [schema] : [], { [dataset]: rows });
          if (result.count) setDiagnostics(result);
          else onApply(rows);
        }}>{tr("applyImport")}</button>
      </div>
    </ReportDialog>
  );
}
