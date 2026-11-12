// Types for the data contract. They match the files the Python pipeline writes
// into public/data/ (ephem.json, sites.json, horizons/*.json, golden.json).
// Change these only together with the pipeline owner.

export type Vec3 = [number, number, number];

/** ephem.json: describes ephem.bin (Sun and Earth vectors relative to the Moon's centre). */
export interface EphemMeta {
  dummy?: boolean;
  t0_utc: string; // e.g. "2026-01-01T00:00:00Z"
  t0_et?: number;
  step_s: number; // 1800
  n: number; // 87648
  frame: string; // "MOON_ME"
  abcorr: string; // "LT+S"
  units: string; // "km"
  file: string; // "ephem.bin"
  layout: string;
  time_note?: string;
}

/** ephem.bin loaded into memory: 6 floats per sample = [sunX, sunY, sunZ, earthX, earthY, earthZ]. */
export interface Ephemeris {
  meta: EphemMeta;
  data: Float32Array;
  n: number;
  t0Ms: number; // UTC time of sample 0, in ms since 1970
  stepMs: number;
}

export type SiteKind = "artemis3" | "clps" | string;

export interface Site {
  id: string;
  name: string;
  kind: SiteKind;
  lat: number; // planetocentric degrees, south is negative
  lon: number; // degrees, east positive
  elev_m: number; // height above the 1737.4 km reference sphere
  source: string;
}

/** sites.json is { dummy?, sites: [...] }. A plain array is also accepted by the loader. */
export interface SitesFile {
  dummy?: boolean;
  sites: Site[];
}

/** horizons/<id>.json: terrain elevation angle (degrees) for each azimuth, clockwise from north. */
export interface HorizonFile {
  dummy?: boolean;
  id: string;
  az_step_deg: number;
  mask_deg: number[];
  dem: string;
  max_range_km: number;
  mast_m: number;
}

/**
 * real  = computed from LOLA terrain
 * dummy = fake demo terrain from make_dummy_data.py
 * flat  = no file found, so a smooth 0 degree horizon is used ("terrain not computed")
 */
export type TerrainStatus = "real" | "dummy" | "flat";

export interface Horizon extends HorizonFile {
  status: TerrainStatus;
}

/** golden.json: SPICE's own answers (azlcpo) that our browser maths must reproduce. */
export interface GoldenRow {
  point: string;
  lat: number;
  lon: number;
  elev_m: number;
  index: number; // row in ephem.bin
  utc: string;
  target: "SUN" | "EARTH";
  az_deg: number;
  el_deg: number;
}

export interface GoldenFile {
  about: string;
  rows: GoldenRow[];
}
