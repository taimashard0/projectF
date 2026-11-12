import type { Ephemeris } from "./types";

export type Zoom = "year" | "month" | "day";
export interface Period { startMs: number; endMs: number }
export const DAY_MS = 24 * 3_600_000;

/** Calendar arithmetic in UTC, clamping the day to the target month's last day. */
export function shiftUtcMonths(ms: number, months: number): number {
  const d = new Date(ms);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}
export function dataBounds(e: Ephemeris): Period {
  return { startMs: e.t0Ms, endMs: e.t0Ms + e.n * e.stepMs };
}
export function zoomPeriod(start: number, zoom: Zoom, e: Ephemeris): Period {
  const bounds = dataBounds(e);
  const startMs = Math.max(bounds.startMs, Math.min(start, bounds.endMs - e.stepMs));
  const end = zoom === "day" ? startMs + DAY_MS : shiftUtcMonths(startMs, zoom === "year" ? 12 : 1);
  return { startMs, endMs: Math.min(end, bounds.endMs) };
}
export function initialPeriod(e: Ephemeris, nowMs: number): Period {
  const d = new Date(nowMs);
  return zoomPeriod(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), "year", e);
}
/** Samples whose timestamps lie inside the half-open UTC interval. End may equal n. */
export function sampleRange(e: Ephemeris, period: Period): [number, number] {
  const clamp = (i: number) => Math.max(0, Math.min(e.n, i));
  return [clamp(Math.ceil((period.startMs - e.t0Ms) / e.stepMs)), clamp(Math.ceil((period.endMs - e.t0Ms) / e.stepMs))];
}
export function sampleAtFraction(i0: number, i1: number, fraction: number): number {
  return Math.min(i1 - 1, Math.max(i0, Math.floor(i0 + Math.max(0, Math.min(1, fraction)) * (i1 - i0))));
}
/** Every sample contributes exactly once. Empty columns repeat the nearest sample for magnified views. */
export function aggregateColumns(a: Uint8Array, i0: number, i1: number, width: number): Float32Array {
  if (!Number.isInteger(width) || width < 1 || i0 < 0 || i1 > a.length || i1 < i0) throw new RangeError("Invalid column range");
  const out = new Float32Array(width);
  const count = i1 - i0;
  if (count === 0) return out;
  for (let x = 0; x < width; x++) {
    const start = i0 + Math.floor(x * count / width);
    const end = i0 + Math.floor((x + 1) * count / width);
    if (end === start) { out[x] = a[start]!; continue; }
    let sum = 0;
    for (let i = start; i < end; i++) sum += a[i]!;
    out[x] = sum / (end - start);
  }
  return out;
}
export function calendarOrigin(ms: number): number {
  const d = new Date(ms);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return midnight - ((d.getUTCDay() + 6) % 7) * DAY_MS;
}
export function calendarCell(ms: number, origin: number): { week: number; weekday: number } {
  const days = Math.floor((ms - origin) / DAY_MS);
  return { week: Math.floor(days / 7), weekday: ((days % 7) + 7) % 7 };
}
