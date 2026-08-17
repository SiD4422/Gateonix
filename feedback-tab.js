/* =========================================================================
   Gateonix Feedback Console
   Drop-in feedback tab. Builds its own DOM (no markup edits needed on your
   page) and syncs messages through Firebase Firestore so every visitor
   sees the same feed in real time.

   Include on your page, after the widget's CSS:
     <link rel="stylesheet" href="feedback-tab.css">
     <script type="module" src="feedback-tab.js"></script>

   First-time setup (Firebase project + security rules): see SETUP.md.
   Using your own backend instead? Only connectFeedback() and wireSubmit()
   below need to change — everything else (DOM, styling, open/close) stays.
   ========================================================================= */

// ---- configure ---------------------------------------------------------

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDLcu_cH2ymY2SHbq-HwCFZK1Ix7J83Rqs",
  authDomain: "gateonix-86df2.firebaseapp.com",
  projectId: "gateonix-86df2",
  storageBucket: "gateonix-86df2.firebasestorage.app",
  messagingSenderId: "326966864233",
  appId: "1:326966864233:web:20db8454ff28ddecb7f5f8",
  measurementId: "G-1VYXSY8SF3"
};

const COLLECTION_NAME = "gateonix_feedback";
const MAX_MESSAGE_LEN = 500;
const MAX_NAME_LEN = 60;
const FEED_LIMIT = 50;
const SUBMIT_COOLDOWN_MS = 20000;
const FIREBASE_SDK_VERSION = "12.17.1"; // bump if you need a newer SDK

const isConfigured = Boolean(FIREBASE_CONFIG.apiKey) && FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY";

// ---- DOM ----------------------------------------------------------------

function buildWidget() {
  const embedTarget = document.getElementById("gtx-fb-embed");
  const isEmbed = !!embedTarget;

  const root = document.createElement("div");
  root.className = isEmbed ? "gtx-feedback-embed" : "gtx-feedback-widget";
  root.id = isEmbed ? "gtx-feedback-embed-root" : "gtx-feedback-widget";
  root.dataset.open = isEmbed ? "true" : "false";

  if (isEmbed) {
    root.innerHTML = `
      <section class="gtx-fb-panel" id="gtx-fb-panel">
        <header class="gtx-fb-header">
          <h2 class="gtx-fb-title"><span class="gtx-fb-tab-dot" aria-hidden="true"></span>Live Feedback</h2>
        </header>
        <form class="gtx-fb-form" id="gtx-fb-form" novalidate>
          <div class="gtx-fb-field">
            <input class="gtx-fb-input" id="gtx-fb-name" type="text" maxlength="${MAX_NAME_LEN}" placeholder="Name (optional)" autocomplete="off">
          </div>
          <div class="gtx-fb-field">
            <textarea class="gtx-fb-textarea" id="gtx-fb-message" maxlength="${MAX_MESSAGE_LEN}" placeholder="Bug, idea, or a note about Gateonix…" required></textarea>
          </div>
          <div class="gtx-fb-hp" aria-hidden="true">
            <label for="gtx-fb-website">Leave blank</label>
            <input id="gtx-fb-website" name="website" type="text" tabindex="-1" autocomplete="off">
          </div>
          <div class="gtx-fb-form-row">
            <span class="gtx-fb-counter" id="gtx-fb-counter">0 / ${MAX_MESSAGE_LEN}</span>
            <button type="submit" class="gtx-fb-send" id="gtx-fb-send-btn">Send ▸</button>
          </div>
          <p class="gtx-fb-form-msg" id="gtx-fb-form-msg" role="status" hidden></p>
        </form>
        <div class="gtx-fb-feed" id="gtx-fb-feed">
          <p class="gtx-fb-status" id="gtx-fb-status">Connecting…</p>
        </div>
      </section>
    `;
    embedTarget.appendChild(root);
  } else {
    root.innerHTML = `
      <button type="button" class="gtx-fb-tab" id="gtx-fb-tab-btn" aria-expanded="false" aria-controls="gtx-fb-panel">
        <span class="gtx-fb-tab-dot" aria-hidden="true"></span>Feedback
      </button>
      <div class="gtx-fb-overlay" id="gtx-fb-overlay"></div>
      <section class="gtx-fb-panel" id="gtx-fb-panel" role="dialog" aria-label="Feedback" aria-hidden="true">
        <header class="gtx-fb-header">
          <h2 class="gtx-fb-title"><span class="gtx-fb-tab-dot" aria-hidden="true"></span>Feedback channel</h2>
          <button type="button" class="gtx-fb-close" id="gtx-fb-close-btn" aria-label="Close feedback panel">✕</button>
        </header>
        <form class="gtx-fb-form" id="gtx-fb-form" novalidate>
          <div class="gtx-fb-field">
            <input class="gtx-fb-input" id="gtx-fb-name" type="text" maxlength="${MAX_NAME_LEN}" placeholder="Name (optional)" autocomplete="off">
          </div>
          <div class="gtx-fb-field">
            <textarea class="gtx-fb-textarea" id="gtx-fb-message" maxlength="${MAX_MESSAGE_LEN}" placeholder="Bug, idea, or a note about Gateonix…" required></textarea>
          </div>
          <div class="gtx-fb-hp" aria-hidden="true">
            <label for="gtx-fb-website">Leave blank</label>
            <input id="gtx-fb-website" name="website" type="text" tabindex="-1" autocomplete="off">
          </div>
          <div class="gtx-fb-form-row">
            <span class="gtx-fb-counter" id="gtx-fb-counter">0 / ${MAX_MESSAGE_LEN}</span>
            <button type="submit" class="gtx-fb-send" id="gtx-fb-send-btn">Send ▸</button>
          </div>
          <p class="gtx-fb-form-msg" id="gtx-fb-form-msg" role="status" hidden></p>
        </form>
        <div class="gtx-fb-feed" id="gtx-fb-feed">
          <p class="gtx-fb-status" id="gtx-fb-status">Connecting…</p>
        </div>
      </section>
    `;
    document.body.appendChild(root);
  }

  guardSubmit(root);
  return { root, isEmbed };
}

