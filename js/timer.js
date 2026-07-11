/* ==========================================================
   timer.js — smart pomodoro, stopwatch, just-5-min, strict,
              visual ring, overtime, breaks, lockout
   ========================================================== */
"use strict";

const Timer = (() => {
  const { $, el, esc, toast, modal } = UI;

  const state = {
    mode: "pomodoro",       // pomodoro | stopwatch | five
    phase: "idle",          // idle | work | break | overtime
    running: false, paused: false,
    startTs: 0, pausedAt: 0, pausedTotal: 0,
    durationSec: 0,
    minutesCredited: 0,
    overtimeStart: 0,
    tick: null,
  };

  const BREAK_IDEAS = [
    "🚰 Get a glass of water and drink all of it",
    "🙆 Reach up high, then touch your toes — 5 slow reps",
    "🫁 Box breathing: 4s in, 4s hold, 4s out, 4s hold — ×4",
    "🪟 Look out a window at something 20+ feet away for 20s",
    "🚶 Walk one lap around your room or house",
    "🧹 Clear exactly 3 items off your desk",
    "💪 10 wall push-ups or squats",
    "👀 Close your eyes and slowly roll them — eye strain reset",
    "🌤️ Step outside for 60 seconds of fresh air",
    "🧊 Splash cold water on your face",
  ];

  /* ---------- Smart Pomodoro: adjust from history ---------- */
  function smartAdjust() {
    const log = Store.s.focusLog.slice(-30);
    if (log.length < 5) return;
    const avg = log.reduce((a, f) => a + f.mins, 0) / log.length;
    const p = Store.s.pomo;
    if (!p.autoAdjust) return;
    // if user consistently completes long sessions, extend work; if short, shrink
    if (avg >= p.work * 0.95 && p.work < 50) { p.work += 5; toast(`🧠 Smart Pomodoro: work sessions raised to ${p.work} min — you've earned it`); }
    else if (avg < p.work * 0.6 && p.work > 15) { p.work -= 5; toast(`🧠 Smart Pomodoro: shortened to ${p.work} min to match your rhythm`); }
    // breaks scale with work length
    p.brk = Math.max(3, Math.round(p.work / 5));
    Store.save();
  }

  /* ---------- Core ---------- */
  function elapsedSec() {
    if (!state.running) return 0;
    const pausedExtra = state.paused ? (Date.now() - state.pausedAt) : 0;
    return Math.floor((Date.now() - state.startTs - state.pausedTotal - pausedExtra) / 1000);
  }

  function remainingSec() {
    return Math.max(0, state.durationSec - elapsedSec());
  }

  function displayTime() {
    let s;
    if (!state.running) s = (Store.s.pomo.work * 60);
    else if (state.mode === "stopwatch" || state.phase === "overtime") s = state.phase === "overtime" ? Math.floor((Date.now() - state.overtimeStart) / 1000) : elapsedSec();
    else s = remainingSec();
    const m = Math.floor(s / 60), sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  function start(mode = "pomodoro") {
    // Commitment Wall gate — must state why before the timer starts (skippable in stopwatch)
    const t = Tasks.nowTask();
    if (mode !== "stopwatch" && t && !t.commitment) { Psych.commitmentWall(t, () => reallyStart(mode)); return; }
    reallyStart(mode);
  }

  function reallyStart(mode) {
    if (state.running) return;
    smartAdjust();
    state.mode = mode;
    state.phase = "work";
    state.running = true; state.paused = false;
    state.startTs = Date.now(); state.pausedTotal = 0;
    state.minutesCredited = 0;
    state.durationSec = mode === "five" ? 5 * 60 : mode === "stopwatch" ? 0 : Store.s.pomo.work * 60;
    AudioFX.play("start");
    Store.day().sessions++;
    if (mode === "five") toast("🚪 Just 5 minutes. That's the whole deal. Go.", "xp");
    startTick();
    renderPulse();
    UI.updateZen();
    document.querySelector(".zone-now")?.classList.add("pulsing");
  }

  function startTick() {
    clearInterval(state.tick);
    state.tick = setInterval(onTick, 1000);
  }

  function onTick() {
    if (!state.running || state.paused) return;
    const el = elapsedSec();
    // credit focused minutes as they accrue (work phase only)
    if (state.phase === "work" || state.phase === "overtime") {
      const mins = Math.floor(el / 60) + (state.phase === "overtime" ? state.minutesCredited : 0);
      while (state.minutesCredited < Math.floor(el / 60)) {
        state.minutesCredited++;
        const t = Tasks.nowTask();
        Game.onFocusMinutes(1, t?.skill || null, t?.id || null);
        Store.s.focusBlocks++;
      }
    }
    if (state.mode !== "stopwatch" && state.phase === "work" && remainingSec() <= 0) {
      onWorkComplete();
    }
    if (state.phase === "break" && remainingSec() <= 0) {
      endBreak();
    }
    if (state.phase === "overtime") {
      // credit overtime minutes
      const otMin = Math.floor((Date.now() - state.overtimeStart) / 60000);
      if (otMin > (state.otCredited || 0)) {
        state.otCredited = otMin;
        Store.s.overtimeTotal++;
        const t = Tasks.nowTask();
        Game.onFocusMinutes(1, t?.skill || null, t?.id || null);
      }
    }
    renderPulse();
    UI.updateZen();
  }

  function onWorkComplete() {
    AudioFX.play("complete");
    Store.day(); // ensure
    Store.s.sessionsCompleted++;
    Game.questProgress("sessions", 1);
    const scale = Game.earnScale();
    Game.addXP(Math.max(5, Math.round(30 * scale)), Tasks.nowTask()?.skill || null);
    Game.addCoins(Math.max(2, Math.round(10 * scale)), true);

    if (state.mode === "five") {
      // The psychological trick: momentum is now on their side
      state.running = false; state.phase = "idle"; clearInterval(state.tick);
      modal("🚪 5 minutes done — resistance broken!", `
        <p>Aarush, you did the hard part: <b>you started.</b></p>
        <p class="muted" style="margin-top:8px">Motivation follows action, not the other way around. Ride the momentum?</p>`,
        [
          { label: "😌 Stop here (still a win)", onClick: () => renderPulse() },
          { label: "🔥 Keep going — full session", cls: "primary", onClick: () => { reallyStart("pomodoro"); } },
        ]);
      renderPulse();
      return;
    }

    // enter overtime instead of hard stop — track how long they keep going
    state.phase = "overtime";
    state.overtimeStart = Date.now();
    state.otCredited = 0;
    toast("⏰ Session complete! Now in OVERTIME — every extra minute is tracked & counted.", "gold", 5000);
    notify("Pomodoro complete!", "Take a break, or keep riding the overtime wave.");
  }

  function takeBreak() {
    clearInterval(state.tick);
    state.phase = "break";
    state.running = true; state.paused = false;
    state.startTs = Date.now(); state.pausedTotal = 0;
    state.durationSec = Store.s.pomo.brk * 60;
    const idea = BREAK_IDEAS[Math.floor(Math.random() * BREAK_IDEAS.length)];
    modal("☕ Break time", `
      <p style="font-size:1.05rem;margin-bottom:8px">${idea}</p>
      <p class="muted">Break: ${Store.s.pomo.brk} min. Also — blink slowly a few times. Your eyes will thank you. 👁️</p>`,
      [{ label: "Got it", cls: "primary" }]);
    startTick(); renderPulse();
  }

  function endBreak() {
    AudioFX.play("start");
    state.running = false; state.phase = "idle"; clearInterval(state.tick);
    toast("Break over — ready for the next round?", "xp");
    notify("Break over", "Ready for the next focus round?");
    renderPulse();
  }

  function togglePause() {
    if (!state.running) return;
    if (Store.s.pomo.strict && state.phase === "work") {
      toast("🔒 Strict Mode: no pausing. You chose this. Finish.", "bad");
      AudioFX.play("fail");
      return;
    }
    if (state.paused) { state.pausedTotal += Date.now() - state.pausedAt; state.paused = false; }
    else { state.paused = true; state.pausedAt = Date.now(); }
    renderPulse(); UI.updateZen();
  }

  function stop(finished = false) {
    if (Store.s.pomo.strict && state.phase === "work" && !finished && remainingSec() > 0) {
      failSession();
      return;
    }
    state.running = false; state.phase = "idle"; state.paused = false;
    clearInterval(state.tick);
    document.querySelector(".zone-now")?.classList.remove("pulsing");
    renderPulse(); UI.updateZen();
  }

  /* ---------- Fail session → Time Out lockout ---------- */
  function failSession() {
    modal("⚠️ Abandon strict session?", `
      <p>Strict Mode is on. Quitting counts as a <b>failed session</b> and locks the app for 15 minutes.</p>
      <p class="muted" style="margin-top:6px">Or… you could just finish. ${Math.ceil(remainingSec() / 60)} min left.</p>`,
      [
        { label: "💪 Keep going", cls: "primary" },
        { label: "Fail Session (15-min lockout)", cls: "danger", onClick: () => {
          state.running = false; state.phase = "idle"; clearInterval(state.tick);
          AudioFX.play("fail");
          startLockout(15 * 60);
          renderPulse();
        }},
      ]);
  }

  function startLockout(seconds, opts = {}) {
    const ov = $("#lockout-overlay");
    $("#lockout-title").textContent = opts.title || "⏳ Time Out";
    $("#lockout-msg").textContent = opts.msg || "You failed a session. The app is locked so you can reset your mind.";
    $("#lockout-hint").textContent = opts.hint || "Stand up. Breathe. Drink water. Come back stronger.";
    ov.classList.remove("hidden");
    const end = Date.now() + seconds * 1000;
    const iv = setInterval(() => {
      const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
      $("#lockout-timer").textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
      if (left <= 0) {
        clearInterval(iv); ov.classList.add("hidden");
        if (opts.onDone) opts.onDone(); else toast("Lockout over. Fresh start. 💙", "xp");
      }
    }, 500);
  }

  /* ---------- Mandatory Rest Break (burnout guard) ----------
     Gamifies recovery: completing the forced rest pays XP + coins. */
  function mandatoryRest(focusedMins, distractionSpike) {
    // pause whatever is running (bypasses strict mode — recovery outranks it)
    state.running = false; state.phase = "idle"; state.paused = false;
    clearInterval(state.tick);
    renderPulse(); UI.updateZen(); UI.exitZen();
    AudioFX.play("start");
    const why = distractionSpike >= 5
      ? `Your focus-to-distraction ratio is dropping fast (${distractionSpike} distractions this block). That's your brain waving a white flag.`
      : `You've focused ${focusedMins} minutes straight. Elite — but recovery is part of the training, not a break from it.`;
    startLockout(10 * 60, {
      title: "🛌 Mandatory Rest Break",
      msg: `${why} DialedIn is locked for 10 minutes.`,
      hint: "Walk. Water. Look out a window. Finishing this rest pays +60 XP and +25 coins — recovery is part of the game.",
      onDone: () => {
        Game.addXP(60, null, { noMult: true, silent: true });
        Game.addCoins(25, true);
        toast("🛌 Recovery complete: +60 XP, +25 🪙. THIS is how you avoid the week-three burnout wall.", "gold", 6000);
      },
    });
  }

  /* ---------- Notifications ---------- */
  function notify(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification(title, { body }); } catch (e) {}
    }
  }

  /* ---------- The Pulse (render) ---------- */
  function pulseHTML() {
    return `
    <div class="pulse-wrap">
      <div class="pulse-head">
        <div class="timer-mini" title="Click for a fullscreen Focus Session">
          <div class="timer-mini-row">
            <div class="timer-time" id="pulse-time">--:--</div>
            <div class="timer-phase" id="pulse-phase">ready</div>
          </div>
          <div class="timer-mini-bar"><i id="pulse-bar-fill"></i></div>
          <div class="timer-over" id="pulse-over"></div>
        </div>
        <div class="pulse-controls">
          <div class="timer-modes">
            <button class="mode-btn ${state.mode === "pomodoro" ? "active" : ""}" data-mode="pomodoro">Smart Pomodoro</button>
            <button class="mode-btn ${state.mode === "stopwatch" ? "active" : ""}" data-mode="stopwatch">Stopwatch</button>
            <button class="mode-btn ${state.mode === "five" ? "active" : ""}" data-mode="five">Just 5 Minutes</button>
          </div>
          <div class="timer-actions" id="pulse-actions"></div>
        </div>
      </div>
      <div class="timer-opts">
        <label title="Session length in minutes">work <input type="number" id="opt-work" min="5" max="180" value="${Store.s.pomo.work}">m</label>
        <label title="Break length in minutes">break <input type="number" id="opt-brk" min="1" max="60" value="${Store.s.pomo.brk}">m</label>
        <label title="No pausing once started"><input type="checkbox" id="opt-strict" ${Store.s.pomo.strict ? "checked" : ""}> Strict</label>
        <label title="Auto-adjust session length from your history (turn off to keep your custom length)"><input type="checkbox" id="opt-smart" ${Store.s.pomo.autoAdjust ? "checked" : ""}> Smart adjust</label>
        <button class="btn sm ghost" id="log-distraction" title="Self-report a distracted moment">I got distracted</button>
      </div>
      <details style="margin-top:2px">
        <summary style="cursor:pointer;font-size:.78rem;color:var(--muted)">Ambient Sound Mixer</summary>
        <div style="padding-top:10px">
          ${["white:White noise", "rain:Rain", "lofi:Lo-fi pad", "cafe:Cafe"].map(x => {
            const [id, name] = x.split(":");
            return `<div class="mixer-row"><span class="mix-name">${name}</span>
              <input type="range" min="0" max="100" value="0" data-mix="${id}"></div>`;
          }).join("")}
          <div class="muted" style="font-size:.72rem">Sounds are synthesized live — they stop when volume hits 0.</div>
        </div>
      </details>
    </div>`;
  }

  function bindPulse(container) {
    const ring = container.querySelector(".timer-mini");
    if (ring) ring.onclick = () => UI.enterZen();
    container.querySelectorAll(".mode-btn").forEach(b => b.onclick = () => {
      if (state.running) { toast("Finish or stop the current session first"); return; }
      state.mode = b.dataset.mode;
      container.querySelectorAll(".mode-btn").forEach(x => x.classList.toggle("active", x === b));
      renderPulse();
    });
    container.querySelector("#opt-strict").onchange = e => { Store.s.pomo.strict = e.target.checked; Store.save(); };
    container.querySelector("#opt-smart").onchange = e => { Store.s.pomo.autoAdjust = e.target.checked; Store.save(); };
    container.querySelector("#opt-work").onchange = e => {
      const v = Math.min(180, Math.max(5, parseInt(e.target.value, 10) || 25));
      Store.s.pomo.work = v; e.target.value = v; Store.save(); renderPulse();
    };
    container.querySelector("#opt-brk").onchange = e => {
      const v = Math.min(60, Math.max(1, parseInt(e.target.value, 10) || 5));
      Store.s.pomo.brk = v; e.target.value = v; Store.save();
    };
    container.querySelector("#log-distraction").onclick = () => {
      Store.s.distractions++; Store.day().distracted++;
      Store.save();
      Psych.distractionGate();
    };
    container.querySelectorAll("[data-mix]").forEach(sl => {
      sl.oninput = () => AudioFX.setChannel(sl.dataset.mix, sl.value / 100);
    });
    renderPulse();
  }

  /* Shared 0..1 progress fraction — drives both the in-card mini bar and the top-edge bar. */
  function progressFrac() {
    if (!state.running) return 0;
    if (state.mode !== "stopwatch" && state.phase !== "overtime" && state.durationSec > 0)
      return 1 - remainingSec() / state.durationSec;
    if (state.phase === "overtime") return 1;
    if (state.mode === "stopwatch") return (elapsedSec() % 60) / 60;
    return 0;
  }

  /* Always-visible chrome: sidebar mini readout + slim top-edge progress bar.
     Runs regardless of which view is mounted, since the ring is gone from the main layout. */
  function renderChrome() {
    const timeEl = document.getElementById("side-timer-time");
    const dotEl = document.getElementById("side-timer-dot");
    const labelEl = document.getElementById("side-timer-label");
    const fill = document.getElementById("top-progress-fill");
    if (timeEl) timeEl.textContent = state.running ? displayTime() : "--:--";
    if (labelEl) labelEl.textContent =
      !state.running ? "ready" : state.paused ? "paused" :
      state.phase === "break" ? "break" : state.phase === "overtime" ? "overtime" : "focus";
    if (dotEl) dotEl.classList.toggle("live", state.running && !state.paused);
    if (fill) {
      fill.style.width = Math.min(100, Math.max(0, progressFrac() * 100)) + "%";
      fill.parentElement?.classList.toggle("active", state.running);
    }
  }

  function renderPulse() {
    renderChrome();
    const timeEl = document.getElementById("pulse-time");
    if (!timeEl) return;
    timeEl.textContent = displayTime();
    const phaseEl = document.getElementById("pulse-phase");
    const overEl = document.getElementById("pulse-over");
    phaseEl.textContent =
      state.phase === "idle" ? "ready" :
      state.paused ? "paused" :
      state.phase === "work" ? (state.mode === "stopwatch" ? "deep work ↑" : "focus") :
      state.phase === "break" ? "break" : "overtime 🔥";
    overEl.textContent = state.phase === "overtime" ? `+${displayTime()} beyond the bell` : "";

    // slim in-card progress bar (replaces the old circular ring)
    const bar = document.getElementById("pulse-bar-fill");
    if (bar) bar.style.width = Math.min(100, Math.max(0, progressFrac() * 100)) + "%";

    // actions
    const act = document.getElementById("pulse-actions");
    if (!act) return;
    act.innerHTML = "";
    const mk = (label, cls, fn) => { const b = el("button", `btn ${cls}`, label); b.onclick = fn; act.appendChild(b); };
    if (!state.running) {
      mk(state.mode === "five" ? "🚪 Start 5-min door" : state.mode === "stopwatch" ? "▶ Start stopwatch" : "▶ Start focus", "primary", () => start(state.mode));
    } else {
      if (state.phase === "overtime") {
        mk("☕ Take break", "good", takeBreak);
        mk("⏹ Done", "", () => stop(true));
      } else {
        mk(state.paused ? "▶ Resume" : "⏸ Pause", "", togglePause);
        mk("⏹ Stop", "danger", () => stop(false));
      }
    }
  }

  return {
    start, stop, togglePause, takeBreak, startLockout, mandatoryRest,
    pulseHTML, bindPulse, renderPulse, renderChrome, displayTime,
    isRunning: () => state.running,
    isPaused: () => state.paused,
    phase: () => state.phase,
  };
})();
