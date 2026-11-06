export interface ChartSeries {
  label: string;
  values: number[];
}

export interface ChartOptions {
  type: "bar" | "line" | "pie";
  labels: string[];
  series: ChartSeries[];
  width: number;
  height: number;
  palette?: string[];
  title?: string;
}

const DEFAULT_PALETTE = ["#1D3557", "#2F6FED", "#0F766E", "#B45309", "#8A1C1C"];
const PAD = { top: 12, right: 8, bottom: 22, left: 30 };

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Deterministic SVG chart for print. No canvas, no runtime dependency. */
export function renderChartSvg(options: ChartOptions): string {
  const { width, height, labels } = options;
  const palette = options.palette?.length ? options.palette : DEFAULT_PALETTE;
  const innerWidth = Math.max(10, width - PAD.left - PAD.right);
  const innerHeight = Math.max(10, height - PAD.top - PAD.bottom);
  const title = options.title ? `<text x="${PAD.left}" y="9" font-size="6" font-weight="600">${esc(options.title)}</text>` : "";
  const parts: string[] = [];

  if (options.type === "pie") {
    const values = (options.series[0]?.values ?? []).map((value) => Math.max(0, value));
    const total = values.reduce((sum, value) => sum + value, 0);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.max(4, Math.min(innerWidth, innerHeight) / 2 - 4);
    let angle = -Math.PI / 2;
    values.forEach((value, index) => {
      if (total <= 0) return;
      const sweep = (value / total) * Math.PI * 2;
      const x1 = cx + radius * Math.cos(angle);
      const y1 = cy + radius * Math.sin(angle);
      const x2 = cx + radius * Math.cos(angle + sweep);
      const y2 = cy + radius * Math.sin(angle + sweep);
      const large = sweep > Math.PI ? 1 : 0;
      parts.push(
        `<path d="M ${round(cx)} ${round(cy)} L ${round(x1)} ${round(y1)} A ${round(radius)} ${round(radius)} 0 ${large} 1 ${round(x2)} ${round(y2)} Z" fill="${palette[index % palette.length]}" />`,
      );
      angle += sweep;
    });
  } else {
    const all = options.series.flatMap((series) => series.values);
    const maximum = Math.max(1, ...all.map((value) => Math.abs(value)));
    const baseline = PAD.top + innerHeight;
    for (let tick = 0; tick <= 4; tick += 1) {
      const y = baseline - (tick / 4) * innerHeight;
      parts.push(
        `<line x1="${PAD.left}" y1="${round(y)}" x2="${round(PAD.left + innerWidth)}" y2="${round(y)}" stroke="#E5E7EB" stroke-width="0.2" />`,
      );
      parts.push(
        `<text x="${PAD.left - 2}" y="${round(y + 1)}" font-size="4" text-anchor="end" fill="#6B7280">${esc(round((maximum * tick) / 4))}</text>`,
      );
    }
    const slot = innerWidth / Math.max(1, labels.length);
    labels.forEach((label, index) => {
      const x = PAD.left + index * slot + slot / 2;
      parts.push(
        `<text x="${round(x)}" y="${round(height - 8)}" font-size="4" text-anchor="middle" fill="#374151">${esc(label)}</text>`,
      );
    });
    options.series.forEach((series, seriesIndex) => {
      const color = palette[seriesIndex % palette.length];
      if (options.type === "bar") {
        const barWidth = Math.max(1, (slot * 0.6) / options.series.length);
        series.values.forEach((value, index) => {
          const x = PAD.left + index * slot + slot * 0.2 + seriesIndex * barWidth;
          const barHeight = (Math.abs(value) / maximum) * innerHeight;
          parts.push(
            `<rect x="${round(x)}" y="${round(baseline - barHeight)}" width="${round(barWidth)}" height="${round(barHeight)}" fill="${color}" />`,
          );
        });
      } else {
        const points = series.values
          .map((value, index) => {
            const x = PAD.left + index * slot + slot / 2;
            const y = baseline - (value / maximum) * innerHeight;
            return `${round(x)},${round(y)}`;
          })
          .join(" ");
        parts.push(
          `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="0.6" />`,
        );
        series.values.forEach((value, index) => {
          const x = PAD.left + index * slot + slot / 2;
          const y = baseline - (value / maximum) * innerHeight;
          parts.push(`<circle cx="${round(x)}" cy="${round(y)}" r="0.8" fill="${color}" />`);
        });
      }
    });
  }

  const legend = options.series
    .map(
      (series, index) =>
        `<rect x="${round(PAD.left + index * 34)}" y="${round(height - 4)}" width="3" height="3" fill="${palette[index % palette.length]}" /><text x="${round(PAD.left + index * 34 + 5)}" y="${round(height - 1)}" font-size="4" fill="#374151">${esc(series.label)}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" role="img" aria-label="${esc(options.title ?? "Chart")}">${title}${parts.join("")}${legend}</svg>`;
}
