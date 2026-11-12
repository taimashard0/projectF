// Loading the files from public/data/ and turning them into typed objects.
// parseEphemeris() is pure (no fetch) so tests can use it too.

import type { EphemMeta, Ephemeris, Horizon, HorizonFile, Site, SitesFile } from "./types";

/** URL of a file in public/data. BASE_URL keeps it working on GitHub Pages sub-paths. */
function dataUrl(name: string): string {
  return `${import.meta.env.BASE_URL}data/${name}`;
}

async function getJson<T>(name: string): Promise<T> {
  const res = await fetch(dataUrl(name));
  if (!res.ok) throw new Error(`Could not load ${name} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

/** Turn ephem.json + the raw bytes of ephem.bin into an Ephemeris. */
export function parseEphemeris(meta: EphemMeta, buf: ArrayBuffer): Ephemeris {
  const expectedBytes = meta.n * 6 * 4;
  if (buf.byteLength !== expectedBytes) {
    throw new Error(
      `ephem.bin is ${buf.byteLength} bytes but ephem.json says n=${meta.n} (expected ${expectedBytes}). ` +
        `The two files come from different runs?`,
    );
  }
  const t0Ms = Date.parse(meta.t0_utc);
  if (Number.isNaN(t0Ms)) throw new Error(`Bad t0_utc in ephem.json: ${meta.t0_utc}`);
  return {
    meta,
    // float32 little-endian, same as every browser/CPU we care about
    data: new Float32Array(buf),
    n: meta.n,
    t0Ms,
    stepMs: meta.step_s * 1000,
  };
}

export async function loadEphemeris(): Promise<Ephemeris> {
  const meta = await getJson<EphemMeta>("ephem.json");
  const res = await fetch(dataUrl(meta.file));
  if (!res.ok) throw new Error(`Could not load ${meta.file} (HTTP ${res.status})`);
  return parseEphemeris(meta, await res.arrayBuffer());
}

/** Accepts both { sites: [...] } (what the pipeline writes) and a plain array (the plan's contract). */
export async function loadSites(): Promise<{ sites: Site[]; dummy: boolean }> {
  const raw = await getJson<SitesFile | Site[]>("sites.json");
  if (Array.isArray(raw)) return { sites: raw, dummy: false };
  return { sites: raw.sites, dummy: raw.dummy === true };
}

/** A smooth-ground horizon, used when a site has no terrain file yet. */
export function flatHorizon(id: string): Horizon {
  return {
    id,
    az_step_deg: 1,
    mask_deg: new Array<number>(360).fill(0),
    dem: "none",
    max_range_km: 0,
    mast_m: 0,
    status: "flat",
  };
}

/** Load horizons/<id>.json. If it is missing the app still works, with a flat horizon and status "flat". */
export async function loadHorizon(id: string): Promise<Horizon> {
  try {
    const h = await getJson<HorizonFile>(`horizons/${id}.json`);
    return { ...h, status: h.dummy === true ? "dummy" : "real" };
  } catch {
    return flatHorizon(id);
  }
}

// ---- time helpers (sample i <-> UTC) ---------------------------------------
// Valid while no leap second is added inside 2026-2030 (see time_note in ephem.json).

export function indexToUtcMs(e: Ephemeris, i: number): number {
  return e.t0Ms + i * e.stepMs;
}

/** Nearest sample index for a UTC time in ms, clamped to the file's range. */
export function utcMsToIndex(e: Ephemeris, ms: number): number {
  const i = Math.round((ms - e.t0Ms) / e.stepMs);
  return Math.min(e.n - 1, Math.max(0, i));
}
