/* ==========================================================
   district.js — 3D "Digital District" growth simulator (Three.js).
   Focus builds the city: 25 min lights a neon hub, 2 h raises a
   skyscraper. Broken (stopped-early) sessions rust sectors offline.
   Cyberpunk palette, OrbitControls (pan/zoom/rotate), + a low-poly
   dog mascot that replaces the old spinning UI gear.
   ========================================================== */
"use strict";

const District = (() => {
  const { $, el } = UI;

  const GRID = 8;           // 8×8 = 64 sectors
  const SECTOR_CAP = 120;   // minutes to fully raise a sector into a skyscraper
  const SPACING = 3.2;

  let THREE = null, OrbitControls = null, loaded = false, loading = false;
  let renderer = null, scene = null, camera = null, controls = null, raf = null;
  let dog = null, clock0 = 0, neonLights = [];

  async function ensureThree() {
    if (loaded) return true;
    if (loading) return false;
    loading = true;
    try {
      THREE = await import("three");
      const mod = await import("three/addons/controls/OrbitControls.js");
      OrbitControls = mod.OrbitControls;
      loaded = true;
    } catch (e) {
      console.error("District: failed to load Three.js", e);
      loaded = false;
    }
    loading = false;
    return loaded;
  }

  // Distributes cumulative focus minutes across sectors (cap each), so the city grows outward as
  // total focus climbs. Broken sessions rust the most-recently-developed sectors offline.
  function districtStats() {
    const total = Math.floor(Store.s.totalFocusMin || 0);
    const broken = (Store.s.sessionLog || []).filter(s => !s.completed && !s.missed).length;
    const count = GRID * GRID;
    const sectors = [];
    let remaining = total;
    for (let i = 0; i < count; i++) { const m = Math.max(0, Math.min(SECTOR_CAP, remaining)); remaining -= m; sectors.push(m); }
    const developed = sectors.map((m, i) => ({ m, i })).filter(x => x.m > 0);
    // Rust the oldest sectors, but cap it so a stretch of broken sessions never wipes the whole
    // city — the growth you earned always stays visible alongside the offline (rusted) blocks.
    const rustCount = Math.min(broken, Math.max(0, Math.floor(developed.length * 0.4)));
    const rusted = new Set(rustCount > 0 ? developed.slice(0, rustCount).map(x => x.i) : []);
    const hubs = sectors.filter((m, i) => m >= 25 && m < SECTOR_CAP && !rusted.has(i)).length;
    const skyscrapers = sectors.filter((m, i) => m >= SECTOR_CAP && !rusted.has(i)).length;
    return { total, broken, sectors, rusted, hubs, skyscrapers };
  }
  function stageFor(m) { return m <= 0 ? "empty" : m < 25 ? "plot" : m < SECTOR_CAP ? "hub" : "sky"; }

  const NEON = ["#22d3ee", "#e879f9", "#8b5cf6", "#5e6ad2", "#38bdf8"];

  function buildScene(host) {
    teardown();
    const w = host.clientWidth, h = host.clientHeight || 460;
    scene = new THREE.Scene();
    scene.background = new THREE.Color("#08080d");
    scene.fog = new THREE.Fog("#08080d", 22, 60);

    camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 200);
    camera.position.set(18, 16, 20);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    host.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 6;
    controls.maxDistance = 70;
    controls.target.set(0, 1, 0);

    // lights
    scene.add(new THREE.AmbientLight("#2a2a45", 1.1));
    const dir = new THREE.DirectionalLight("#8b9bff", 0.6);
    dir.position.set(10, 20, 8);
    scene.add(dir);
    neonLights = [];
    [["#22d3ee", -10, -10], ["#e879f9", 10, 10], ["#8b5cf6", 10, -10]].forEach(([c, x, z]) => {
      const p = new THREE.PointLight(c, 0.9, 60);
      p.position.set(x, 9, z);
      scene.add(p); neonLights.push(p);
    });

    // ground + neon grid
    const groundSize = GRID * SPACING + 6;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundSize, groundSize),
      new THREE.MeshStandardMaterial({ color: "#0c0c16", metalness: 0.4, roughness: 0.8 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    scene.add(ground);
    const grid = new THREE.GridHelper(groundSize, GRID + 2, "#3b3b7a", "#191933");
    grid.position.y = 0;
    scene.add(grid);

    // sectors
    const stats = districtStats();
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    stats.sectors.forEach((mins, i) => {
      const row = Math.floor(i / GRID), col = i % GRID;
      const x = (col - (GRID - 1) / 2) * SPACING;
      const z = (row - (GRID - 1) / 2) * SPACING;
      const stage = stageFor(mins);
      const isRusted = stats.rusted.has(i);
      if (stage === "empty") return;
      const neon = NEON[(row * 3 + col) % NEON.length];

      if (stage === "plot") {
        const m = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: isRusted ? "#3d2a17" : "#1b1b30", emissive: isRusted ? "#b45309" : neon, emissiveIntensity: isRusted ? 0.18 : 0.12, metalness: 0.5, roughness: 0.6 }));
        m.scale.set(1.9, 0.35, 1.9); m.position.set(x, 0.17, z);
        scene.add(m);
        return;
      }
      // hub / skyscraper share a tower; skyscrapers are much taller with a beacon
      const t = Math.min(1, (mins - 25) / (SECTOR_CAP - 25));
      const height = stage === "sky" ? 6.5 + t * 3 : 1.2 + t * 2.2;
      const tower = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({
        color: isRusted ? "#3d2a17" : "#12122a",
        emissive: isRusted ? "#b45309" : neon,
        emissiveIntensity: isRusted ? 0.3 : (stage === "sky" ? 0.9 : 0.55),
        metalness: isRusted ? 0.35 : 0.75, roughness: isRusted ? 0.85 : 0.25,
      }));
      tower.scale.set(1.5, height, 1.5);
      tower.position.set(x, height / 2, z);
      scene.add(tower);

      // neon top ring / beacon
      if (!isRusted) {
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(stage === "sky" ? 0.42 : 0.28, 12, 12),
          new THREE.MeshBasicMaterial({ color: neon })
        );
        beacon.position.set(x, height + 0.4, z);
        scene.add(beacon);
      } else {
        // rusted = offline: a dim amber cap, clearly "powered down" but still visible
        const cap = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: "#5a3a1a", emissive: "#7c3a09", emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.9 }));
        cap.scale.set(1.7, 0.2, 1.7); cap.position.set(x, height + 0.12, z);
        scene.add(cap);
      }
    });

    // dog mascot on a central pad
    dog = buildDog(neon => NEON[0]);
    dog.position.set(0, 0.3, 0);
    scene.add(dog);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.3, 24), new THREE.MeshStandardMaterial({ color: "#141427", emissive: "#22d3ee", emissiveIntensity: 0.25, metalness: 0.6, roughness: 0.4 }));
    pad.position.set(0, 0.15, 0);
    scene.add(pad);

    clock0 = performance.now();
    startLoop(host);
  }

  // Low-poly dog built from primitives (no external asset needed) — the mascot that replaces the
  // old spinning gear. Amber body, floppy ears, wagging tail.
  function buildDog(colorFn) {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: "#d9863b", metalness: 0.2, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: "#8a4b1e", metalness: 0.2, roughness: 0.8 });
    const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
    box(1.4, 0.8, 0.8, body, 0, 0.9, 0);            // torso
    const head = box(0.7, 0.7, 0.7, body, 0.9, 1.15, 0); // head
    box(0.35, 0.35, 0.2, dark, 1.25, 1.05, 0);       // snout
    box(0.16, 0.3, 0.06, dark, 0.75, 1.55, 0.22);    // ear L
    box(0.16, 0.3, 0.06, dark, 0.75, 1.55, -0.22);   // ear R
    // legs
    [[-0.5, 0.32], [0.5, 0.32], [-0.5, -0.32], [0.5, -0.32]].forEach(([x, z]) => box(0.22, 0.6, 0.22, dark, x, 0.35, z));
    // tail (wags)
    const tail = box(0.5, 0.16, 0.16, body, -0.85, 1.05, 0);
    g.userData.tail = tail; g.userData.head = head;
    g.scale.set(0.9, 0.9, 0.9);
    return g;
  }

  function startLoop(host) {
    cancelAnimationFrame(raf);
    const onResize = () => {
      if (!renderer) return;
      const w = host.clientWidth, h = host.clientHeight || 460;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);
    const loop = () => {
      const view = $("#view-district");
      if (!renderer || !host.isConnected || !view || !view.classList.contains("active")) {
        window.removeEventListener("resize", onResize);
        return; // stop rendering when the view is left; render() rebuilds on return
      }
      const t = (performance.now() - clock0) / 1000;
      if (dog) {
        dog.position.y = 0.3 + Math.sin(t * 2) * 0.06;
        dog.rotation.y = Math.sin(t * 0.4) * 0.5;
        if (dog.userData.tail) dog.userData.tail.rotation.y = Math.sin(t * 8) * 0.6;
        if (dog.userData.head) dog.userData.head.rotation.z = Math.sin(t * 1.5) * 0.08;
      }
      neonLights.forEach((p, i) => { p.intensity = 0.7 + Math.sin(t * 1.5 + i) * 0.25; });
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function teardown() {
    cancelAnimationFrame(raf); raf = null;
    if (renderer) {
      renderer.dispose();
      renderer.domElement?.remove();
      renderer = null;
    }
    scene = null; camera = null; controls = null; dog = null; neonLights = [];
  }

  function render() {
    const v = $("#view-district");
    const stats = districtStats();
    v.innerHTML = `
      <div class="district-wrap">
        <div id="district-canvas-host" class="district-canvas-host"></div>
        <div class="district-hud">
          <div class="district-hud-title">⬢ Your Focus District</div>
          <div class="district-hud-stat"><span>Total focus</span><b>${Math.floor(stats.total / 60)}h ${stats.total % 60}m</b></div>
          <div class="district-hud-stat"><span>Neon hubs (≥25m)</span><b>${stats.hubs}</b></div>
          <div class="district-hud-stat"><span>Skyscrapers (≥2h)</span><b>${stats.skyscrapers}</b></div>
          <div class="district-hud-stat"><span>Rusted / offline</span><b class="${stats.broken ? "district-rust" : ""}">${stats.rusted.size}</b></div>
          <div class="district-hud-legend">
            <span><i style="background:#22d3ee"></i> hub · 25m</span>
            <span><i style="background:#8b5cf6"></i> skyscraper · 2h</span>
            <span><i style="background:#7a5030"></i> rusted (stopped-early session)</span>
          </div>
          <button class="btn sm" id="district-reset-cam">Reset camera</button>
          <div class="district-hud-hint">Drag to rotate · scroll to zoom · right-drag to pan</div>
        </div>
        <div id="district-loading" class="district-loading">Loading 3D engine…</div>
      </div>`;

    const host = $("#district-canvas-host");
    ensureThree().then(ok => {
      const loadEl = $("#district-loading");
      if (!ok) {
        if (loadEl) loadEl.innerHTML = "Couldn't load the 3D engine (needs internet for the Three.js CDN). Your focus totals are safe — reopen this tab when you're online.";
        return;
      }
      if (loadEl) loadEl.remove();
      buildScene(host);
      const resetBtn = $("#district-reset-cam");
      if (resetBtn) resetBtn.onclick = () => { if (camera && controls) { camera.position.set(18, 16, 20); controls.target.set(0, 1, 0); controls.update(); } };
    });
  }

  return { render };
})();
