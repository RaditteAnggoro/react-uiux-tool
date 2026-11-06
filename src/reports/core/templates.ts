import { createPage } from "./geometry.js";
import { createDefaultDocument } from "./schema.js";
import type {
  ReportBand,
  ReportDocumentV1,
  ReportElement,
} from "./types.js";

export type StyleFamilyId = "corporateNavy" | "neutralFinance" | "minimalMono";

export interface StyleTokens {
  family: StyleFamilyId;
  colors: Record<string, string>;
  fonts: Record<string, string>;
  spacing: number[];
  table: Record<string, unknown>;
}

export const STYLE_FAMILIES: Record<StyleFamilyId, StyleTokens> = {
  corporateNavy: {
    family: "corporateNavy",
    colors: {
      primary: "#16233D",
      accent: "#2F5DA8",
      text: "#111827",
      muted: "#5B6474",
      rule: "#C7D0DE",
      surface: "#F5F7FA",
      positive: "#0F5132",
      negative: "#8A1C1C",
      page: "#FFFFFF",
    },
    fonts: {
      heading: "'Iowan Old Style', Georgia, 'Times New Roman', serif",
      body: "Helvetica, Arial, sans-serif",
      numeric: "'SF Mono', Menlo, Consolas, monospace",
    },
    spacing: [4, 8, 12, 16, 24],
    table: { rowHeight: 7, headerHeight: 8, stripe: "#F1F4F8" },
  },
  neutralFinance: {
    family: "neutralFinance",
    colors: {
      primary: "#123F3A",
      accent: "#0F766E",
      text: "#0F172A",
      muted: "#57636B",
      rule: "#CBD5D1",
      surface: "#F4F7F5",
      positive: "#0B5132",
      negative: "#8C1D18",
      page: "#FFFFFF",
    },
    fonts: {
      heading: "Helvetica, Arial, sans-serif",
      body: "Helvetica, Arial, sans-serif",
      numeric: "'SF Mono', Menlo, Consolas, monospace",
    },
    spacing: [4, 8, 12, 16, 24],
    table: { rowHeight: 7, headerHeight: 8, stripe: "#EEF3F1" },
  },
  minimalMono: {
    family: "minimalMono",
    colors: {
      primary: "#111111",
      accent: "#3F3F46",
      text: "#18181B",
      muted: "#6B7280",
      rule: "#D4D4D8",
      surface: "#FAFAFA",
      positive: "#15803D",
      negative: "#B91C1C",
      page: "#FFFFFF",
    },
    fonts: {
      heading: "Helvetica, Arial, sans-serif",
      body: "Helvetica, Arial, sans-serif",
      numeric: "'SF Mono', Menlo, Consolas, monospace",
    },
    spacing: [4, 8, 12, 16, 24],
    table: { rowHeight: 7, headerHeight: 8, stripe: "#F3F4F6" },
  },
};

function text(
  id: string,
  box: ReportElement["box"],
  props: Record<string, unknown>,
): ReportElement {
  return { id, type: "text", box, props };
}

function field(
  id: string,
  box: ReportElement["box"],
  props: Record<string, unknown>,
  binding: string,
): ReportElement {
  return {
    id,
    type: "field",
    box,
    props,
    bindings: { path: binding },
  };
}

function tableElement(
  id: string,
  box: ReportElement["box"],
  props: Record<string, unknown>,
  binding: string,
): ReportElement {
  return {
    id,
    type: "table",
    box,
    props,
    bindings: { path: binding },
  };
}

function image(
  id: string,
  box: ReportElement["box"],
  props: Record<string, unknown>,
): ReportElement {
  return { id, type: "image", box, props };
}

function line(id: string, box: ReportElement["box"], props: Record<string, unknown>): ReportElement {
  return { id, type: "line", box, props };
}

export interface TemplateDefinition {
  id: string;
  name: { en: string; id: string };
  description: { en: string; id: string };
  styleFamily: StyleFamilyId;
  build: () => ReportDocumentV1;
}

function baseDocument(
  id: string,
  title: string,
  family: StyleFamilyId,
  locale: string,
): ReportDocumentV1 {
  const document = createDefaultDocument({
    id,
    title,
    locale,
    units: "mm",
    styleTokens: STYLE_FAMILIES[family] as unknown as Record<string, unknown>,
  });
  document.page = createPage({
    size: "A4",
    orientation: "portrait",
    units: "mm",
    margins: { top: 16, right: 16, bottom: 16, left: 16 },
  });
  document.bands = [];
  return document;
}

