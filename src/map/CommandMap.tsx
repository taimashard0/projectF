import { useEffect, useState } from "react";
import { useMission } from "../context/MissionContext";
import { hours, percent } from "../format";
import LunarScene from "./LunarScene";
import "./CommandMap.css";

type Bounds = { x_min: number; x_max: number; y_min: number; y_max: number };
type Layer = { what: string; min: number; max: number; colormap: string };
type Grid = Bounds & { nx: number; ny: number; step_m: number; cell_index: number[]; elev_m: number[]; heat_layers: Record<string, Layer> };
type Region = { id: string; name: string; outline: [number, number][][] };
type Metrics = { pct_sunlit: number; pct_dte: number; pct_dsn_link: number; longest_shadow_h: number; by_mast?: Record<string, { longest_shadow_h: number }> };
type Validation = { sites: Record<string, Metrics>; checks: { name: string; detail: string; result: string; limit: string; pass: boolean | null }[] };
type Safety = { slope_mean_deg?: number; slope_max_deg?: number; rough_100m_m?: number; psr_dist_km?: number | null };
const data = (file: string) => `${import.meta.env.BASE_URL}data/${file}`;
const layers = { "heat_sun.png": "Sunlight", "heat_dte.png": "Earth visibility", "heat_shadow.png": "Longest shadow" };
type Heat = keyof typeof layers;

function useData<T,>(name: string) {
  const [state, setState] = useState<T | null | undefined>();
  useEffect(() => {
    let active = true;
    fetch(data(name)).then(response => {
      if (!response.ok) throw new Error(name);
      return response.json() as Promise<T>;
    }).then(value => { if (active) setState(value); }).catch(() => { if (active) setState(null); });
    return () => { active = false; };
  }, [name]);
  return state;
}


