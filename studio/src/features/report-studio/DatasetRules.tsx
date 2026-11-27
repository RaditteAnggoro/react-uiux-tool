import { useState } from "react";
import { asRecord } from "../../../../src/reports/core/data";
import { SAMPLE_FIELD_TYPES, sampleFieldRules, type SampleFieldType } from "../../../../src/reports/core/sample-validation";
import type { ReportDataset } from "../../../../src/reports/core/types";
import type { ReportKey } from "./i18n";

export default function DatasetRules({ dataset, tr, onChange }: {
  dataset: ReportDataset;
  tr: (key: ReportKey) => string;
  onChange: (dataset: ReportDataset) => void;
}) {
  const [name, setName] = useState("");
  const rules = sampleFieldRules(dataset);
  const patch = (field: string, type: SampleFieldType | undefined, required: boolean) => {
    const schema = asRecord(dataset.schema);
    const fieldTypes = { ...asRecord(schema.fieldTypes) };
    if (type) fieldTypes[field] = type;
    else delete fieldTypes[field];
    const requiredFields = rules.filter(rule => rule.field !== field && rule.required).map(rule => rule.field);
    if (required) requiredFields.push(field);
    const fields = [...new Set([...rules.map(rule => rule.field), field])];
    onChange({ ...dataset, schema: { ...schema, fields, fieldTypes, requiredFields } });
  };
  const field = name.trim();
  const canAdd = field.length > 0 && !rules.some(rule => rule.field === field) &&
    !["__proto__", "constructor", "prototype"].includes(field);
  return <details className="rs-dataset-rules">
    <summary>{tr("datasetRules")} · {dataset.id}</summary>
    <div className="rs-rule-fields">
      {rules.map(rule => <div key={rule.field} className="rs-rule-field">
        <span>{rule.field}</span>
        <select aria-label={`${tr("datasetFieldType")} · ${rule.field}`} value={rule.type ?? ""}
          onChange={event => patch(rule.field, (event.target.value || undefined) as SampleFieldType | undefined, rule.required)}>
          <option value="">{tr("datasetAnyType")}</option>
          {SAMPLE_FIELD_TYPES.map(type => <option key={type} value={type}>{tr(`datasetType_${type}`)}</option>)}
        </select>
        <label className="rs-check">
          <input type="checkbox" aria-label={`${tr("datasetRequired")} · ${rule.field}`} checked={rule.required}
            onChange={event => patch(rule.field, rule.type, event.target.checked)} />
          {tr("datasetRequired")}
        </label>
      </div>)}
    </div>
    <div className="rs-row-actions">
      <input aria-label={tr("datasetFieldName")} value={name} maxLength={120} onChange={event => setName(event.target.value)} />
      <button type="button" className="rs-ghost" disabled={!canAdd} onClick={() => {
        patch(field, undefined, false);
        setName("");
      }}>{tr("datasetAddField")}</button>
    </div>
  </details>;
}