function invoice(family: StyleFamilyId, locale = "id-ID"): ReportDocumentV1 {
  const tokens = STYLE_FAMILIES[family];
  const document = baseDocument("tpl-invoice", "Invoice / Faktur", family, locale);
  document.datasets = [
    {
      id: "invoice",
      schema: {
        fields: [
          "number",
          "issuedAt",
          "dueAt",
          "customerName",
          "customerAddress",
          "currency",
          "subtotal",
          "tax",
          "total",
        ],
      },
    },
    {
      id: "lines",
      schema: { fields: ["description", "quantity", "unitPrice", "amount"] },
    },
  ];
  const bands: ReportBand[] = [
    {
      id: "band-title",
      kind: "reportTitle",
      height: 26,
      elements: [
        image("el-logo", { x: 0, y: 0, width: 32, height: 14 }, {
          src: "",
          alt: "Company logo",
          fit: "contain",
        }),
        text("el-title", { x: 0, y: 15, width: 120, height: 9 }, {
          text: "INVOICE",
          font: tokens.fonts.heading,
          fontSize: 18,
          fontWeight: 700,
          color: tokens.colors.primary,
        }),
        text("el-subtitle", { x: 120, y: 3, width: 58, height: 5 }, {
          text: "Faktur Penjualan",
          font: tokens.fonts.body,
          fontSize: 8,
          align: "right",
          color: tokens.colors.muted,
        }),
      ],
    },
    {
      id: "band-header",
      kind: "pageHeader",
      height: 34,
      repeat: true,
      elements: [
        text("el-seller", { x: 0, y: 0, width: 90, height: 20 }, {
          text: "PT Contoh Nusantara\nJakarta, Indonesia",
          font: tokens.fonts.body,
          fontSize: 9,
          lineHeight: 1.35,
          color: tokens.colors.text,
        }),
        field("el-invoice-number", { x: 118, y: 0, width: 60, height: 5 }, {
          label: "No. Invoice",
          fontSize: 8,
          align: "right",
          color: tokens.colors.muted,
        }, "invoice.number"),
        field("el-issued", { x: 118, y: 6, width: 60, height: 5 }, {
          label: "Tanggal",
          format: "date",
          fontSize: 8,
          align: "right",
          color: tokens.colors.muted,
        }, "invoice.issuedAt"),
        field("el-customer", { x: 0, y: 22, width: 100, height: 8 }, {
          label: "Ditagihkan kepada",
          fontSize: 9,
          color: tokens.colors.text,
        }, "invoice.customerName"),
        line("el-rule", { x: 0, y: 32.5, width: 178, height: 0.4 }, {
          color: tokens.colors.rule,
          strokeWidth: 0.4,
        }),
      ],
    },
    {
      id: "band-lines",
      kind: "detail",
      height: 60,
      elements: [
        tableElement("el-lines-table", { x: 0, y: 0, width: 178, height: 60 }, {
          columns: [
            { key: "description", label: "Deskripsi", width: 90, align: "left" },
            { key: "quantity", label: "Qty", width: 18, align: "right" },
            { key: "unitPrice", label: "Harga", width: 34, align: "right", currency: true },
            { key: "amount", label: "Jumlah", width: 36, align: "right", currency: true },
          ],
          headerRepeat: true,
          rowHeight: tokens.table.rowHeight,
          stripe: tokens.table.stripe,
          emptyText: "Belum ada baris",
        }, "lines"),
      ],
    },
    {
      id: "band-summary",
      kind: "summary",
      height: 26,
      elements: [
        text("el-terms", { x: 0, y: 2, width: 95, height: 12 }, {
          text: "Pembayaran jatuh tempo sesuai tanggal di atas.",
          font: tokens.fonts.body,
          fontSize: 8,
          color: tokens.colors.muted,
        }),
        field("el-subtotal", { x: 118, y: 2, width: 60, height: 5 }, {
          label: "Subtotal",
          format: "currency",
          align: "right",
          fontSize: 8,
        }, "invoice.subtotal"),
        field("el-tax", { x: 118, y: 8, width: 60, height: 5 }, {
          label: "PPN",
          format: "currency",
          align: "right",
          fontSize: 8,
        }, "invoice.tax"),
        field("el-total", { x: 118, y: 14, width: 60, height: 7 }, {
          label: "Total",
          format: "currency",
          align: "right",
          fontSize: 11,
          fontWeight: 700,
        }, "invoice.total"),
      ],
    },
    {
      id: "band-footer",
      kind: "pageFooter",
      height: 10,
      repeat: true,
      elements: [
        line("el-footer-rule", { x: 0, y: 0, width: 178, height: 0.3 }, {
          color: tokens.colors.rule,
          strokeWidth: 0.3,
        }),
        text("el-footer-note", { x: 0, y: 3, width: 130, height: 5 }, {
          text: "Dokumen ini dihasilkan secara lokal.",
          font: tokens.fonts.body,
          fontSize: 7,
          color: tokens.colors.muted,
        }),
        { id: "el-page-number", type: "pageNumber", box: { x: 148, y: 3, width: 30, height: 5 }, props: { format: "Page {page} of {total}", fontSize: 7, align: "right", color: tokens.colors.muted } },
      ],
    },
  ];
  document.bands = bands;
  return document;
}

