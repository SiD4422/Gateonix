/* waveform.js — Timing Diagram / Waveform Viewer for LogicForge
   ================================================================
   Features:
   1. Core waveform recording & display
   2. Step mode  — advance 1 tick at a time manually
   3. Edge markers — ↑↓ markers on every signal transition
   4. Bus display  — group signals into hex/decimal value
   5. Pattern generator — auto-feed input sequences
   ================================================================
   Rules: No 'use strict', no classes, no DOMContentLoaded
   Globals used from app.js: resize(), gates, connections
   ================================================================ */

window.WF = (function() {

  /* ── Config ──────────────────────────────────────────────────── */
  var LABEL_W   = 130;
  var ROW_H     = 34;
  var HDR_H     = 20;
  var TICK_W    = 28;
  var MAX_TICKS = 120;

  /* ── State ───────────────────────────────────────────────────── */
  var history   = {};   // { key: { label, cat, values[], isBus, busKeys } }
  var tick      = 0;
  var recording = true;
  var stepMode  = false;
  var showEdges = true;
  var visible   = false;
  var cursorX   = null;
  var panelH    = 220;
  var resizing  = false;
  var rsY0 = 0, rsH0 = 0;

  /* Pattern generator state */
  var patActive  = false;
  var patTimer   = null;
  var patInputs  = [];  // [{ gateId, sequence:[], pos }]
  var patInterval= 500; // ms per step

  var panel, canvas, ctx, labelDiv, wrapDiv;
  var built = false;

  /* ── Colours ─────────────────────────────────────────────────── */
  var CAT = {
    clk:  { line:'#ffa726', fill:'rgba(255,167,38,0.10)' },
    io:   { line:'#00e676', fill:'rgba(0,230,118,0.11)'  },
    out:  { line:'#ef9a9a', fill:'rgba(239,154,154,0.09)'},
    ff:   { line:'#9c6bff', fill:'rgba(156,107,255,0.10)'},
    bus:  { line:'#26c6da', fill:'rgba(38,198,218,0.09)' }
  };

  /* ══════════════════════════════════════════════════════════════
     BUILD DOM
  ══════════════════════════════════════════════════════════════ */
  function build() {
    if (built) return;
    built = true;

    var s = document.createElement('style');
    s.textContent =
      /* panel */
      '#wf-panel{display:none;flex-direction:column;width:100%;flex-shrink:0;' +
        'background:#080b10;border-top:1px solid rgba(0,212,170,0.28);' +
        'position:relative;z-index:50;overflow:hidden}' +
      '#wf-panel.wf-open{display:flex}' +
      /* drag handle */
      '#wf-drag{position:absolute;top:0;left:0;right:0;height:5px;cursor:ns-resize;z-index:10}' +
      '#wf-drag:hover{background:rgba(0,212,170,0.18)}' +
      /* top bar */
      '#wf-bar{height:34px;flex-shrink:0;background:#0d1117;' +
        'border-bottom:1px solid rgba(255,255,255,0.07);' +
        'display:flex;align-items:center;padding:0 10px;gap:6px;flex-wrap:nowrap;overflow:hidden}' +
      '#wf-title{font:700 11px "Syne",sans-serif;color:#00d4aa;margin-right:2px;white-space:nowrap}' +
      /* buttons */
      '.wfb{font:500 10px "JetBrains Mono",monospace;white-space:nowrap;' +
        'background:#161b23;border:1px solid rgba(255,255,255,0.1);' +
        'border-radius:4px;color:#7d8a9a;cursor:pointer;padding:2px 7px;flex-shrink:0}' +
      '.wfb:hover{background:#1c2333;color:#cdd5e0}' +
      '.wfb.wf-on{color:#00d4aa;border-color:rgba(0,212,170,0.4);background:rgba(0,212,170,0.09)}' +
      '.wfb.wf-rec{color:#ff5252;border-color:rgba(255,82,82,0.35);background:rgba(255,82,82,0.08)}' +
      '.wfb.wf-step{color:#ffa726;border-color:rgba(255,167,38,0.4);background:rgba(255,167,38,0.09)}' +
      '.wfb.wf-pat{color:#9c6bff;border-color:rgba(156,107,255,0.4);background:rgba(156,107,255,0.09)}' +
      /* separator */
      '.wf-sep{width:1px;height:16px;background:rgba(255,255,255,0.08);flex-shrink:0}' +
      /* zoom */
      '#wf-zoom{width:60px;height:3px;accent-color:#00d4aa;cursor:pointer;flex-shrink:0}' +
      '#wf-info{font:400 10px "JetBrains Mono",monospace;color:#3d4a5a;margin-left:auto;white-space:nowrap}' +
      /* body */
      '#wf-body{display:flex;flex:1;overflow:hidden;min-height:0}' +
      /* labels */
      '#wf-labels{width:' + LABEL_W + 'px;flex-shrink:0;background:#0d1117;' +
        'border-right:1px solid rgba(255,255,255,0.07);' +
        'overflow:hidden;padding-top:' + HDR_H + 'px;display:flex;flex-direction:column}' +
      '.wf-lr{height:' + ROW_H + 'px;flex-shrink:0;display:flex;align-items:center;' +
        'justify-content:space-between;padding:0 6px 0 10px;' +
        'border-bottom:1px solid rgba(255,255,255,0.04);gap:3px}' +
      '.wf-lname{font:400 10px "JetBrains Mono",monospace;color:#cdd5e0;' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}' +
      '.wf-lval{font:700 10px "JetBrains Mono",monospace;flex-shrink:0}' +
      '.wf-lval.hi{color:#00e676}.wf-lval.lo{color:#ff4444}.wf-lval.bus{color:#26c6da}' +
      '.wf-lbus{font:500 9px "JetBrains Mono",monospace;color:#26c6da;' +
        'background:rgba(38,198,218,0.12);border:1px solid rgba(38,198,218,0.25);' +
        'border-radius:3px;padding:0 3px;cursor:pointer;flex-shrink:0}' +
      '.wf-lbus:hover{background:rgba(38,198,218,0.22)}' +
      '#wf-empty{font:400 11px "JetBrains Mono",monospace;color:#3d4a5a;' +
        'text-align:center;padding:18px 10px;line-height:1.9}' +
      /* canvas wrap */
      '#wf-wrap{flex:1;overflow-x:auto;overflow-y:hidden;' +
        'scrollbar-width:thin;scrollbar-color:rgba(0,212,170,0.25) transparent}' +
      '#wf-wrap::-webkit-scrollbar{height:4px}' +
      '#wf-wrap::-webkit-scrollbar-thumb{background:rgba(0,212,170,0.25);border-radius:2px}' +
      '#wf-canvas{display:block;cursor:crosshair}' +
      /* pattern modal */
      '#wf-pat-modal{display:none;position:fixed;inset:0;z-index:2000;' +
        'background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);' +
        'align-items:center;justify-content:center}' +
      '#wf-pat-modal.open{display:flex}' +
      '#wf-pat-box{background:#0d1117;border:1px solid rgba(255,255,255,0.12);' +
        'border-radius:10px;padding:20px;width:420px;max-width:95vw;' +
        'box-shadow:0 20px 60px rgba(0,0,0,0.7)}' +
      '#wf-pat-box h3{font:700 13px "Syne",sans-serif;color:#00d4aa;margin-bottom:12px}' +
      '.wf-pat-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}' +
      '.wf-pat-row label{font:400 10px "JetBrains Mono",monospace;color:#7d8a9a;width:70px;flex-shrink:0}' +
      '.wf-pat-row input{flex:1;padding:5px 8px;background:#161b23;' +
        'border:1px solid rgba(255,255,255,0.1);border-radius:4px;' +
        'color:#cdd5e0;font:400 11px "JetBrains Mono",monospace;outline:none}' +
      '.wf-pat-row input:focus{border-color:#00d4aa}' +
      '#wf-pat-hint{font:400 9px "JetBrains Mono",monospace;color:#3d4a5a;margin-bottom:12px;line-height:1.7}' +
      '.wf-pat-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}';
    document.head.appendChild(s);

    /* HTML */
    panel = document.createElement('div');
    panel.id = 'wf-panel';
    panel.innerHTML =
      '<div id="wf-drag"></div>' +
      '<div id="wf-bar">' +
        '<span id="wf-title">⏱ Waveform</span>' +
        '<div class="wf-sep"></div>' +
        /* recording */
        '<button class="wfb wf-on" id="wf-brec" title="Pause/resume recording">⏺ Rec</button>' +
        /* step mode */
        '<button class="wfb" id="wf-bstep-mode" title="Toggle step mode">⬛ Step</button>' +
        '<button class="wfb" id="wf-bstep" title="Advance one tick (step mode only)" style="display:none">▶ +1</button>' +
        '<div class="wf-sep"></div>' +
        /* edge markers */
        '<button class="wfb wf-on" id="wf-bedge" title="Toggle edge markers ↑↓">↑↓ Edges</button>' +
        /* bus */
        '<button class="wfb" id="wf-bbus" title="Create bus from selected signals">⊞ Bus</button>' +
        '<div class="wf-sep"></div>' +
        /* pattern */
        '<button class="wfb" id="wf-bpat" title="Open pattern generator">⚡ Pattern</button>' +
        '<div class="wf-sep"></div>' +
        /* util */
        '<button class="wfb" id="wf-bclr" title="Clear history">⌫ Clear</button>' +
        '<button class="wfb" id="wf-bfit" title="Fit view">⊡ Fit</button>' +
        '<span style="font:400 10px \'JetBrains Mono\',monospace;color:#3d4a5a;flex-shrink:0">Zoom</span>' +
        '<input type="range" id="wf-zoom" min="10" max="60" value="28" step="2"/>' +
        '<span id="wf-info">0 ticks</span>' +
        '<button class="wfb" id="wf-bclose" style="color:#3d4a5a;margin-left:4px">✕</button>' +
      '</div>' +
      '<div id="wf-body">' +
        '<div id="wf-labels"><div id="wf-empty">Toggle inputs or<br>start the clock</div></div>' +
        '<div id="wf-wrap"><canvas id="wf-canvas"></canvas></div>' +
      '</div>';
    document.getElementById('app').appendChild(panel);

    /* Pattern modal */
    var pm = document.createElement('div');
    pm.id = 'wf-pat-modal';
    pm.innerHTML =
      '<div id="wf-pat-box">' +
        '<h3>⚡ Pattern Generator</h3>' +
        '<div id="wf-pat-hint">' +
          'Enter a sequence of 0s and 1s for each input.<br>' +
          'Example: <b>0,1,0,1,1,0</b> — repeats automatically.<br>' +
          'Interval = ms between each step.' +
        '</div>' +
        '<div id="wf-pat-inputs"></div>' +
        '<div class="wf-pat-row">' +
          '<label>Interval</label>' +
          '<input type="number" id="wf-pat-interval" value="500" min="100" max="5000" step="100"/>' +
          '<span style="font:400 10px \'JetBrains Mono\',monospace;color:#3d4a5a">ms</span>' +
        '</div>' +
        '<div class="wf-pat-btns">' +
          '<button class="wfb" id="wf-pat-cancel">Cancel</button>' +
          '<button class="wfb" id="wf-pat-stop" style="display:none">⏹ Stop</button>' +
          '<button class="wfb wf-pat" id="wf-pat-start">▶ Start</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(pm);

    /* Grab refs */
    canvas   = document.getElementById('wf-canvas');
    ctx      = canvas.getContext('2d');
    labelDiv = document.getElementById('wf-labels');
    wrapDiv  = document.getElementById('wf-wrap');

    /* ── Button handlers ─────────────────────────────────────────── */

    /* Record toggle */
    document.getElementById('wf-brec').onclick = function() {
      recording = !recording;
      this.textContent = recording ? '⏺ Rec' : '⏸ Paused';
      if (recording) this.classList.add('wf-on'); else this.classList.remove('wf-on');
      if (recording) this.classList.remove('wf-rec'); else this.classList.add('wf-rec');
    };

    /* Step mode toggle */
    document.getElementById('wf-bstep-mode').onclick = function() {
      stepMode = !stepMode;
      this.textContent = stepMode ? '⬛ Step ON' : '⬛ Step';
      if (stepMode) this.classList.add('wf-step'); else this.classList.remove('wf-step');
      document.getElementById('wf-bstep').style.display = stepMode ? '' : 'none';
      /* pause recording in step mode so nothing auto-records */
      if (stepMode) {
        recording = false;
        var rb = document.getElementById('wf-brec');
        rb.textContent = '⏸ Paused'; rb.classList.remove('wf-on'); rb.classList.add('wf-rec');
      }
    };

    /* Step +1 tick */
    document.getElementById('wf-bstep').onclick = function() {
      /* Toggle all clocks then simulate — identical to what the auto-clock timer does */
      if (typeof gates !== 'undefined') {
        gates.forEach(function(g) { if (g.type === 'CLOCK') g.clockVal = g.clockVal ? 0 : 1; });
      }
      if (typeof simulate === 'function' && typeof render === 'function') {
        recording = true;
        simulate();
        render();
        if (typeof updateProps === 'function') updateProps();
        recording = false;
      }
    };

    /* Edge markers toggle */
    document.getElementById('wf-bedge').onclick = function() {
      showEdges = !showEdges;
      if (showEdges) this.classList.add('wf-on'); else this.classList.remove('wf-on');
      draw();
    };

    /* Bus builder */
    document.getElementById('wf-bbus').onclick = openBusBuilder;

    /* Pattern generator */
    document.getElementById('wf-bpat').onclick = openPatternModal;
    document.getElementById('wf-pat-cancel').onclick = closePatternModal;
    document.getElementById('wf-pat-start').onclick  = startPattern;
    document.getElementById('wf-pat-stop').onclick   = stopPattern;
    document.getElementById('wf-pat-modal').onclick  = function(e) {
      if (e.target === this) closePatternModal();
    };

    /* Clear */
    document.getElementById('wf-bclr').onclick = function() {
      history = {}; tick = 0; cursorX = null; draw();
    };

    /* Fit */
    document.getElementById('wf-bfit').onclick = fitView;

    /* Zoom */
    document.getElementById('wf-zoom').oninput = function() {
      TICK_W = +this.value; sizeCanvas(); draw();
    };

    /* Close */
    document.getElementById('wf-bclose').onclick = hide;

    /* Canvas cursor */
    canvas.onmousemove = function(e) {
      cursorX = e.clientX - canvas.getBoundingClientRect().left; draw();
    };
    canvas.onmouseleave = function() { cursorX = null; draw(); };

    /* Resize handle */
    document.getElementById('wf-drag').onmousedown = function(e) {
      resizing = true; rsY0 = e.clientY; rsH0 = panelH;
      document.body.style.cursor = 'ns-resize'; e.preventDefault();
    };
    document.addEventListener('mousemove', function(e) {
      if (!resizing) return;
      panelH = Math.max(120, Math.min(480, rsH0 + (rsY0 - e.clientY)));
      panel.style.height = panelH + 'px'; sizeCanvas(); draw();
    });
    document.addEventListener('mouseup', function() {
      if (!resizing) return; resizing = false; document.body.style.cursor = '';
      if (typeof resize === 'function') resize();
    });
  }

  /* ══════════════════════════════════════════════════════════════
     SHOW / HIDE / TOGGLE
  ══════════════════════════════════════════════════════════════ */
  function show() {
    visible = true;
    panel.classList.add('wf-open');
    panel.style.height = panelH + 'px';
    sizeCanvas(); draw();
    var b = document.getElementById('btn-waveform');
    if (b) b.classList.add('wf-on');
    if (typeof resize === 'function') resize();
  }

  function hide() {
    visible = false;
    panel.classList.remove('wf-open');
    var b = document.getElementById('btn-waveform');
    if (b) b.classList.remove('wf-on');
    if (typeof resize === 'function') resize();
  }

  function toggle() { if (visible) hide(); else show(); }

  /* ══════════════════════════════════════════════════════════════
     PUSH — called from app.js simulate()
  ══════════════════════════════════════════════════════════════ */
  function push(sigVals, gates) {
    if (!built || !recording) return;
    tick++;

    for (var i = 0; i < gates.length; i++) {
      var g = gates[i];
      if (g.type === 'INPUT') {
        pv(g.id + ':I', g.label || ('IN#' + g.id), 'io', g.value || 0);
      } else if (g.type === 'CLOCK') {
        pv(g.id + ':C', 'CLK#' + g.id, 'clk', g.clockVal || 0);
      } else if (g.type === 'OUTPUT' || g.type === 'LED') {
        var lbl = g.label || ((g.type === 'LED' ? 'LED#' : 'OUT#') + g.id);
        pv(g.id + ':O', lbl, 'out', sigVals['in_' + g.id] || 0);
      } else if (g.type === 'SR_FF' || g.type === 'D_FF' ||
                 g.type === 'JK_FF' || g.type === 'T_FF') {
        var ov = sigVals[g.id] || [0, 1];
        var base = g.type.replace('_FF', '');
        pv(g.id + ':Q',  base + '#' + g.id + '.Q',  'ff', ov[0] || 0);
        pv(g.id + ':NQ', base + '#' + g.id + '.Q\u0305', 'ff',
           ov[1] != null ? ov[1] : 1);
      }
    }

    /* Update bus values */
    var ks = Object.keys(history);
    for (var j = 0; j < ks.length; j++) {
      var sig = history[ks[j]];
      if (sig.isBus) pushBusTick(ks[j]);
      if (sig.values.length > MAX_TICKS)
        sig.values = sig.values.slice(sig.values.length - MAX_TICKS);
    }

    if (visible) draw();
  }

  function pv(key, label, cat, val) {
    if (!history[key]) history[key] = { label:label, cat:cat, values:[] };
    history[key].values.push(val ? 1 : 0);
  }

  /* ══════════════════════════════════════════════════════════════
     FEATURE 1: STEP MODE
     (handled via buttons above — simulate() called once per click)
  ══════════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════════
     FEATURE 2: EDGE MARKERS (drawn in draw() below)
  ══════════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════════
     FEATURE 3: BUS DISPLAY
  ══════════════════════════════════════════════════════════════ */
  function openBusBuilder() {
    var list = sigs().filter(function(s) { return !s.isBus; });
    if (list.length < 2) {
      alert('Need at least 2 signals to create a bus. Record some data first.');
      return;
    }
    var chosen = [];
    var msg = 'Select signals for the bus (enter numbers separated by commas):\n\n';
    for (var i = 0; i < list.length; i++) msg += (i+1) + '. ' + list[i].label + '\n';
    msg += '\nExample: 1,2,3  (MSB first)';
    var ans = prompt(msg);
    if (!ans) return;
    var parts = ans.split(',');
    for (var p = 0; p < parts.length; p++) {
      var idx = parseInt(parts[p].trim()) - 1;
      if (idx >= 0 && idx < list.length) chosen.push(list[idx]);
    }
    if (chosen.length < 2) { alert('Please select at least 2 signals.'); return; }
    var busName = prompt('Name this bus:', chosen.map(function(s){ return s.label; }).join('+'));
    if (!busName) return;
    createBus(busName, chosen.map(function(s){ return s.key; }));
  }

  function createBus(name, keys) {
    var busKey = 'bus:' + name;
    /* find min length across member signals */
    var minLen = MAX_TICKS;
    for (var i = 0; i < keys.length; i++) {
      if (history[keys[i]]) minLen = Math.min(minLen, history[keys[i]].values.length);
    }
    /* build decimal values per tick */
    var vals = [];
    for (var t = 0; t < minLen; t++) {
      var dec = 0;
      for (var b = 0; b < keys.length; b++) {
        if (history[keys[b]] && history[keys[b]].values[t])
          dec |= (1 << (keys.length - 1 - b));
      }
      vals.push(dec);
    }
    history[busKey] = { label:name, cat:'bus', values:vals, isBus:true, busKeys:keys, maxVal: (1 << keys.length) - 1 };
    draw();
  }

  function pushBusTick(busKey) {
    var bus = history[busKey];
    if (!bus || !bus.busKeys) return;
    var dec = 0;
    for (var b = 0; b < bus.busKeys.length; b++) {
      var member = history[bus.busKeys[b]];
      if (member && member.values.length) {
        var last = member.values[member.values.length - 1];
        if (last) dec |= (1 << (bus.busKeys.length - 1 - b));
      }
    }
    bus.values.push(dec);
    if (bus.values.length > MAX_TICKS)
      bus.values = bus.values.slice(bus.values.length - MAX_TICKS);
  }

  /* ══════════════════════════════════════════════════════════════
     FEATURE 4: PATTERN GENERATOR
  ══════════════════════════════════════════════════════════════ */
  function openPatternModal() {
    /* populate with current INPUT gates */
    var gateList = typeof gates !== 'undefined' ? gates : [];
    var inputs = gateList.filter(function(g) { return g.type === 'INPUT'; });
    var container = document.getElementById('wf-pat-inputs');
    container.innerHTML = '';
    if (!inputs.length) {
      container.innerHTML = '<div style="font:400 10px \'JetBrains Mono\',monospace;color:#3d4a5a;padding:8px 0">No INPUT gates in circuit. Add some first.</div>';
    } else {
      for (var i = 0; i < inputs.length; i++) {
        var g = inputs[i];
        var row = document.createElement('div');
        row.className = 'wf-pat-row';
        row.innerHTML =
          '<label>' + (g.label || 'IN#' + g.id) + '</label>' +
          '<input type="text" class="wf-pat-seq" data-id="' + g.id + '" ' +
            'placeholder="0,1,0,1,..." value="0,1,0,1"/>';
        container.appendChild(row);
      }
    }
    document.getElementById('wf-pat-interval').value = patInterval;
    document.getElementById('wf-pat-start').style.display = '';
    document.getElementById('wf-pat-stop').style.display  = patActive ? '' : 'none';
    document.getElementById('wf-pat-modal').classList.add('open');
  }

  function closePatternModal() {
    document.getElementById('wf-pat-modal').classList.remove('open');
  }

  function startPattern() {
    var seqInputs = document.querySelectorAll('.wf-pat-seq');
    patInputs = [];
    for (var i = 0; i < seqInputs.length; i++) {
      var raw = seqInputs[i].value.trim();
      var seq = raw.split(',').map(function(x) { return parseInt(x.trim()) ? 1 : 0; });
      if (seq.length) patInputs.push({ gateId: +seqInputs[i].dataset.id, sequence: seq, pos: 0 });
    }
    patInterval = Math.max(100, parseInt(document.getElementById('wf-pat-interval').value) || 500);
    if (!patInputs.length) { alert('No sequences defined.'); return; }

    stopPattern();   /* clear any existing timer */
    patActive = true;
    recording = true;
    var rb = document.getElementById('wf-brec');
    if (rb) { rb.textContent = '⏺ Rec'; rb.classList.add('wf-on'); rb.classList.remove('wf-rec'); }
    var pb = document.getElementById('wf-bpat');
    if (pb) pb.classList.add('wf-pat');

    patTimer = setInterval(function() {
      /* apply next value to each input gate */
      var gateList = typeof gates !== 'undefined' ? gates : [];
      for (var i = 0; i < patInputs.length; i++) {
        var pi = patInputs[i];
        var g  = gateList.filter(function(x){ return x.id === pi.gateId; })[0];
        if (g) { g.value = pi.sequence[pi.pos % pi.sequence.length]; }
        pi.pos++;
      }
      /* trigger simulation + recording */
      if (typeof simulate === 'function') simulate();
      if (typeof render   === 'function') render();
    }, patInterval);

    closePatternModal();
    document.getElementById('wf-pat-start').style.display = 'none';
    document.getElementById('wf-pat-stop').style.display  = '';
  }

  function stopPattern() {
    if (patTimer) { clearInterval(patTimer); patTimer = null; }
    patActive = false;
    var pb = document.getElementById('wf-bpat');
    if (pb) pb.classList.remove('wf-pat');
  }

  /* ══════════════════════════════════════════════════════════════
     SIGNAL LIST
  ══════════════════════════════════════════════════════════════ */
  function sigs() {
    var ord = { clk:0, io:1, out:2, ff:3, bus:4 };
    return Object.keys(history).map(function(k) {
      var h = history[k];
      return { key:k, label:h.label, cat:h.cat, values:h.values,
               isBus:h.isBus||false, busKeys:h.busKeys, maxVal:h.maxVal };
    }).sort(function(a, b) {
      var ca = ord[a.cat] != null ? ord[a.cat] : 9;
      var cb = ord[b.cat] != null ? ord[b.cat] : 9;
      return ca !== cb ? ca - cb : (a.label < b.label ? -1 : 1);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     FIT / SIZE
  ══════════════════════════════════════════════════════════════ */
  function fitView() {
    var list = sigs(), maxT = 0;
    for (var i = 0; i < list.length; i++) maxT = Math.max(maxT, list[i].values.length);
    if (!maxT || !wrapDiv) return;
    TICK_W = Math.max(10, Math.min(60, Math.floor(wrapDiv.clientWidth / maxT)));
    var sl = document.getElementById('wf-zoom');
    if (sl) sl.value = TICK_W;
    sizeCanvas(); draw();
  }

  function sizeCanvas() {
    if (!canvas || !wrapDiv) return;
    var list = sigs(), maxT = 8;
    for (var i = 0; i < list.length; i++) maxT = Math.max(maxT, list[i].values.length);
    canvas.width  = Math.max(wrapDiv.clientWidth,  maxT * TICK_W + 2);
    canvas.height = Math.max(panelH - 34, list.length * ROW_H + HDR_H + 2);
  }

  /* ══════════════════════════════════════════════════════════════
     DRAW
  ══════════════════════════════════════════════════════════════ */
  function draw() {
    if (!canvas) return;
    var list = sigs();
    var W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#080b10'; ctx.fillRect(0, 0, W, H);

    var maxT = 8;
    for (var i = 0; i < list.length; i++) maxT = Math.max(maxT, list[i].values.length);

    /* ── Time ruler ─────────────────────────────────────────────── */
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, W, HDR_H);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, HDR_H); ctx.lineTo(W, HDR_H); ctx.stroke();

    var step = TICK_W >= 20 ? 1 : TICK_W >= 10 ? 2 : 5;
    for (var t = 0; t <= maxT; t++) {
      var tx = t * TICK_W;
      ctx.strokeStyle = (t % step === 0) ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tx, HDR_H); ctx.lineTo(tx, H); ctx.stroke();
      if (t % step === 0) {
        ctx.font = '9px "JetBrains Mono",monospace';
        ctx.fillStyle = '#3d4a5a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t, tx, HDR_H / 2);
      }
    }

    if (!list.length) {
      ctx.font = '11px "JetBrains Mono",monospace'; ctx.fillStyle = '#3d4a5a';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('No signals — toggle inputs or start the clock', W / 2, H / 2);
      drawLabels(list, null); updateInfo(); return;
    }

    /* ── Waveform rows ──────────────────────────────────────────── */
    for (var r = 0; r < list.length; r++) {
      var sig  = list[r];
      var col  = CAT[sig.cat] || CAT.io;
      var vals = sig.values;
      var n    = vals.length;
      var y0   = HDR_H + r * ROW_H;
      var yHi  = y0 + 5;
      var yLo  = y0 + ROW_H - 5;
      var yMid = y0 + ROW_H / 2;

      /* Row tint */
      if (r % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.010)'; ctx.fillRect(0, y0, W, ROW_H); }
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y0+ROW_H); ctx.lineTo(W, y0+ROW_H); ctx.stroke();

      if (!n) continue;

      /* ── BUS ROW ────────────────────────────────────────────── */
      if (sig.isBus) {
        var prev = vals[0], segStart = 0;
        for (var t5 = 1; t5 <= n; t5++) {
          if (t5 === n || vals[t5] !== prev) {
            var sx = segStart * TICK_W, ex = t5 * TICK_W;
            var segW = ex - sx;
            /* fill */
            ctx.fillStyle = col.fill;
            ctx.fillRect(sx + 2, yHi, segW - 4, yLo - yHi);
            /* border trapezoid lines */
            ctx.strokeStyle = col.line; ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(sx,      yMid);
            ctx.lineTo(sx + 6,  yHi);
            ctx.lineTo(ex - 6,  yHi);
            ctx.lineTo(ex,      yMid);
            ctx.lineTo(ex - 6,  yLo);
            ctx.lineTo(sx + 6,  yLo);
            ctx.closePath(); ctx.stroke();
            /* value label */
            if (segW > 24) {
              ctx.font = '9px "JetBrains Mono",monospace';
              ctx.fillStyle = col.line; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              var hexVal = prev.toString(16).toUpperCase();
              ctx.fillText('0x' + hexVal + ' (' + prev + ')', (sx + ex) / 2, yMid);
            }
            segStart = t5; prev = vals[t5];
          }
        }
        continue; /* skip normal waveform drawing */
      }

      /* ── NORMAL ROW ─────────────────────────────────────────── */
      /* HIGH fill */
      ctx.fillStyle = col.fill;
      var inH = false, hS = 0;
      for (var t2 = 0; t2 < n; t2++) {
        var x2 = t2 * TICK_W;
        if (vals[t2]  && !inH) { inH = true;  hS = x2; }
        if (!vals[t2] && inH)  { inH = false; ctx.fillRect(hS, yHi, x2-hS, yLo-yHi); }
      }
      if (inH) ctx.fillRect(hS, yHi, n*TICK_W-hS, yLo-yHi);

      /* Waveform line */
      ctx.strokeStyle = col.line; ctx.lineWidth = 1.8; ctx.lineJoin = 'miter';
      ctx.beginPath();
      var pv2 = vals[0];
      ctx.moveTo(0, pv2 ? yHi : yLo);
      for (var t3 = 0; t3 < n; t3++) {
        var v = vals[t3], xa = t3*TICK_W, xb = (t3+1)*TICK_W;
        if (t3 > 0 && v !== pv2) { ctx.lineTo(xa, pv2?yHi:yLo); ctx.lineTo(xa, v?yHi:yLo); }
        ctx.lineTo(xb, v ? yHi : yLo);
        pv2 = v;
      }
      ctx.stroke();

      /* ── FEATURE 2: Edge markers ─────────────────────────────── */
      if (showEdges) {
        for (var te = 1; te < n; te++) {
          if (vals[te] !== vals[te-1]) {
            var ex2   = te * TICK_W;
            var rising = vals[te] === 1;
            /* marker triangle */
            ctx.save();
            ctx.fillStyle = rising ? 'rgba(0,230,118,0.85)' : 'rgba(255,68,68,0.85)';
            ctx.beginPath();
            if (rising) {
              ctx.moveTo(ex2-4, yLo+1); ctx.lineTo(ex2+4, yLo+1); ctx.lineTo(ex2, yLo-5);
            } else {
              ctx.moveTo(ex2-4, yHi-1); ctx.lineTo(ex2+4, yHi-1); ctx.lineTo(ex2, yHi+5);
            }
            ctx.closePath(); ctx.fill();
            /* arrow label on ruler */
            ctx.fillStyle = rising ? 'rgba(0,230,118,0.6)' : 'rgba(255,68,68,0.55)';
            ctx.font = '8px "JetBrains Mono",monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(rising ? '↑' : '↓', ex2, HDR_H / 2);
            ctx.restore();
          }
        }
      }

      /* Value labels when zoomed in */
      if (TICK_W >= 20) {
        ctx.font = '9px "JetBrains Mono",monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var ss = 0;
        for (var t4 = 1; t4 <= n; t4++) {
          if (t4 === n || vals[t4] !== vals[t4-1]) {
            var slen = t4 - ss;
            if (slen * TICK_W > 16) {
              ctx.fillStyle = vals[t4-1] ? 'rgba(0,230,118,0.65)' : 'rgba(255,68,68,0.55)';
              ctx.fillText(vals[t4-1], (ss + slen/2)*TICK_W, yMid);
            }
            ss = t4;
          }
        }
      }
    }

    /* ── Cursor ─────────────────────────────────────────────────── */
    if (cursorX !== null) {
      ctx.save();
      ctx.strokeStyle = 'rgba(0,212,170,0.7)'; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(cursorX, HDR_H); ctx.lineTo(cursorX, H); ctx.stroke();
      ctx.setLineDash([]);
      var ct = Math.floor(cursorX / TICK_W);
      ctx.font = '9px "JetBrains Mono",monospace'; ctx.fillStyle = '#00d4aa';
      ctx.textAlign = cursorX > W-40 ? 'right' : 'left'; ctx.textBaseline = 'top';
      ctx.fillText('t='+ct, cursorX+(cursorX>W-40?-3:3), 2);
      ctx.restore();
      drawLabels(list, ct);
    } else {
      drawLabels(list, null);
    }

    updateInfo();
  }

  /* ── Label column ────────────────────────────────────────────── */
  function drawLabels(list, atTick) {
    if (!labelDiv) return;
    if (!list.length) {
      labelDiv.innerHTML = '<div id="wf-empty">Toggle inputs or<br>start the clock</div>';
      return;
    }
    var h = '';
    for (var i = 0; i < list.length; i++) {
      var sig = list[i];
      var idx = atTick != null ? Math.min(atTick, sig.values.length-1) : sig.values.length-1;
      var v   = idx >= 0 ? (sig.values[idx] || 0) : 0;
      var valHtml;
      if (sig.isBus) {
        valHtml = '<span class="wf-lval bus">0x' + v.toString(16).toUpperCase() + '</span>';
      } else {
        valHtml = '<span class="wf-lval ' + (v ? 'hi' : 'lo') + '">' + v + '</span>';
      }
      var busBtn = sig.isBus
        ? '<span class="wf-lbus" title="Remove bus" data-buskey="' + sig.key + '">✕</span>'
        : '';
      h += '<div class="wf-lr">' +
           '<span class="wf-lname" title="' + sig.label + '">' + sig.label + '</span>' +
           valHtml + busBtn + '</div>';
    }
    labelDiv.innerHTML = h;

    /* Bus remove buttons */
    var removeBtns = labelDiv.querySelectorAll('.wf-lbus');
    for (var j = 0; j < removeBtns.length; j++) {
      removeBtns[j].onclick = function() {
        delete history[this.dataset.buskey]; draw();
      };
    }
  }

  function updateInfo() {
    var el = document.getElementById('wf-info');
    if (el) {
      var mode = stepMode ? ' | STEP' : (patActive ? ' | PAT' : '');
      el.textContent = tick + ' ticks' + mode;
    }
  }

  /* ── Public ──────────────────────────────────────────────────── */
  return { build:build, show:show, hide:hide, toggle:toggle, push:push };

})();
