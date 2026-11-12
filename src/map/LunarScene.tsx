import { useEffect, useRef, useState } from "react";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { polar } from "./projection";
import type { Site } from "../lib/types";

type Bounds = { x_min: number; x_max: number; y_min: number; y_max: number };
type Grid = Bounds & { nx: number; ny: number; step_m: number; cell_index: number[]; elev_m: number[] };
type Region = { outline: [number, number][][] };
type Props = { mode: "globe" | "pole"; sites: Site[]; selected?: string; select: (id: string) => void;
  cinematic?: boolean;
  focus?: { id: string }; openPole: () => void;
  grid?: Grid | null; base?: Bounds | null; regions?: Region[]; heat?: string; opacity?: number;
  terrain?: boolean; exaggeration?: number; onMissing?: (file: string) => void };
const asset = (file: string) => import.meta.env.BASE_URL + file;

function height(grid: Grid, x: number, y: number) {
  const col = (x - grid.x_min) / grid.step_m - 0.5;
  const row = (grid.y_max - y) / grid.step_m - 0.5;
  let total = 0;
  let weight = 0;
  for (const r of [Math.floor(row), Math.floor(row) + 1]) {
    for (const c of [Math.floor(col), Math.floor(col) + 1]) {
      if (r < 0 || r >= grid.ny || c < 0 || c >= grid.nx) continue;
      const index = grid.cell_index[r * grid.nx + c];
      if (index == null || index < 0) continue;
      const w = (1 - Math.abs(row - r)) * (1 - Math.abs(col - c));
      total += w * grid.elev_m[index]!;
      weight += w;
    }
  }
  return weight ? total / weight : 0;
}