function statement(family: StyleFamilyId, locale = "id-ID"): ReportDocumentV1 {
  const tokens = STYLE_FAMILIES[family];
  const document = baseDocument("tpl-statement", "Statement of Account", family, locale);
  document.datasets = [
    {
      id: "accounts",
      schema: { fields: ["contractNumber", "customerName", "currency", "closingBalance"] },
    },
    {
      id: "entries",
      schema: { fields: ["date", "reference", "description", "debit", "credit", "balance"] },
    },
  ];
  document.parameters = [
    { id: "periodStart", type: "date", required: true },
    { id: "periodEnd", type: "date", required: true },
  ];
  document.bands = [
    {
      id: "band-title",
      kind: "reportTitle",
      height: 24,
      elements: [
        text("el-statement-title", { x: 0, y: 0, width: 120, height: 9 }, {
          text: "LAPORAN TAGIHAN",
          font: tokens.fonts.heading,
          fontSize: 16,
          fontWeight: 700,
          color: tokens.colors.primary,
        }),
        text("el-statement-period", { x: 120, y: 2, width: 58, height: 5 }, {
          text: "Periode: {periodStart} – {periodEnd}",
          font: tokens.fonts.body,
          fontSize: 8,
          align: "right",
          color: tokens.colors.muted,
        }),
        line("el-statement-rule", { x: 0, y: 22, width: 178, height: 0.4 }, {
          color: tokens.colors.primary,
          strokeWidth: 0.4,
        }),
      ],
    },
    {
      id: "band-page-header",
      kind: "pageHeader",
      height: 10,
      repeat: true,
      elements: [
        text("el-account-label", { x: 0, y: 2, width: 90, height: 5 }, {
          text: "Akun / Kontrak",
          font: tokens.fonts.body,
          fontSize: 8,
          color: tokens.colors.muted,
        }),
        field("el-account-number", { x: 90, y: 2, width: 88, height: 5 }, {
          align: "right",
          fontSize: 8,
          color: tokens.colors.muted,
        }, "accounts.contractNumber"),
      ],
    },
    {
      id: "band-group-header",
      kind: "groupHeader",
      height: 10,
      repeat: true,
      groupBy: "accounts.contractNumber",
      elements: [
        text("el-contract", { x: 0, y: 2, width: 100, height: 6 }, {
          text: "Kontrak {contractNumber}",
          font: tokens.fonts.body,
          fontSize: 9,
          fontWeight: 700,
          color: tokens.colors.primary,
        }),
      ],
    },
    {
      id: "band-detail",
      kind: "detail",
      height: 74,
      elements: [
        tableElement("el-entries-table", { x: 0, y: 0, width: 178, height: 74 }, {
          columns: [
            { key: "date", label: "Tanggal", width: 22, align: "left" },
            { key: "reference", label: "Referensi", width: 30, align: "left" },
            { key: "description", label: "Keterangan", width: 52, align: "left" },
            { key: "debit", label: "Debit", width: 24, align: "right", currency: true },
            { key: "credit", label: "Kredit", width: 24, align: "right", currency: true },
            { key: "balance", label: "Saldo", width: 26, align: "right", currency: true },
          ],
          headerRepeat: true,
          rowHeight: tokens.table.rowHeight,
          stripe: tokens.table.stripe,
          emptyText: "Tidak ada transaksi",
        }, "entries"),
      ],
    },
    {
      id: "band-group-footer",
      kind: "groupFooter",
      height: 10,
      groupBy: "accounts.contractNumber",
      elements: [
        field("el-group-total", { x: 118, y: 2, width: 60, height: 6 }, {
          label: "Subtotal kontrak",
          format: "currency",
          align: "right",
          fontSize: 9,
          fontWeight: 700,
        }, "accounts.closingBalance"),
      ],
    },
    {
      id: "band-summary",
      kind: "summary",
      height: 14,
      elements: [
        text("el-summary-note", { x: 0, y: 4, width: 100, height: 6 }, {
          text: "Total seluruh kontrak pada periode ini.",
          font: tokens.fonts.body,
          fontSize: 8,
          color: tokens.colors.muted,
        }),
      ],
    },
    {
      id: "band-footer",
      kind: "pageFooter",
      height: 8,
      repeat: true,
      elements: [
        { id: "el-statement-page", type: "pageNumber", box: { x: 148, y: 2, width: 30, height: 5 }, props: { format: "Page {page} of {total}", fontSize: 7, align: "right", color: tokens.colors.muted } },
      ],
    },
  ];
  return document;
}

