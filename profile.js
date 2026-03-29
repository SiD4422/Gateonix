/**
 * profile.js — Gateonix Profile Bar + Edit Modal
 *
 * HOW TO USE — add this ONE line just before </body> on every page:
 *   <script src="profile.js"></script>
 *
 * What it does:
 *  - Reads sessionStorage "lf_user" to know who is logged in
 *  - Injects a profile chip in the top-right nav (hides the "Launch App" CTA)
 *  - Dropdown shows display name, @username, email and two actions:
 *      · Edit Profile → modal
 *      · Sign Out
 *  - Profile modal lets users:
 *      · Change Display Name  (editable)
 *      · Pick from 10 preset avatars
 *      · Upload a custom photo (max 2 MB)
 *      · Username & Email are shown as READ-ONLY / locked
 *  - Saves to localStorage "lf_profile_<username>"
 */

(function () {
  /* ── micro-utilities ─────────────────────────────────────────── */
  function esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function getUsers()  { return JSON.parse(localStorage.getItem('lf_users') || '[]'); }
  function getSession(){ return sessionStorage.getItem('lf_user'); }
  function getProfile(u) { return JSON.parse(localStorage.getItem('lf_profile_'+u) || '{}'); }
  function saveProfile(u, d) { localStorage.setItem('lf_profile_'+u, JSON.stringify(d)); }

  /* ── preset avatars ──────────────────────────────────────────── */
  const PRESETS = [
    { id:'circuit',  emoji:'⬡', bg:'linear-gradient(135deg,#00d4aa,#006b55)' },
    { id:'chip',     emoji:'🔬', bg:'linear-gradient(135deg,#40c4ff,#0066aa)' },
    { id:'neon',     emoji:'⚡', bg:'linear-gradient(135deg,#ffd600,#ff6f00)' },
    { id:'galaxy',   emoji:'🌌', bg:'linear-gradient(135deg,#9c6bff,#3d0080)' },
    { id:'fire',     emoji:'🔥', bg:'linear-gradient(135deg,#ff5722,#880022)' },
    { id:'matrix',   emoji:'▣',  bg:'linear-gradient(135deg,#00e676,#004d20)' },
    { id:'ice',      emoji:'❄',  bg:'linear-gradient(135deg,#80d8ff,#0044aa)' },
    { id:'robo',     emoji:'🤖', bg:'linear-gradient(135deg,#cfd8dc,#455a64)' },
    { id:'quantum',  emoji:'⚛',  bg:'linear-gradient(135deg,#f48fb1,#880033)' },
    { id:'ghost',    emoji:'👾', bg:'linear-gradient(135deg,#b39ddb,#3d1080)' },
  ];

  function presetById(id) {
    return PRESETS.find(p => p.id === id) || PRESETS[0];
  }

  function avatarBg(profile) {
    if (profile.avatarType === 'custom') return '#1e2535';
    return presetById(profile.avatarId).bg;
  }

  function avatarInner(profile, size) {
    const fs = Math.round(size * 0.48);
    if (profile.avatarType === 'custom' && profile.avatarData) {
      return `<img src="${profile.avatarData}" style="width:100%;height:100%;object-fit:cover;" alt=""/>`;
    }
    return `<span style="font-size:${fs}px;line-height:1">${presetById(profile.avatarId).emoji}</span>`;
  }

  /* ══════════════════════════════════════════════════════════════
     STYLES
  ══════════════════════════════════════════════════════════════ */
  const CSS = `
/* ── Profile chip ─────────────────────────────────────────────── */
.gx-chip {
  display:flex;align-items:center;gap:8px;
  padding:4px 4px 4px 12px;
  background:rgba(255,255,255,0.04);
  border:1px solid rgba(255,255,255,0.1);
  border-radius:40px;cursor:pointer;
  transition:all .18s;flex-shrink:0;
  position:relative;margin-left:0;
  user-select:none;
  font-family:'JetBrains Mono',monospace;
}
.gx-chip:hover{background:rgba(0,212,170,.08);border-color:rgba(0,212,170,.3);box-shadow:0 0 0 3px rgba(0,212,170,.08);}
.gx-chip:focus-visible{outline:2px solid #00d4aa;outline-offset:2px;}
.gx-chip-name{font-size:11px;font-weight:600;color:#cdd5e0;letter-spacing:.03em;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.gx-chip-av{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1.5px solid rgba(255,255,255,.12);overflow:hidden;background:#1e2535;}
.gx-chip-av img{width:100%;height:100%;object-fit:cover;}
.gx-chip-arr{font-size:9px;color:#64748b;margin-right:4px;margin-left:-2px;transition:transform .18s;}
.gx-chip[aria-expanded="true"] .gx-chip-arr{transform:rotate(180deg);}

/* ── Dropdown ─────────────────────────────────────────────────── */
.gx-dd{position:absolute;top:calc(100% + 8px);right:0;background:#0f1218;border:1px solid rgba(255,255,255,.1);border-radius:14px;width:220px;box-shadow:0 20px 60px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.03) inset;z-index:9999;overflow:hidden;animation:gx-drop .18s ease;transform-origin:top right;}
@keyframes gx-drop{from{opacity:0;transform:scale(.92) translateY(-6px)}to{opacity:1;transform:scale(1) translateY(0)}}
.gx-dd-head{padding:14px 16px 10px;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:10px;}
.gx-dd-av{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;border:1.5px solid rgba(255,255,255,.1);overflow:hidden;background:#1e2535;}
.gx-dd-av img{width:100%;height:100%;object-fit:cover;}
.gx-dd-info{overflow:hidden;}
.gx-dd-dname{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gx-dd-uname{font-family:'JetBrains Mono',monospace;font-size:10px;color:#64748b;margin-top:1px;}
.gx-dd-email{font-family:'JetBrains Mono',monospace;font-size:9px;color:#475569;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gx-dd-body{padding:6px;}
.gx-dd-item{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#94a3b8;cursor:pointer;transition:all .14s;border:none;background:none;width:100%;text-align:left;}
.gx-dd-item:hover{background:rgba(255,255,255,.05);color:#e2e8f0;}
.gx-dd-item.danger:hover{background:rgba(248,113,113,.08);color:#f87171;}
.gx-dd-item svg{width:14px;height:14px;flex-shrink:0;}
.gx-dd-sep{height:1px;background:rgba(255,255,255,.07);margin:4px 6px;}

/* ── Modal ────────────────────────────────────────────────────── */
.gx-overlay{position:fixed;inset:0;z-index:10000;background:rgba(4,6,10,.88);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:20px;animation:gx-fade .18s ease;}
@keyframes gx-fade{from{opacity:0}to{opacity:1}}
.gx-modal{background:#0f1218;border:1px solid rgba(255,255,255,.1);border-radius:20px;width:100%;max-width:500px;max-height:90vh;overflow-y:auto;box-shadow:0 40px 100px rgba(0,0,0,.8);animation:gx-min .22s cubic-bezier(.22,.68,0,1.2);scrollbar-width:thin;scrollbar-color:#1e2535 transparent;}
@keyframes gx-min{from{opacity:0;transform:scale(.9) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
.gx-mhead{padding:24px 24px 18px;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-between;}
.gx-mtitle{font-family:'Syne',sans-serif;font-weight:800;font-size:18px;color:#e2e8f0;letter-spacing:-.02em;}
.gx-mclose{width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,.05);border:none;color:#64748b;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .14s;}
.gx-mclose:hover{background:rgba(248,113,113,.1);color:#f87171;}
.gx-mbody{padding:24px;display:flex;flex-direction:column;gap:28px;}

/* avatar preview row */
.gx-av-row{display:flex;align-items:center;gap:16px;}
.gx-av-prev{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;border:2px solid rgba(0,212,170,.3);overflow:hidden;background:#1e2535;box-shadow:0 0 0 4px rgba(0,212,170,.06);}
.gx-av-prev img{width:100%;height:100%;object-fit:cover;}
.gx-av-btns{display:flex;flex-direction:column;gap:7px;}
.gx-upload-lbl{font-family:'JetBrains Mono',monospace;font-size:11px;color:#00d4aa;background:rgba(0,212,170,.07);border:1px solid rgba(0,212,170,.2);border-radius:7px;padding:7px 14px;cursor:pointer;transition:all .15s;display:inline-block;}
.gx-upload-lbl:hover{background:rgba(0,212,170,.14);border-color:rgba(0,212,170,.4);}
.gx-av-note{font-family:'JetBrains Mono',monospace;font-size:9px;color:#475569;}

/* preset grid */
.gx-presets{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;}
.gx-pb{aspect-ratio:1;border-radius:50%;border:2px solid transparent;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;transition:all .15s;position:relative;}
.gx-pb:hover{transform:scale(1.08);}
.gx-pb.sel{border-color:#00d4aa;box-shadow:0 0 0 3px rgba(0,212,170,.2);}
.gx-pb.sel::after{content:'✓';position:absolute;bottom:-3px;right:-3px;width:14px;height:14px;background:#00d4aa;color:#050e0b;font-size:9px;font-weight:900;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:sans-serif;}

/* form field */
.gx-field{display:flex;flex-direction:column;gap:6px;}
.gx-field label{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:#64748b;letter-spacing:.12em;text-transform:uppercase;display:flex;align-items:center;gap:6px;}
.gx-lock{display:inline-flex;align-items:center;gap:4px;font-family:'JetBrains Mono',monospace;font-size:9px;color:#64748b;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:4px;padding:2px 7px;}
.gx-input{background:#161b24;border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:11px 14px;color:#e2e8f0;font-family:'JetBrains Mono',monospace;font-size:13px;outline:none;transition:border-color .15s,box-shadow .15s;width:100%;}
.gx-input:focus{border-color:#00d4aa;box-shadow:0 0 0 3px rgba(0,212,170,.13);}
.gx-input:disabled{opacity:.45;cursor:not-allowed;}
.gx-hint{font-family:'JetBrains Mono',monospace;font-size:9px;color:#475569;margin-top:2px;}

/* section label */
.gx-slabel{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:#64748b;letter-spacing:.12em;text-transform:uppercase;}

/* action row */
.gx-acts{display:flex;gap:10px;justify-content:flex-end;}
.gx-btn-save{font-family:'Syne',sans-serif;font-weight:700;font-size:13px;color:#050e0b;background:#00d4aa;border:none;border-radius:9px;padding:11px 28px;cursor:pointer;transition:all .15s;letter-spacing:.02em;}
.gx-btn-save:hover{background:#00ffcc;transform:translateY(-1px);box-shadow:0 8px 24px rgba(0,212,170,.3);}
.gx-btn-save:active{transform:none;box-shadow:none;}
.gx-btn-save.ok{background:#34d399;}
.gx-btn-cancel{font-family:'JetBrains Mono',monospace;font-size:11px;color:#64748b;background:transparent;border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:11px 18px;cursor:pointer;transition:all .15s;}
.gx-btn-cancel:hover{color:#e2e8f0;border-color:rgba(255,255,255,.2);}

/* toast */
.gx-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(8px);background:#0f1218;border:1px solid rgba(0,212,170,.3);border-radius:10px;padding:12px 22px;font-family:'JetBrains Mono',monospace;font-size:12px;color:#00d4aa;box-shadow:0 12px 40px rgba(0,0,0,.6);z-index:20000;opacity:0;transition:opacity .22s,transform .22s;pointer-events:none;}
.gx-toast.on{opacity:1;transform:translateX(-50%) translateY(0);}
`;

  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  /* ══════════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════════ */
  let _user    = getSession();
  let _pending = null; // pending avatar change while modal is open
  let _dd      = null;

  /* ══════════════════════════════════════════════════════════════
     CHIP INJECTION
  ══════════════════════════════════════════════════════════════ */
  function injectChip() {
    if (!_user) return;

    const nav = document.querySelector('#site-nav') || document.querySelector('nav');
    if (!nav) return;

    // hide old "launch app" CTA since user is already in
    const cta = nav.querySelector('.sn-cta, .nav-cta');
    if (cta) cta.style.display = 'none';

    const profile   = getProfile(_user);
    const dispName  = profile.displayName || _user;

    const chip = document.createElement('button');
    chip.className = 'gx-chip';
    chip.setAttribute('aria-haspopup','true');
    chip.setAttribute('aria-expanded','false');
    chip.setAttribute('aria-label','Profile menu');
    chip.innerHTML = `
      <span class="gx-chip-name">${esc(dispName)}</span>
      <div class="gx-chip-av" style="background:${avatarBg(profile)}">
        ${avatarInner(profile, 30)}
      </div>
      <span class="gx-chip-arr">▾</span>
    `;

    // Append chip directly onto the nav bar (not inside .sn-links)
    // so it always sits at the far right after the CTA slot
    nav.appendChild(chip);

    chip.addEventListener('click', e => {
      e.stopPropagation();
      chip.getAttribute('aria-expanded') === 'true' ? closeDd() : openDd(chip);
    });
  }

  function refreshChip(profile) {
    const chip = document.querySelector('.gx-chip');
    if (!chip) return;
    chip.querySelector('.gx-chip-name').textContent = profile.displayName || _user;
    const av = chip.querySelector('.gx-chip-av');
    av.style.background = avatarBg(profile);
    av.innerHTML = avatarInner(profile, 30);
  }

  /* ══════════════════════════════════════════════════════════════
     DROPDOWN
  ══════════════════════════════════════════════════════════════ */
  function openDd(chip) {
    closeDd();
    chip.setAttribute('aria-expanded','true');

    const profile  = getProfile(_user);
    const userRec  = getUsers().find(u => u.username === _user) || {};
    const dispName = profile.displayName || _user;

    _dd = document.createElement('div');
    _dd.className = 'gx-dd';
    _dd.setAttribute('role','menu');
    _dd.innerHTML = `
      <div class="gx-dd-head">
        <div class="gx-dd-av" style="background:${avatarBg(profile)}">
          ${avatarInner(profile, 38)}
        </div>
        <div class="gx-dd-info">
          <div class="gx-dd-dname">${esc(dispName)}</div>
          <div class="gx-dd-uname">@${esc(_user)}</div>
          ${userRec.email ? `<div class="gx-dd-email">${esc(userRec.email)}</div>` : ''}
        </div>
      </div>
      <div class="gx-dd-body">
        <button class="gx-dd-item" id="_gx_edit" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>Edit Profile
        </button>
        <div class="gx-dd-sep"></div>
        <button class="gx-dd-item danger" id="_gx_logout" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>Sign Out
        </button>
      </div>
    `;

    chip.appendChild(_dd);
    _dd.querySelector('#_gx_edit').addEventListener('click', () => { closeDd(); openModal(); });
    _dd.querySelector('#_gx_logout').addEventListener('click', doLogout);

    setTimeout(() => {
      document.addEventListener('click', onClickOut, { capture: true });
    }, 0);
  }

  function closeDd() {
    const chip = document.querySelector('.gx-chip');
    if (chip) chip.setAttribute('aria-expanded','false');
    if (_dd) { _dd.remove(); _dd = null; }
    document.removeEventListener('click', onClickOut, { capture: true });
  }

  function onClickOut(e) {
    if (_dd && !_dd.contains(e.target) && !e.target.closest('.gx-chip')) closeDd();
  }

  /* ══════════════════════════════════════════════════════════════
     MODAL
  ══════════════════════════════════════════════════════════════ */
  function openModal() {
    const profile  = getProfile(_user);
    const userRec  = getUsers().find(u => u.username === _user) || {};
    _pending = null;

    const presetsHTML = PRESETS.map(p => {
      const isSel = profile.avatarType !== 'custom' && profile.avatarId === p.id;
      return `<button class="gx-pb${isSel?' sel':''}" data-pid="${p.id}"
        style="background:${p.bg}" title="${p.id}">${p.emoji}</button>`;
    }).join('');

    const ov = document.createElement('div');
    ov.className = 'gx-overlay';
    ov.id = '_gx_ov';
    ov.innerHTML = `
      <div class="gx-modal" role="dialog" aria-modal="true" aria-labelledby="_gx_mt">
        <div class="gx-mhead">
          <span class="gx-mtitle" id="_gx_mt">Edit Profile</span>
          <button class="gx-mclose" id="_gx_mc" aria-label="Close">✕</button>
        </div>
        <div class="gx-mbody">

          <div style="display:flex;flex-direction:column;gap:14px">
            <span class="gx-slabel">Profile Picture</span>
            <div class="gx-av-row">
              <div class="gx-av-prev" id="_gx_prev" style="background:${avatarBg(profile)}">
                ${avatarInner(profile, 64)}
              </div>
              <div class="gx-av-btns">
                <label class="gx-upload-lbl">
                  ↑ Upload Image
                  <input type="file" id="_gx_file" accept="image/*" style="display:none"/>
                </label>
                <span class="gx-av-note">JPG, PNG, GIF · max 2 MB</span>
              </div>
            </div>
            <span class="gx-slabel" style="margin-top:4px">Choose Avatar</span>
            <div class="gx-presets" id="_gx_pg">${presetsHTML}</div>
          </div>

          <div class="gx-field">
            <label for="_gx_dn">Display Name</label>
            <input class="gx-input" type="text" id="_gx_dn" maxlength="30"
              value="${esc(profile.displayName || userRec.username || _user)}"
              placeholder="How you appear in the app"/>
            <span class="gx-hint">Visible to you across the app. Change it anytime.</span>
          </div>

          <div class="gx-field">
            <label>Username <span class="gx-lock">🔒 locked</span></label>
            <input class="gx-input" type="text" value="${esc(_user)}" disabled/>
            <span class="gx-hint">Username cannot be changed after registration.</span>
          </div>

          <div class="gx-field">
            <label>Email <span class="gx-lock">🔒 locked</span></label>
            <input class="gx-input" type="email" value="${esc(userRec.email||'—')}" disabled/>
            <span class="gx-hint">Contact support to update your email address.</span>
          </div>

          <div class="gx-acts">
            <button class="gx-btn-cancel" id="_gx_cancel">Cancel</button>
            <button class="gx-btn-save"   id="_gx_save">Save Changes</button>
          </div>

        </div>
      </div>
    `;

    document.body.appendChild(ov);

    // close triggers
    ov.querySelector('#_gx_mc').addEventListener('click', closeModal);
    ov.querySelector('#_gx_cancel').addEventListener('click', closeModal);
    ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
    document.addEventListener('keydown', onEsc);

    // preset pick
    ov.querySelectorAll('.gx-pb').forEach(btn => {
      btn.addEventListener('click', () => {
        ov.querySelectorAll('.gx-pb').forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
        const p = PRESETS.find(x => x.id === btn.dataset.pid);
        _pending = { type:'preset', id: p.id };
        const prev = ov.querySelector('#_gx_prev');
        prev.style.background = p.bg;
        prev.innerHTML = `<span style="font-size:28px;line-height:1">${p.emoji}</span>`;
      });
    });

    // file upload
    ov.querySelector('#_gx_file').addEventListener('change', function() {
      const f = this.files[0];
      if (!f) return;
      if (f.size > 2*1024*1024) { toast('Image too large — max 2 MB'); return; }
      const r = new FileReader();
      r.onload = ev => {
        _pending = { type:'custom', data: ev.target.result };
        const prev = ov.querySelector('#_gx_prev');
        prev.style.background = '#1e2535';
        prev.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt=""/>`;
        ov.querySelectorAll('.gx-pb').forEach(b => b.classList.remove('sel'));
      };
      r.readAsDataURL(f);
    });

    // save
    ov.querySelector('#_gx_save').addEventListener('click', () => {
      const btn = ov.querySelector('#_gx_save');
      const dn  = ov.querySelector('#_gx_dn').value.trim();
      const updated = { ...profile };

      if (dn) updated.displayName = dn;

      if (_pending) {
        if (_pending.type === 'preset') {
          updated.avatarType = 'preset';
          updated.avatarId   = _pending.id;
          delete updated.avatarData;
        } else {
          updated.avatarType = 'custom';
          updated.avatarData = _pending.data;
          delete updated.avatarId;
        }
      }

      saveProfile(_user, updated);
      btn.textContent = '✓ Saved!';
      btn.classList.add('ok');
      refreshChip(updated);
      toast('Profile updated!');
      setTimeout(closeModal, 650);
    });
  }

  function closeModal() {
    const ov = document.getElementById('_gx_ov');
    if (ov) ov.remove();
    document.removeEventListener('keydown', onEsc);
    _pending = null;
  }

  function onEsc(e) { if (e.key === 'Escape') closeModal(); }

  /* ══════════════════════════════════════════════════════════════
     LOGOUT / TOAST
  ══════════════════════════════════════════════════════════════ */
  function doLogout() {
    closeDd();
    sessionStorage.removeItem('lf_user');
    window.location.href = 'login.html';
  }

  let _toastEl = null, _toastTimer = null;
  function toast(msg) {
    if (!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.className = 'gx-toast';
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = msg;
    _toastEl.classList.add('on');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => _toastEl.classList.remove('on'), 2300);
  }

  /* ══════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════ */
  function init() {
    if (!getSession()) return;
    injectChip();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
