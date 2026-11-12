import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import { useMission } from "../context/MissionContext";
import { maskAt } from "../lib/geometry";
import type { SkyTracks } from "../lib/geometry";
import { aggregateColumns, calendarCell, calendarOrigin, DAY_MS, sampleAtFraction, sampleRange } from "../lib/timeline";
import type { Period, Zoom } from "../lib/timeline";
import { dailyStats, metricsForRange } from "../lib/windows";
import type { SiteSeries, Thresholds } from "../lib/windows";
import type { Horizon, Site } from "../lib/types";

export interface SiteAnalysis { site: Site; horizon: Horizon; tracks: SkyTracks; series: SiteSeries }
const SUN = "#f5c542";
const EARTH = "#4aa3ff";
const LEFT = 42;
const RIGHT = 12;
function utcLabel(ms: number, time = false): string {
  return new Date(ms).toISOString().slice(time ? 11 : 0, time ? 16 : 10);
}
function useCanvas(height: number, draw: (ctx: CanvasRenderingContext2D, width: number) => void, enabled = true): RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0]!.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !width) return;
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    draw(ctx, width);
  }, [width, height, draw]);
  return ref;
}
export function TerrainBadge({ horizon }: { horizon: Horizon }) {
  if (horizon.status === "real") return null;
  return <span className={`badge ${horizon.status}`}>{horizon.status === "dummy" ? "demo terrain" : "terrain not computed"}</span>;
}
function SiteRow({ analysis, period, zoom }: { analysis: SiteAnalysis; period: Period; zoom: Zoom }) {
  const { ephem } = useMission();
  const { site, tracks, horizon, series } = analysis;
  const [i0, i1] = sampleRange(ephem, period);
  const [selected, setSelected] = useState(i0);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const index = Math.max(i0, Math.min(selected, i1 - 1));
  const ms = ephem.t0Ms + index * ephem.stepMs;
  const daily = useMemo(() => dailyStats(series, ephem), [series, ephem]);
  const days = useMemo(() => daily.filter(d => d.dayStartMs < period.endMs && d.dayStartMs + DAY_MS > period.startMs).map(d => {
    const [a, b] = sampleRange(ephem, { startMs: Math.max(d.dayStartMs, period.startMs), endMs: Math.min(d.dayStartMs + DAY_MS, period.endMs) });
    if (a === b) return null;
    const m = metricsForRange(series, a, b, ephem.stepMs / 3_600_000);
    return { ...d, pctSunlit: m.pctSunlit, pctDte: m.pctDte };
  }).filter(d => d !== null), [daily, ephem, period, series]);
  const origin = calendarOrigin(period.startMs);
  const weeks = calendarCell(period.endMs - 1, origin).week + 1;
  const selectedDay = days.find(d => ms >= d.dayStartMs && ms < d.dayStartMs + DAY_MS);
  const columnsCache = useRef<{ width: number; i0: number; i1: number; series: SiteSeries; sun: Float32Array; earth: Float32Array } | null>(null);
  const timelineRef = useCanvas(112, (ctx, width) => {
    const plotWidth = Math.max(1, Math.floor(width - LEFT - RIGHT));
    let columns = columnsCache.current;
    if (!columns || columns.width !== plotWidth || columns.i0 !== i0 || columns.i1 !== i1 || columns.series !== series) {
      columns = { width: plotWidth, i0, i1, series, sun: aggregateColumns(series.sunlit, i0, i1, plotWidth), earth: aggregateColumns(series.dte, i0, i1, plotWidth) };
      columnsCache.current = columns;
    }
    ctx.font = `${width > 1100 ? 13 : 11}px ui-monospace, Consolas, monospace`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#9daaba";
    ctx.fillText("SUN", 0, 48);
    ctx.fillText("DTE", 0, 82);
    const ticks = width < 500 ? 2 : 4;
    for (let t = 0; t <= ticks; t++) {
      const fraction = t / ticks;
      const x = LEFT + plotWidth * fraction;
      ctx.strokeStyle = "#283341";
      ctx.beginPath(); ctx.moveTo(x, 28); ctx.lineTo(x, 99); ctx.stroke();
      ctx.fillStyle = "#9daaba";
      ctx.textAlign = t === 0 ? "left" : t === ticks ? "right" : "center";
      ctx.fillText(utcLabel(period.startMs + (period.endMs - period.startMs) * fraction, zoom === "day"), x, 12);
    }
    ctx.textAlign = "left";
    for (const [values, y, color] of [[columns.sun, 35, SUN], [columns.earth, 69, EARTH]] as const) {
      ctx.fillStyle = "#202c39"; ctx.fillRect(LEFT, y, plotWidth, 26);
      ctx.fillStyle = color;
      for (let x = 0; x < plotWidth; x++) {
        ctx.globalAlpha = values[x]!;
        ctx.fillRect(LEFT + x, y, 1, 26);
      }
      ctx.globalAlpha = 1;
    }
    const cursor = LEFT + ((ms - period.startMs) / (period.endMs - period.startMs)) * plotWidth;
    ctx.strokeStyle = "#ffffff";
    ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(cursor, 28); ctx.lineTo(cursor, 99); ctx.stroke(); ctx.setLineDash([]);
  });
  const calendarRef = useCanvas(146, (ctx, width) => {
    const cellWidth = (width - LEFT - RIGHT) / weeks;
    ctx.font = `${width > 1100 ? 12 : 10}px ui-monospace, Consolas, monospace`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#9daaba";
    ["M", "T", "W", "T", "F", "S", "S"].forEach((label, day) => ctx.fillText(label, 23, 31 + day * 16));
    let lastMonth = "";
    let lastLabelX = -100;
    for (const day of days) {
      const { week, weekday } = calendarCell(day.dayStartMs, origin);
      const x = LEFT + week * cellWidth;
      const y = 24 + weekday * 16;
      const month = new Date(day.dayStartMs).toISOString().slice(0, 7);
      if (month !== lastMonth) {
        if (x - lastLabelX >= 43) {
          ctx.fillStyle = "#9daaba";
          ctx.fillText(new Date(day.dayStartMs).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }), x, 9);
          lastLabelX = x;
        }
        lastMonth = month;
      }
      ctx.fillStyle = "#202c39"; ctx.fillRect(x, y, Math.max(1, cellWidth - 1), 14);
      ctx.fillStyle = SUN; ctx.globalAlpha = day.pctSunlit / 100; ctx.fillRect(x, y, Math.max(1, cellWidth - 1), 7);
      ctx.fillStyle = EARTH; ctx.globalAlpha = day.pctDte / 100; ctx.fillRect(x, y + 7, Math.max(1, cellWidth - 1), 7);
      ctx.globalAlpha = 1;
      if (ms >= day.dayStartMs && ms < day.dayStartMs + DAY_MS) {
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.strokeRect(x, y, Math.max(1, cellWidth - 1), 14);
      }
    }
  }, zoom === "year");
  function positionTooltip(event: PointerEvent<HTMLCanvasElement>) {
    if (event.pointerType === "mouse") setHover({ x: Math.max(12, Math.min(event.clientX + 14, window.innerWidth - 302)), y: Math.max(12, Math.min(event.clientY + 14, window.innerHeight - 220)) });
  }
  function inspectTimeline(event: PointerEvent<HTMLCanvasElement>) {
    positionTooltip(event);
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - rect.left - LEFT) / (rect.width - LEFT - RIGHT);
    setSelected(sampleAtFraction(i0, i1, fraction));
  }
  function inspectCalendar(event: PointerEvent<HTMLCanvasElement>) {
    positionTooltip(event);
    const rect = event.currentTarget.getBoundingClientRect();
    const week = Math.floor((event.clientX - rect.left - LEFT) / ((rect.width - LEFT - RIGHT) / weeks));
    const weekday = Math.floor((event.clientY - rect.top - 24) / 16);
    if (week < 0 || week >= weeks || weekday < 0 || weekday > 6) return;
    const day = origin + (week * 7 + weekday) * DAY_MS;
    if (day >= period.endMs || day + DAY_MS <= period.startMs) return;
    setSelected(Math.max(i0, Math.min(i1 - 1, Math.ceil((day - ephem.t0Ms) / ephem.stepMs))));
  }
  function keyboard(event: KeyboardEvent<HTMLCanvasElement>) {
    const jumps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -Math.round(DAY_MS / ephem.stepMs), ArrowDown: Math.round(DAY_MS / ephem.stepMs) };
    if (event.key === "Home" || event.key === "End" || event.key in jumps) {
      event.preventDefault();
      setSelected(event.key === "Home" ? i0 : event.key === "End" ? i1 - 1 : Math.max(i0, Math.min(i1 - 1, index + jumps[event.key]!)));
    }
  }
  const sunHorizon = maskAt(horizon.mask_deg, tracks.sunAz[index]!, horizon.az_step_deg);
  const earthHorizon = maskAt(horizon.mask_deg, tracks.earthAz[index]!, horizon.az_step_deg);
  return <article className="site-row">
    <div className="site-heading"><div><h3>{site.name}</h3><p>{Math.abs(site.lat).toFixed(4)}° {site.lat < 0 ? "S" : "N"} · {Math.abs(site.lon).toFixed(4)}° {site.lon < 0 ? "W" : "E"} · {site.elev_m} m elevation</p></div><TerrainBadge horizon={horizon} /></div>
    <canvas ref={timelineRef} className="timeline-canvas" style={{ height: 112 }} tabIndex={0} role="img" aria-label={`${site.name}: sunlight and Earth contact timeline. Hover or tap to inspect. Arrow keys change sample; up and down change day; Home and End select range edges.`} onPointerMove={inspectTimeline} onPointerDown={inspectTimeline} onKeyDown={keyboard} onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)} />
    {zoom === "year" && <div className="calendar-block"><div className="calendar-heading"><span>DAILY COVERAGE / UTC</span><span>Each cell: Sun above · DTE below</span></div><canvas ref={calendarRef} className="calendar-canvas" style={{ height: 146 }} tabIndex={0} role="img" aria-label={`${site.name}: calendar heatmap. Brighter yellow means more daily sunlight; brighter blue means more daily Earth contact. Hover or tap a day to inspect its first sample. Arrow keys change sample.`} onPointerMove={inspectCalendar} onPointerDown={inspectCalendar} onKeyDown={keyboard} onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)} /></div>}
    {zoom === "year" && selectedDay && <p className="daily-reading">{utcLabel(ms)} UTC day: <span className="sun-text">{selectedDay.pctSunlit.toFixed(1)}% sunlit</span> · <span className="earth-text">{selectedDay.pctDte.toFixed(1)}% DTE</span></p>}
    <div className="sample-detail" aria-label={`${site.name} sample details`}>
      <div className="sample-time"><span className="eyebrow">SAMPLE / UTC</span><strong>{utcLabel(ms)} {utcLabel(ms, true)} UTC</strong><span>Local: {new Date(ms).toLocaleString(undefined, { timeZoneName: "short" })}</span></div>
      <div><strong className="sun-text">Sunlit: {series.sunlit[index] ? "yes" : "no"}</strong><span>Sun {tracks.sunEl[index]!.toFixed(3)}° · terrain {sunHorizon.toFixed(3)}°</span><span>Azimuth {tracks.sunAz[index]!.toFixed(2)}° · disk {(series.sunFrac[index]! * 100).toFixed(1)}%</span></div>
      <div><strong className="earth-text">DTE: {series.dte[index] ? "yes" : "no"}</strong><span>Earth {tracks.earthEl[index]!.toFixed(3)}° · terrain {earthHorizon.toFixed(3)}°</span><span>Azimuth {tracks.earthAz[index]!.toFixed(2)}° · clearance {(tracks.earthEl[index]! - earthHorizon).toFixed(3)}°</span></div>
    </div>
    {hover && <div className="hover-tooltip" role="tooltip" style={{ left: hover.x, top: hover.y }}>
      <strong>{utcLabel(ms)} {utcLabel(ms, true)} UTC</strong>
      <span>Local: {new Date(ms).toLocaleString(undefined, { timeZoneName: "short" })}</span>
      <hr />
      <strong className="sun-text">Sunlit: {series.sunlit[index] ? "yes" : "no"} · disk {(series.sunFrac[index]! * 100).toFixed(1)}%</strong>
      <span>Sun {tracks.sunEl[index]!.toFixed(3)}° · terrain {sunHorizon.toFixed(3)}°</span>
      <span>Azimuth {tracks.sunAz[index]!.toFixed(2)}°</span>
      <strong className="earth-text">DTE: {series.dte[index] ? "yes" : "no"}</strong>
      <span>Earth {tracks.earthEl[index]!.toFixed(3)}° · terrain {earthHorizon.toFixed(3)}°</span>
      <span>Azimuth {tracks.earthAz[index]!.toFixed(2)}°</span>
    </div>}
    <p className="source-note">Site source: {site.source}</p>
  </article>;
}
export function TimelineView({ analyses, period, zoom, thresholds }: { analyses: SiteAnalysis[]; period: Period; zoom: Zoom; thresholds: Thresholds }) {
  const { ephem } = useMission();
  const [i0, i1] = sampleRange(ephem, period);
  const metrics = useMemo(() => analyses.map(a => ({ ...a, metrics: metricsForRange(a.series, i0, i1, ephem.stepMs / 3_600_000) })), [analyses, i0, i1, ephem]);
  return <>
    <section className="panel timeline-panel" aria-labelledby="comparison-heading">
      <div className="panel-heading"><div><p className="eyebrow">01 / COMPARE THE CONDITIONS</p><h2 id="comparison-heading">Light & line of sight</h2></div><div className="legend"><span><i className="sun-key" />Sunlit</span><span><i className="earth-key" />Earth contact</span></div></div>
      <p className="chart-help">Hover, tap, or use the arrow keys on a chart to inspect a sample. Band brightness shows the share of available samples in each column.</p>
      {analyses.length ? analyses.map(a => <SiteRow key={a.site.id} analysis={a} period={period} zoom={zoom} />) : <p className="empty-state">Select a landing site above to start comparing conditions.</p>}
    </section>
    {analyses.length > 0 && <section className="panel summary-panel" aria-labelledby="summary-heading"><div className="panel-heading"><div><p className="eyebrow">02 / VISIBLE PERIOD</p><h2 id="summary-heading">Mission conditions</h2></div><span className="subtle">{i1 - i0} samples · {ephem.stepMs / 60_000} min cadence</span></div>
      <div className="table-scroll"><table><thead><tr><th scope="col">Landing site</th><th scope="col">Sunlit (%)</th><th scope="col">DTE (%)</th><th scope="col">Longest shadow (h)</th><th scope="col">Longest blackout (h)</th></tr></thead><tbody>{metrics.map(a => <tr key={a.site.id}><th scope="row">{a.site.name}<TerrainBadge horizon={a.horizon} /></th><td className="sun-text">{a.metrics.pctSunlit.toFixed(2)}%</td><td className="earth-text">{a.metrics.pctDte.toFixed(2)}%</td><td>{a.metrics.longestShadowH.toFixed(1)} h</td><td>{a.metrics.longestBlackoutH.toFixed(1)} h</td></tr>)}</tbody></table></div>
      <p className="summary-note">Sunlit: visible Sun disk ≥ {(thresholds.sunFractionMin * 100).toLocaleString("en", { maximumFractionDigits: 8 })}%. DTE: Earth-centre elevation − terrain horizon ≥ {thresholds.earthMarginDeg}°. Runs are clipped to the selected period; durations use {ephem.stepMs / 60_000} min samples.</p>
    </section>}
  </>;
}



