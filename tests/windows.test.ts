import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { flatHorizon, parseEphemeris, utcMsToIndex } from "../src/lib/data";
import { computeTracks, siteFrame } from "../src/lib/geometry";
import { buildSeries, dailyStats, longestRunOfZeros, metricsForRange, SUN_RADIUS_DEG, sunDiskFraction } from "../src/lib/windows";
import type { SiteSeries } from "../src/lib/windows";
import type { EphemMeta, Ephemeris, SitesFile } from "../src/lib/types";
function series(sun: number[], earth = sun): SiteSeries {
  return { sunlit: new Uint8Array(sun), dte: new Uint8Array(earth), sunFrac: new Float32Array(sun) };
}
describe("Sun disk", () => {
  it("has half its disk on the horizon and saturates outside it", () => {
    expect(sunDiskFraction(0, 0)).toBeCloseTo(0.5, 12);
    expect(sunDiskFraction(10, 0)).toBe(1);
    expect(sunDiskFraction(-10, 0)).toBe(0);
    expect(sunDiskFraction(SUN_RADIUS_DEG, 0)).toBe(1);
    expect(sunDiskFraction(-SUN_RADIUS_DEG, 0)).toBe(0);
  });
  it("is strictly increasing and symmetric", () => {
    let last = 0;
    for (let k = -99; k < 100; k++) {
      const d = k / 100;
      const value = sunDiskFraction(d, 0, 1);
      expect(value).toBeGreaterThan(last);
      expect(value + sunDiskFraction(-d, 0, 1)).toBeCloseTo(1, 12);
      last = value;
    }
  });
});
describe("window metrics", () => {
  const s = series([0,0,0,1,0,0,1,0,0,0], [1,1,0,0,0,0,1,1,1,1]);
  it("clips runs at either window edge", () => {
    expect(longestRunOfZeros(s.sunlit,1,5)).toBe(2);
    expect(longestRunOfZeros(s.sunlit,6,9)).toBe(2);
    expect(longestRunOfZeros(s.sunlit,0,10)).toBe(3);
  });
  it("computes shares and half-hour durations", () => {
    expect(metricsForRange(s,0,10,0.5)).toEqual({ samples:10, pctSunlit:20, pctDte:60, longestShadowH:1.5, longestBlackoutH:2 });
  });
  it("handles all-zero, all-one and empty ranges", () => {
    expect(metricsForRange(series([0,0]),0,2,0.5)).toEqual({samples:2,pctSunlit:0,pctDte:0,longestShadowH:1,longestBlackoutH:1});
    expect(metricsForRange(series([1,1]),0,2,0.5)).toEqual({samples:2,pctSunlit:100,pctDte:100,longestShadowH:0,longestBlackoutH:0});
    expect(metricsForRange(s,2,2,0.5)).toEqual({samples:0,pctSunlit:0,pctDte:0,longestShadowH:0,longestBlackoutH:0});
  });
  it("rejects invalid ranges", () => {
    expect(() => longestRunOfZeros(s.sunlit,-1,2)).toThrow(RangeError);
    expect(() => metricsForRange(s,0,11,0.5)).toThrow(RangeError);
  });
});
describe("terrain and thresholds", () => {
  it("interpolates the mask separately for Sun and Earth and includes equality", () => {
    const h = {...flatHorizon("test"), az_step_deg:90, mask_deg:[0,2,0,0]};
    const t = {sunAz:new Float32Array([45,45,45]),sunEl:new Float32Array([1,2,0]),earthAz:new Float32Array([90,180,90]),earthEl:new Float32Array([2,0,1])};
    const s = buildSeries(t,h,{sunFractionMin:0.5,earthMarginDeg:0});
    expect([...s.sunlit]).toEqual([1,1,0]);
    expect([...s.dte]).toEqual([1,1,0]);
    expect([...s.sunFrac]).toEqual([0.5,1,0]);
    expect([...buildSeries(t,h,{sunFractionMin:1,earthMarginDeg:1}).dte]).toEqual([0,0,0]);
  });
});
const dir = resolve(process.cwd(),"public/data");
const meta = JSON.parse(readFileSync(resolve(dir,"ephem.json"),"utf8")) as EphemMeta;
const bin = readFileSync(resolve(dir,"ephem.bin"));
const e = parseEphemeris(meta,bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength) as ArrayBuffer);
describe("UTC daily summaries", () => {
  it("summarizes two days with 48 half-hour samples each", () => {
    const fake: Ephemeris = {...e,n:96,data:new Float32Array(96*6),t0Ms:Date.UTC(2027,0,1)};
    const s = series([...Array<number>(48).fill(1),...Array<number>(48).fill(0)],Array.from({length:96},(_,i) => i%2));
    expect(dailyStats(s,fake)).toEqual([
      {dayStartMs:Date.UTC(2027,0,1),pctSunlit:100,pctDte:50},
      {dayStartMs:Date.UTC(2027,0,2),pctSunlit:0,pctDte:50},
    ]);
  });
  it("groups partial days by UTC midnight", () => {
    const fake: Ephemeris = {...e,n:4,data:new Float32Array(24),t0Ms:Date.UTC(2027,0,1,23)};
    expect(dailyStats(series([1,1,0,0]),fake).map(d => d.pctSunlit)).toEqual([100,0]);
  });
});
describe("real IM-2 ephemeris with flat terrain", () => {
  it("matches the Sun elevation sign and yields finite January metrics", () => {
    expect(meta.dummy).not.toBe(true);
    const sites = JSON.parse(readFileSync(resolve(dir,"sites.json"),"utf8")) as SitesFile;
    const site = sites.sites.find(s => s.id === "im2");
    if (!site) throw new Error("IM-2 is missing");
    const tracks = computeTracks(siteFrame(site.lat,site.lon,site.elev_m),e);
    const s = buildSeries(tracks,flatHorizon(site.id),{sunFractionMin:0.5,earthMarginDeg:0});
    let mismatches = 0;
    for(let i=0;i<e.n;i++) {
      if (Math.abs(tracks.sunEl[i]!) >= 1e-6 && s.sunlit[i] !== Number(tracks.sunEl[i]! > 0)) mismatches++;
    }
    expect(mismatches).toBe(0);
    const m = metricsForRange(s,utcMsToIndex(e,Date.UTC(2027,0,1)),utcMsToIndex(e,Date.UTC(2027,0,31)),e.stepMs/3_600_000);
    console.log("IM-2 flat terrain, [2027-01-01, 2027-01-31) UTC:",m);
    for(const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true);
    expect(m.pctSunlit).toBeGreaterThanOrEqual(0);
    expect(m.pctSunlit).toBeLessThanOrEqual(100);
    expect(m.pctDte).toBeGreaterThanOrEqual(0);
    expect(m.pctDte).toBeLessThanOrEqual(100);
  });
});