function receipt(family: StyleFamilyId, locale = "id-ID"): ReportDocumentV1 {
  const tokens = STYLE_FAMILIES[family];
  const document = baseDocument("tpl-receipt", "Payment Receipt", family, locale);
  document.datasets = [
    {
      id: "payment",
      schema: { fields: ["reference", "paidAt", "payer", "amount", "method"] },
    },
  ];
  document.bands = [
    {
      id: "band-receipt-title",
      kind: "reportTitle",
      height: 18,
      elements: [
        text("el-receipt-title", { x: 0, y: 0, width: 178, height: 8 }, {
          text: "BUKTI PEMBAYARAN",
          font: tokens.fonts.heading,
          fontSize: 14,
          fontWeight: 700,
          align: "center",
          color: tokens.colors.primary,
        }),
      ],
    },
    {
      id: "band-receipt-body",
      kind: "detail",
      height: 70,
      elements: [
        field("el-ref", { x: 0, y: 2, width: 88, height: 6 }, { label: "Referensi", fontSize: 9 }, "payment.reference"),
        field("el-paid-at", { x: 90, y: 2, width: 88, height: 6 }, { label: "Tanggal", format: "date", align: "right", fontSize: 9 }, "payment.paidAt"),
        field("el-payer", { x: 0, y: 12, width: 88, height: 6 }, { label: "Pembayar", fontSize: 9 }, "payment.payer"),
        field("el-method", { x: 90, y: 12, width: 88, height: 6 }, { label: "Metode", align: "right", fontSize: 9 }, "payment.method"),
        field("el-amount", { x: 0, y: 26, width: 178, height: 12 }, { label: "Jumlah dibayar", format: "currency", align: "center", fontSize: 16, fontWeight: 700 }, "payment.amount"),
        line("el-receipt-rule", { x: 0, y: 44, width: 178, height: 0.4 }, { color: tokens.colors.rule, strokeWidth: 0.4 }),
        text("el-signature", { x: 108, y: 52, width: 70, height: 16 }, { text: "Tanda tangan / Signature", fontSize: 7, align: "center", color: tokens.colors.muted }),
      ],
    },
    {
      id: "band-receipt-footer",
      kind: "pageFooter",
      height: 8,
      repeat: true,
      elements: [
        { id: "el-receipt-page", type: "pageNumber", box: { x: 148, y: 2, width: 30, height: 5 }, props: { format: "Page {page} of {total}", fontSize: 7, align: "right", color: tokens.colors.muted } },
      ],
    },
  ];
  return document;
}


function loanSchedule(family: StyleFamilyId, locale = "id-ID"): ReportDocumentV1 {
  const tokens = STYLE_FAMILIES[family];
  const document = baseDocument("tpl-loan-schedule", "Jadwal Angsuran", family, locale);
  document.datasets = [
    { id: "contracts", schema: { fields: ["contractNumber", "customerName", "currency"] } },
    { id: "schedule", schema: { fields: ["contractNumber", "dueDate", "principal", "interest", "penalty", "total"] } },
  ];
  document.bands = [
    {
      id: "band-title",
      kind: "reportTitle",
      height: 22,
      elements: [
        text("el-loan-title", { x: 0, y: 0, width: 120, height: 8 }, {
          text: "JADWAL ANGSURAN",
          font: tokens.fonts.heading,
          fontSize: 16,
          fontWeight: 700,
          color: tokens.colors.primary,
        }),
        line("el-loan-rule", { x: 0, y: 20, width: 178, height: 0.4 }, {
          color: tokens.colors.primary,
          strokeWidth: 0.4,
        }),
      ],
    },
    {
      id: "band-page-header",
      kind: "pageHeader",
      height: 8,
      repeat: true,
      elements: [
        text("el-loan-note", { x: 0, y: 2, width: 120, height: 5 }, {
          text: "Rincian pokok, bunga, dan denda per kontrak",
          font: tokens.fonts.body,
          fontSize: 7,
          color: tokens.colors.muted,
        }),
      ],
    },
    {
      id: "band-group-header",
      kind: "groupHeader",
      height: 10,
      repeat: true,
      groupBy: "contracts.contractNumber",
      elements: [
        text("el-contract-label", { x: 0, y: 2, width: 100, height: 6 }, {
          text: "Kontrak {contractNumber}",
          font: tokens.fonts.body,
          fontSize: 9,
          fontWeight: 700,
          color: tokens.colors.primary,
        }),
      ],
    },
    {
      id: "band-detail",
      kind: "detail",
      height: 60,
      elements: [
        tableElement("el-schedule-table", { x: 0, y: 0, width: 178, height: 60 }, {
          columns: [
            { key: "dueDate", label: "Jatuh tempo", width: 28, align: "left" },
            { key: "principal", label: "Pokok", width: 36, align: "right", currency: true },
            { key: "interest", label: "Bunga", width: 34, align: "right", currency: true },
            { key: "penalty", label: "Denda", width: 30, align: "right", currency: true },
            { key: "total", label: "Total", width: 40, align: "right", currency: true },
          ],
          headerRepeat: true,
          rowHeight: tokens.table.rowHeight,
          stripe: tokens.table.stripe,
          emptyText: "Belum ada jadwal",
        }, "schedule"),
      ],
    },
    {
      id: "band-group-footer",
      kind: "groupFooter",
      height: 12,
      groupBy: "contracts.contractNumber",
      elements: [
        field("el-sum-principal", { x: 88, y: 2, width: 44, height: 6 }, {
          label: "Total pokok",
          align: "right",
          fontSize: 8,
          expression: "FORMAT_NUMBER(SUM(group.principal), 2)",
        }, ""),
        field("el-sum-interest", { x: 132, y: 2, width: 46, height: 6 }, {
          label: "Total bunga",
          align: "right",
          fontSize: 8,
          expression: "FORMAT_NUMBER(SUM(group.interest), 2)",
        }, ""),
      ],
    },
    {
      id: "band-summary",
      kind: "summary",
      height: 12,
      elements: [
        field("el-grand-total", { x: 108, y: 2, width: 70, height: 6 }, {
          label: "Total keseluruhan",
          align: "right",
          fontSize: 9,
          fontWeight: 700,
          expression: "FORMAT_NUMBER(SUM(schedule.total), 2)",
        }, ""),
      ],
    },
    {
      id: "band-footer",
      kind: "pageFooter",
      height: 8,
      repeat: true,
      elements: [
        { id: "el-loan-page", type: "pageNumber", box: { x: 148, y: 2, width: 30, height: 5 }, props: { format: "Page {page} of {total}", fontSize: 7, align: "right", color: tokens.colors.muted } },
      ],
    },
  ];
  return document;
}


