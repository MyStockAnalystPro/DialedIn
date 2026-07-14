/* ==========================================================
   integrations.js — Spotify (IFrame embed) + Gmail/Outlook inbox
   via client-side OAuth 2.0. Spotify works with just a playlist
   URL. Mail needs an OAuth client id (Google GIS / Microsoft MSAL)
   registered for this origin — supplied here or via a secret.
   ========================================================== */
"use strict";

const Integrations = (() => {
  const { $, el, esc, toast } = UI;

  function cfg() {
    if (!Store.s.integrations) Store.s.integrations = { spotifyUrl: "", provider: "gmail", googleClientId: "", msClientId: "" };
    return Store.s.integrations;
  }
  // Client ids may also be injected as globals (e.g. from a secret) without editing storage.
  const googleClientId = () => (cfg().googleClientId || window.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const msClientId = () => (cfg().msClientId || window.MS_OAUTH_CLIENT_ID || "").trim();

  function spotifyEmbed(url) {
    if (!url) return null;
    let m = url.match(/open\.spotify\.com\/(?:embed\/)?(playlist|album|track|episode|show|artist)\/([A-Za-z0-9]+)/);
    if (!m) m = url.match(/spotify:(playlist|album|track|episode|show|artist):([A-Za-z0-9]+)/);
    return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=dialedin` : null;
  }

  function render() {
    const c = cfg();
    const v = $("#view-integrations");
    const embed = spotifyEmbed(c.spotifyUrl);
    v.innerHTML = `
      <div class="card">
        <h2>🎧 Spotify</h2>
        <div class="card-sub">Paste any Spotify playlist / album / track link — it embeds below via the Spotify IFrame player. Playback controls live inside the player (log in to Spotify in the frame for full tracks).</div>
        <div class="quickadd-row">
          <input type="text" id="sp-url" placeholder="https://open.spotify.com/playlist/…" value="${esc(c.spotifyUrl)}">
          <button class="btn primary" id="sp-embed">Embed</button>
          ${c.spotifyUrl ? `<button class="btn" id="sp-clear">Clear</button>` : ""}
        </div>
        <div id="sp-frame" class="sp-frame">${embed ? `<iframe style="border-radius:12px" src="${embed}" width="100%" height="352" frameborder="0" allowfullscreen allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>` : `<div class="tl-empty">No playlist yet — paste a Spotify link above.</div>`}</div>
      </div>

      <div class="card">
        <h2>📥 Inbox <span class="spacer"></span>
          <select id="mail-provider">
            <option value="gmail" ${c.provider !== "outlook" ? "selected" : ""}>Gmail</option>
            <option value="outlook" ${c.provider === "outlook" ? "selected" : ""}>Outlook</option>
          </select>
        </h2>
        <div class="card-sub">Connect your inbox over OAuth 2.0 to browse recent mail and jump to any message. Read-only. Requires a one-time OAuth client id registered to this site's origin (<code>${esc(location.origin)}</code>).</div>
        <div id="mail-config"></div>
        <div id="mail-status" class="mail-status"></div>
        <div id="mail-list" class="mail-list"></div>
      </div>`;

    $("#sp-embed").onclick = () => {
      const url = $("#sp-url").value.trim();
      if (url && !spotifyEmbed(url)) { toast("That doesn't look like a Spotify link.", "bad"); return; }
      c.spotifyUrl = url; Store.save(); render();
    };
    if ($("#sp-clear")) $("#sp-clear").onclick = () => { c.spotifyUrl = ""; Store.save(); render(); };
    $("#mail-provider").onchange = e => { c.provider = e.target.value; Store.save(); render(); };
    renderMailConfig();
  }

  function renderMailConfig() {
    const c = cfg();
    const wrap = $("#mail-config");
    const isGmail = c.provider !== "outlook";
    const id = isGmail ? googleClientId() : msClientId();
    wrap.innerHTML = `
      <div class="quickadd-row" style="margin-top:8px">
        <input type="text" id="mail-clientid" placeholder="${isGmail ? "Google OAuth Client ID (…apps.googleusercontent.com)" : "Azure App (client) ID"}" value="${esc(isGmail ? (c.googleClientId || "") : (c.msClientId || ""))}">
        <button class="btn" id="mail-save-id">Save ID</button>
        <button class="btn primary" id="mail-connect" ${id ? "" : "disabled"}>Connect ${isGmail ? "Gmail" : "Outlook"}</button>
      </div>
      ${id ? "" : `<div class="mail-hint muted2">No client id set. ${isGmail
        ? `Create an OAuth <b>Web</b> client in Google Cloud Console, add <code>${esc(location.origin)}</code> as an authorized JavaScript origin, enable the Gmail API, then paste the client id above.`
        : `Register an app in the Azure portal (SPA platform) with redirect <code>${esc(location.origin)}</code> and the <code>Mail.Read</code> scope, then paste the Application (client) id above.`}</div>`}`;
    $("#mail-save-id").onclick = () => {
      const val = $("#mail-clientid").value.trim();
      if (isGmail) c.googleClientId = val; else c.msClientId = val;
      Store.save(); render();
    };
    $("#mail-connect").onclick = () => isGmail ? connectGmail() : connectOutlook();
  }

  function status(msg, kind) { const s = $("#mail-status"); if (s) s.innerHTML = `<span class="${kind === "bad" ? "district-rust" : ""}">${esc(msg)}</span>`; }

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const sc = document.createElement("script");
      sc.src = src; sc.async = true; sc.onload = () => res(); sc.onerror = () => rej(new Error("load " + src));
      document.head.appendChild(sc);
    });
  }

  /* ---------- Gmail via Google Identity Services token client ---------- */
  async function connectGmail() {
    const clientId = googleClientId();
    if (!clientId) return;
    status("Loading Google Identity Services…");
    try {
      await loadScript("https://accounts.google.com/gsi/client");
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        callback: async resp => {
          if (resp.error) { status("Authorization failed: " + resp.error, "bad"); return; }
          await fetchGmail(resp.access_token);
        },
      });
      status("Opening Google sign-in…");
      tokenClient.requestAccessToken();
    } catch (e) { status("Couldn't load Google sign-in (needs internet + a valid client id).", "bad"); }
  }
  async function fetchGmail(token) {
    status("Fetching inbox…");
    try {
      const headers = { Authorization: "Bearer " + token };
      const listRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&labelIds=INBOX", { headers });
      const list = await listRes.json();
      if (!list.messages) { status("Inbox empty (or no permission).", "bad"); return; }
      const msgs = await Promise.all(list.messages.slice(0, 15).map(async m => {
        const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, { headers });
        const d = await r.json();
        const h = (name) => (d.payload?.headers || []).find(x => x.name === name)?.value || "";
        return { id: m.id, from: h("From"), subject: h("Subject") || "(no subject)", snippet: d.snippet || "" };
      }));
      status(`Connected — ${msgs.length} recent messages.`);
      renderMailList(msgs.map(m => ({ ...m, link: `https://mail.google.com/mail/u/0/#inbox/${m.id}` })));
    } catch (e) { status("Failed to read Gmail: " + e.message, "bad"); }
  }

  /* ---------- Outlook via MSAL browser + Microsoft Graph ---------- */
  async function connectOutlook() {
    const clientId = msClientId();
    if (!clientId) return;
    status("Loading Microsoft sign-in…");
    try {
      await loadScript("https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js");
      const pca = new msal.PublicClientApplication({ auth: { clientId, redirectUri: location.origin } });
      await pca.initialize();
      const login = await pca.loginPopup({ scopes: ["Mail.Read"] });
      const tok = await pca.acquireTokenSilent({ scopes: ["Mail.Read"], account: login.account });
      status("Fetching inbox…");
      const r = await fetch("https://graph.microsoft.com/v1.0/me/messages?$top=15&$select=subject,from,webLink,receivedDateTime,bodyPreview", { headers: { Authorization: "Bearer " + tok.accessToken } });
      const d = await r.json();
      const msgs = (d.value || []).map(m => ({ id: m.id, from: m.from?.emailAddress?.address || "", subject: m.subject || "(no subject)", snippet: m.bodyPreview || "", link: m.webLink }));
      status(`Connected — ${msgs.length} recent messages.`);
      renderMailList(msgs);
    } catch (e) { status("Outlook connect failed (needs internet + a valid client id): " + (e.message || e), "bad"); }
  }

  function renderMailList(msgs) {
    const wrap = $("#mail-list");
    if (!wrap) return;
    wrap.innerHTML = msgs.length ? msgs.map(m => `
      <a class="mail-row" href="${esc(m.link)}" target="_blank" rel="noopener">
        <span class="mail-subject">${esc(m.subject)}</span>
        <span class="mail-from muted2">${esc(m.from)}</span>
        <span class="mail-snippet muted2">${esc((m.snippet || "").slice(0, 90))}</span>
      </a>`).join("") : `<div class="tl-empty">No messages.</div>`;
  }

  return { render };
})();
