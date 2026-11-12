// Run with:  npx vitest run
// Needs the REAL ephem.bin / ephem.json / golden.json in public/data/ (same pipeline run).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEphemeris } from "../src/lib/data";
import { angDiffDeg, azElInto, maskAt, siteFrame, targetVector } from "../src/lib/geometry";
import type { EphemMeta, GoldenFile } from "../src/lib/types";

const DIR = resolve(process.cwd(), "public/data");
const meta = JSON.parse(readFileSync(resolve(DIR, "ephem.json"), "utf8")) as EphemMeta;
const bin = readFileSync(resolve(DIR, "ephem.bin"));
const golden = JSON.parse(readFileSync(resolve(DIR, "golden.json"), "utf8")) as GoldenFile;
const ephem = parseEphemeris(
  meta,
  bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer,
);

const TOL_DEG = 0.01;

describe("ephemeris files", () => {
  it("are the real data, not the dummy files", () => {
    expect(meta.dummy).not.toBe(true);
    expect(meta.frame).toBe("MOON_ME");
  });
});

describe("geometry.ts vs SPICE azlcpo (golden.json)", () => {
  it("has golden rows to check", () => {
    expect(golden.rows.length).toBeGreaterThan(0);
  });

  for (const row of golden.rows) {
    it(`${row.point} ${row.target} at sample ${row.index} (${row.utc})`, () => {
      const f = siteFrame(row.lat, row.lon, row.elev_m);
      const v = targetVector(ephem, row.index, row.target === "SUN" ? 0 : 1);
      const out = [0, 0];
      azElInto(f, v[0], v[1], v[2], out);
      expect(angDiffDeg(out[0]!, row.az_deg)).toBeLessThan(TOL_DEG);
      expect(Math.abs(out[1]! - row.el_deg)).toBeLessThan(TOL_DEG);
    });
  }
});

describe("site frame and mask lookup", () => {
  it("up, east and north are perpendicular unit vectors", () => {
    const f = siteFrame(-84.7906, 29.1957, 0);
    const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    expect(dot(f.U, f.E)).toBeCloseTo(0, 12);
    expect(dot(f.U, f.N)).toBeCloseTo(0, 12);
    expect(dot(f.E, f.N)).toBeCloseTo(0, 12);
    expect(dot(f.U, f.U)).toBeCloseTo(1, 12);
  });

  it("maskAt interpolates and wraps around 360", () => {
    const mask = new Array<number>(360).fill(0);
    mask[0] = 2;
    mask[359] = 4;
    expect(maskAt(mask, 0)).toBeCloseTo(2, 10);
    expect(maskAt(mask, 0.5)).toBeCloseTo(1, 10); // halfway between 2 and 0
    expect(maskAt(mask, 359.5)).toBeCloseTo(3, 10); // halfway between 4 and 2 (wraps)
    expect(maskAt(mask, -1)).toBeCloseTo(4, 10);
  });
});