export default function CommandMap({ id, onSelect }: { id?: string; onSelect: (id?: string) => void }) {
  const { sites } = useMission();
  const [focus, setFocus] = useState<{ id: string }>();
  const [view, setView] = useState<"globe" | "pole">("globe");
  const [exaggeration, setExaggeration] = useState(2);
  const [heat, setHeat] = useState<Heat | "">("heat_sun.png");
  const [opacity, setOpacity] = useState(0.8);
  const [terrain, setTerrain] = useState(true);
  const [regionsOn, setRegionsOn] = useState(true);
  const [mast, setMast] = useState("2");
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const basemap = useData<Bounds>("basemap.json");
  const grid = useData<Grid>("grid.json");
  const regions = useData<{ regions: Region[] }>("regions.json");
  const validation = useData<Validation>("validation.json");
  const site = sites.find(item => item.id === id);
  function focusSite(siteId: string) {
    onSelect(siteId);
    setFocus({ id: siteId });
    setView("pole");
  }
  function returnToMoon() {
    onSelect(undefined);
    setFocus(undefined);
    setView("globe");
  }

  const safety = site as Safety | undefined;
  const metrics = id ? validation?.sites[id] : undefined;
  const legend = heat ? grid?.heat_layers[heat] : undefined;
  const failImage = (name: string) => setFailedImages(items => items.includes(name) ? items : [...items, name]);
  return <section className="command-map" aria-label="Lunar mission map" onKeyDown={event => { if (event.key === "Escape") returnToMoon(); }}>
    <div className="command-header">
      <div><p className="eyebrow">LUNAR SOUTH POLE</p><h2>Mission command center</h2></div>
      {view === "pole" && <button onClick={returnToMoon}>← Full Moon</button>}

    </div>
    <div className="command-layout">
      <nav aria-label="Landing sites" className="command-sites">
        {sites.map((item, index) => <button key={item.id} aria-pressed={item.id === id} onClick={() => focusSite(item.id)}><span>{index + 1}</span>{item.name}</button>)}
      </nav>
      <div className="command-viewport">
        <LunarScene mode={view} sites={sites} selected={id} select={focusSite} focus={focus} openPole={() => setView("pole")} grid={grid} base={basemap}
          terrain={terrain} heat={heat} opacity={opacity} regions={regionsOn ? regions?.regions : undefined}
          exaggeration={exaggeration} onMissing={failImage}/>
        {view === "globe" ? <>
          <div className="command-tools"><span>Drag to rotate · scroll or pinch to zoom · select a landing site</span><button onClick={() => setView("pole")}>South-pole terrain ↗</button></div>
          <div className="command-legend"><a href="https://svs.gsfc.nasa.gov/4720/">Moon imagery · NASA SVS / LRO / LROC</a></div>
          {failedImages.includes("moon.jpg") && <p>Lunar texture unavailable.</p>}
        </> : <>
          <div className="command-tools">
            <button onClick={() => setFocus({ id: "" })}>Reset camera</button>
            <label><input type="checkbox" checked={terrain} onChange={event => setTerrain(event.target.checked)}/> Terrain</label>
            <label><input type="checkbox" checked={regionsOn} onChange={event => setRegionsOn(event.target.checked)}/> Regions</label>
            <label>Relief <input aria-label="Vertical exaggeration" type="range" min="1" max="5" step=".5" value={exaggeration} onChange={event => setExaggeration(Number(event.target.value))}/>{exaggeration}×</label>
            <label>Heat map <select value={heat} onChange={event => setHeat(event.target.value as Heat | "")}><option value="">Off</option>{Object.entries(layers).map(([file, name]) => <option key={file} value={file}>{name}</option>)}</select></label>
            {heat && <label>Opacity <input aria-label="Heat map opacity" type="range" min="0" max="1" step=".05" value={opacity} onChange={event => setOpacity(Number(event.target.value))}/></label>}
          </div>
          <p className="command-relief">{grid ? "Drag to orbit · scroll or pinch to zoom · approximate relief (5 km grid)" : "Elevation grid unavailable · flat terrain"}</p>
          {legend && heat && !failedImages.includes(heat) && <div className="command-legend"><i className={heat}/><span>{legend.what} · {legend.min}–{legend.max} · 2026–2030 · approximate (5 km grid)</span></div>}
          {(basemap === null || failedImages.includes("basemap.png")) && terrain && <p>Terrain basemap unavailable.</p>}
          {(grid === null || (heat && failedImages.includes(heat))) && heat && <p>Selected heat map unavailable.</p>}
          {regionsOn && regions === null && <p>Region boundaries unavailable.</p>}
        </>}
      </div>
      <aside className="command-detail" aria-live="polite">
        {site ? <>
          <p className="eyebrow">{site.kind}</p><h3>{site.name}</h3>
          <p>{site.lat}° latitude · {site.lon}° longitude<br/>{site.elev_m} m above reference sphere</p>
          <label>Mast height <select value={mast} onChange={event => setMast(event.target.value)}><option value="2">2 m</option><option value="10">10 m</option><option value="20">20 m</option></select></label>
          <p>2026–2030 · Sunlit = at least 50% of the Sun disk visible after terrain and eclipse effects.</p>
          <dl><dt>Sunlit</dt><dd>{percent(mast === "2" ? metrics?.pct_sunlit : undefined)}</dd><dt>Earth visible (DTE)</dt><dd>{percent(mast === "2" ? metrics?.pct_dte : undefined)}</dd><dt>Modeled DSN link</dt><dd>{percent(mast === "2" ? metrics?.pct_dsn_link : undefined)}</dd><dt>Longest shadow</dt><dd>{hours(metrics?.by_mast?.[mast]?.longest_shadow_h ?? (mast === "2" ? metrics?.longest_shadow_h : undefined))}</dd></dl>
          <details><summary>Terrain and landing safety</summary><dl><dt>Mean slope</dt><dd>{safety?.slope_mean_deg ?? "—"}°</dd><dt>Maximum slope (limit 5°)</dt><dd>{safety?.slope_max_deg ?? "—"}°</dd><dt>Roughness</dt><dd>{safety?.rough_100m_m ?? "—"} m</dd><dt>Permanent shadow distance</dt><dd>{safety?.psr_dist_km === null ? "None within 25 km" : safety?.psr_dist_km != null ? `${safety.psr_dist_km} km` : "Unavailable"}</dd></dl></details>
          <details><summary>Calculation rules</summary><p>Sunlit = terrain-visible Sun fraction × eclipse factor ≥ 0.5.</p><p>DTE = Earth elevation − terrain horizon ≥ 0°.</p><p>DSN link = DTE and at least one available station.</p><p>Live calculation: waiting for engine: explainAt.</p></details>
          <details><summary>Sources and space weather</summary><p>{site.source}</p><p>Solar radio, infrared and spectral measurements are unavailable in the supplied datasets.</p></details>
          {validation === null && <p>Validation data unavailable.</p>}
        </> : <p>Select a landing site on the Moon or in the list to open its dashboard.</p>}
      </aside>
    </div>
    <details className="command-validation"><summary>Scientific validation</summary>
      {validation ? <table><thead><tr><th>Check</th><th>Result</th><th>Tolerance</th><th>Status</th></tr></thead><tbody>{validation.checks.map(check => <tr key={check.name}><th scope="row">{check.name}<small>{check.detail}</small></th><td>{check.result}</td><td>{check.limit}</td><td>{check.pass === true ? "Pass" : check.pass === false ? "Review" : "Informational"}</td></tr>)}</tbody></table> : <p>{validation === null ? "Validation data unavailable." : "Loading validation…"}</p>}
    </details>
  </section>;
}




