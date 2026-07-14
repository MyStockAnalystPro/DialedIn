/* ==========================================================
   sticky.js — floating sticky notes overlay. Drag anywhere,
   recolor, minimize; persisted in localStorage. A lightweight
   "always-on-top" capture tool, separate from the Notes app.
   ========================================================== */
"use strict";

const Sticky = (() => {
  const { el, esc } = UI;
  const COLORS = ["#f5d90a", "#f5a524", "#46a758", "#5e6ad2", "#e879f9", "#e5484d"];
  let layer = null;

  function ensureState() { if (!Store.s.stickies) Store.s.stickies = []; }

  function init() {
    ensureState();
    layer = document.getElementById("sticky-layer");
    if (!layer) { layer = el("div", "", ""); layer.id = "sticky-layer"; document.body.appendChild(layer); }
    renderAll();
  }

  function renderAll() {
    if (!layer) return;
    layer.innerHTML = "";
    Store.s.stickies.forEach(s => layer.appendChild(noteEl(s)));
  }

  function add() {
    ensureState();
    const n = {
      id: "sk" + Date.now(),
      text: "",
      x: 90 + Math.round(Math.random() * 120),
      y: 90 + Math.round(Math.random() * 80),
      color: COLORS[Store.s.stickies.length % COLORS.length],
      min: false,
    };
    Store.s.stickies.push(n);
    Store.save();
    if (layer) layer.appendChild(noteEl(n));
    setTimeout(() => { const ta = document.querySelector(`[data-sk="${n.id}"] textarea`); ta && ta.focus(); }, 20);
    UI.toast("🗒️ Sticky note added — drag it anywhere.");
  }

  function noteEl(s) {
    const d = el("div", "sticky-note" + (s.min ? " min" : ""));
    d.dataset.sk = s.id;
    d.style.left = s.x + "px"; d.style.top = s.y + "px";
    d.style.setProperty("--sk", s.color);
    d.innerHTML = `
      <div class="sticky-head">
        <button class="sticky-color" title="Color"></button>
        <span class="spacer"></span>
        <button class="sticky-min" title="Minimize">${s.min ? "▢" : "—"}</button>
        <button class="sticky-close" title="Close">✕</button>
      </div>
      <div class="sticky-swatches hidden">${COLORS.map(c => `<button data-c="${c}" style="background:${c}"></button>`).join("")}</div>
      <textarea placeholder="Quick note…">${esc(s.text)}</textarea>`;

    const head = d.querySelector(".sticky-head");
    head.addEventListener("mousedown", e => {
      if (e.target.closest("button")) return;
      const sx = e.clientX, sy = e.clientY, ox = s.x, oy = s.y;
      const move = ev => { s.x = Math.max(0, ox + ev.clientX - sx); s.y = Math.max(0, oy + ev.clientY - sy); d.style.left = s.x + "px"; d.style.top = s.y + "px"; };
      const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); Store.save(); };
      window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    });
    const ta = d.querySelector("textarea");
    ta.oninput = () => { s.text = ta.value; Store.save(); };
    d.querySelector(".sticky-close").onclick = () => { Store.s.stickies = Store.s.stickies.filter(x => x.id !== s.id); Store.save(); d.remove(); };
    d.querySelector(".sticky-min").onclick = () => { s.min = !s.min; Store.save(); d.classList.toggle("min", s.min); d.querySelector(".sticky-min").textContent = s.min ? "▢" : "—"; };
    const swatches = d.querySelector(".sticky-swatches");
    d.querySelector(".sticky-color").onclick = () => swatches.classList.toggle("hidden");
    swatches.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { s.color = b.dataset.c; d.style.setProperty("--sk", s.color); swatches.classList.add("hidden"); Store.save(); });
    return d;
  }

  return { init, add, renderAll };
})();
