/** Visual-only rulers: report geometry and saved output stay unchanged. */
export default function CanvasRulers({ width, height, scale, step, unit }: { width: number; height: number; scale: number; step: number; unit: string }) {
  const effectiveStep = Math.max(step, Math.ceil(Math.max(width, height) / 150 / step) * step);
  const ticks = (size: number) => Array.from({ length: Math.floor(size / effectiveStep) + 1 }, (_, index) => index * effectiveStep);
  return <div className="report-rulers" aria-hidden="true">
    <div className="report-ruler-x"><span className="report-ruler-unit">{unit}</span>{ticks(width).map((value) => <span className="report-ruler-tick-x" style={{ left: value * scale }} key={value}>{value}</span>)}</div>
    <div className="report-ruler-y">{ticks(height).map((value) => <span className="report-ruler-tick-y" style={{ top: value * scale }} key={value}>{value}</span>)}</div>
  </div>;
}