function dashboard(family: StyleFamilyId, locale = "id-ID"): ReportDocumentV1 {
  const tokens = STYLE_FAMILIES[family];
  const document = baseDocument("tpl-dashboard", "Ringkasan Operasional", family, locale);
  document.datasets = [
    { id: "kpi", schema: { fields: ["transactions", "volume", "successRate"] } },
    { id: "monthly", schema: { fields: ["label", "value"] } },
  ];
  document.bands = [
    {
      id: "band-title",
      kind: "reportTitle",
      height: 20,
      elements: [
        text("el-dash-title", { x: 0, y: 0, width: 120, height: 8 }, {
          text: "RINGKASAN OPERASIONAL",
          font: tokens.fonts.heading,
          fontSize: 15,
          fontWeight: 700,
          color: tokens.colors.primary,
        }),
        line("el-dash-rule", { x: 0, y: 18, width: 178, height: 0.4 }, {
          color: tokens.colors.primary,
          strokeWidth: 0.4,
        }),
      ],
    },
    {
      id: "band-page-header",
      kind: "pageHeader",
      height: 8,
      repeat: true,
      elements: [
        text("el-dash-note", { x: 0, y: 2, width: 120, height: 5 }, {
          text: "Angka sintetis untuk contoh tata letak",
          font: tokens.fonts.body,
          fontSize: 7,
          color: tokens.colors.muted,
        }),
      ],
    },
    {
      id: "band-kpi",
      kind: "detail",
      height: 62,
      elements: [
        field("el-kpi-transactions", { x: 4, y: 4, width: 52, height: 16 }, {
          label: "Transaksi",
          align: "center",
          fontSize: 14,
          fontWeight: 700,
        }, "kpi.transactions"),
        field("el-kpi-volume", { x: 63, y: 4, width: 52, height: 16 }, {
          label: "Volume",
          align: "center",
          fontSize: 14,
          fontWeight: 700,
        }, "kpi.volume"),
        field("el-kpi-success", { x: 122, y: 4, width: 52, height: 16 }, {
          label: "Tingkat sukses",
          align: "center",
          fontSize: 14,
          fontWeight: 700,
        }, "kpi.successRate"),
        {
          id: "el-chart-monthly",
          type: "chart",
          box: { x: 4, y: 24, width: 170, height: 36 },
          props: {
            chartType: "bar",
            title: "Volume per bulan",
            seriesLabel: "Volume",
            labels: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun"],
            values: [120, 168, 96, 154, 142, 188],
          },
        },
      ],
    },
    {
      id: "band-footer",
      kind: "pageFooter",
      height: 8,
      repeat: true,
      elements: [
        { id: "el-dash-page", type: "pageNumber", box: { x: 148, y: 2, width: 30, height: 5 }, props: { format: "Page {page} of {total}", fontSize: 7, align: "right", color: tokens.colors.muted } },
      ],
    },
  ];
  return document;
}


function aging(family: StyleFamilyId, locale = "id-ID"): ReportDocumentV1 {
  const tokens = STYLE_FAMILIES[family];
  const document = baseDocument("tpl-aging", "Aging Piutang", family, locale);
  document.datasets = [
    { id: "aging", schema: { fields: ["bucket", "count", "amount"] } },
  ];
  document.bands = [
    {
      id: "band-title",
      kind: "reportTitle",
      height: 20,
      elements: [
        text("el-aging-title", { x: 0, y: 0, width: 120, height: 8 }, {
          text: "AGING PIUTANG",
          font: tokens.fonts.heading,
          fontSize: 15,
          fontWeight: 700,
          color: tokens.colors.primary,
        }),
      ],
    },
    {
      id: "band-page-header",
      kind: "pageHeader",
      height: 8,
      repeat: true,
      elements: [
        text("el-aging-note", { x: 0, y: 2, width: 120, height: 5 }, {
          text: "Distribusi saldo berdasarkan umur piutang",
          font: tokens.fonts.body,
          fontSize: 7,
          color: tokens.colors.muted,
        }),
      ],
    },
    {
      id: "band-detail",
      kind: "detail",
      height: 40,
      elements: [
        tableElement("el-aging-table", { x: 0, y: 0, width: 178, height: 40 }, {
          columns: [
            { key: "bucket", label: "Bucket", width: 60, align: "left" },
            { key: "count", label: "Jumlah akun", width: 40, align: "right" },
            { key: "amount", label: "Saldo", width: 78, align: "right", currency: true },
          ],
          headerRepeat: true,
          rowHeight: tokens.table.rowHeight,
          stripe: tokens.table.stripe,
          emptyText: "Tidak ada saldo",
        }, "aging"),
      ],
    },
    {
      id: "band-summary",
      kind: "summary",
      height: 12,
      elements: [
        field("el-aging-total", { x: 108, y: 2, width: 70, height: 6 }, {
          label: "Total saldo",
          align: "right",
          fontSize: 9,
          fontWeight: 700,
          expression: "FORMAT_NUMBER(SUM(aging.amount), 2)",
        }, ""),
      ],
    },
  ];
  return document;
}

