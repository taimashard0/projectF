# CLPS Lunar Mission Browser

Static React + TypeScript app for comparing sunlight and direct-to-Earth (DTE) visibility at lunar south-pole sites. Phase 3 includes the timeline, daily heatmap, editable thresholds, sample inspection, and period summaries. Skyline, mission window finder, polar map, and panorama are later phases.

## Run locally

From this `web` directory, run each command separately in PowerShell:

```powershell
npm install
npm run dev
```

Vite prints the preview URL. Dependencies are already installed on the development machine. No extra dependencies were added for Phase 3.

## Checks

```powershell
npx tsc -b
npx vitest run
npm run build
```

The golden tests require the real ephemeris and golden answers from the same pipeline run in `public/data/`. Do not loosen the 0.01 degree tolerance.

## Read the timeline

- The initial comparison selects `im2`, `dummy-a`, and `dummy-b`, for one calendar year from today's UTC midnight, clamped to the available data.
- Yellow is sunlight; blue is Earth contact. Each canvas pixel column averages the samples it represents. Magnified columns repeat the corresponding sample.
- Year zoom also shows Monday-first UTC calendar cells, with sunlight in each cell's upper half and DTE in its lower half. Brighter color means higher daily coverage.
- Hover or tap the charts to inspect a sample. Keyboard: left/right move one sample, up/down move one UTC day, Home/End select the first/last visible sample. Daily heatmap inspection selects the first available sample of the day. The persistent detail panel supports touch and keyboard access.
- Period ends are exclusive. Only sample timestamps inside the selected period contribute to metrics. Partial UTC days use their available samples.
- Controls apply when **Update comparison** is pressed. Invalid settings preserve the last valid comparison. Zoom and navigation change the applied period immediately.
- Sunlit means visible Sun-disk fraction meets the editable minimum (default 0.5); DTE means Earth-centre elevation minus its terrain horizon meets the editable Earth margin (default 0 degrees).
- Longest shadow and blackout runs are clipped at period edges and multiplied by the ephemeris sample duration.

## Data and provenance

The data contract and geometry conventions remain unchanged. All geometry uses MOON_ME, clockwise-from-north azimuth, planetocentric latitude, east-positive longitude, and the 1737.4 km Moon reference sphere. Site elevation is metres above that sphere.

The current ephemeris is real SPICE data. The current catalogue includes synthetic demo sites, and IM-2 coordinates remain marked to verify in the supplied source. The supplied terrain files are synthetic and visibly labelled **demo terrain**. A missing horizon uses 0 degrees and is labelled **terrain not computed**. These results do not establish validated real-terrain mission feasibility.

UTC/sample mapping follows `time_note` in `ephem.json`; the pipeline's leap-second assumption is displayed in the footer. Local time appears in inspection details.

## Static deployment (human step)

Push the repository and connect it to Vercel or GitHub Pages. Use `npm run build` and publish `dist/`. For a repository subpath on GitHub Pages, configure Vite's `base` to that subpath before building; data URLs already use `import.meta.env.BASE_URL`.

Commit `web/public/data/`. Do not commit `pipeline/kernels/` or DEM tiles. Do not change `pipeline/out/` as part of front-end development.
