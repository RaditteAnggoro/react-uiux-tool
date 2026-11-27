import type { ReportDocumentV1 } from "./types.js";

/** Visibility applies to output and its row layout; the editable source keeps all objects. */
export function outputDocument(document: ReportDocumentV1): ReportDocumentV1 {
  if (!document.bands.some(band => band.elements.some(element => element.props.outputHidden === true))) return document;
  return {
    ...document,
    bands: document.bands.map(band => ({ ...band, elements: band.elements.filter(element => element.props.outputHidden !== true) })),
  };
}