function paymentAllocation(family: StyleFamilyId, locale = "id-ID"): ReportDocumentV1 {
  const tokens = STYLE_FAMILIES[family];
  const document = baseDocument("tpl-allocation", "Alokasi Pembayaran", family, locale);
  document.datasets = [
    { id: "allocation", schema: { fields: ["component", "count", "amount"] } },
  ];
  document.bands = [
    {
      id: "band-title",
      kind: "reportTitle",
      height: 20,
      elements: [
        text("el-alloc-title", { x: 0, y: 0, width: 120, height: 8 }, {
          text: "ALOKASI PEMBAYARAN",
          font: tokens.fonts.heading,
          fontSize: 15,
          fontWeight: 700,
          color: tokens.colors.primary,
        }),
      ],
    },
    {
      id: "band-detail",
      kind: "detail",
      height: 36,
      elements: [
        tableElement("el-alloc-table", { x: 0, y: 0, width: 178, height: 36 }, {
          columns: [
            { key: "component", label: "Komponen", width: 70, align: "left" },
            { key: "count", label: "Jumlah", width: 30, align: "right" },
            { key: "amount", label: "Nilai", width: 78, align: "right", currency: true },
          ],
          headerRepeat: true,
          rowHeight: tokens.table.rowHeight,
          stripe: tokens.table.stripe,
          emptyText: "Tidak ada pembayaran",
        }, "allocation"),
      ],
    },
    {
      id: "band-summary",
      kind: "summary",
      height: 12,
      elements: [
        field("el-alloc-total", { x: 108, y: 2, width: 70, height: 6 }, {
          label: "Total pembayaran",
          align: "right",
          fontSize: 9,
          fontWeight: 700,
          expression: "FORMAT_NUMBER(SUM(allocation.amount), 2)",
        }, ""),
      ],
    },
  ];
  return document;
}


function voucher(family: StyleFamilyId, locale = "id-ID"): ReportDocumentV1 {
  const tokens = STYLE_FAMILIES[family];
  const document = baseDocument("tpl-voucher", "Bukti Jurnal", family, locale);
  document.datasets = [
    { id: "voucher", schema: { fields: ["number", "postedAt", "description"] } },
    { id: "lines", schema: { fields: ["account", "debit", "credit"] } },
  ];
  document.bands = [
    {
      id: "band-title",
      kind: "reportTitle",
      height: 18,
      elements: [
        text("el-voucher-title", { x: 0, y: 0, width: 120, height: 8 }, {
          text: "BUKTI JURNAL",
          font: tokens.fonts.heading,
          fontSize: 14,
          fontWeight: 700,
          color: tokens.colors.primary,
        }),
      ],
    },
    {
      id: "band-page-header",
      kind: "pageHeader",
      height: 12,
      repeat: true,
      elements: [
        field("el-voucher-number", { x: 0, y: 0, width: 60, height: 6 }, { label: "Nomor", fontSize: 8 }, "voucher.number"),
        field("el-voucher-date", { x: 62, y: 0, width: 60, height: 6 }, { label: "Tanggal", format: "date", fontSize: 8 }, "voucher.postedAt"),
      ],
    },
    {
      id: "band-detail",
      kind: "detail",
      height: 50,
      elements: [
        tableElement("el-voucher-table", { x: 0, y: 0, width: 178, height: 50 }, {
          columns: [
            { key: "account", label: "Akun", width: 90, align: "left" },
            { key: "debit", label: "Debit", width: 44, align: "right", currency: true },
            { key: "credit", label: "Kredit", width: 44, align: "right", currency: true },
          ],
          headerRepeat: true,
          rowHeight: tokens.table.rowHeight,
          stripe: tokens.table.stripe,
          emptyText: "Tidak ada baris jurnal",
        }, "lines"),
      ],
    },
    {
      id: "band-summary",
      kind: "summary",
      height: 14,
      elements: [
        field("el-voucher-debit", { x: 88, y: 2, width: 44, height: 6 }, { label: "Total debit", align: "right", fontSize: 8, expression: "FORMAT_NUMBER(SUM(lines.debit), 2)" }, ""),
        field("el-voucher-credit", { x: 134, y: 2, width: 44, height: 6 }, { label: "Total kredit", align: "right", fontSize: 8, expression: "FORMAT_NUMBER(SUM(lines.credit), 2)" }, ""),
      ],
    },
  ];
  return document;
}