// Always intercept the form, even before Firebase has connected — otherwise
// a slow or blocked connection lets the click fall through to a native page
// navigation. connectFeedback() flips form.dataset.ready once wireSubmit()
// has attached the real handler; until then this just shows a status line.
function guardSubmit(root) {
  const form = root.querySelector("#gtx-fb-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (form.dataset.ready === "true") return;
    const text = isConfigured
      ? "Feedback isn't connected right now — try again shortly."
      : "Feedback storage isn't connected yet — see SETUP.md.";
    showFormMsg(form.querySelector("#gtx-fb-form-msg"), text, "error");
  });
}

// ---- open / close ---------------------------------------------------------

function initInteractions({ root, isEmbed }) {
  if (isEmbed) {
    // Already open and connected on page load
    connectFeedback(root);
    return;
  }

  const tabBtn = root.querySelector("#gtx-fb-tab-btn");
  const closeBtn = root.querySelector("#gtx-fb-close-btn");
  const overlay = root.querySelector("#gtx-fb-overlay");
  const panel = root.querySelector("#gtx-fb-panel");

  let connected = false;

  function open() {
    root.dataset.open = "true";
    tabBtn.setAttribute("aria-expanded", "true");
    panel.setAttribute("aria-hidden", "false");
    if (!connected) {
      connected = true;
      connectFeedback(root);
    }
    window.setTimeout(() => root.querySelector("#gtx-fb-name")?.focus(), 250);
  }

  function close() {
    root.dataset.open = "false";
    tabBtn.setAttribute("aria-expanded", "false");
    panel.setAttribute("aria-hidden", "true");
    tabBtn.focus();
  }

  function toggle() {
    if (root.dataset.open === "true") close();
    else open();
  }

  tabBtn.addEventListener("click", toggle);
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.dataset.open === "true") close();
  });

  // small public API in case you want to trigger the panel from your own nav
  window.GateonixFeedback = { open, close, toggle };
}

// ---- Firebase connection ---------------------------------------------

