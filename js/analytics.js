/* ==========================================================
   analytics.js — heatmap, energy curve, pie chart, streak
   calendar, comparisons, report card, timeline, predictions
   ========================================================== */
"use strict";

const Analytics = (() => {
  const { $, el, esc, toast } = UI;

  const cssVar = name => getComputedStyle(document.body).getPropertyValue(name).trim();

  /* ---------- helpers ---------- */
  function lastNDays(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(Store.todayStr(new Date(Date.now() - i * 864e5)));
    return out;
  }
  const dayStat = d => Store.s.dayStats[d] || { focusMin: 0, tasksDone: 0, xp: 0, distracted: 0, sessions: 0 };

  function weekSum(offsetWeeks) {
    const days = lastNDays(7 * (offsetWeeks + 1)).slice(0, 7);
    return days.reduce((a, d) => a + dayStat(d).focusMin, 0);
  }

  /* ---------- render ---------- */
  function render() {
    const v = $("#view-analytics");
    const thisWeek = lastNDays(7).reduce((a, d) => a + dayStat(d).focusMin, 0);
    const lastWeek = lastNDays(14).slice(0, 7).reduce((a, d) => a + dayStat(d).focusMin, 0);
    let compareMsg;
    if (lastWeek === 0 && thisWeek === 0) compareMsg = "Start focusing to unlock week-over-week comparisons.";
    else if (lastWeek === 0) compareMsg = `🚀 ${thisWeek} focus minutes this week — your first tracked week!`;
    else {
      const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
      compareMsg = pct >= 0
        ? `📈 You are <b>${pct}% more focused</b> this week than last week (${thisWeek} vs ${lastWeek} min)!`
        : `📉 Down ${Math.abs(pct)}% vs last week (${thisWeek} vs ${lastWeek} min). One good session flips this.`;
    }

    const ratio = Store.s.focusBlocks > 0
      ? (Store.s.focusBlocks / Math.max(1, Store.s.distractions)).toFixed(1)
      : "—";

    // task lifecycle: avg hours from creation to completion
    const doneTasks = Store.s.tasks.filter(t => t.completedAt);
    const avgLife = doneTasks.length
      ? (doneTasks.reduce((a, t) => a + (t.completedAt - t.createdAt), 0) / doneTasks.length / 36e5).toFixed(1) + " hrs"
      : "—";

    // procrastination patterns — grouped into themes by the lightweight categorizer below
    const plCount = Store.s.procrastinationLog.length;

    v.innerHTML = `
      <div class="card"><h2>📊 Historical Comparison</h2><p style="font-size:.95rem">${compareMsg}</p></div>

      <div class="card"><h2>🟩 Focus Heatmap <span class="spacer"></span><span class="muted" style="font-size:.72rem">last 26 weeks</span></h2>
        <div class="heatmap" id="an-heatmap"></div>
      </div>

      <div class="grid-2">
        <div class="card"><h2>⚡ Energy Tracker <span class="spacer"></span><span class="muted" style="font-size:.72rem">focus min by hour of day</span></h2>
          <canvas class="chart" id="an-energy" height="180"></canvas>
          <div class="card-sub" id="an-peak"></div>
        </div>
        <div class="card"><h2>🥧 Focus Distribution</h2>
          <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
            <canvas id="an-pie" width="170" height="170"></canvas>
            <div class="pie-legend" id="an-pie-legend"></div>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card"><h2>🗓️ Streak Calendar <span class="spacer"></span><span class="muted" style="font-size:.72rem">last 28 days</span></h2>
          <div class="streak-cal" id="an-streakcal"></div>
        </div>
        <div class="card"><h2>🔢 Core Stats</h2>
          <div class="stat-line"><span>Focus-to-distraction ratio</span><b>${ratio} : 1</b></div>
          <div class="stat-line"><span>Total focus time</span><b>${Math.floor(Store.s.totalFocusMin / 60)}h ${Store.s.totalFocusMin % 60}m</b></div>
          <div class="stat-line"><span>Sessions completed</span><b>${Store.s.sessionsCompleted}</b></div>
          <div class="stat-line"><span>Overtime worked</span><b>${Store.s.overtimeTotal} min</b></div>
          <div class="stat-line"><span>Avg task lifecycle (created → done)</span><b>${avgLife}</b></div>
          <div class="stat-line"><span>Best streak</span><b>${Store.s.bestStreak} days</b></div>
          <div class="stat-line"><span>Avoidance reasons</span>
            <button class="btn sm" id="an-avoidance-btn" title="See all your logged avoidance reasons, grouped">View your main avoidance reasons${plCount ? ` (${plCount})` : ""}</button>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card"><h2>🔮 Predictive Analytics</h2><div id="an-predict"></div></div>
        <div class="card"><h2>🏛️ Milestone Timeline</h2><div id="an-timeline" style="max-height:220px;overflow-y:auto"></div></div>
      </div>

      <div class="card"><h2>📋 Weekly Report Card <span class="spacer"></span>
        <button class="btn sm primary" id="an-download">⬇ Download report</button></h2>
        <div id="an-report"></div>
      </div>`;

    renderHeatmap();
    renderEnergy();
    renderPie();
    renderStreakCal();
    renderPredict();
    renderTimeline();
    renderReport();
    $("#an-download").onclick = downloadReport;
    $("#an-avoidance-btn").onclick = avoidanceModal;
  }

  /* ---------- Avoidance reasons: lightweight theme grouper + donut ----------
     A tiny keyword classifier that folds free-text reasons ("tv", "yt", "too tired") into a small
     set of themes ("Entertainment / video", "Low energy"…), so two different words that mean the
     same thing (YouTube vs TV) count toward one slice of the pie. */
  const AVOID_CATS = [
    { id: "entertainment", label: "Entertainment / video", emoji: "📺", kw: ["tv", "show", "shows", "movie", "movies", "youtube", "yt", "netflix", "stream", "streaming", "twitch", "anime", "video", "videos", "watching", "watch", "game", "games", "gaming", "playing", "play"] },
    { id: "social", label: "Social media / phone", emoji: "📱", kw: ["instagram", "insta", "tiktok", "tik tok", "snapchat", "snap", "twitter", "reddit", "social media", "social", "scrolling", "scroll", "phone", "texting", "discord", "feed"] },
    { id: "tired", label: "Low energy / tired", emoji: "😴", kw: ["tired", "sleepy", "sleep", "exhausted", "exhaustion", "nap", "no energy", "low energy", "drained", "fatigue", "burnt out", "burnout"] },
    { id: "overwhelm", label: "Overwhelmed", emoji: "😰", kw: ["overwhelm", "overwhelmed", "too big", "too much", "so much", "stressed", "stress", "anxious", "anxiety", "pressure", "a lot"] },
    { id: "fear", label: "Fear / perfectionism", emoji: "😨", kw: ["afraid", "scared", "fear", "fail", "failure", "failing", "perfect", "perfectionism", "judged", "judgment", "not good enough", "embarrass"] },
    { id: "boredom", label: "Boredom", emoji: "🥱", kw: ["boring", "bored", "dull", "tedious", "not fun", "no fun", "unmotivated", "lazy"] },
    { id: "confusion", label: "Unclear / stuck", emoji: "😵", kw: ["confused", "confusing", "don't know", "dont know", "no idea", "unclear", "how to", "where to start", "next step", "stuck", "lost"] },
    { id: "time", label: "'No time' / later", emoji: "⏰", kw: ["no time", "busy", "later", "not now", "put off", "procrastinat"] },
  ];
  const AVOID_OTHER = { id: "other", label: "Other", emoji: "🤷" };

  function categorizeAvoidance(reason) {
    const low = " " + String(reason || "").toLowerCase().replace(/[''`]/g, "'") + " ";
    for (const c of AVOID_CATS) {
      const hit = c.kw.some(k => new RegExp("(?:^|[^a-z])" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:[^a-z]|$)", "i").test(low));
      if (hit) return c;
    }
    return AVOID_OTHER;
  }

  function avoidanceModal() {
    const log = Store.s.procrastinationLog || [];
    const total = log.length;
    const groups = {};
    log.forEach(p => {
      const c = categorizeAvoidance(p.reason);
      (groups[c.id] = groups[c.id] || { cat: c, items: [] }).items.push(p);
    });
    const entries = Object.values(groups).sort((a, b) => b.items.length - a.items.length);

    const body = total ? `
      <div class="avoid-top">
        <canvas id="avoid-pie" width="170" height="170"></canvas>
        <div class="pie-legend" id="avoid-legend"></div>
      </div>
      <div class="avoid-groups">
        ${entries.map(e => `
          <details class="avoid-group" open>
            <summary>${e.cat.emoji} <b>${esc(e.cat.label)}</b> <span class="muted">— ${e.items.length} (${Math.round(e.items.length / total * 100)}%)</span></summary>
            ${e.items.slice().reverse().map(it => `<div class="avoid-item"><span class="avoid-date">${new Date(it.ts).toLocaleDateString()}</span> ${esc(it.reason)}${it.taskTitle ? ` <span class="muted">· ${esc(it.taskTitle)}</span>` : ""}</div>`).join("")}
          </details>`).join("")}
      </div>` : `<p class="muted">No avoidance reasons logged yet. Next time you hit <b>😩 "Why am I avoiding this?"</b> on a task, your honest reason lands here — and this grouper starts spotting the patterns.</p>`;

    UI.modal("🧠 Your main avoidance reasons", body, [{ label: "Close", cls: "primary" }]);
    if (total) setTimeout(() => drawAvoidPie(entries, total), 40);
  }

  function drawAvoidPie(entries, total) {
    const cv = document.getElementById("avoid-pie");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const colors = ["#8e6ff0", "#6d7cff", "#3fbf76", "#d9a648", "#ec5f59", "#ff9e4a", "#4ec3c3", "#e87ca8", "#9a8cff"];
    const legend = document.getElementById("avoid-legend");
    legend.innerHTML = "";
    let ang = -Math.PI / 2;
    entries.forEach((e, i) => {
      const v = e.items.length;
      const slice = (v / total) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(85, 85);
      ctx.arc(85, 85, 80, ang, ang + slice - (entries.length > 1 ? 0.02 : 0));
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ang += slice;
      legend.innerHTML += `<div><span class="dot" style="background:${colors[i % colors.length]}"></span>${e.cat.emoji} ${esc(e.cat.label)} — <b>${Math.round(v / total * 100)}%</b> (${v})</div>`;
    });
    ctx.beginPath(); ctx.arc(85, 85, 48, 0, Math.PI * 2);
    ctx.fillStyle = cssVar("--overlay") || cssVar("--card") || "#101116"; ctx.fill();
    ctx.fillStyle = cssVar("--text") || "#e4e5e9";
    ctx.font = "700 22px Inter, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(String(total), 85, 82);
    ctx.font = "500 10px Inter, sans-serif";
    ctx.fillStyle = cssVar("--muted") || "#7e828e";
    ctx.fillText(total === 1 ? "LOG" : "LOGS", 85, 98);
    ctx.textAlign = "left";
  }

  function renderHeatmap() {
    const wrap = $("#an-heatmap");
    const days = lastNDays(26 * 7);
    // pad so column starts on Sunday
    const firstDow = new Date(days[0] + "T12:00").getDay();
    for (let i = 0; i < firstDow; i++) wrap.appendChild(el("div", "hm-cell", ""));
    days.forEach(d => {
      const m = dayStat(d).focusMin;
      const lvl = m === 0 ? 0 : m < 25 ? 1 : m < 60 ? 2 : m < 120 ? 3 : 4;
      const c = el("div", "hm-cell");
      c.dataset.l = lvl;
      c.title = `${d}: ${m} focus min, ${dayStat(d).tasksDone} tasks`;
      wrap.appendChild(c);
    });
  }

  // Plausible ghost curve shown before real data exists — charts never look broken
  const SAMPLE_ENERGY = [0, 0, 0, 0, 0, 2, 6, 14, 22, 30, 26, 18, 12, 20, 28, 34, 30, 22, 16, 24, 18, 10, 4, 1];

  function renderEnergy() {
    const cv = $("#an-energy"), ctx = cv.getContext("2d");
    cv.width = cv.clientWidth * 2; cv.height = 360;
    const byHour = Array(24).fill(0);
    Store.s.focusLog.forEach(f => byHour[f.hour] += f.mins);
    const ghost = Math.max(...byHour) === 0;
    const data = ghost ? SAMPLE_ENERGY : byHour;
    const max = Math.max(1, ...data);
    const W = cv.width, H = cv.height, pad = 30;
    ctx.font = "20px Inter, sans-serif";
    const accent = cssVar("--accent") || "#6d7cff";
    const muted = cssVar("--muted") || "#888";
    const bw = (W - pad * 2) / 24;
    data.forEach((v2, h) => {
      const bh = (H - pad * 2) * (v2 / max);
      ctx.fillStyle = !ghost && v2 === max && max > 1 ? (cssVar("--gold") || "#ffd166") : accent;
      ctx.globalAlpha = ghost ? (v2 ? .15 : .05) : (v2 ? 1 : .12);
      const x = pad + h * bw + 3, y = H - pad - Math.max(bh, 4), w = bw - 6, hh = Math.max(bh, 4);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, hh, [5, 5, 0, 0]); else ctx.rect(x, y, w, hh);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (h % 4 === 0) { ctx.fillStyle = muted; ctx.fillText(String(h), pad + h * bw + 2, H - 6); }
    });
    if (ghost) {
      ctx.fillStyle = muted; ctx.textAlign = "center";
      ctx.font = "600 26px Inter, sans-serif";
      ctx.fillText("PREVIEW", W / 2, H / 2 - 14);
      ctx.font = "400 19px Inter, sans-serif";
      ctx.fillText("your real energy curve draws itself with every session", W / 2, H / 2 + 16);
      ctx.textAlign = "left";
    }
    const peak = byHour.indexOf(Math.max(...byHour));
    $("#an-peak").innerHTML = !ghost
      ? `Your peak hour so far: <b>${peak % 12 || 12}${peak < 12 ? " AM" : " PM"}</b> — guard it like treasure.`
      : "This is a sample shape — one focus session starts painting the real one.";
  }

  function renderPie() {
    const cv = $("#an-pie"), ctx = cv.getContext("2d");
    const bySkill = {};
    Store.s.focusLog.forEach(f => {
      const key = f.skill || "unsorted";
      bySkill[key] = (bySkill[key] || 0) + f.mins;
    });
    let entries = Object.entries(bySkill).sort((a, b) => b[1] - a[1]);
    let total = entries.reduce((a, e) => a + e[1], 0);
    const legend = $("#an-pie-legend");
    const ghost = !total;
    if (ghost) {
      // sample slices so the chart looks alive from day one
      entries = [["coding", 45], ["school", 30], ["reading", 15], ["fitness", 10]];
      total = 100;
      cv.style.opacity = ".22";
      legend.innerHTML = '<span class="muted">Sample preview — focus on any task and the real split appears here instantly.</span>';
    } else {
      cv.style.opacity = "1";
    }
    const colors = ["#6d7cff", "#9a8cff", "#3fbf76", "#d9a648", "#ec5f59", "#ff9e4a", "#4ec3c3", "#e87ca8"];
    let ang = -Math.PI / 2;
    entries.forEach(([k, v2], i) => {
      const slice = (v2 / total) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(85, 85);
      ctx.arc(85, 85, 80, ang, ang + slice - 0.02);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ang += slice;
      if (!ghost) {
        const sk = Store.s.skills.find(s => s.id === k);
        const name = sk ? `${sk.icon} ${sk.name}` : "🗂 Unsorted";
        legend.innerHTML += `<div><span class="dot" style="background:${colors[i % colors.length]}"></span>${name} — <b>${Math.round(v2 / total * 100)}%</b> (${v2}m)</div>`;
      }
    });
    // donut hole with total in the center
    ctx.beginPath(); ctx.arc(85, 85, 48, 0, Math.PI * 2);
    ctx.fillStyle = cssVar("--card") || "#101116"; ctx.fill();
    ctx.fillStyle = cssVar("--text") || "#e4e5e9";
    ctx.font = "700 20px Inter, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(ghost ? "—" : `${Math.floor(total / 60)}h${total % 60 ? " " + (total % 60) + "m" : ""}`, 85, 82);
    ctx.font = "500 10px Inter, sans-serif";
    ctx.fillStyle = cssVar("--muted") || "#7e828e";
    ctx.fillText(ghost ? "PREVIEW" : "TOTAL FOCUS", 85, 98);
  }

  function renderStreakCal() {
    const wrap = $("#an-streakcal");
    const today = Store.todayStr();
    lastNDays(28).forEach(d => {
      const s = dayStat(d);
      const hit = s.focusMin > 0 || s.tasksDone > 0;
      const c = el("div", `sc-cell ${hit ? "hit" : ""} ${d === today ? "today" : ""}`, hit ? "✕" : new Date(d + "T12:00").getDate());
      c.title = d;
      wrap.appendChild(c);
    });
  }

  function renderPredict() {
    const wrap = $("#an-predict");
    const bosses = Store.s.bosses.filter(b => !b.defeated && b.subs.some(s => s.done));
    let html = "";
    bosses.forEach(b => {
      const done = b.subs.filter(s => s.done).length;
      const daysSince = Math.max(1, (Date.now() - b.createdAt) / 864e5);
      const rate = done / daysSince;
      const remaining = b.subs.length - done;
      const eta = Math.ceil(remaining / rate);
      html += `<div class="stat-line"><span>${b.emoji} ${esc(b.name)}</span><b>~${eta} day${eta === 1 ? "" : "s"} at current pace</b></div>`;
    });
    const active = Store.s.tasks.filter(t => t.status === "todo" || t.status === "doing");
    const recent = lastNDays(7).reduce((a, d) => a + dayStat(d).tasksDone, 0) / 7;
    if (active.length && recent > 0) {
      html += `<div class="stat-line"><span>📋 Current backlog (${active.length} tasks)</span><b>~${Math.ceil(active.length / recent)} days to clear</b></div>`;
    }
    wrap.innerHTML = html || '<span class="muted">Work on a Boss or complete tasks to unlock predictions.</span>';
  }

  function renderTimeline() {
    const wrap = $("#an-timeline");
    const items = Store.s.milestones.slice().reverse();
    wrap.innerHTML = items.length
      ? items.map(m => `<div class="timeline-item"><span class="muted">${new Date(m.ts).toLocaleDateString()}</span><b>${esc(m.title)}</b></div>`).join("")
      : '<span class="muted">Your biggest wins will be immortalized here.</span>';
  }

  function reportData() {
    const days = lastNDays(7);
    const focus = days.reduce((a, d) => a + dayStat(d).focusMin, 0);
    const tasks = days.reduce((a, d) => a + dayStat(d).tasksDone, 0);
    const xp = days.reduce((a, d) => a + dayStat(d).xp, 0);
    const distracted = days.reduce((a, d) => a + dayStat(d).distracted, 0);
    const bestDay = days.slice().sort((a, b) => dayStat(b).focusMin - dayStat(a).focusMin)[0];
    return { days, focus, tasks, xp, distracted, bestDay };
  }

  function renderReport() {
    const r = reportData();
    const wins = [];
    const improve = [];
    if (r.focus >= 300) wins.push(`${Math.floor(r.focus / 60)}+ hours of deep focus`);
    else if (r.focus > 0) improve.push("Aim for a bit more total focus time next week");
    if (r.tasks >= 10) wins.push(`${r.tasks} tasks shipped`);
    else improve.push("Try clearing more small tasks — momentum compounds");
    if (Store.s.streak >= 3) wins.push(`${Store.s.streak}-day active streak`);
    else improve.push("Build a 3-day streak — show up tomorrow");
    if (r.distracted > 10) improve.push(`${r.distracted} distraction logs — consider Strict Mode or the ambient mixer`);
    else if (r.focus > 0) wins.push("Kept distractions low");

    $("#an-report").innerHTML = `
      <div class="stat-line"><span>Focus minutes (7d)</span><b>${r.focus}</b></div>
      <div class="stat-line"><span>Tasks completed (7d)</span><b>${r.tasks}</b></div>
      <div class="stat-line"><span>XP earned (7d)</span><b>${r.xp}</b></div>
      <div class="stat-line"><span>Best day</span><b>${r.bestDay} (${dayStat(r.bestDay).focusMin} min)</b></div>
      <div style="margin-top:10px"><b style="color:var(--good)">✅ Wins:</b> ${wins.join(" · ") || "This week is still unwritten."}</div>
      <div style="margin-top:6px"><b style="color:var(--gold)">🔧 Improve:</b> ${improve.join(" · ") || "Honestly? Just keep doing this."}</div>`;
  }

  function downloadReport() {
    const r = reportData();
    const lines = [
      `# DialedIn Weekly Report — ${USER_NAME}`,
      `Generated: ${new Date().toLocaleString()}`,
      ``,
      `## Numbers (last 7 days)`,
      `- Focus minutes: ${r.focus}`,
      `- Tasks completed: ${r.tasks}`,
      `- XP earned: ${r.xp}`,
      `- Distractions logged: ${r.distracted}`,
      `- Current streak: ${Store.s.streak} days (best: ${Store.s.bestStreak})`,
      `- Level: ${Game.level().level} · Coins: ${Store.s.coins}`,
      ``,
      `## Day by day`,
      ...r.days.map(d => `- ${d}: ${dayStat(d).focusMin} min focus, ${dayStat(d).tasksDone} tasks`),
      ``,
      `Keep going, ${USER_NAME}. Future-you is watching. 🚀`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `focusquest-report-${Store.todayStr()}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("📋 Report downloaded");
  }

  return { render, categorize: categorizeAvoidance };
})();
