/* ==========================================================
   psych.js — anti-procrastination toolkit:
   brain dump, commitment wall, friction puzzle, avoidance log,
   micro-steps, pre-commitment check, identity anchor
   ========================================================== */
"use strict";

const Psych = (() => {
  const { $, el, esc, toast, modal } = UI;

  /* ---------- Complete gate (micro-step nudge for big vague tasks) ---------- */
  function gateComplete(task) {
    Tasks.completeTask(task.id);
  }

  /* ---------- Commitment Wall ---------- */
  function commitmentWall(task, onCommitted) {
    modal("🧱 Commitment Wall", `
      <p style="margin-bottom:8px">Before the timer starts, type <b>why</b> this matters:</p>
      <p class="muted" style="font-size:.82rem;margin-bottom:10px">Task: <b>${esc(task.title)}</b></p>
      <textarea id="cw-text" placeholder="I'm doing this because…"></textarea>
      <p class="muted" style="font-size:.74rem;margin-top:6px">Writing the "why" makes quitting feel like breaking a promise to yourself. That's the point.</p>`,
      [
        { label: "Cancel" },
        { label: "🔥 I'm committed — start", cls: "primary", onClick: m => {
          const txt = m.querySelector("#cw-text").value.trim();
          if (txt.length < 5) { toast("Give it a real reason — at least a few words.", "bad"); return false; }
          task.commitment = txt;
          Store.save();
          onCommitted();
        }},
      ], { sticky: true });
  }

  /* ---------- Friction Creator (puzzle to skip/delay) ---------- */
  function frictionPuzzle(actionLabel, onSolved) {
    const a = 12 + Math.floor(Math.random() * 30), b = 7 + Math.floor(Math.random() * 20);
    const op = Math.random() > 0.5 ? "+" : "×";
    const answer = op === "+" ? a + b : a * b;
    modal("🧩 Friction Check", `
      <p style="margin-bottom:8px">You're trying to <b>${esc(actionLabel)}</b>. Fine — but first, solve this:</p>
      <p style="font-size:1.6rem;text-align:center;margin:12px 0"><b>${a} ${op} ${b} = ?</b></p>
      <input type="number" id="fp-answer" placeholder="answer">
      <p class="muted" style="font-size:.74rem;margin-top:8px">If dodging the task takes effort, your brain often decides just doing it is easier. Sneaky? Yes. Effective? Also yes.</p>`,
      [
        { label: "😅 Never mind, I'll do the task", cls: "primary" },
        { label: "Submit & " + actionLabel, onClick: m => {
          const v = parseInt(m.querySelector("#fp-answer").value, 10);
          if (v !== answer) { toast("Wrong answer. The universe wants you to do the task. 🙃", "bad"); AudioFX.play("fail"); return false; }
          onSolved();
        }},
      ]);
  }

  /* ---------- Procrastination Log ---------- */
  // Free-text now (no canned radio options) — just a clean single box to name the real reason in
  // your own words. Analytics groups these into themes automatically (see Analytics → Avoidance).
  function procrastinationLog(task) {
    modal("😩 Why are you avoiding this?", `
      <p class="muted" style="font-size:.82rem;margin-bottom:12px">"${esc(task.title)}" — no judgment. Naming the resistance in your own words shrinks it.</p>
      <textarea id="pl-text" class="pl-reason-box" placeholder="Type it out… e.g. it feels too big, I keep watching YouTube, I'm just tired…"></textarea>`,
      [
        { label: "Cancel" },
        { label: "Log it", cls: "primary", onClick: m => {
          const reason = m.querySelector("#pl-text").value.trim();
          if (reason.length < 2) { toast("Write a few words about the real reason.", "bad"); return false; }
          Store.s.procrastinationLog.push({ ts: Date.now(), taskId: task.id, taskTitle: task.title, reason });
          Store.save();
          toast("Logged. Patterns show up in Analytics → Avoidance. 🔍");
          const low = reason.toLowerCase();
          if (/(overwhelm|too big|too much|confus|don'?t know|no idea|next step|where to start|stuck)/.test(low)) {
            setTimeout(() => microSteps(task), 400);
          } else if (/(tired|sleepy|exhaust|no energy|drained)/.test(low)) {
            toast("Tired? Try the 🚪 Just-5-Minutes timer — tiny commitment, real momentum.", "", 4500);
          }
        }},
      ], { sticky: true });
    setTimeout(() => $("#pl-text")?.focus(), 60);
  }

  /* ---------- Micro-Step Generator ---------- */
  function microSteps(task) {
    modal("🐜 Micro-Step Generator", `
      <p style="margin-bottom:8px">Break <b>"${esc(task.title)}"</b> into 3 <i>ridiculously tiny</i> steps.</p>
      <p class="muted" style="font-size:.78rem;margin-bottom:10px">Rule: each step must feel almost insultingly easy (e.g. "open the doc", "write one bad sentence").</p>
      <label class="field"><span>Step 1 — takes &lt; 60 seconds</span><input type="text" id="ms1" placeholder="Open the file…"></label>
      <label class="field"><span>Step 2 — barely harder</span><input type="text" id="ms2" placeholder="Write one line…"></label>
      <label class="field"><span>Step 3 — still tiny</span><input type="text" id="ms3" placeholder="Do the first real bit…"></label>`,
      [
        { label: "Cancel" },
        { label: "🐜 Add micro-steps", cls: "primary", onClick: m => {
          const steps = ["#ms1", "#ms2", "#ms3"].map(s => m.querySelector(s).value.trim()).filter(Boolean);
          if (steps.length < 3) { toast("All 3 — that's the deal. Make them tinier!", "bad"); return false; }
          steps.forEach(s => task.subtasks.push({ id: Date.now() + Math.random(), name: s, done: false, subtasks: [] }));
          Store.save(); Tasks.render();
          toast("🐜 Micro-steps added. Just do step 1. Only step 1.");
        }},
      ]);
  }

  /* ---------- Pre-Commitment Check (morning popup) ---------- */
  function preCommitCheck() {
    const today = Store.todayStr();
    if (Store.s.preCommit.day === today) return;
    const hour = new Date().getHours();
    if (hour < 4 || hour >= 14) { Store.s.preCommit = { day: today, text: null }; Store.save(); return; }
    modal(`🌅 Morning, ${USER_NAME}`, `
      <p style="font-size:1.02rem;margin-bottom:10px"><b>If you only get ONE thing done today, what must it be?</b></p>
      <input type="text" id="pc-text" placeholder="The one thing…">
      <p class="muted" style="font-size:.76rem;margin-top:8px">It becomes a high-priority task and your Now Zone target.</p>`,
      [
        { label: "Skip today", onClick: () => { Store.s.preCommit = { day: today, text: null }; Store.save(); } },
        { label: "⚓ Lock it in", cls: "primary", onClick: m => {
          const txt = m.querySelector("#pc-text").value.trim();
          if (!txt) return false;
          Store.s.preCommit = { day: today, text: txt };
          const t = Tasks.createTask({ title: txt, priority: "high", due: today });
          Tasks.setNow(t.id);
          toast("⚓ Anchored. Everything else is extra credit.");
        }},
      ], { sticky: true });
  }

  /* ---------- Media/Games Honesty Gate ---------- */
  const MEDIA_PHRASE = "I'm consciously throwing away my potential right now";
  function mediaGuard() {
    modal("🎮 About to open games or media?", `
      <p class="muted" style="font-size:.82rem;margin-bottom:14px">No judgment, no blocking — just honesty. Type the sentence below <b>exactly</b> to continue.</p>
      <p class="gate-phrase">"${esc(MEDIA_PHRASE)}"</p>
      <input type="text" id="mg-input" placeholder="Type it exactly…" autocomplete="off">
      <p class="muted" id="mg-err" style="font-size:.72rem;margin-top:8px;color:var(--bad);display:none">Doesn't match yet — try again, word for word.</p>`,
      [
        { label: "Never mind — back to work", cls: "primary" },
        { label: "I said it. Continue anyway.", onClick: m => {
          const val = m.querySelector("#mg-input").value.trim().toLowerCase();
          if (val !== MEDIA_PHRASE.toLowerCase()) {
            m.querySelector("#mg-err").style.display = "block";
            AudioFX.play("fail");
            return false;
          }
          Store.s.mediaConfessions = (Store.s.mediaConfessions || 0) + 1;
          Store.save();
          toast("Noted. You went in with your eyes open — that's on you now. 👋", "bad", 4000);
        }},
      ], { sticky: true });
    setTimeout(() => $("#mg-input")?.focus(), 60);
  }

  /* ---------- Distraction Refocus Gate ("I got distracted") ----------
     Self-report → own it in writing → drop straight into a fullscreen,
     auto-started Focus Session (same screen as clicking the timer ring). */
  function distractionGate() {
    const t = Tasks.nowTask();
    modal("🫠 Got distracted?", `
      <p class="muted" style="font-size:.82rem;margin-bottom:10px">Name what pulled you away — one line is enough. It's auto-sorted into a theme and saved to your long-term distraction log so patterns surface in Analytics.</p>
      <label class="field"><span>What distracted you?</span>
        <textarea id="dg-reason" class="pl-reason-box" placeholder="e.g. opened youtube, phone buzzed, got a text, started daydreaming…"></textarea></label>
      <div id="dg-cat" class="dg-cat-hint muted2"></div>`,
      [
        { label: "Just log it", onClick: m => logDistraction(m) === false ? false : undefined },
        { label: "🎯 Log & refocus me", cls: "primary", onClick: m => {
          if (logDistraction(m) === false) return false;
          setTimeout(() => {
            UI.enterZen();
            if (!Timer.isRunning()) Timer.start("pomodoro");
            UI.updateZen();
          }, 30);
        }},
      ], { sticky: true });
    setTimeout(() => {
      const ta = $("#dg-reason");
      ta?.focus();
      if (ta) ta.oninput = () => {
        const cat = window.Analytics ? Analytics.categorize(ta.value) : null;
        $("#dg-cat").textContent = ta.value.trim() && cat ? `Auto-categorized as: ${cat.emoji} ${cat.label}` : "";
      };
    }, 60);
    function logDistraction(m) {
      const reason = m.querySelector("#dg-reason").value.trim();
      if (reason.length < 2) { toast("Write a few words about what distracted you.", "bad"); return false; }
      const cat = Analytics.categorize(reason);
      (Store.s.distractionLog = Store.s.distractionLog || []).push({
        ts: Date.now(), reason, category: cat.id, categoryLabel: cat.label, taskTitle: t ? t.title : null,
      });
      Store.save();
      toast(`Logged (${cat.emoji} ${cat.label}). Patterns show up in Analytics & Sessions. 🔍`);
    }
  }

  /* ---------- Identity anchor ---------- */
  function editIdentity() {
    modal("✦ Identity Anchor", `
      <p class="muted" style="font-size:.82rem;margin-bottom:10px">Who are you becoming? This sits at the top of every page. Write it in present tense.</p>
      <input type="text" id="id-text" value="${esc(Store.s.settings.identity)}" placeholder="I am a disciplined creator.">`,
      [
        { label: "Cancel" },
        { label: "Set anchor", cls: "primary", onClick: m => {
          Store.s.settings.identity = m.querySelector("#id-text").value.trim() || Store.s.settings.identity;
          Store.save(); UI.refreshIdentity();
        }},
      ]);
  }

  /* ---------- Brain Dump view ---------- */
  function renderBrainDump() {
    const v = $("#view-braindump");
    v.innerHTML = `
      <div class="card">
        <h2>🌪️ Brain Dump Inbox</h2>
        <div class="card-sub">Vent everything swirling in your head. Zero structure allowed. Converted lines flow straight into your Kanban board <b>and</b> the Timebox pool — enter it once, it's everywhere.</div>
        <textarea id="bd-text" style="min-height:220px" placeholder="just... type... everything... one thought per line helps but no rules">${esc(Store.s.braindump)}</textarea>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="btn primary" id="bd-convert">✅ Turn lines into tasks</button>
          <button class="btn" id="bd-convert-box">🗓 Convert & go timebox them</button>
          <button class="btn ghost" id="bd-clear">🔥 Burn it (clear)</button>
          <span class="muted" style="font-size:.75rem;align-self:center">Quick-add syntax works here too: /today /high /30m #tag @skill</span>
        </div>
      </div>`;
    const ta = $("#bd-text");
    ta.oninput = () => { Store.s.braindump = ta.value; Store.save(); };
    const convert = () => {
      const lines = ta.value.split("\n").map(l => l.trim()).filter(Boolean);
      if (!lines.length) { toast("Nothing to convert yet"); return 0; }
      lines.forEach(l => {
        const t = Tasks.createTask(Tasks.parseQuickAdd(l));
        Automation.applyTemplates(t);
      });
      Store.s.braindump = ""; ta.value = "";
      Store.save();
      AudioFX.play("complete");
      return lines.length;
    };
    $("#bd-convert").onclick = () => {
      const n = convert();
      if (n) toast(`✅ ${n} thought(s) became tasks — now on your board & in the Timebox pool`);
    };
    $("#bd-convert-box").onclick = () => {
      const n = convert();
      if (n) { toast(`✅ ${n} task(s) created — drag them into hour blocks`); UI.showView("timebox"); }
    };
    $("#bd-clear").onclick = () => {
      Store.s.braindump = ""; ta.value = ""; Store.save();
      toast("🔥 Burned. Lighter already, right?");
    };
  }

  return {
    gateComplete, commitmentWall, frictionPuzzle, procrastinationLog,
    microSteps, preCommitCheck, editIdentity, renderBrainDump, mediaGuard, distractionGate,
  };
})();
