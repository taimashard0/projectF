import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { MissionProvider, useMission } from "./context/MissionContext";
import { dataBounds, initialPeriod, sampleRange, shiftUtcMonths, zoomPeriod, DAY_MS } from "./lib/timeline";
import type { Period, Zoom } from "./lib/timeline";
import { buildSeries } from "./lib/windows";
import type { Thresholds } from "./lib/windows";
import { TerrainBadge, TimelineView } from "./views/TimelineView";
import CommandMap from "./map/CommandMap";
import LunarScene from "./map/LunarScene";
import "./App.css";

function inputTime(ms: number): string { return new Date(ms).toISOString().slice(0, 16); }
function MissionBrowser() {
  const mission = useMission();
  const { ephem, sites, horizons } = mission;
  const bounds = dataBounds(ephem);
  const [period, setPeriod] = useState(() => initialPeriod(ephem, Date.now()));
  const [zoom, setZoom] = useState<Zoom>("year");
  const [selected, setSelected] = useState(() => sites.filter(s => ["im2", "shackleton-rim", "haworth"].includes(s.id)).map(s => s.id));
  const [siteId, setSiteId] = useState<string>();
  const [comparison, setComparison] = useState(false);
  const [thresholds, setThresholds] = useState<Thresholds>({ sunFractionMin: 0.5, earthMarginDeg: 0 });
  const [startInput, setStartInput] = useState(() => inputTime(period.startMs));
  const [endInput, setEndInput] = useState(() => inputTime(period.endMs));
  const [sunInput, setSunInput] = useState("0.5");
  const [marginInput, setMarginInput] = useState("0");
  const [error, setError] = useState("");
  const activeSite = sites.find(site => site.id === siteId);
  const activeIds = useMemo(() => comparison ? selected : siteId ? [siteId] : [], [comparison, selected, siteId]);
  const tracks = useMemo(() => sites.filter(s => activeIds.includes(s.id)).map(site => ({ site, horizon: horizons.get(site.id)!, tracks: mission.tracksFor(site) })), [sites, activeIds, horizons, mission]);
  const analyses = useMemo(() => tracks.map(a => ({ ...a, series: buildSeries(a.tracks, a.horizon, thresholds) })), [tracks, thresholds]);
  function updatePeriod(next: Period) {
    setPeriod(next); setStartInput(inputTime(next.startMs)); setEndInput(inputTime(next.endMs)); setError("");
  }
  function changeZoom(next: Zoom) { setZoom(next); updatePeriod(zoomPeriod(period.startMs, next, ephem)); }
  function move(direction: -1 | 1) {
    const start = zoom === "day" ? period.startMs + direction * DAY_MS : shiftUtcMonths(period.startMs, direction * (zoom === "year" ? 12 : 1));
    updatePeriod(zoomPeriod(start, zoom, ephem));
  }
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { startMs: Date.parse(`${startInput}Z`), endMs: Date.parse(`${endInput}Z`) };
    const fraction = Number(sunInput);
    const margin = Number(marginInput);
    if (!Number.isFinite(next.startMs) || !Number.isFinite(next.endMs) || next.startMs < bounds.startMs || next.endMs > bounds.endMs || next.startMs >= next.endMs) {
      setError("Choose a valid UTC period inside the data range, with the end after the start. The chart still shows the last applied period."); return;
    }
    const [i0, i1] = sampleRange(ephem, next);
    if (i1 <= i0) { setError("This period contains no ephemeris samples. Expand it to include a sample."); return; }
    if (sunInput.trim() === "" || marginInput.trim() === "" || !Number.isFinite(fraction) || fraction < 0 || fraction > 1 || !Number.isFinite(margin)) {
      setError("Set a Sun-disk fraction from 0 to 1 and a finite Earth margin in degrees."); return;
    }
    setThresholds({ sunFractionMin: fraction, earthMarginDeg: margin }); updatePeriod(next);
  }
  const pending = startInput !== inputTime(period.startMs) || endInput !== inputTime(period.endMs) || Number(sunInput) !== thresholds.sunFractionMin || Number(marginInput) !== thresholds.earthMarginDeg;
  return <>
    <header className="topbar"><a href="#main" className="brand"><span className="orbit-mark" aria-hidden="true">◒</span><span>CLPS<span className="brand-sub">LUNAR MISSION BROWSER</span></span></a><span className="top-meta">THE FANTASTIC FOUR <span className="separator">/</span> SPACE APPS 2026</span></header>
    <main id="main">
      <CommandMap id={siteId} onSelect={id => { setSiteId(id); setComparison(false); }} />
      <div className="analysis-navigation">
        <button className="text-button" aria-pressed={!comparison} onClick={() => setComparison(false)}>Site dashboard</button>
        <button className="text-button" aria-pressed={comparison} onClick={() => setComparison(true)}>Compare sites</button>
      </div>
      {(comparison || activeSite) && <section className="mission-analysis" aria-label={comparison ? "Compare sites" : activeSite!.name + " dashboard"}>
      <h2>{comparison ? "Compare mission conditions" : activeSite!.name + " dashboard"}</h2>
      <div className="demo-notice"><span aria-hidden="true">◈</span><p><strong>Terrain horizons use LOLA elevation data.</strong> Each site shows its terrain status. A site with no terrain file uses a flat 0° horizon.</p></div>
      <section className="panel controls-panel" aria-labelledby="settings-heading">
        <div className="panel-heading"><div><p className="eyebrow">SET YOUR COMPARISON</p><h2 id="settings-heading">Where & when</h2></div>{comparison && <span className="subtle">{selected.length} sites selected</span>}</div>
        {comparison && <fieldset className="site-picker"><legend>Landing sites</legend>{sites.map(site => <label className={`site-choice ${selected.includes(site.id) ? "chosen" : ""}`} key={site.id}><input type="checkbox" checked={selected.includes(site.id)} onChange={() => setSelected(ids => ids.includes(site.id) ? ids.filter(id => id !== site.id) : [...ids, site.id])} /><span>{site.name}<TerrainBadge horizon={horizons.get(site.id)!} /></span></label>)}</fieldset>}
        <form onSubmit={apply} noValidate><div className="control-grid"><label>Period start (UTC)<input type="datetime-local" value={startInput} min={inputTime(bounds.startMs)} max={inputTime(bounds.endMs - ephem.stepMs)} step={ephem.stepMs / 1000} onChange={e => setStartInput(e.target.value)} required /></label><label>Period end (UTC, exclusive)<input type="datetime-local" value={endInput} min={inputTime(bounds.startMs + ephem.stepMs)} max={inputTime(bounds.endMs)} step={ephem.stepMs / 1000} onChange={e => setEndInput(e.target.value)} required /></label><label>Sun-disk fraction minimum (0–1)<input type="number" value={sunInput} min="0" max="1" step="any" onChange={e => setSunInput(e.target.value)} required /></label><label>Earth clearance margin (°)<input type="number" value={marginInput} step="any" onChange={e => setMarginInput(e.target.value)} required /></label></div><div className="form-bottom"><p>{pending ? "Settings changed. Update the comparison to apply them." : "All times are UTC. Local time appears in the sample details."}</p><button type="submit" className="primary">Update comparison <span aria-hidden="true">↗</span></button></div>{error && <p className="form-error" role="alert">{error}</p>}</form>
      </section>
      <div className="view-toolbar"><div className="segmented" role="group" aria-label="Timeline zoom">{(["year", "month", "day"] as const).map(level => <button key={level} aria-pressed={zoom === level} onClick={() => changeZoom(level)}>{level[0]!.toUpperCase() + level.slice(1)}</button>)}</div><div className="period-navigation"><button aria-label={`Previous ${zoom}`} disabled={period.startMs <= bounds.startMs} onClick={() => move(-1)}>←</button><span>{inputTime(period.startMs).replace("T", " ")} → {inputTime(period.endMs).replace("T", " ")} UTC</span><button aria-label={`Next ${zoom}`} disabled={period.endMs >= bounds.endMs} onClick={() => move(1)}>→</button></div><button className="text-button" onClick={() => { setZoom("year"); updatePeriod(initialPeriod(ephem, Date.now())); }}>Today ↗</button></div>
      <TimelineView analyses={analyses} period={period} zoom={zoom} thresholds={thresholds} />
      </section>}
      <footer><p>CLPS LUNAR MISSION BROWSER <span>/</span> THE FANTASTIC FOUR</p><p>Geometry: MOON_ME · planetocentric latitude · east-positive longitude<br />Sun disk radius: 0.267° · reference Moon radius: 1737.4 km</p><p className="time-note">{ephem.meta.time_note}</p></footer>
    </main>
  </>;
}
const noSites: [] = [];
const noop = () => {};

export default function App() {
  const [exploring, setExploring] = useState(false);
  const experience = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (exploring) experience.current?.focus();
  }, [exploring]);

  return exploring ? <div ref={experience} tabIndex={-1} className="exploration-entry">
    <MissionProvider><MissionBrowser /></MissionProvider>
  </div> : <main className="lunar-landing">
    <div className="landing-scene" aria-hidden="true">
      <LunarScene mode="globe" cinematic sites={noSites} select={noop} openPole={noop} />
    </div>
    <div className="landing-sun" aria-hidden="true" />
    <div className="landing-content">
      <p className="eyebrow">CLPS / LUNAR SOUTH POLE</p>
      <h1>Lunar Mission<br />Browser</h1>
      <p>Explore lunar landing sites and evaluate sunlight, terrain horizons, and direct-to-Earth communications for your mission.</p>
      <button className="primary" onClick={() => setExploring(true)}>Start Exploring <span aria-hidden="true">↗</span></button>
    </div>
    <a className="landing-credit" href="https://svs.gsfc.nasa.gov/4720/">Moon imagery · NASA SVS / LRO / LROC</a>
  </main>;
}
