/* ==========================================================
   flashcards.js — spaced-repetition flashcards (SM-2 algorithm).
   Decks + cards persisted locally; study queue schedules reviews
   by ease factor / interval like Anki.
   ========================================================== */
"use strict";

const Flashcards = (() => {
  const { $, el, esc, toast } = UI;
  let openDeckId = null;
  let study = null; // { deckId, queue:[cardIds], idx, showBack }

  function ensure() { if (!Store.s.flashDecks) Store.s.flashDecks = []; }
  const deckById = id => Store.s.flashDecks.find(d => d.id === id);
  const isDue = c => !c.due || c.due <= Date.now();
  const dueCount = d => d.cards.filter(isDue).length;

  // SM-2: q in 0..5. <3 = lapse (reset reps, review again soon); >=3 grows the interval by EF.
  function sm2(card, q) {
    card.ef = card.ef || 2.5;
    if (q < 3) { card.reps = 0; card.interval = 1; card.lapses = (card.lapses || 0) + 1; }
    else {
      card.reps = (card.reps || 0) + 1;
      card.interval = card.reps === 1 ? 1 : card.reps === 2 ? 6 : Math.round((card.interval || 1) * card.ef);
    }
    card.ef = Math.max(1.3, card.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    card.due = Date.now() + card.interval * 86400000;
  }

  function render() {
    ensure();
    const v = $("#view-flashcards");
    if (study) return renderStudy(v);
    const deck = openDeckId ? deckById(openDeckId) : null;
    if (deck) return renderDeck(v, deck);
    renderDeckList(v);
  }

  function renderDeckList(v) {
    v.innerHTML = `
      <div class="card">
        <h2>🃏 Flashcards <span class="spacer"></span><button class="btn sm primary" id="fc-add-deck">＋ New deck</button></h2>
        <div class="card-sub">Spaced repetition with the SM-2 algorithm — cards you find hard come back sooner, easy ones drift further out.</div>
        <div class="fc-deck-grid">
          ${Store.s.flashDecks.length ? Store.s.flashDecks.map(d => `
            <button class="fc-deck" data-id="${d.id}">
              <div class="fc-deck-name">${esc(d.name)}</div>
              <div class="fc-deck-meta">${d.cards.length} card${d.cards.length === 1 ? "" : "s"} · <b class="${dueCount(d) ? "fc-due" : ""}">${dueCount(d)} due</b></div>
            </button>`).join("") : `<div class="tl-empty">No decks yet — create one to start studying.</div>`}
        </div>
      </div>`;
    $("#fc-add-deck").onclick = () => {
      const name = prompt("Deck name:", "New deck");
      if (!name) return;
      Store.s.flashDecks.push({ id: "fd" + (Store.s.flashSeq++), name: name.trim(), cards: [] });
      Store.save(); render();
    };
    v.querySelectorAll(".fc-deck").forEach(b => b.onclick = () => { openDeckId = b.dataset.id; render(); });
  }

  function renderDeck(v, deck) {
    v.innerHTML = `
      <div class="card">
        <h2><button class="btn sm ghost" id="fc-back-decks">← Decks</button> ${esc(deck.name)}
          <span class="spacer"></span>
          <button class="btn sm" id="fc-del-deck" title="Delete deck">🗑 Delete deck</button>
          <button class="btn sm primary" id="fc-study" ${dueCount(deck) ? "" : "disabled"}>▶ Study ${dueCount(deck)} due</button>
        </h2>
        <div class="fc-add-row">
          <input type="text" id="fc-front" placeholder="Front (question / prompt)">
          <input type="text" id="fc-back" placeholder="Back (answer)">
          <button class="btn primary sm" id="fc-add-card">＋ Add card</button>
        </div>
        <div class="fc-card-list">
          ${deck.cards.length ? deck.cards.map(c => `
            <div class="fc-card-row">
              <span class="fc-card-front">${esc(c.front)}</span>
              <span class="fc-card-back muted2">${esc(c.back)}</span>
              <span class="fc-card-sched">${isDue(c) ? "due now" : "in " + Math.max(1, Math.round((c.due - Date.now()) / 86400000)) + "d"} · EF ${(c.ef || 2.5).toFixed(2)}</span>
              <button class="icon-btn fc-del-card" data-id="${c.id}" title="Delete">✕</button>
            </div>`).join("") : `<div class="tl-empty">No cards yet — add some above.</div>`}
        </div>
      </div>`;
    const addCard = () => {
      const front = $("#fc-front").value.trim(), back = $("#fc-back").value.trim();
      if (!front || !back) { toast("Both front and back are needed.", "bad"); return; }
      deck.cards.push({ id: "c" + Date.now() + Math.floor(Math.random() * 1000), front, back, ef: 2.5, reps: 0, interval: 0, due: 0, lapses: 0 });
      Store.save(); render();
      setTimeout(() => $("#fc-front") && $("#fc-front").focus(), 0);
    };
    $("#fc-add-card").onclick = addCard;
    $("#fc-back").addEventListener("keydown", e => { if (e.key === "Enter") addCard(); });
    $("#fc-front").addEventListener("keydown", e => { if (e.key === "Enter") $("#fc-back").focus(); });
    $("#fc-back-decks").onclick = () => { openDeckId = null; render(); };
    v.querySelectorAll(".fc-del-card").forEach(b => b.onclick = () => { deck.cards = deck.cards.filter(c => c.id !== b.dataset.id); Store.save(); render(); });
    $("#fc-del-deck").onclick = () => {
      if (!confirm("Delete this deck and all its cards?")) return;
      Store.s.flashDecks = Store.s.flashDecks.filter(d => d.id !== deck.id);
      openDeckId = null; Store.save(); render();
    };
    $("#fc-study").onclick = () => {
      const queue = deck.cards.filter(isDue).map(c => c.id);
      if (!queue.length) return;
      study = { deckId: deck.id, queue, idx: 0, showBack: false };
      render();
    };
  }

  function renderStudy(v) {
    const deck = deckById(study.deckId);
    if (!deck || study.idx >= study.queue.length) {
      const done = study ? study.queue.length : 0;
      study = null;
      v.innerHTML = `<div class="card fc-study-done"><h2>✅ Review complete</h2><p class="muted">You reviewed ${done} card${done === 1 ? "" : "s"}. Come back when they're due again.</p><button class="btn primary" id="fc-done">Back to deck</button></div>`;
      $("#fc-done").onclick = render;
      return;
    }
    const card = deck.cards.find(c => c.id === study.queue[study.idx]);
    v.innerHTML = `
      <div class="card fc-study">
        <div class="fc-study-progress">${study.idx + 1} / ${study.queue.length}</div>
        <div class="fc-flash">
          <div class="fc-flash-front">${esc(card.front)}</div>
          ${study.showBack ? `<div class="fc-flash-div"></div><div class="fc-flash-back">${esc(card.back)}</div>` : ""}
        </div>
        <div class="fc-study-actions">
          ${study.showBack ? `
            <button class="btn danger" data-q="1">Again</button>
            <button class="btn" data-q="3">Hard</button>
            <button class="btn good" data-q="4">Good</button>
            <button class="btn primary" data-q="5">Easy</button>`
            : `<button class="btn primary" id="fc-flip">Show answer</button>`}
        </div>
        <button class="btn sm ghost fc-quit" id="fc-quit">End review</button>
      </div>`;
    if (study.showBack) {
      v.querySelectorAll("[data-q]").forEach(b => b.onclick = () => {
        sm2(card, +b.dataset.q); Store.save();
        study.idx++; study.showBack = false; render();
      });
    } else {
      $("#fc-flip").onclick = () => { study.showBack = true; render(); };
    }
    $("#fc-quit").onclick = () => { study = null; render(); };
  }

  return { render };
})();