export default function LunarScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  const update = useRef<() => void>(() => {});
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    current.current = props;
    update.current();
  }, [props]);
  const { mode, cinematic } = props;

  useEffect(() => {
    const element = host.current!;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: cinematic });
    } catch {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor("#080b14", cinematic ? 0 : 1);
    element.append(renderer.domElement);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(38, 1, 0.01, 30);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enabled = !cinematic;
    controls.minDistance = mode === "globe" ? 1.45 : 0.19;
    controls.maxDistance = 8;
    if (mode === "globe") camera.position.set(0, cinematic ? 0.2 : -2.75, cinematic ? 3.45 : 2.55);
    else {
      camera.position.set(0, 1.65, 2.35);
      controls.maxPolarAngle = Math.PI * 0.48;
    }
    controls.update();
    scene.add(new T.HemisphereLight(0xffffff, 0x646778, cinematic ? 0.25 : 1.25));
    const light = new T.DirectionalLight(0xffffff, 2.25);
    light.position.set(cinematic ? 5 : -3, 4, 5);
    scene.add(light);

    const geometry = mode === "globe" ? new T.SphereGeometry(1, 96, 64) : new T.PlaneGeometry(2, 2, 144, 144);
    if (mode === "pole") geometry.rotateX(-Math.PI / 2);
    const material = new T.MeshStandardMaterial({ roughness: 1 });
    const surface = new T.Mesh(geometry, material);
    if (mode === "globe") surface.rotation.y = -Math.PI / 2;
    scene.add(surface);
    const ringGeometry = new T.RingGeometry(0.102, 0.117, 64);
    ringGeometry.rotateX(Math.PI / 2);
    const ringMaterial = new T.MeshBasicMaterial({ color: "#f5b83d", side: T.DoubleSide });
    const ring = new T.Mesh(ringGeometry, ringMaterial);
    ring.position.y = -1.005;
    if (mode === "globe" && !cinematic) scene.add(ring);
    let lastFocus: Props["focus"];
    let flight = 0;
    let drift = 0;
    if (cinematic && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const start = performance.now();
      function rotate(now: number) {
        surface.rotation.y = -Math.PI / 2 + (now - start) * 0.000025;
        render();
        drift = requestAnimationFrame(rotate);
      }
      drift = requestAnimationFrame(rotate);
    }

    function flyTo(target: T.Vector3, destination: T.Vector3) {
      cancelAnimationFrame(flight);
      const from = camera.position.clone();
      const fromTarget = controls.target.clone();
      const start = performance.now();
      const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650;
      function step(now: number) {
        const progress = duration ? Math.min((now - start) / duration, 1) : 1;
        const eased = 1 - (1 - progress) ** 3;
        camera.position.lerpVectors(from, destination, eased);
        controls.target.lerpVectors(fromTarget, target, eased);
        controls.update();
        render();
        if (progress < 1) flight = requestAnimationFrame(step);
      }
      flight = requestAnimationFrame(step);
    }

    const pins = new T.Group();
    scene.add(pins);
    const pinShape = new T.SphereGeometry(mode === "globe" ? 0.009 : 0.019, 12, 8);
    const normalPin = new T.MeshBasicMaterial({ color: "#dcecff" });
    const selectedPin = new T.MeshBasicMaterial({ color: "#f5b83d" });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext("2d")!;
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    let disposed = false;
    const images = new Map<string, HTMLImageElement>();
    const failed = new Set<string>();
    const extent = 200160;

    function render() {
      renderer.render(scene, camera);
    }

    function image(file: string) {
      if (!images.has(file)) {
        const img = new Image();
        images.set(file, img);
        img.onload = () => { if (!disposed) redraw(); };
        img.onerror = () => {
          failed.add(file);
          if (!disposed) current.current.onMissing?.(file.split("/").pop()!);
        };
        img.src = asset(file);
      }
      const img = images.get(file)!;
      return img.complete && img.naturalWidth && !failed.has(file) ? img : undefined;
    }

    function drawLayer(file: string, bounds: Bounds, opacity: number) {
      const img = image(file);
      if (!img) return;
      const scale = canvas.width / (2 * extent);
      ctx.globalAlpha = opacity;
      ctx.drawImage(img, (bounds.x_min + extent) * scale, (extent - bounds.y_max) * scale,
        (bounds.x_max - bounds.x_min) * scale, (bounds.y_max - bounds.y_min) * scale);
      ctx.globalAlpha = 1;
    }

    function relief(x: number, y: number) {
      const { grid, exaggeration, terrain } = current.current;
      return grid && terrain ? height(grid, x * extent, y * extent) * (exaggeration ?? 2) / extent : 0;
    }

    let previousGrid: Grid | null | undefined;
    let previousExaggeration: number | undefined;
    let previousTerrain: boolean | undefined;
    function redraw() {
      const p = current.current;
      if (mode === "pole") {
        if (p.grid !== previousGrid || p.exaggeration !== previousExaggeration || p.terrain !== previousTerrain) {
          const vertices = geometry.attributes.position!;
          for (let i = 0; i < vertices.count; i++) vertices.setY(i, relief(vertices.getX(i), -vertices.getZ(i)));
          vertices.needsUpdate = true;
          geometry.computeVertexNormals();
          previousGrid = p.grid;
          previousExaggeration = p.exaggeration;
          previousTerrain = p.terrain;
        }
        ctx.fillStyle = p.terrain ? "#525762" : "#151e2d";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (p.terrain && p.base) drawLayer("data/basemap.png", p.base, 1);
        if (p.heat && p.grid) drawLayer("data/" + p.heat, p.grid, p.opacity ?? 1);
        ctx.strokeStyle = "#91bcff";
        ctx.lineWidth = 2;
        for (const region of p.regions ?? []) {
          for (const ring of region.outline) {
            ctx.beginPath();
            ring.forEach(([lat, lon], i) => {
              const [x, y] = polar(lat, lon);
              const px = (x! / extent + 1) * canvas.width / 2;
              const py = (y! / extent + 1) * canvas.height / 2;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.closePath();
            ctx.stroke();
          }
        }
        texture.needsUpdate = true;
      }
      pins.clear();
      for (const site of p.sites) {
        const pin = new T.Mesh(pinShape, site.id === p.selected ? selectedPin : normalPin);
        pin.userData.id = site.id;
        if (mode === "pole") {
          const [x, y] = polar(site.lat, site.lon);
          const px = x! / extent;
          const pz = y! / extent;
          pin.position.set(px, relief(px, -pz) + 0.019, pz);
        } else {
          const lat = T.MathUtils.degToRad(site.lat);
          const lon = T.MathUtils.degToRad(site.lon);
          pin.position.set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)).multiplyScalar(1.006);
        }
        if (site.id === p.selected) pin.scale.setScalar(1.3);
        pins.add(pin);
      }
      if (mode === "pole" && p.focus && p.focus !== lastFocus) {
        lastFocus = p.focus;
        const marker = pins.children.find(pin => pin.userData.id === p.focus?.id);
        if (marker) {
          const target = marker.position.clone();
          flyTo(target, target.clone().add(new T.Vector3(0, 0.24, 0.34)));
        } else {
          flyTo(new T.Vector3(), new T.Vector3(0, 1.65, 2.35));
        }
      }
      render();
    }

    if (mode === "pole") material.map = texture;
    let moon: T.Texture | undefined;
    if (mode === "globe") {
      moon = new T.TextureLoader().load(asset("moon.jpg"), loaded => {
        if (disposed) return;
        loaded.colorSpace = T.SRGBColorSpace;
        loaded.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        material.map = loaded;
        material.needsUpdate = true;
        render();
      }, undefined, () => {
        if (!disposed) current.current.onMissing?.("moon.jpg");
      });
    }

    const resize = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = element;
      if (!clientWidth || !clientHeight) return;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
      render();
    });
    resize.observe(element);
    controls.addEventListener("change", render);
    const ray = new T.Raycaster();
    let start = new T.Vector2();
    const down = (event: PointerEvent) => { cancelAnimationFrame(flight); start = new T.Vector2(event.clientX, event.clientY); };
    const pick = (event: PointerEvent) => {
      if (start.distanceTo(new T.Vector2(event.clientX, event.clientY)) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new T.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
        1 - (event.clientY - rect.top) / rect.height * 2), camera);
      const [hit] = ray.intersectObjects(mode === "globe" ? [surface, ring, ...pins.children] : [surface, ...pins.children]);
      if (hit?.object === ring) current.current.openPole();
      if (hit?.object.userData.id) current.current.select(hit.object.userData.id as string);
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", pick);
    update.current = redraw;
    redraw();

    return () => {
      disposed = true;
      cancelAnimationFrame(drift);
      cancelAnimationFrame(flight);
      ringGeometry.dispose();
      ringMaterial.dispose();
      update.current = () => {};
      resize.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      pinShape.dispose();
      normalPin.dispose();
      selectedPin.dispose();
      texture.dispose();
      moon?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [mode, cinematic]);

  return <div ref={host} className="lunar-scene" aria-label={mode === "globe" ? "Interactive 3D Moon" : "3D south-pole terrain"}>
    {unavailable && <p>3D rendering requires WebGL. Select a landing site from the list to inspect its data.</p>}
  </div>;
}



