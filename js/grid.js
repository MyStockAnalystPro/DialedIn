/* ==========================================================
   grid.js — Excel-style data grid (Linear UI). Multiple sheets,
   editable cells, add/remove rows & columns, and lightweight
   formulas (=SUM(A1:B3), =A1+B2*2). Stored in localStorage.
   ========================================================== */
"use strict";

const Sheets = (() => {
  const { $, el, esc, toast } = UI;
  let activeId = null;

  function ensure() {
    if (!Store.s.sheets) Store.s.sheets = [];
    if (!Store.s.sheets.length) {
      Store.s.sheets.push({ id: "sh" + (Store.s.sheetSeq++), name: "Sheet 1", cols: 6, rows: 14, data: {} });
    }
    if (!activeId || !Store.s.sheets.find(s => s.id === activeId)) activeId = Store.s.sheets[0].id;
    Store.save();
  }

  const colName = c => { let s = ""; c++; while (c > 0) { const r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = Math.floor((c - 1) / 26); } return s; };
  const colIndex = name => { let c = 0; for (const ch of name.toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; };
  const key = (r, c) => `${r},${c}`;

  function rawAt(sheet, r, c) { return sheet.data[key(r, c)] || ""; }

  // Very small formula evaluator: cell refs (A1), ranges via SUM/AVG, and + - * / ( ).
  function evalCell(sheet, raw, seen) {
    if (typeof raw !== "string" || raw[0] !== "=") return raw;
    seen = seen || new Set();
    let expr = raw.slice(1);
    try {
      expr = expr.replace(/\b(SUM|AVG)\(([A-Z]+\d+):([A-Z]+\d+)\)/gi, (m, fn, a, b) => {
        const [r1, c1] = [parseInt(a.match(/\d+/)[0], 10) - 1, colIndex(a.match(/[A-Z]+/i)[0])];
        const [r2, c2] = [parseInt(b.match(/\d+/)[0], 10) - 1, colIndex(b.match(/[A-Z]+/i)[0])];
        const vals = [];
        for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
          for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++)
            vals.push(parseFloat(resolve(sheet, r, c, seen)) || 0);
        const sum = vals.reduce((a2, b2) => a2 + b2, 0);
        return fn.toUpperCase() === "AVG" ? (vals.length ? sum / vals.length : 0) : sum;
      });
      expr = expr.replace(/\b([A-Z]+)(\d+)\b/gi, (m, cn, rn) => {
        const v = resolve(sheet, parseInt(rn, 10) - 1, colIndex(cn), seen);
        return "(" + (parseFloat(v) || 0) + ")";
      });
      if (!/^[-+*/().\d\s]*$/.test(expr)) return "#ERR";
      // eslint-disable-next-line no-new-func
      const val = Function('"use strict";return (' + (expr || "0") + ")")();
      return Number.isFinite(val) ? String(Math.round(val * 1e6) / 1e6) : "#ERR";
    } catch (e) { return "#ERR"; }
  }
  function resolve(sheet, r, c, seen) {
    const k = key(r, c);
    if (seen.has(k)) return "0"; // guard against circular refs
    seen.add(k);
    const raw = rawAt(sheet, r, c);
    const out = raw && raw[0] === "=" ? evalCell(sheet, raw, seen) : raw;
    seen.delete(k);
    return out;
  }

  function render() {
    ensure();
    const v = $("#view-sheets");
    const sheet = Store.s.sheets.find(s => s.id === activeId);
    v.innerHTML = `
      <div class="card">
        <div class="canvas-tabs">
          ${Store.s.sheets.map(s => `<button class="canvas-tab ${s.id === activeId ? "active" : ""}" data-id="${s.id}"><span>${esc(s.name)}</span>${Store.s.sheets.length > 1 ? `<i class="ico tab-del" data-ico="x" data-del="${s.id}" title="Delete sheet"></i>` : ""}</button>`).join("")}
          <button class="canvas-tab-add" id="sheet-add" title="New sheet"><i class="ico" data-ico="plus"></i></button>
          <span class="spacer"></span>
          <button class="btn sm" id="sheet-addrow">＋ Row</button>
          <button class="btn sm" id="sheet-addcol">＋ Column</button>
        </div>
        <div class="card-sub">Click a cell to edit. Formulas start with <code>=</code> — try <code>=SUM(A1:A5)</code> or <code>=A1+B2*2</code>. Double-click a tab to rename.</div>
        <div class="sheet-scroll">
          <table class="sheet-table" id="sheet-table"></table>
        </div>
      </div>`;
    UI.mountIcons(v);

    const table = $("#sheet-table");
    let head = `<tr><th class="sheet-corner"></th>${Array.from({ length: sheet.cols }, (_, c) => `<th>${colName(c)}</th>`).join("")}</tr>`;
    let body = "";
    for (let r = 0; r < sheet.rows; r++) {
      body += `<tr><th class="sheet-rownum">${r + 1}</th>${Array.from({ length: sheet.cols }, (_, c) => {
        const raw = rawAt(sheet, r, c);
        const disp = raw && raw[0] === "=" ? evalCell(sheet, raw, new Set()) : raw;
        return `<td class="sheet-cell" data-r="${r}" data-c="${c}" title="${esc(raw)}"><div class="sheet-cell-view">${esc(disp)}</div></td>`;
      }).join("")}</tr>`;
    }
    table.innerHTML = head + body;

    v.querySelectorAll(".canvas-tab").forEach(tab => {
      tab.onclick = e => { if (e.target.closest("[data-del]")) return; activeId = tab.dataset.id; render(); };
      tab.ondblclick = () => {
        const s = Store.s.sheets.find(x => x.id === tab.dataset.id);
        const name = prompt("Rename sheet:", s.name);
        if (name) { s.name = name.trim() || s.name; Store.save(); render(); }
      };
    });
    v.querySelectorAll("[data-del]").forEach(x => x.onclick = e => {
      e.stopPropagation();
      if (Store.s.sheets.length <= 1) return;
      Store.s.sheets = Store.s.sheets.filter(s => s.id !== x.dataset.del);
      if (activeId === x.dataset.del) activeId = Store.s.sheets[0].id;
      Store.save(); render();
    });
    $("#sheet-add").onclick = () => { const s = { id: "sh" + (Store.s.sheetSeq++), name: "Sheet " + (Store.s.sheets.length + 1), cols: 6, rows: 14, data: {} }; Store.s.sheets.push(s); activeId = s.id; Store.save(); render(); };
    $("#sheet-addrow").onclick = () => { sheet.rows++; Store.save(); render(); };
    $("#sheet-addcol").onclick = () => { sheet.cols++; Store.save(); render(); };

    table.querySelectorAll(".sheet-cell").forEach(td => {
      td.onclick = () => startEdit(td, sheet);
    });
  }

  function startEdit(td, sheet) {
    if (td.querySelector("input")) return;
    const r = +td.dataset.r, c = +td.dataset.c;
    const raw = rawAt(sheet, r, c);
    td.innerHTML = `<input class="sheet-input" value="${esc(raw)}">`;
    const inp = td.querySelector("input");
    inp.focus(); inp.select();
    const commit = (move) => {
      sheet.data[key(r, c)] = inp.value;
      Store.save();
      render();
      if (move) {
        const nextSel = `.sheet-cell[data-r="${r + 1}"][data-c="${c}"]`;
        const next = document.querySelector(nextSel);
        if (next) startEdit(next, sheet);
      }
    };
    inp.onblur = () => commit(false);
    inp.onkeydown = e => {
      if (e.key === "Enter") { e.preventDefault(); inp.onblur = null; commit(true); }
      else if (e.key === "Escape") { inp.onblur = null; render(); }
      else if (e.key === "Tab") {
        e.preventDefault(); sheet.data[key(r, c)] = inp.value; Store.save(); render();
        const next = document.querySelector(`.sheet-cell[data-r="${r}"][data-c="${c + 1}"]`);
        if (next) startEdit(next, sheet);
      }
    };
  }

  return { render };
})();
