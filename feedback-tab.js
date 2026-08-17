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
      <section class="gtx-fb-panel template-2col" id="gtx-fb-panel">
        <div class="gtx-fb-template-wrapper">
          <div class="gtx-fb-sidebar">
            <div class="gtx-fb-sb-icon">💬</div>
            <h2 class="gtx-fb-sb-title">We value your <span>feedback</span></h2>
            <p class="gtx-fb-sb-desc">Your opinion helps us build better products and provide a better experience for everyone.</p>
            <div class="gtx-fb-sb-points">
              <div class="gtx-fb-point">
                <div class="gtx-fb-point-icon">🛡️</div>
                <div class="gtx-fb-point-text">
                  <h4>Your feedback is secure</h4>
                  <p>We keep your responses private and safe.</p>
                </div>
              </div>
              <div class="gtx-fb-point">
                <div class="gtx-fb-point-icon">⚡</div>
                <div class="gtx-fb-point-text">
                  <h4>It only takes a minute</h4>
                  <p>Quick and easy feedback process.</p>
                </div>
              </div>
              <div class="gtx-fb-point">
                <div class="gtx-fb-point-icon">🎯</div>
                <div class="gtx-fb-point-text">
                  <h4>Make an impact</h4>
                  <p>Your feedback drives real improvements.</p>
                </div>
              </div>
            </div>
          </div>
          
          <div class="gtx-fb-main">
            <div class="gtx-fb-main-header">
              <div class="icon">💬</div>
              <div>
                <h3>Share your feedback</h3>
                <p>Help us improve by sharing your experience</p>
              </div>
            </div>
            
            <form class="gtx-fb-form" id="gtx-fb-form" novalidate style="padding:0; border:none; margin:0;">
              <div class="gtx-fb-row-2">
                <div class="gtx-fb-field">
                  <label class="gtx-fb-lbl" for="gtx-fb-category">What is your feedback about? <span>*</span></label>
                  <select class="gtx-fb-select" id="gtx-fb-category" required>
                    <option value="">Select a category</option>
                    <option value="Bug">Bug Report</option>
                    <option value="Feature">Feature Request</option>
                    <option value="Praise">Praise</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div class="gtx-fb-field">
                  <label class="gtx-fb-lbl">Overall experience <span>*</span></label>
                  <div class="gtx-fb-stars" id="gtx-fb-stars-group">
                    <span class="gtx-fb-star" data-val="1">☆</span>
                    <span class="gtx-fb-star" data-val="2">☆</span>
                    <span class="gtx-fb-star" data-val="3">☆</span>
                    <span class="gtx-fb-star" data-val="4">☆</span>
                    <span class="gtx-fb-star" data-val="5">☆</span>
                  </div>
                  <span class="gtx-fb-star-caption">Click to rate</span>
                  <input type="hidden" id="gtx-fb-rating" value="0">
                </div>
              </div>

              <div class="gtx-fb-field" style="margin-top: 24px;">
                <label class="gtx-fb-lbl" for="gtx-fb-message">Tell us more <span>*</span></label>
                <textarea class="gtx-fb-textarea" id="gtx-fb-message" maxlength="${MAX_MESSAGE_LEN}" placeholder="What did you like or dislike? Any suggestions?" required></textarea>
                <div class="gtx-fb-form-row" style="justify-content: flex-end;">
                  <span class="gtx-fb-counter" id="gtx-fb-counter">0 / ${MAX_MESSAGE_LEN}</span>
                </div>
              </div>

              <div class="gtx-fb-field" style="margin-top: 24px;">
                <label class="gtx-fb-lbl">How likely are you to recommend us to others?</label>
                <div class="gtx-fb-nps-row" id="gtx-fb-nps-group">
                  <button type="button" class="gtx-fb-nps-btn" data-val="0">0</button>
                  <button type="button" class="gtx-fb-nps-btn" data-val="1">1</button>
                  <button type="button" class="gtx-fb-nps-btn" data-val="2">2</button>
                  <button type="button" class="gtx-fb-nps-btn" data-val="3">3</button>
                  <button type="button" class="gtx-fb-nps-btn" data-val="4">4</button>
                  <button type="button" class="gtx-fb-nps-btn" data-val="5">5</button>
                  <button type="button" class="gtx-fb-nps-btn" data-val="6">6</button>
                  <button type="button" class="gtx-fb-nps-btn" data-val="7">7</button>
                  <button type="button" class="gtx-fb-nps-btn" data-val="8">8</button>
                  <button type="button" class="gtx-fb-nps-btn" data-val="9">9</button>
                  <button type="button" class="gtx-fb-nps-btn" data-val="10">10</button>
                </div>
                <div class="gtx-fb-nps-labels">
                  <span>Not likely</span>
                  <span>Very likely</span>
                </div>
                <input type="hidden" id="gtx-fb-nps" value="-1">
              </div>

              <div class="gtx-fb-toggle-row" style="margin-top: 24px;">
                <div class="gtx-fb-toggle-lbl">
                  <h4>May we contact you for more details?</h4>
                  <p>Optional - your contact info will not be shared</p>
                </div>
                <label class="gtx-fb-switch">
                  <input type="checkbox" id="gtx-fb-contact">
                  <span class="gtx-fb-slider"></span>
                </label>
              </div>

              <div class="gtx-fb-row-2" style="margin-top: 16px;">
                <div class="gtx-fb-field">
                  <input class="gtx-fb-input" id="gtx-fb-name" type="text" maxlength="${MAX_NAME_LEN}" placeholder="👤 Your name (optional)" autocomplete="off">
                </div>
                <div class="gtx-fb-field">
                  <input class="gtx-fb-input" id="gtx-fb-email" type="email" placeholder="✉️ Email address (optional)" autocomplete="off">
                </div>
              </div>

              <div class="gtx-fb-hp" aria-hidden="true">
                <label for="gtx-fb-website">Leave blank</label>
                <input id="gtx-fb-website" name="website" type="text" tabindex="-1" autocomplete="off">
              </div>

              <button type="submit" class="gtx-fb-submit-lg" id="gtx-fb-send-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                Submit Feedback
              </button>
              <p class="gtx-fb-submit-note" style="margin-top: 12px;">🔒 Thank you! Your feedback makes a difference.</p>
              <p class="gtx-fb-form-msg" id="gtx-fb-form-msg" role="status" hidden></p>
            </form>
          </div>
        </div>

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
    // Bind interactive elements
    const stars = root.querySelectorAll('.gtx-fb-star');
    const ratingInput = root.querySelector('#gtx-fb-rating');
    stars.forEach(star => {
      star.addEventListener('click', () => {
        const val = parseInt(star.dataset.val, 10);
        ratingInput.value = val;
        stars.forEach(s => {
          if (parseInt(s.dataset.val, 10) <= val) {
            s.classList.add('active');
            s.textContent = '★';
          } else {
            s.classList.remove('active');
            s.textContent = '☆';
          }
        });
      });
    });

    const npsBtns = root.querySelectorAll('.gtx-fb-nps-btn');
    const npsInput = root.querySelector('#gtx-fb-nps');
    npsBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        npsInput.value = val;
        npsBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

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

    let extras = null;
    if (entry.category || entry.rating) {
      extras = document.createElement("div");
      extras.className = "gtx-fb-entry-extras";
      extras.style.display = "flex";
      extras.style.gap = "8px";
      extras.style.marginBottom = "8px";
      extras.style.fontSize = "11px";
      extras.style.fontFamily = "var(--gtx-fb-font-mono)";

      if (entry.category) {
        const cat = document.createElement("span");
        cat.style.padding = "2px 6px";
        cat.style.background = "rgba(140,120,240,0.1)";
        cat.style.color = "#8c78f0";
        cat.style.borderRadius = "4px";
        cat.textContent = entry.category;
        extras.appendChild(cat);
      }
      if (entry.rating) {
        const r = document.createElement("span");
        r.style.color = "#8c78f0";
        r.textContent = "★".repeat(entry.rating) + "☆".repeat(5 - entry.rating);
        extras.appendChild(r);
      }
    }

    const msg = document.createElement("p");
    msg.className = "gtx-fb-entry-msg";
    msg.textContent = entry.message || "";

    if (extras) {
      card.append(meta, extras, msg);
    } else {
      card.append(meta, msg);
    }
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
  const hpInput = form.querySelector("#gtx-fb-website");
  const sendBtn = form.querySelector("#gtx-fb-send-btn");
  const formMsg = form.querySelector("#gtx-fb-form-msg");
  const msgInput = form.querySelector("#gtx-fb-message");
  const counter = form.querySelector("#gtx-fb-counter");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formMsg.hidden = true;

    if (hpInput.value) return; // honeypot tripped

    const data = getFormData(form);
    if (!data.message) {
      showFormMsg(formMsg, "Write a message first.", "error");
      return;
    }

    const waitMs = SUBMIT_COOLDOWN_MS - (Date.now() - getLastSubmitTs());
    if (waitMs > 0) {
      showFormMsg(formMsg, `Wait ${Math.ceil(waitMs / 1000)}s before sending again.`, "error");
      return;
    }

    sendBtn.disabled = true;
    sendBtn.innerHTML = "Sending…";

    try {
      const payload = {
        message: data.message.slice(0, MAX_MESSAGE_LEN),
        createdAt: serverTimestamp(),
      };
      // Only attach extra fields if they are present/modified
      if (data.name && data.name !== "Anonymous") payload.name = data.name.slice(0, MAX_NAME_LEN);
      if (data.category) payload.category = data.category;
      if (data.rating > 0) payload.rating = data.rating;
      if (data.nps >= 0) payload.nps = data.nps;
      if (data.contact) payload.contact = true;
      if (data.email) payload.email = data.email;

      await addDoc(feedbackCol, payload);
      setLastSubmitTs(Date.now());
      
      // Reset form
      if (msgInput) msgInput.value = "";
      if (counter) counter.textContent = `0 / ${MAX_MESSAGE_LEN}`;
      // Reset stars
      form.querySelectorAll('.gtx-fb-star').forEach(s => { s.classList.remove('active'); s.textContent = '☆'; });
      const ratingInput = form.querySelector('#gtx-fb-rating');
      if (ratingInput) ratingInput.value = "0";
      // Reset NPS
      form.querySelectorAll('.gtx-fb-nps-btn').forEach(b => b.classList.remove('active'));
      const npsInput = form.querySelector('#gtx-fb-nps');
      if (npsInput) npsInput.value = "-1";
      // Reset select
      const cat = form.querySelector('#gtx-fb-category');
      if (cat) cat.value = "";
      
      showFormMsg(formMsg, "Sent — thanks for the signal.", "ok");
    } catch (err) {
      console.error("Gateonix feedback: submit failed", err);
      showFormMsg(formMsg, "Couldn't send. Try again.", "error");
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> Submit Feedback`;
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
