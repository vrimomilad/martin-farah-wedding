// Visual editor for the invitation — open martinandfarah.com/#edit
// Text mode: click any text and type. Move mode: drag items (arrow keys nudge).
// Publish writes the changes straight into index.html on GitHub; the site
// updates about a minute later. Positions are stored in cqw (percent of the
// card width) so a layout made on a phone holds on a laptop and vice versa.
(() => {
  const REPO = "vrimomilad/martin-farah-wedding";
  const FILE = "index.html";
  const TOKEN_KEY = "mf-editor-token";
  const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";
  const ALLOWED_TAGS = new Set(["BR", "STRONG", "EM", "B", "I"]);
  const SNAP = 0.8; // cqw: snap back to centre within this distance

  const cards = document.querySelector(".cards");
  const items = [...document.querySelectorAll("[data-edit],[data-move]")];
  const isText = (el) => el.hasAttribute("data-edit");
  let mode = "text";
  let selected = null;

  document.documentElement.classList.add("editing");
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));

  // ───────────── Content helpers ─────────────
  // Keep only simple formatting so nothing odd ends up in the page source.
  function cleanHTML(el) {
    const clone = el.cloneNode(true);
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.COMMENT_NODE) { child.remove(); continue; }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        walk(child);
        if (ALLOWED_TAGS.has(child.tagName)) {
          for (const a of [...child.attributes]) if (a.name !== "class") child.removeAttribute(a.name);
        } else if (child.tagName === "DIV" || child.tagName === "P") {
          // Chrome wraps new lines in <div>s; turn them back into line breaks
          child.before(document.createElement("br"));
          child.replaceWith(...child.childNodes);
        } else {
          child.replaceWith(...child.childNodes);
        }
      }
    };
    walk(clone);
    return clone.innerHTML;
  }
  const norm = (html) => html.replace(/\s+/g, " ").replace(/&nbsp;/g, " ").trim();

  const getMove = (el) => {
    const m = (el.style.translate || "").match(/(-?[\d.]+)cqw(?:\s+(-?[\d.]+)cqw)?/);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2] || 0) } : { x: 0, y: 0 };
  };
  const setMove = (el, x, y) => {
    x = Math.round(x * 100) / 100; y = Math.round(y * 100) / 100;
    if (Math.abs(x) < 0.01 && Math.abs(y) < 0.01) el.style.removeProperty("translate");
    else el.style.translate = `${x}cqw ${y}cqw`;
  };

  const getScale = (el) => parseFloat(el.style.scale) || 1;
  const setScale = (el, s) => {
    s = Math.round(Math.min(3, Math.max(0.4, s)) * 100) / 100;
    if (s === 1) el.style.removeProperty("scale"); else el.style.scale = String(s);
  };

  const snapshot = () => items.map((el) => [isText(el) ? el.innerHTML : null, el.style.translate || "", el.style.scale || ""]);
  const restore = (snap) => items.forEach((el, i) => {
    if (snap[i][0] !== null) el.innerHTML = snap[i][0];
    if (snap[i][1]) el.style.translate = snap[i][1]; else el.style.removeProperty("translate");
    if (snap[i][2]) el.style.scale = snap[i][2]; else el.style.removeProperty("scale");
  });
  const signature = () => items.map((el) => (isText(el) ? norm(cleanHTML(el)) : "") + "|" + (el.style.translate || "") + "|" + (el.style.scale || "")).join("\n");

  // What GitHub currently has (as far as this page knows); updated after each publish
  let baselineSnap = snapshot();
  let publishedSig = signature();
  const history = [];
  const pushHistory = (snap) => { history.push(snap); if (history.length > 200) history.shift(); refresh(); };

  // Unpublished edits are kept on this device, so closing the tab never loses work
  const DRAFT_KEY = "mf-editor-draft";
  let restoredDraft = false;
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (draft && draft.base === publishedSig && draft.snap.length === items.length) { restore(draft.snap); restoredDraft = true; }
    else localStorage.removeItem(DRAFT_KEY);
  } catch (_) {}
  const saveDraft = () => {
    try {
      if (signature() === publishedSig) localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify({ base: publishedSig, snap: snapshot() }));
    } catch (_) {}
  };

  // ───────────── Toolbar ─────────────
  const bar = document.createElement("div");
  bar.className = "ed-bar";
  bar.innerHTML = `
    <div class="ed-row">
      <div class="ed-seg" role="group" aria-label="Mode">
        <button type="button" data-mode="text" aria-pressed="true">Edit text</button>
        <button type="button" data-mode="move" aria-pressed="false">Move</button>
      </div>
      <button type="button" class="ed-btn" data-act="undo" title="Undo (Ctrl+Z)">↶ Undo</button>
      <span class="ed-group" aria-label="Selected item">
        <button type="button" class="ed-btn ed-sel" data-act="smaller" title="Make the selected item smaller">A−</button>
        <button type="button" class="ed-btn ed-sel" data-act="bigger" title="Make the selected item bigger">A+</button>
        <button type="button" class="ed-btn ed-sel ed-text-only" data-act="bold" title="Bold (select words first, or applies to the whole line)"><b>B</b></button>
        <button type="button" class="ed-btn ed-sel ed-text-only" data-act="italic" title="Italic"><i>I</i></button>
      </span>
      <button type="button" class="ed-btn ed-move-only" data-act="parent" title="Select the group this item belongs to">Select group</button>
      <button type="button" class="ed-btn ed-sel" data-act="reset" title="Put this item back to its original place and size">Reset item</button>
      <button type="button" class="ed-btn" data-act="thanks">Show thank-you</button>
      <span class="ed-spacer"></span>
      <button type="button" class="ed-btn ed-primary" data-act="publish">Save &amp; publish</button>
      <button type="button" class="ed-btn" data-act="exit">Exit</button>
    </div>
    <div class="ed-row ed-status">
      <span class="ed-tip"></span>
      <span class="ed-warn" aria-live="polite"></span>
      <span class="ed-dirty"></span>
    </div>`;
  document.body.appendChild(bar);
  const tip = bar.querySelector(".ed-tip");
  const warn = bar.querySelector(".ed-warn");
  const dirty = bar.querySelector(".ed-dirty");

  const guide = document.createElement("div");
  guide.className = "ed-guide";
  document.body.appendChild(guide);

  function refresh() {
    bar.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    bar.classList.toggle("is-move", mode === "move");
    document.documentElement.classList.toggle("ed-move", mode === "move");
    tip.textContent = mode === "text"
      ? "Click any text to type. Select words, then B / I. A− / A+ resize."
      : selected
        ? "Drag to move. Arrow keys nudge (Shift = bigger steps). Snaps to centre."
        : "Click an item, then drag it.";
    bar.querySelector('[data-act="undo"]').disabled = history.length === 0;
    bar.querySelector('[data-act="parent"]').disabled = !selected || !parentItem(selected);
    bar.querySelectorAll(".ed-sel").forEach((b) => { b.disabled = !selected; });
    if (selected) bar.querySelector('[data-act="reset"]').disabled = !selected.style.translate && !selected.style.scale;
    bar.querySelectorAll(".ed-text-only").forEach((b) => { b.disabled = !selected || mode !== "text" || !isText(selected); });
    const changed = signature() !== publishedSig;
    dirty.textContent = changed
      ? (restoredDraft ? "Unsaved changes (restored from last time)" : "Unsaved changes — press Save & publish")
      : "Everything is saved";
    dirty.classList.toggle("is-dirty", changed);
    saveDraft();
  }

  // Toolbar buttons must not steal focus/selection from the text being edited
  bar.addEventListener("mousedown", (e) => { if (e.target.closest(".ed-sel, [data-act=undo]")) e.preventDefault(); });

  function resize(factor) {
    if (!selected) return;
    pushHistory(snapshot());
    setScale(selected, getScale(selected) * factor);
    afterChange();
  }
  function format(cmd) {
    if (!selected || !isText(selected)) return;
    const sel = getSelection();
    const inside = sel.rangeCount && selected.contains(sel.getRangeAt(0).commonAncestorContainer) && !sel.isCollapsed;
    pushHistory(snapshot());
    if (!inside) { // nothing highlighted: apply to the whole line
      selected.focus();
      const r = document.createRange(); r.selectNodeContents(selected);
      sel.removeAllRanges(); sel.addRange(r);
    }
    document.execCommand(cmd);
    afterChange();
  }

  function setMode(next) {
    mode = next;
    items.filter(isText).forEach((el) => {
      if (mode === "text") { el.setAttribute("contenteditable", "true"); el.setAttribute("spellcheck", "true"); }
      else { el.removeAttribute("contenteditable"); el.removeAttribute("spellcheck"); }
    });
    select(null);
    refresh();
  }

  function select(el) {
    if (selected) selected.classList.remove("ed-selected");
    selected = el;
    if (selected) selected.classList.add("ed-selected");
    refresh();
  }
  const parentItem = (el) => el.parentElement && el.parentElement.closest("[data-edit],[data-move]");

  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.mode) return setMode(b.dataset.mode);
    switch (b.dataset.act) {
      case "undo": return undo();
      case "parent": { const p = selected && parentItem(selected); if (p) select(p); return; }
      case "reset": if (selected) { pushHistory(snapshot()); selected.style.removeProperty("translate"); selected.style.removeProperty("scale"); afterChange(); } return;
      case "bigger": return resize(1.08);
      case "smaller": return resize(1 / 1.08);
      case "bold": return format("bold");
      case "italic": return format("italic");
      case "thanks": return toggleThanks(b);
      case "publish": return publish();
      case "exit":
        if (signature() !== publishedSig && !confirm("You have unpublished changes. Leave without publishing?")) return;
        history.length = 0; publishedSig = signature();
        try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
        location.hash = ""; location.reload();
    }
  });

  function undo() {
    const snap = history.pop();
    if (snap) { restore(snap); afterChange(); }
    refresh();
  }

  function toggleThanks(btn) {
    const form = document.getElementById("rsvp-form");
    const thanks = document.getElementById("thanks");
    const showing = !thanks.hidden;
    thanks.hidden = showing;
    form.hidden = !showing;
    if (!showing) {
      const msg = document.getElementById("thanks-msg");
      if (!msg.textContent) msg.textContent = "(Preview) Your guest's personalised thank-you message appears here.";
      thanks.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    btn.textContent = showing ? "Show thank-you" : "Show RSVP form";
    afterChange();
  }

  // ───────────── Guard the live page while editing ─────────────
  cards.addEventListener("click", (e) => { e.preventDefault(); }, true);
  cards.addEventListener("submit", (e) => { e.preventDefault(); e.stopImmediatePropagation(); }, true);
  window.addEventListener("beforeunload", (e) => {
    if (signature() !== publishedSig) { e.preventDefault(); e.returnValue = ""; }
  });

  // ───────────── Text editing ─────────────
  let textBefore = null;
  cards.addEventListener("focusin", (e) => {
    const el = mode === "text" && e.target.closest("[data-edit]");
    if (el) { textBefore = snapshot(); if (el !== selected) select(el); }
  });
  cards.addEventListener("focusout", (e) => {
    if (mode !== "text" || !textBefore) return;
    const el = e.target.closest("[data-edit]");
    if (el) {
      const i = items.indexOf(el);
      if (textBefore[i] && textBefore[i][0] !== el.innerHTML) pushHistory(textBefore);
    }
    textBefore = null;
  });
  cards.addEventListener("keydown", (e) => {
    if (mode !== "text" || !e.target.closest("[data-edit]")) return;
    if (e.key === "Enter") { e.preventDefault(); document.execCommand("insertLineBreak"); }
    // Space inside a <button> would otherwise "press" it
    if (e.key === " " && e.target.closest("button")) { e.preventDefault(); document.execCommand("insertText", false, " "); }
  });
  cards.addEventListener("paste", (e) => {
    if (mode !== "text" || !e.target.closest("[data-edit]")) return;
    e.preventDefault();
    document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain"));
  });
  cards.addEventListener("input", () => { scheduleCheck(); refresh(); });

  document.addEventListener("keydown", (e) => {
    const inText = mode === "text" && document.activeElement && document.activeElement.closest("[data-edit]");
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !inText) { e.preventDefault(); undo(); }
  });

  // ───────────── Moving ─────────────
  const unit = (el) => el.closest(".card-wrap").clientWidth / 100; // px per cqw
  let drag = null;

  cards.addEventListener("pointerdown", (e) => {
    if (mode !== "move") return;
    const el = e.target.closest("[data-edit],[data-move]");
    if (!el) { select(null); return; }
    e.preventDefault();
    select(el);
    const start = getMove(el);
    drag = { el, id: e.pointerId, x0: e.clientX, y0: e.clientY, start, before: snapshot(), moved: false };
    el.setPointerCapture(e.pointerId);
  });
  cards.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const u = unit(drag.el);
    let x = drag.start.x + (e.clientX - drag.x0) / u;
    const y = drag.start.y + (e.clientY - drag.y0) / u;
    const snapped = Math.abs(x) < SNAP;
    if (snapped) x = 0;
    if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) > 2) drag.moved = true;
    setMove(drag.el, x, y);
    showGuide(drag.el, snapped);
    scheduleCheck();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) pushHistory(drag.before);
    drag = null;
    guide.classList.remove("is-on");
    afterChange();
  };
  cards.addEventListener("pointerup", endDrag);
  cards.addEventListener("pointercancel", endDrag);

  function showGuide(el, on) {
    const card = el.closest(".card").getBoundingClientRect();
    guide.style.left = card.left + card.width / 2 + "px";
    guide.style.top = card.top + "px";
    guide.style.height = card.height + "px";
    guide.classList.toggle("is-on", on);
  }

  let nudgeBefore = null, nudgeTimer = 0;
  document.addEventListener("keydown", (e) => {
    if (mode !== "move" || !selected) return;
    const step = e.shiftKey ? 2 : 0.25;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (e.key === "Escape") return select(null);
    if (!d) return;
    e.preventDefault();
    if (!nudgeBefore) nudgeBefore = snapshot();
    const { x, y } = getMove(selected);
    setMove(selected, x + d[0], y + d[1]);
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => { pushHistory(nudgeBefore); nudgeBefore = null; afterChange(); }, 500);
    scheduleCheck();
  });

  function afterChange() { scheduleCheck(); refresh(); }

  // ───────────── Floral overlap warnings ─────────────
  // Marks the leaves/flowers in the card artwork, then flags any text or
  // control that touches them, so a move never lands text on the florals.
  let masks = null, checkTimer = 0;
  async function buildMask(src) {
    const img = new Image(); img.src = src; await img.decode();
    const W = img.width, H = img.height;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    const L = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    const R = 8, blur = new Float32Array(W * H), tmp = new Float32Array(W * H);
    for (let y = 0; y < H; y++) { let s = 0; for (let k = -R; k <= R; k++) s += L[y * W + Math.min(W - 1, Math.max(0, k))]; for (let x = 0; x < W; x++) { tmp[y * W + x] = s / (2 * R + 1); s += L[y * W + Math.min(W - 1, x + R + 1)] - L[y * W + Math.max(0, x - R)]; } }
    for (let x = 0; x < W; x++) { let s = 0; for (let k = -R; k <= R; k++) s += tmp[Math.min(H - 1, Math.max(0, k)) * W + x]; for (let y = 0; y < H; y++) { blur[y * W + x] = s / (2 * R + 1); s += tmp[Math.min(H - 1, y + R + 1) * W + x] - tmp[Math.max(0, y - R) * W + x]; } }
    const m = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 34; x < W - 34; x++) {
      const i = y * W + x, r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      m[i] = Math.abs(L[i] - blur[i]) > 14 || L[i] < 165 || (g >= r - 12 && sat > 18 && L[i] < 200) ? 1 : 0;
    }
    return { m, W, H };
  }

  function findOverlaps(pad = 8) {
    const hits = new Set();
    for (const card of document.querySelectorAll(".card")) {
      const cr = card.getBoundingClientRect(), s = 1024 / cr.width, botH = 696 / s;
      const rects = [];
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (el.closest("[hidden]") || el.closest("svg") || getComputedStyle(el).visibility === "hidden") continue;
        const r = document.createRange(); r.selectNodeContents(n);
        for (const q of r.getClientRects()) rects.push({ q, el });
      }
      card.querySelectorAll("img, svg, input, textarea, select, .button, .pill").forEach((el) => {
        if (el.closest("[hidden]")) return;
        const q = el.getBoundingClientRect();
        if (q.width) rects.push({ q, el });
      });
      for (const { q, el } of rects) {
        for (const [k, y0] of [["top", 0], ["bot", cr.height - botH]]) {
          const { m, W, H } = masks[k];
          const x1 = Math.max(0, Math.floor((q.left - cr.left) * s) - pad), x2 = Math.min(W - 1, Math.ceil((q.right - cr.left) * s) + pad);
          const ya = Math.max(k === "top" ? 40 : 0, Math.floor((q.top - cr.top - y0) * s) - pad);
          const yb = Math.min(k === "bot" ? H - 45 : H - 1, Math.ceil((q.bottom - cr.top - y0) * s) + pad);
          let c = 0;
          for (let y = ya; y <= yb && c <= 3; y++) for (let x = x1; x <= x2; x++) c += m[y * W + x];
          if (c > 3) { hits.add(el.closest("[data-edit],[data-move]") || el); break; }
        }
      }
    }
    return hits;
  }

  function scheduleCheck() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(runCheck, 250);
  }
  function runCheck() {
    if (!masks) return;
    document.querySelectorAll(".ed-overlap").forEach((el) => el.classList.remove("ed-overlap"));
    const hits = findOverlaps();
    hits.forEach((el) => el.classList.add("ed-overlap"));
    warn.textContent = hits.size
      ? `⚠ ${hits.size} item${hits.size > 1 ? "s" : ""} touching the flowers (outlined in red)`
      : "✓ Nothing touches the flowers";
    warn.classList.toggle("is-bad", hits.size > 0);
  }
  Promise.all([buildMask("assets/bg-top.jpg"), buildMask("assets/bg-bottom.jpg")])
    .then(([top, bot]) => { masks = { top, bot }; return document.fonts.ready; })
    .then(runCheck)
    .catch((err) => console.warn("Overlap check unavailable", err));
  window.addEventListener("resize", scheduleCheck);

  // ───────────── Publishing to GitHub ─────────────
  const dialog = document.createElement("dialog");
  dialog.className = "ed-dialog";
  document.body.appendChild(dialog);

  function askForToken(reason) {
    return new Promise((resolve) => {
      dialog.innerHTML = `
        <form method="dialog">
          <h2>Connect to GitHub (one time)</h2>
          ${reason ? `<p class="ed-error">${reason}</p>` : ""}
          <p>Publishing saves your changes to the website's files on GitHub. It needs a private access key that only works for this one website.</p>
          <ol>
            <li>Open <a href="${TOKEN_URL}" target="_blank" rel="noopener">GitHub → New access token</a> (sign in if asked).</li>
            <li><b>Token name:</b> Wedding site editor. <b>Expiration:</b> pick a date after the wedding.</li>
            <li><b>Repository access:</b> “Only select repositories” → <b>martin-farah-wedding</b>.</li>
            <li><b>Permissions:</b> add <b>Contents</b> and set it to “Read and write”.</li>
            <li>Click <b>Generate token</b>, copy it, and paste it below.</li>
          </ol>
          <label>Access key<input name="token" type="password" autocomplete="off" placeholder="github_pat_…" required></label>
          <p class="ed-small">It's stored only in this browser on this device. Never share it with anyone.</p>
          <div class="ed-actions">
            <button value="cancel" formnovalidate class="ed-btn">Cancel</button>
            <button value="ok" class="ed-btn ed-primary">Save &amp; publish</button>
          </div>
        </form>`;
      dialog.onclose = () => {
        const token = dialog.returnValue === "ok" ? dialog.querySelector("input").value.trim() : "";
        if (token) { try { localStorage.setItem(TOKEN_KEY, token); } catch (_) {} }
        resolve(token || null);
      };
      dialog.showModal();
    });
  }

  function message(title, body, isError) {
    dialog.innerHTML = `<form method="dialog"><h2>${title}</h2><p class="${isError ? "ed-error" : ""}">${body}</p>
      <div class="ed-actions"><button value="ok" class="ed-btn ed-primary">OK</button></div></form>`;
    dialog.onclose = null;
    dialog.showModal();
  }

  const b64ToText = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  const textToB64 = (text) => {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };

  async function gh(token, method, body) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}${method === "GET" ? "?ref=main&t=" + Date.now() : ""}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      body: body && JSON.stringify(body),
    });
    if (!res.ok) { const err = new Error(`GitHub ${res.status}`); err.status = res.status; throw err; }
    return res.json();
  }

  let publishing = false;
  async function publish() {
    if (publishing) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (signature() === publishedSig) return message("Nothing to publish", "You haven't changed anything since the last publish.");

    let token = null;
    try { token = localStorage.getItem(TOKEN_KEY); } catch (_) {}
    if (!token) token = await askForToken();
    if (!token) return;

    const btn = bar.querySelector('[data-act="publish"]');
    publishing = true; btn.disabled = true; btn.textContent = "Publishing…";
    try {
      const file = await gh(token, "GET");
      const doc = new DOMParser().parseFromString(b64ToText(file.content), "text/html");
      const srcItems = [...doc.querySelectorAll("[data-edit],[data-move]")];
      const sameLayout = srcItems.length === items.length &&
        items.every((el, i) => isText(el) === srcItems[i].hasAttribute("data-edit") && el.tagName === srcItems[i].tagName);
      if (!sameLayout) {
        throw Object.assign(new Error("stale"), { userMessage: "The website's layout was updated since this page loaded. Your changes are saved on this device — just refresh the page and press Save & publish again." });
      }
      // Write only what was changed here, so edits published from another device are kept
      const now = snapshot();
      items.forEach((el, i) => {
        const src = srcItems[i], [h, t, s] = now[i], [h0, t0, s0] = baselineSnap[i];
        if (isText(el) && norm(h) !== norm(h0)) src.innerHTML = cleanHTML(el);
        if (t !== t0) { if (t) src.style.translate = t; else src.style.removeProperty("translate"); }
        if (s !== s0) { if (s) src.style.scale = s; else src.style.removeProperty("scale"); }
        if (src.hasAttribute("style") && !src.getAttribute("style")) src.removeAttribute("style");
      });
      // Normalise the ending so repeated publishes don't keep adding blank lines
      const html = "<!doctype html>\n" +
        doc.documentElement.outerHTML.replace(/\s*<\/body>\s*<\/html>\s*$/, "\n</body>\n</html>") + "\n";
      await gh(token, "PUT", {
        message: "Update invitation from the site editor",
        content: textToB64(html),
        sha: file.sha,
        branch: "main",
      });
      baselineSnap = snapshot();
      publishedSig = signature();
      saveDraft();
      message("Saved & published!", "Your changes will be live on martinandfarah.com in about a minute. If you don't see them, wait a couple of minutes and refresh (phones can take up to 10 minutes).");
    } catch (err) {
      console.error(err);
      if (err.status === 401 || err.status === 403 || err.status === 404) {
        try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
        message("Access key not accepted", "GitHub didn't accept the access key (it may have expired or be missing the Contents “Read and write” permission). Press Publish again to enter a new one.", true);
      } else if (err.status === 409 || err.status === 422) {
        message("Couldn't publish", "Someone else published at the same moment. Reload the page and try again.", true);
      } else {
        message("Couldn't publish", err.userMessage || "Something went wrong reaching GitHub. Check your internet connection and try again.", true);
      }
    } finally {
      publishing = false; btn.disabled = false; btn.textContent = "Publish";
      refresh();
    }
  }

  setMode("text");
})();