function collection(family: StyleFamilyId, locale = "id-ID"): ReportDocumentV1 {
  const tokens = STYLE_FAMILIES[family];
  const document = baseDocument("tpl-collection", "Laporan Koleksi", family, locale);
  document.datasets = [
    { id: "collection", schema: { fields: ["branch", "count", "amount"] } },
  ];
  document.bands = [
    {
      id: "band-title",
      kind: "reportTitle",
      height: 18,
      elements: [
        text("el-collection-title", { x: 0, y: 0, width: 120, height: 8 }, {
          text: "LAPORAN KOLEKSI HARIAN",
          font: tokens.fonts.heading,
          fontSize: 14,
          fontWeight: 700,
          color: tokens.colors.primary,
        }),
      ],
    },
    {
      id: "band-detail",
      kind: "detail",
      height: 44,
      elements: [
        tableElement("el-collection-table", { x: 0, y: 0, width: 178, height: 44 }, {
          columns: [
            { key: "branch", label: "Cabang", width: 88, align: "left" },
            { key: "count", label: "Transaksi", width: 30, align: "right" },
            { key: "amount", label: "Nilai", width: 60, align: "right", currency: true },
          ],
          headerRepeat: true,
          rowHeight: tokens.table.rowHeight,
          stripe: tokens.table.stripe,
          emptyText: "Tidak ada koleksi",
        }, "collection"),
      ],
    },
    {
      id: "band-summary",
      kind: "summary",
      height: 12,
      elements: [
        field("el-collection-total", { x: 100, y: 2, width: 78, height: 6 }, { label: "Total koleksi", align: "right", fontSize: 9, fontWeight: 700, expression: "FORMAT_NUMBER(SUM(collection.amount), 2)" }, ""),
      ],
    },
  ];
  return document;
}


function thermalReceipt(family: StyleFamilyId, locale = "id-ID"): ReportDocumentV1 {
  const tokens = STYLE_FAMILIES[family];
  const document = baseDocument("tpl-thermal", "Struk 80 mm", family, locale);
  document.page = createPage({
    size: "custom",
    orientation: "portrait",
    units: "mm",
    custom: { width: 80, height: 140 },
    margins: { top: 4, right: 4, bottom: 4, left: 4 },
  });
  document.datasets = [
    { id: "receipt", schema: { fields: ["reference", "paidAt", "amount", "method"] } },
  ];
  document.bands = [
    {
      id: "band-thermal-title",
      kind: "reportTitle",
      height: 16,
      elements: [
        text("el-thermal-title", { x: 0, y: 0, width: 72, height: 7 }, {
          text: "STRUK PEMBAYARAN",
          font: tokens.fonts.heading,
          fontSize: 11,
          fontWeight: 700,
          align: "center",
          color: tokens.colors.primary,
        }),
        text("el-thermal-shop", { x: 0, y: 8, width: 72, height: 6 }, {
          text: "Contoh Nusantara",
          font: tokens.fonts.body,
          fontSize: 7,
          align: "center",
          color: tokens.colors.muted,
        }),
      ],
    },
    {
      id: "band-thermal-body",
      kind: "detail",
      height: 70,
      elements: [
        field("el-thermal-ref", { x: 0, y: 2, width: 72, height: 6 }, { label: "Referensi", fontSize: 7 }, "receipt.reference"),
        field("el-thermal-date", { x: 0, y: 10, width: 72, height: 6 }, { label: "Tanggal", format: "date", fontSize: 7 }, "receipt.paidAt"),
        field("el-thermal-method", { x: 0, y: 18, width: 72, height: 6 }, { label: "Metode", fontSize: 7 }, "receipt.method"),
        field("el-thermal-amount", { x: 0, y: 30, width: 72, height: 10 }, { label: "Jumlah", format: "currency", align: "center", fontSize: 12, fontWeight: 700 }, "receipt.amount"),
      ],
    },
    {
      id: "band-thermal-footer",
      kind: "pageFooter",
      height: 8,
      repeat: true,
      elements: [
        text("el-thermal-note", { x: 0, y: 2, width: 72, height: 5 }, {
          text: "Terima kasih",
          font: tokens.fonts.body,
          fontSize: 7,
          align: "center",
          color: tokens.colors.muted,
        }),
      ],
    },
  ];
  return document;
}

function labelSheet(family: StyleFamilyId, locale = "id-ID"): ReportDocumentV1 {
  const tokens = STYLE_FAMILIES[family];
  const document = baseDocument("tpl-label", "Label 50 x 30 mm", family, locale);
  document.page = createPage({
    size: "custom",
    orientation: "landscape",
    units: "mm",
    custom: { width: 50, height: 30 },
    margins: { top: 2, right: 2, bottom: 2, left: 2 },
  });
  document.datasets = [
    { id: "label", schema: { fields: ["code", "description", "batch"] } },
  ];
  document.bands = [
    {
      id: "band-label",
      kind: "detail",
      height: 26,
      elements: [
        field("el-label-code", { x: 0, y: 0, width: 46, height: 8 }, { label: "Kode", fontSize: 9, fontWeight: 700 }, "label.code"),
        field("el-label-description", { x: 0, y: 9, width: 46, height: 8 }, { label: "Deskripsi", fontSize: 7 }, "label.description"),
        field("el-label-batch", { x: 0, y: 18, width: 46, height: 7 }, { label: "Batch", fontSize: 7 }, "label.batch"),
      ],
    },
  ];
  return document;
}

