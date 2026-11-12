import { describe, expect, it } from "vitest";
import { aggregateColumns, calendarCell, calendarOrigin, DAY_MS, initialPeriod, sampleAtFraction, sampleRange, shiftUtcMonths, zoomPeriod } from "../src/lib/timeline";
import type { Ephemeris } from "../src/lib/types";
const t0Ms = Date.UTC(2026,0,1);
const e: Ephemeris = {
  meta:{t0_utc:"2026-01-01T00:00:00Z",step_s:1800,n:87648,frame:"MOON_ME",abcorr:"LT+S",units:"km",file:"ephem.bin",layout:"float32 LE, n x 6"},
  data:new Float32Array(0), n:87648, t0Ms, stepMs:1_800_000,
};
describe("UTC periods and sample boundaries", () => {
  it("opens on a calendar year from today's UTC midnight", () => {
    expect(initialPeriod(e,Date.UTC(2026,9,31,23,59))).toEqual({startMs:Date.UTC(2026,9,31),endMs:Date.UTC(2027,9,31)});
  });
  it("clamps before and after the ephemeris without an empty window", () => {
    expect(initialPeriod(e,Date.UTC(2025,0,1)).startMs).toBe(t0Ms);
    const p = initialPeriod(e,Date.UTC(2032,0,1));
    expect(p.endMs).toBe(t0Ms + e.n * e.stepMs);
    expect(sampleRange(e,p)).toEqual([e.n-1,e.n]);
  });
  it("handles leap days and month ends without rolling into another month", () => {
    expect(shiftUtcMonths(Date.UTC(2028,0,31),1)).toBe(Date.UTC(2028,1,29));
    expect(shiftUtcMonths(Date.UTC(2028,1,29),12)).toBe(Date.UTC(2029,1,28));
    expect(shiftUtcMonths(Date.UTC(2027,2,31),-1)).toBe(Date.UTC(2027,1,28));
  });
  it("uses 24 UTC hours for day zoom and a calendar month for month zoom", () => {
    expect(zoomPeriod(Date.UTC(2028,1,1),"month",e).endMs).toBe(Date.UTC(2028,2,1));
    const start = Date.UTC(2027,2,28);
    expect(zoomPeriod(start,"day",e).endMs-start).toBe(DAY_MS);
  });
  it("uses an exclusive end while retaining the final file sample", () => {
    expect(sampleRange(e,{startMs:t0Ms,endMs:t0Ms+e.stepMs})).toEqual([0,1]);
    expect(sampleRange(e,{startMs:t0Ms+1,endMs:t0Ms+2*e.stepMs})).toEqual([1,2]);
    expect(sampleRange(e,{startMs:t0Ms+(e.n-1)*e.stepMs,endMs:t0Ms+e.n*e.stepMs})).toEqual([e.n-1,e.n]);
  });
  it("clamps pointer selection at both chart edges", () => {
    expect(sampleAtFraction(10,58,-1)).toBe(10);
    expect(sampleAtFraction(10,58,0.5)).toBe(34);
    expect(sampleAtFraction(10,58,1)).toBe(57);
    expect(sampleAtFraction(10,58,2)).toBe(57);
  });
});
describe("canvas column aggregation", () => {
  it("averages every sample once across uneven columns", () => {
    const data = new Uint8Array([1,0,0,1,1,0,1]);
    const columns = aggregateColumns(data,0,7,3);
    expect([...columns]).toEqual([0.5,0.5,Math.fround(2/3)]);
    expect(columns[0]! * 2 + columns[1]! * 2 + columns[2]! * 3).toBeCloseTo(4,6);
  });
  it("respects the selected range and a single-column view", () => {
    expect([...aggregateColumns(new Uint8Array([1,0,0,1,1,1]),1,5,2)]).toEqual([0,1]);
    expect(aggregateColumns(new Uint8Array([0,1,1,0]),0,4,1)[0]).toBe(0.5);
  });
  it("fills magnified columns without NaN and preserves pure on/off bands", () => {
    expect([...aggregateColumns(new Uint8Array([0,1]),0,2,6)]).toEqual([0,0,0,1,1,1]);
    expect([...aggregateColumns(new Uint8Array(48).fill(1),0,48,300)].every(v=>v===1)).toBe(true);
  });
  it("handles empty input and rejects invalid dimensions", () => {
    expect([...aggregateColumns(new Uint8Array(0),0,0,2)]).toEqual([0,0]);
    expect(()=>aggregateColumns(new Uint8Array(1),0,1,0)).toThrow(RangeError);
  });
});
describe("UTC calendar layout", () => {
  it("aligns Monday-first weeks across a year boundary", () => {
    const start = Date.UTC(2026,9,31); // Saturday
    const origin = calendarOrigin(start);
    expect(origin).toBe(Date.UTC(2026,9,26));
    expect(calendarCell(start,origin)).toEqual({week:0,weekday:5});
    expect(calendarCell(Date.UTC(2026,10,2),origin)).toEqual({week:1,weekday:0});
    const yearOrigin = calendarOrigin(Date.UTC(2026,11,31));
    expect(calendarCell(Date.UTC(2027,0,1),yearOrigin)).toEqual({week:0,weekday:4});
  });
});
