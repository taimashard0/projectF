import { maskAt } from "./geometry";
import type { SkyTracks } from "./geometry";
import type { Ephemeris, Horizon } from "./types";

export const SUN_RADIUS_DEG = 0.267;
export interface Thresholds { sunFractionMin: number; earthMarginDeg: number }
export interface SiteSeries {
  sunlit: Uint8Array;
  dte: Uint8Array;
  sunFrac: Float32Array;
}
export interface RangeMetrics {
  samples: number;
  pctSunlit: number;
  pctDte: number;
  longestShadowH: number;
  longestBlackoutH: number;
}
export function sunDiskFraction(sunElDeg: number, horizonDeg: number, radiusDeg = SUN_RADIUS_DEG): number {
  const d = (sunElDeg - horizonDeg) / radiusDeg;
  if (d >= 1) return 1;
  if (d <= -1) return 0;
  return 1 - (Math.acos(d) - d * Math.sqrt(1 - d * d)) / Math.PI;
}
export function buildSeries(tracks: SkyTracks, horizon: Horizon, th: Thresholds): SiteSeries {
  const n = tracks.sunEl.length;
  if ([tracks.sunAz, tracks.earthAz, tracks.earthEl].some(a => a.length !== n)) {
    throw new RangeError("Track lengths must match");
  }
  const sunlit = new Uint8Array(n);
  const dte = new Uint8Array(n);
  const sunFrac = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const fraction = sunDiskFraction(tracks.sunEl[i]!, maskAt(horizon.mask_deg, tracks.sunAz[i]!, horizon.az_step_deg));
    sunFrac[i] = fraction;
    sunlit[i] = Number(fraction >= th.sunFractionMin);
    dte[i] = Number(tracks.earthEl[i]! - maskAt(horizon.mask_deg, tracks.earthAz[i]!, horizon.az_step_deg) >= th.earthMarginDeg);
  }
  return { sunlit, dte, sunFrac };
}
function checkRange(length: number, i0: number, i1: number): void {
  if (!Number.isInteger(i0) || !Number.isInteger(i1) || i0 < 0 || i1 < i0 || i1 > length) {
    throw new RangeError("Expected a sample range 0 <= i0 <= i1 <= length");
  }
}
export function longestRunOfZeros(a: Uint8Array, i0: number, i1: number): number {
  checkRange(a.length, i0, i1);
  let longest = 0;
  let run = 0;
  for (let i = i0; i < i1; i++) {
    run = a[i] === 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}
export function metricsForRange(series: SiteSeries, i0: number, i1: number, stepHours: number): RangeMetrics {
  checkRange(series.sunlit.length, i0, i1);
  checkRange(series.dte.length, i0, i1);
  if (!Number.isFinite(stepHours) || stepHours <= 0) throw new RangeError("stepHours must be positive and finite");
  const samples = i1 - i0;
  let sun = 0;
  let earth = 0;
  for (let i = i0; i < i1; i++) {
    sun += Number(series.sunlit[i] === 1);
    earth += Number(series.dte[i] === 1);
  }
  // Empty ranges have zero coverage and zero durations.
  return {
    samples,
    pctSunlit: samples ? sun / samples * 100 : 0,
    pctDte: samples ? earth / samples * 100 : 0,
    longestShadowH: longestRunOfZeros(series.sunlit, i0, i1) * stepHours,
    longestBlackoutH: longestRunOfZeros(series.dte, i0, i1) * stepHours,
  };
}
export function dailyStats(series: SiteSeries, e: Ephemeris): { dayStartMs: number; pctSunlit: number; pctDte: number }[] {
  if (series.sunlit.length !== e.n || series.dte.length !== e.n) throw new RangeError("Series must match ephemeris sample count");
  if (!Number.isFinite(e.stepMs) || e.stepMs <= 0) throw new RangeError("Sample step must be positive and finite");
  const result: { dayStartMs: number; pctSunlit: number; pctDte: number }[] = [];
  let i0 = 0;
  while (i0 < e.n) {
    const date = new Date(e.t0Ms + i0 * e.stepMs);
    const dayStartMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const nextDay = dayStartMs + 24 * 3_600_000;
    const i1 = Math.min(e.n, Math.max(i0 + 1, Math.ceil((nextDay - e.t0Ms) / e.stepMs)));
    const m = metricsForRange(series, i0, i1, e.stepMs / 3_600_000);
    result.push({ dayStartMs, pctSunlit: m.pctSunlit, pctDte: m.pctDte });
    i0 = i1;
  }
  return result;
}
