import type { validateSampleData } from "../../../../src/reports/core/sample-validation";
import type { ReportKey } from "./i18n";

export default function SampleIssues({ result, tr }: {
  result: ReturnType<typeof validateSampleData>;
  tr: (key: ReportKey) => string;
}) {
  return <div role="status" className={result.count ? "rs-error" : "rs-hint"}>
    <p>{result.count ? tr("sampleTypeIssueCount").replace("{count}", String(result.count)) : tr("sampleTypesValid")}</p>
    {!!result.count && <ul>{result.issues.map((issue, index) => (
      <li key={index}>
        {[issue.dataset, issue.row && tr("sampleTypeRow").replace("{row}", String(issue.row)), issue.field].filter(Boolean).join(" · ")}
        {" — "}{tr(`sampleType_${issue.expected}`)}
      </li>
    ))}</ul>}
    {result.count > result.issues.length && <p>{tr("sampleTypeMore").replace("{count}", String(result.count - result.issues.length))}</p>}
  </div>;
}
