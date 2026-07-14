/* ==========================================================
   sessions.js — focus session history + distraction log,
   plus manual "log missed focus time I forgot to record"
   ========================================================== */
"use strict";

const Sessions = (() => {
  const { $, el, esc, toast, modal } = UI;

  function fmtDuration(mins) {
    mins = Math.round(mins);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }
  function fmtPause(ms) {
    const s = Math.round((ms || 0) / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  // Credits a chunk of (possibly past) focus time into the same stores the live timer feeds, so
  // the District, heatmap and totals all reflect focus you forgot to log.
  function creditMissedFocus(mins, dateStr) {
    const d = new Date((dateStr || Store.todayStr()) + "T12:00:00");
    const ts = d.getTime();
    Store.s.totalFocusMin += mins;
    const day = Store.day(dateStr || Store.todayStr());
    day.focusMin += mins;
    Store.s.focusLog.push({ ts, mins, skill: null, taskId: null, hour: d.getHours(), missed: true });
    Store.save();
    if (window.UI) UI.refreshChips && UI.refreshChips();
  }

  function logMissedModal() {
    modal("🕓 Log missed focus time", `
      <p class="muted" style="font-size:.82rem;margin-bottom:10px">Forgot to run the timer? Add the focus you actually did — it counts toward your totals, heatmap and District.</p>
      <label class="field"><span>What were you working on?</span><input type="text" id="ms-title" placeholder="e.g. Studied biology"></label>
      <div class="grid-2">
        <label class="field"><span>Minutes focused</span><input type="number" id="ms-min" min="1" max="1440" value="25"></label>
        <label class="field"><span>Date</span><input type="date" id="ms-date" value="${Store.todayStr()}"></label>
      </div>`,
      [
        { label: "Cancel" },
        { label: "＋ Log it", cls: "primary", onClick: m => {
          const title = m.querySelector("#ms-title").value.trim() || ("Untitled #" + (Store.s.sessionSeq || 1));
          if (!m.querySelector("#ms-title").value.trim()) Store.s.sessionSeq = (Store.s.sessionSeq || 1) + 1;
          const mins = Math.max(1, Math.min(1440, parseInt(m.querySelector("#ms-min").value, 10) || 25));
          const dateStr = m.querySelector("#ms-date").value || Store.todayStr();
          const start = new Date(dateStr + "T12:00:00").getTime();
          (Store.s.sessionLog = Store.s.sessionLog || []).push({
            id: "se" + Date.now() + Math.floor(Math.random() * 1000),
            title, mode: "manual", start, end: start + mins * 60000, focusMin: mins, pauseMs: 0, completed: true, missed: true,
          });
          creditMissedFocus(mins, dateStr);
          toast(`🕓 Logged ${fmtDuration(mins)} of focus for ${dateStr}`, "xp");
          render();
        }},
      ]);
  }

  function render() {
    const v = $("#view-sessions");
    const log = (Store.s.sessionLog || []).slice().reverse();
    const distractions = (Store.s.distractionLog || []).slice().reverse();
    const totalMin = (Store.s.sessionLog || []).reduce((a, s) => a + (s.focusMin || 0), 0);

    v.innerHTML = `
      <div class="card">
        <h2>🗂️ Focus Session History
          <span class="spacer"></span>
          <button class="btn sm primary" id="ss-log-missed">＋ Log missed focus time</button>
        </h2>
        <div class="card-sub">Every focus session, with its title (default <code>Untitled #</code>), how long you focused, and total paused time. You can also log focus you forgot to record.</div>
        <div class="stat-line"><span>Sessions logged</span><b>${(Store.s.sessionLog || []).length}</b></div>
        <div class="stat-line"><span>Total focus across sessions</span><b>${fmtDuration(totalMin)}</b></div>
        <div class="ss-list">
          ${log.length ? log.map(s => `
            <div class="ss-row">
              <span class="ss-title">${esc(s.title || "Untitled")}</span>
              <span class="ss-tags">
                ${s.missed ? `<span class="tag">logged later</span>` : `<span class="tag">${esc(s.mode || "focus")}</span>`}
                ${s.completed ? `<span class="tag ss-ok">completed</span>` : `<span class="tag ss-miss">stopped early</span>`}
              </span>
              <span class="ss-meta">${new Date(s.start).toLocaleDateString()} · <b>${fmtDuration(s.focusMin || 0)}</b> focus${s.pauseMs ? ` · paused ${fmtPause(s.pauseMs)}` : ""}</span>
            </div>`).join("") : `<div class="tl-empty">No sessions yet — start the Pulse timer on the Dashboard, or log missed focus above.</div>`}
        </div>
      </div>

      <div class="card">
        <h2>🫠 Distraction Log <span class="spacer"></span><span class="muted" style="font-size:.72rem">auto-categorized</span></h2>
        <div class="card-sub">What pulled you away, saved long-term and sorted into themes. Full theme breakdown lives in Analytics → "View your main avoidance reasons".</div>
        <div class="ss-list">
          ${distractions.length ? distractions.slice(0, 60).map(dz => {
            const cat = Analytics.categorize(dz.reason);
            return `<div class="ss-row">
              <span class="ss-title">${esc(dz.reason)}</span>
              <span class="ss-tags"><span class="tag">${cat.emoji} ${esc(dz.categoryLabel || cat.label)}</span></span>
              <span class="ss-meta">${new Date(dz.ts).toLocaleString()}${dz.taskTitle ? ` · ${esc(dz.taskTitle)}` : ""}</span>
            </div>`;
          }).join("") : `<div class="tl-empty">No distractions logged. When you hit "I got distracted", your reason lands here.</div>`}
        </div>
      </div>`;

    $("#ss-log-missed").onclick = logMissedModal;
  }

  return { render, logMissedModal, creditMissedFocus };
})();