async function connectFeedback(root) {
  const feedEl = root.querySelector("#gtx-fb-feed");
  const form = root.querySelector("#gtx-fb-form");

  if (!isConfigured) {
    setStatus(feedEl, "Feedback storage isn't connected yet — see SETUP.md.", "error");
    disableForm(form, "Storage not configured yet.");
    return;
  }

  try {
    const [{ initializeApp }, firestore] = await Promise.all([
      import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`),
    ]);
    const { getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } = firestore;

    const app = initializeApp(FIREBASE_CONFIG);
    const db = getFirestore(app);
    const feedbackCol = collection(db, COLLECTION_NAME);
    const feedQuery = query(feedbackCol, orderBy("createdAt", "desc"), limit(FEED_LIMIT));

    const seen = new Set();
    let firstLoad = true;

    onSnapshot(
      feedQuery,
      (snap) => {
        const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderFeed(feedEl, entries, seen, firstLoad);
        firstLoad = false;
      },
      (err) => {
        console.error("Gateonix feedback: snapshot error", err);
        setStatus(feedEl, "Couldn't load feedback right now.", "error");
      }
    );

    form.dataset.ready = "true";
    wireSubmit(form, feedbackCol, addDoc, serverTimestamp);
  } catch (err) {
    console.error("Gateonix feedback: connection failed", err);
    setStatus(feedEl, "Couldn't reach feedback storage.", "error");
  }
}

// ---- feed rendering -----------------------------------------------------

function renderFeed(feedEl, entries, seen, firstLoad) {
  const prevScrollTop = feedEl.scrollTop;

  if (entries.length === 0) {
    feedEl.innerHTML = `<p class="gtx-fb-empty">No signals yet. Be the first to transmit.</p>`;
    return;
  }

  feedEl.innerHTML = "";
  for (const entry of entries) {
    const isNew = !firstLoad && !seen.has(entry.id);
    seen.add(entry.id);

    const card = document.createElement("div");
    card.className = isNew ? "gtx-fb-entry gtx-fb-entry--new" : "gtx-fb-entry";

    const meta = document.createElement("div");
    meta.className = "gtx-fb-entry-meta";

    const name = document.createElement("span");
    name.className = "gtx-fb-entry-name";
    name.textContent = (entry.name || "").trim() || "Anonymous";

    const time = document.createElement("span");
    time.textContent = relativeTime(entry.createdAt);

    meta.append(name, time);

    const msg = document.createElement("p");
    msg.className = "gtx-fb-entry-msg";
    msg.textContent = entry.message || "";

    card.append(meta, msg);
    feedEl.appendChild(card);
  }

  if (!firstLoad) feedEl.scrollTop = prevScrollTop;
}

function relativeTime(ts) {
  if (!ts || typeof ts.toDate !== "function") return "just now";
  const diffMs = Date.now() - ts.toDate().getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return ts.toDate().toLocaleDateString();
}

function setStatus(feedEl, text, kind = "") {
  feedEl.innerHTML = `<p class="gtx-fb-status" data-kind="${kind}">${text}</p>`;
}

function disableForm(form, reason) {
  form.querySelector("#gtx-fb-send-btn").disabled = true;
  const textarea = form.querySelector("#gtx-fb-message");
  textarea.disabled = true;
  textarea.placeholder = reason;
}

// ---- submit ---------------------------------------------------------------

function wireSubmit(form, feedbackCol, addDoc, serverTimestamp) {
  const nameInput = form.querySelector("#gtx-fb-name");
  const msgInput = form.querySelector("#gtx-fb-message");
  const hpInput = form.querySelector("#gtx-fb-website");
  const counter = form.querySelector("#gtx-fb-counter");
  const sendBtn = form.querySelector("#gtx-fb-send-btn");
  const formMsg = form.querySelector("#gtx-fb-form-msg");

  msgInput.addEventListener("input", () => {
    const len = msgInput.value.length;
    counter.textContent = `${len} / ${MAX_MESSAGE_LEN}`;
    counter.dataset.nearLimit = String(len > MAX_MESSAGE_LEN * 0.9);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formMsg.hidden = true;

    if (hpInput.value) return; // honeypot tripped — drop silently, no error shown to the bot

    const message = msgInput.value.trim();
    if (!message) {
      showFormMsg(formMsg, "Write a message first.", "error");
      return;
    }

    const waitMs = SUBMIT_COOLDOWN_MS - (Date.now() - getLastSubmitTs());
    if (waitMs > 0) {
      showFormMsg(formMsg, `Wait ${Math.ceil(waitMs / 1000)}s before sending again.`, "error");
      return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = "Sending…";

    try {
      await addDoc(feedbackCol, {
        name: nameInput.value.trim().slice(0, MAX_NAME_LEN),
        message: message.slice(0, MAX_MESSAGE_LEN),
        createdAt: serverTimestamp(),
      });
      setLastSubmitTs(Date.now());
      msgInput.value = "";
      counter.textContent = `0 / ${MAX_MESSAGE_LEN}`;
      showFormMsg(formMsg, "Sent — thanks for the signal.", "ok");
    } catch (err) {
      console.error("Gateonix feedback: submit failed", err);
      showFormMsg(formMsg, "Couldn't send. Try again.", "error");
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send ▸";
    }
  });
}

function showFormMsg(el, text, kind) {
  el.textContent = text;
  el.dataset.kind = kind;
  el.hidden = false;
}

function getLastSubmitTs() {
  try {
    return Number(localStorage.getItem("gtx_fb_last_submit")) || 0;
  } catch {
    return 0;
  }
}

function setLastSubmitTs(ts) {
  try {
    localStorage.setItem("gtx_fb_last_submit", String(ts));
  } catch {
    /* storage unavailable — cooldown just won't persist across reloads */
  }
}

// ---- init -----------------------------------------------------------------

function init() {
  if (document.getElementById("gtx-feedback-widget") || document.getElementById("gtx-feedback-embed-root")) return;
  const config = buildWidget();
  initInteractions(config);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
