// Browser-side geometry: Sun/Earth vectors (MOON_ME, km) -> azimuth/elevation at a site.
// Same maths as Method A in 00_spike.py. Azimuth is clockwise from north (east = 90),
// elevation is positive up. All angles returned are in degrees.

import type { Ephemeris, Vec3 } from "./types";

export const R_MOON_KM = 1737.4;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** A site's position and local axes in MOON_ME. Build it once per site, reuse it for every sample. */
export interface SiteFrame {
  p: Vec3; // site position from the Moon's centre, km
  U: Vec3; // up
  E: Vec3; // east
  N: Vec3; // north
}

export function siteFrame(latDeg: number, lonDeg: number, elevM = 0): SiteFrame {
  const lat = latDeg * RAD;
  const lon = lonDeg * RAD;
  const R = R_MOON_KM + elevM / 1000;
  const cl = Math.cos(lat);
  const sl = Math.sin(lat);
  const co = Math.cos(lon);
  const so = Math.sin(lon);
  const U: Vec3 = [cl * co, cl * so, sl];
  return {
    p: [R * U[0], R * U[1], R * U[2]],
    U,
    E: [-so, co, 0],
    N: [-sl * co, -sl * so, cl],
  };
}

/**
 * Azimuth and elevation (degrees) of a target at (x, y, z) km relative to the Moon's centre.
 * Writes into `out` = [az, el] so loops over 87,648 samples allocate nothing.
 * Subtracting the site position matters for Earth (parallax about 0.26 deg).
 */
export function azElInto(f: SiteFrame, x: number, y: number, z: number, out: ArrayLike<number> & { [i: number]: number }): void {
  const vx = x - f.p[0];
  const vy = y - f.p[1];
  const vz = z - f.p[2];
  const d = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const up = vx * f.U[0] + vy * f.U[1] + vz * f.U[2];
  const east = vx * f.E[0] + vy * f.E[1] + vz * f.E[2];
  const north = vx * f.N[0] + vy * f.N[1] + vz * f.N[2];
  out[0] = (Math.atan2(east, north) * DEG + 360) % 360;
  out[1] = Math.asin(up / d) * DEG;
}

/** Convenience version that returns a new object. Fine for one-off calls, not for big loops. */
export function azEl(f: SiteFrame, v: Vec3): { az: number; el: number } {
  const out = [0, 0];
  azElInto(f, v[0], v[1], v[2], out);
  return { az: out[0]!, el: out[1]! };
}

/** Sun (target = 0) or Earth (target = 1) vector of sample i in ephem.bin. */
export function targetVector(e: Ephemeris, i: number, target: 0 | 1): Vec3 {
  const o = i * 6 + target * 3;
  return [e.data[o]!, e.data[o + 1]!, e.data[o + 2]!];
}

export interface SkyTracks {
  sunAz: Float32Array;
  sunEl: Float32Array;
  earthAz: Float32Array;
  earthEl: Float32Array;
}

/** Sun and Earth azimuth/elevation for every sample, for one site. Input for windows.ts and the skyline view. */
export function computeTracks(f: SiteFrame, e: Ephemeris): SkyTracks {
  const n = e.n;
  const t: SkyTracks = {
    sunAz: new Float32Array(n),
    sunEl: new Float32Array(n),
    earthAz: new Float32Array(n),
    earthEl: new Float32Array(n),
  };
  const out = [0, 0];
  const d = e.data;
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    azElInto(f, d[o]!, d[o + 1]!, d[o + 2]!, out);
    t.sunAz[i] = out[0]!;
    t.sunEl[i] = out[1]!;
    azElInto(f, d[o + 3]!, d[o + 4]!, d[o + 5]!, out);
    t.earthAz[i] = out[0]!;
    t.earthEl[i] = out[1]!;
  }
  return t;
}

/** Smallest difference between two azimuths, in degrees (359.9 vs 0.1 gives 0.2, not 359.8). */
export function angDiffDeg(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * Terrain horizon height (degrees) at an azimuth, by linear interpolation between mask samples.
 * mask[k] is the horizon at azimuth k * stepDeg, wrapping around at 360.
 */
export function maskAt(mask: ArrayLike<number>, azDeg: number, stepDeg = 1): number {
  const n = mask.length;
  const x = (((azDeg % 360) + 360) % 360) / stepDeg;
  const i0 = Math.floor(x) % n;
  const i1 = (i0 + 1) % n;
  const f = x - Math.floor(x);
  return mask[i0]! * (1 - f) + mask[i1]! * f;
}