export const TEMPLATE_CATALOG: readonly TemplateDefinition[] = [
  {
    id: "blank",
    name: { en: "Blank page", id: "Halaman kosong" },
    description: {
      en: "A4 portrait page with a single empty body band.",
      id: "Halaman A4 portrait dengan satu band isi kosong.",
    },
    styleFamily: "neutralFinance",
    build: () => {
      const document = baseDocument("tpl-blank", "Untitled report", "neutralFinance", "id-ID");
      document.bands = [
        { id: "band-body", kind: "detail", height: 60, elements: [] },
      ];
      return document;
    },
  },
  {
    id: "invoice",
    name: { en: "Invoice / factur", id: "Invoice / faktur" },
    description: {
      en: "Professional invoice with repeated header, line-item table, tax and total.",
      id: "Invoice profesional dengan header berulang, tabel baris, pajak, dan total.",
    },
    styleFamily: "corporateNavy",
    build: () => invoice("corporateNavy"),
  },
  {
    id: "loanSchedule",
    name: { en: "Loan schedule", id: "Jadwal angsuran" },
    description: {
      en: "Installment schedule grouped by contract with principal, interest and penalty totals.",
      id: "Jadwal angsuran per kontrak dengan total pokok, bunga, dan denda.",
    },
    styleFamily: "neutralFinance",
    build: () => loanSchedule("neutralFinance"),
  },
  {
    id: "statement",
    name: { en: "Grouped statement", id: "Laporan tagihan berkelompok" },
    description: {
      en: "Multi-band account statement grouped by contract with subtotal and grand total.",
      id: "Laporan tagihan multi-band per kontrak dengan subtotal dan total keseluruhan.",
    },
    styleFamily: "neutralFinance",
    build: () => statement("neutralFinance"),
  },
  {
    id: "dashboard",
    name: { en: "Operational dashboard", id: "Dashboard operasional" },
    description: {
      en: "KPI row with a print-ready bar chart.",
      id: "Baris KPI dengan grafik batang siap cetak.",
    },
    styleFamily: "corporateNavy",
    build: () => dashboard("corporateNavy"),
  },
  {
    id: "aging",
    name: { en: "Aging statement", id: "Aging piutang" },
    description: {
      en: "Outstanding balance buckets with account counts and a saldo total.",
      id: "Distribusi saldo per bucket umur dengan total saldo.",
    },
    styleFamily: "corporateNavy",
    build: () => aging("corporateNavy"),
  },
  {
    id: "allocation",
    name: { en: "Payment allocation", id: "Alokasi pembayaran" },
    description: {
      en: "Principal, interest and penalty allocation with a payment total.",
      id: "Alokasi pokok, bunga, dan denda dengan total pembayaran.",
    },
    styleFamily: "neutralFinance",
    build: () => paymentAllocation("neutralFinance"),
  },
  {
    id: "voucher",
    name: { en: "Journal voucher", id: "Bukti jurnal" },
    description: {
      en: "Double-entry voucher with debit and credit totals.",
      id: "Bukti jurnal dengan total debit dan kredit.",
    },
    styleFamily: "minimalMono",
    build: () => voucher("minimalMono"),
  },
  {
    id: "collection",
    name: { en: "Daily collection", id: "Koleksi harian" },
    description: {
      en: "Per-branch collection summary with transaction counts and value.",
      id: "Ringkasan koleksi per cabang dengan jumlah transaksi dan nilai.",
    },
    styleFamily: "corporateNavy",
    build: () => collection("corporateNavy"),
  },
  {
    id: "thermalReceipt",
    name: { en: "80 mm thermal receipt", id: "Struk termal 80 mm" },
    description: {
      en: "Fixed 80 mm width receipt profile for thermal printers, without a vendor driver.",
      id: "Profil struk lebar 80 mm untuk printer termal, tanpa driver vendor.",
    },
    styleFamily: "minimalMono",
    build: () => thermalReceipt("minimalMono"),
  },
  {
    id: "label",
    name: { en: "Label 50 × 30 mm", id: "Label 50 × 30 mm" },
    description: {
      en: "Single label profile with code, description and batch fields.",
      id: "Profil label tunggal dengan kode, deskripsi, dan batch.",
    },
    styleFamily: "minimalMono",
    build: () => labelSheet("minimalMono"),
  },
  {
    id: "receipt",
    name: { en: "Payment receipt", id: "Bukti pembayaran" },
    description: {
      en: "Fixed-layout receipt with amount emphasis and signature area.",
      id: "Bukti pembayaran tata letak tetap dengan penekanan jumlah dan area tanda tangan.",
    },
    styleFamily: "minimalMono",
    build: () => receipt("minimalMono"),
  },
];

export function getTemplate(id: string): TemplateDefinition | null {
  return TEMPLATE_CATALOG.find((template) => template.id === id) ?? null;
}

export function buildTemplate(id: string, family?: StyleFamilyId, locale?: string): ReportDocumentV1 {
  const template = getTemplate(id);
  if (!template) throw new Error(`Unknown report template: ${id}`);
  const document = template.build();
  if (locale) document.locale = locale;
  if (family) {
    document.styleTokens = STYLE_FAMILIES[family] as unknown as Record<string, unknown>;
  }
  return document;
}
