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

function getSessionId() {
  let sid = localStorage.getItem("gtx_fb_sid");
  if (!sid) {
    sid = "sid_" + Math.random().toString(36).substring(2, 10);
    localStorage.setItem("gtx_fb_sid", sid);
  }
  return sid;
}
const SESSION_ID = getSessionId();

// ---- DOM ----------------------------------------------------------------

function buildWidget() {
  const embedTarget = document.getElementById("gtx-fb-embed");
  const isEmbed = !!embedTarget;

  const root = document.createElement("div");
  root.className = isEmbed ? "gtx-feedback-embed" : "gtx-feedback-widget";
  root.id = isEmbed ? "gtx-feedback-embed-root" : "gtx-feedback-widget";
  root.dataset.open = isEmbed ? "true" : "false";

  const chatHTML = `
    <header class="gtx-chat-header">
      <div class="gtx-chat-avatar">
        <span class="avatar-icon">⬡</span>
        <div class="status-dot"></div>
      </div>
      <div class="gtx-chat-info">
        <h3>Gateonix Developer</h3>
        <p>Typically replies fast</p>
      </div>
      ${!isEmbed ? '<button type="button" class="gtx-chat-close" id="gtx-fb-close-btn" aria-label="Close chat">✕</button>' : ''}
    </header>
    <div class="gtx-chat-feed" id="gtx-fb-feed">
      <p class="gtx-fb-status" id="gtx-fb-status">Connecting…</p>
    </div>
    <form class="gtx-chat-input-bar" id="gtx-fb-form" novalidate>
      <input class="gtx-chat-name" id="gtx-fb-name" type="text" maxlength="${MAX_NAME_LEN}" placeholder="Name (optional)" autocomplete="off">
      <div class="gtx-chat-input-wrapper">
        <textarea class="gtx-chat-textarea" id="gtx-fb-message" maxlength="${MAX_MESSAGE_LEN}" placeholder="Type your message..." required rows="1"></textarea>
        <button type="submit" class="gtx-chat-send" id="gtx-fb-send-btn" title="Send">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
      <div class="gtx-fb-hp" aria-hidden="true">
        <label for="gtx-fb-website">Leave blank</label>
        <input id="gtx-fb-website" name="website" type="text" tabindex="-1" autocomplete="off">
      </div>
      <p class="gtx-fb-form-msg" id="gtx-fb-form-msg" role="status" hidden></p>
    </form>
  `;

  if (isEmbed) {
    root.innerHTML = `<section class="gtx-chat-window" id="gtx-fb-panel">${chatHTML}</section>`;
    embedTarget.appendChild(root);
  } else {
    root.innerHTML = `
      <button type="button" class="gtx-fb-tab" id="gtx-fb-tab-btn" aria-expanded="false" aria-controls="gtx-fb-panel">
        <span class="gtx-fb-tab-dot" aria-hidden="true"></span>Feedback
      </button>
      <div class="gtx-fb-overlay" id="gtx-fb-overlay"></div>
      <section class="gtx-chat-window gtx-chat-window-floating" id="gtx-fb-panel" role="dialog" aria-label="Feedback" aria-hidden="true">
        ${chatHTML}
      </section>
    `;
    document.body.appendChild(root);
  }

  guardSubmit(root);
  return { root, isEmbed };
}

// Always intercept the form, even before Firebase has connected
function guardSubmit(root) {
  const form = root.querySelector("#gtx-fb-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (form.dataset.ready === "true") return;
    const text = isConfigured
      ? "Connecting to chat... try again shortly."
      : "Feedback storage isn't connected yet — see SETUP.md.";
    showFormMsg(form.querySelector("#gtx-fb-form-msg"), text, "error");
  });
}

// ---- open / close ---------------------------------------------------------

function initInteractions({ root, isEmbed }) {
  const textarea = root.querySelector('#gtx-fb-message');
  const form = root.querySelector('#gtx-fb-form');
  
  // Submit on enter without shift
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // If form is ready and valid, submit it
      if (form.dataset.ready === "true" && form.checkValidity()) {
        form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    }
  });

  if (isEmbed) {
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
    form.querySelector("#gtx-fb-message").focus();

    if (!connected) {
      connected = true;
      connectFeedback(root);
    }
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
  const isScrolledToBottom = feedEl.scrollHeight - feedEl.clientHeight <= feedEl.scrollTop + 10;

  if (entries.length === 0) {
    feedEl.innerHTML = `<p class="gtx-fb-empty">No messages yet. Say hello!</p>`;
    return;
  }

  feedEl.innerHTML = "";
  // Sort entries ascending for chat
  const sorted = [...entries].reverse();

  for (const entry of sorted) {
    seen.add(entry.id);

    const isMine = entry.sessionId === SESSION_ID;
    const card = document.createElement("div");
    card.className = isMine ? "gtx-chat-bubble-right" : "gtx-chat-bubble-left";

    const bubble = document.createElement("div");
    bubble.className = "gtx-chat-bubble-inner";

    if (!isMine) {
      const name = document.createElement("span");
      name.className = "gtx-chat-name-lbl";
      name.textContent = (entry.name || "").trim() || "Anonymous";
      bubble.appendChild(name);
    }

    const msg = document.createElement("p");
    msg.className = "gtx-chat-msg-text";
    msg.textContent = entry.message || "";
    bubble.appendChild(msg);

    const time = document.createElement("span");
    time.className = "gtx-chat-time";
    time.textContent = relativeTime(entry.createdAt);
    
    card.append(bubble, time);
    feedEl.appendChild(card);
  }

  // Scroll to bottom
  if (firstLoad || isScrolledToBottom) {
    feedEl.scrollTop = feedEl.scrollHeight;
  } else {
    feedEl.scrollTop = prevScrollTop;
  }
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
  const hpInput = form.querySelector("#gtx-fb-website");
  const sendBtn = form.querySelector("#gtx-fb-send-btn");
  const formMsg = form.querySelector("#gtx-fb-form-msg");
  const msgInput = form.querySelector("#gtx-fb-message");
  const nameInput = form.querySelector("#gtx-fb-name");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formMsg.hidden = true;

    if (hpInput && hpInput.value) return; // honeypot tripped

    const message = (msgInput.value || "").trim();
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

    try {
      const payload = {
        message: message.slice(0, MAX_MESSAGE_LEN),
        createdAt: serverTimestamp(),
        sessionId: SESSION_ID
      };
      
      const name = nameInput ? nameInput.value.trim() : "";
      if (name) payload.name = name.slice(0, MAX_NAME_LEN);

      await addDoc(feedbackCol, payload);
      setLastSubmitTs(Date.now());
      
      // Reset form
      if (msgInput) {
        msgInput.value = "";
        msgInput.style.height = 'auto'; // reset textarea height
      }
      
    } catch (err) {
      console.error("Gateonix feedback: submit failed", err);
      showFormMsg(formMsg, "Couldn't send. Try again.", "error");
    } finally {
      sendBtn.disabled = false;
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
