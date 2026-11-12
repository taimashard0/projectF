import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { loadEphemeris, loadHorizon, loadSites } from "../lib/data";
import { computeTracks, siteFrame } from "../lib/geometry";
import type { SkyTracks } from "../lib/geometry";
import type { Ephemeris, Horizon, Site } from "../lib/types";

export interface MissionData {
  ephem: Ephemeris;
  sites: Site[];
  demoSites: boolean;
  horizons: Map<string, Horizon>;
  tracksFor: (site: Site) => SkyTracks;
}
let pending: Promise<MissionData> | undefined;
function loadMission(): Promise<MissionData> {
  pending ??= Promise.all([loadEphemeris(), loadSites()]).then(async ([ephem, file]) => {
    const horizons = new Map(await Promise.all(file.sites.map(async site => [site.id, await loadHorizon(site.id)] as const)));
    const cache = new Map<string, SkyTracks>();
    return {
      ephem, sites: file.sites, demoSites: file.dummy, horizons,
      tracksFor(site: Site) {
        let tracks = cache.get(site.id);
        if (!tracks) {
          tracks = computeTracks(siteFrame(site.lat, site.lon, site.elev_m), ephem);
          cache.set(site.id, tracks);
        }
        return tracks;
      },
    };
  }).catch((error: unknown) => { pending = undefined; throw error; });
  return pending;
}
const MissionContext = createContext<MissionData | null>(null);
export function useMission(): MissionData {
  const value = useContext(MissionContext);
  if (!value) throw new Error("Mission data is not loaded");
  return value;
}
export function MissionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<MissionData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadMission().then(value => { if (active) setData(value); }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { active = false; };
  }, [attempt]);
  const value = useMemo(() => data, [data]);
  if (error) return <main className="load-state" role="alert"><p className="eyebrow">MISSION DATA</p><h1>Unable to load the mission.</h1><p>{error}</p><button onClick={() => { setError(""); setAttempt(a => a + 1); }}>Retry loading</button></main>;
  if (!value) return <main className="load-state" role="status"><p className="eyebrow">CLPS / LUNAR MISSION BROWSER</p><h1>Reading the lunar sky…</h1><p>Loading the ephemeris, landing sites, and terrain horizons.</p></main>;
  return <MissionContext.Provider value={value}>{children}</MissionContext.Provider>;
}
