/* canvas.js — Rendering: IEEE gate shapes, wires, pins, flip-flops, minimap */

const PIN_R   = 5;
const PIN_HIT = 11;
const SNAP    = 10;
const BUBBLE  = 4.5; // negation bubble radius

function snapV(v) { return Math.round(v / SNAP) * SNAP; }

function sigColor(v) {
  if (v === 1) return '#00e676';
  if (v === 0) return '#ff4444';
  return '#546e7a';
}
function sigFill(v) {
  if (v === 1) return 'rgba(0,230,118,0.2)';
  if (v === 0) return 'rgba(255,68,68,0.18)';
  return 'rgba(84,110,122,0.15)';
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}

// ===== PIN DRAWING =====
function drawPin(ctx, x, y, val) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, PIN_R, 0, Math.PI*2);
  ctx.fillStyle = sigFill(val); ctx.fill();
  ctx.strokeStyle = sigColor(val); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

// ===== GATE RENDERING =====
function drawGate(ctx, g, sigVals, selectedId, multiSelected) {
  const def  = GATE_DEFS[g.type];
  const col  = CAT_COLORS[def.cat];
  const isSel = g.id === selectedId;
  const isMultiSel = multiSelected && multiSelected.has(g.id) && !isSel;
  const x = g.x, y = g.y, w = def.w, h = def.h;

  // ── Validation highlight — strokes only, zero shadowBlur ──────
  const verrs = window._validationErrors && window._validationErrors[g.id];
  if (verrs && verrs.length) {
    const isErr = verrs.some(v => v.severity === 'error');
    ctx.save();
    rr(ctx, x-4, y-4, w+8, h+8, 11);
    ctx.fillStyle   = isErr ? 'rgba(255,50,50,0.07)' : 'rgba(255,140,0,0.06)';
    ctx.strokeStyle = isErr ? 'rgba(255,70,70,0.9)'  : 'rgba(255,160,30,0.9)';
    ctx.lineWidth = 1.8; ctx.fill(); ctx.stroke();
    rr(ctx, x-7, y-7, w+14, h+14, 14);
    ctx.strokeStyle = isErr ? 'rgba(255,70,70,0.2)' : 'rgba(255,160,30,0.2)';
    ctx.lineWidth = 3; ctx.stroke();
    const bx=x+w+4, by=y-4;
    ctx.beginPath(); ctx.arc(bx, by, 6, 0, Math.PI*2);
    ctx.fillStyle = isErr ? '#ff3333' : '#ff8c00'; ctx.fill();
    ctx.font='bold 7px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#fff'; ctx.fillText(isErr?'✖':'⚠', bx, by);
    ctx.restore();
  }

  ctx.save();

  // ── Multi-select teal outline ─────────────────────────────────
  if (isMultiSel) {
    ctx.save();
    rr(ctx, g.x-4, g.y-4, def.w+8, def.h+8, 10);
    ctx.strokeStyle = 'rgba(0,212,170,0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5,3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,212,170,0.06)';
    ctx.fill();
    ctx.restore();
  }

  // ---- INPUT / CLOCK ----
  if (g.type === 'INPUT' || g.type === 'CLOCK') {
    const v = g.type === 'INPUT' ? (g.value ?? 0) : (g.clockVal ?? 0);
    rr(ctx, x, y, w, h, 6);
    ctx.fillStyle = v ? 'rgba(0,230,118,0.12)' : 'rgba(255,68,68,0.1)';
    ctx.fill();
    ctx.strokeStyle = isSel ? '#00d4aa' : (v ? '#00e676' : '#ff4444');
    ctx.lineWidth = isSel ? 2 : 1.5; ctx.stroke();
    // label
    ctx.font = '500 9px "JetBrains Mono",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffa726';
    ctx.fillText(g.type === 'CLOCK' ? 'CLK' : (g.label || 'IN'), x + w/2, y + h/2 - 7);
    // value
    ctx.font = 'bold 14px "JetBrains Mono",monospace';
    ctx.fillStyle = v ? '#00e676' : '#ff4444';
    ctx.fillText(v, x + w/2, y + h/2 + 7);
    // clock waveform
    if (g.type === 'CLOCK') {
      ctx.strokeStyle = '#ffa726'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x+8,y+h-8); ctx.lineTo(x+14,y+h-8); ctx.lineTo(x+14,y+8);
      ctx.lineTo(x+20,y+8);  ctx.lineTo(x+20,y+h-8); ctx.lineTo(x+26,y+h-8);
      ctx.stroke();
    }
    // out pin
    getOutputPins(g).forEach(p => drawPin(ctx, p.x, p.y, v));
    ctx.restore(); return;
  }

  // ---- OUTPUT / LED ----
  if (g.type === 'OUTPUT' || g.type === 'LED') {
    const inVal = sigVals['in_' + g.id] ?? 0;
    if (g.type === 'LED') {
      const cx = x + w/2, cy = y + h/2, r2 = h/2 - 2;
      ctx.beginPath(); ctx.arc(cx, cy, r2, 0, Math.PI*2);
      ctx.fillStyle = inVal ? 'rgba(0,230,118,0.22)' : 'rgba(255,68,68,0.1)';
      ctx.fill();
      ctx.strokeStyle = isSel ? '#00d4aa' : (inVal ? '#00e676' : '#ff4444');
      ctx.lineWidth = isSel ? 2 : 1.5; ctx.stroke();
      if (inVal) {
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, r2-3, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(0,230,118,0.45)'; ctx.fill();
        ctx.restore();
      }
      ctx.font = 'bold 12px "JetBrains Mono",monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle = inVal ? '#fff' : '#555'; ctx.fillText(inVal, cx, cy);
    } else {
      rr(ctx, x, y, w, h, 6);
      ctx.fillStyle = inVal ? 'rgba(0,230,118,0.12)' : 'rgba(255,68,68,0.08)';
      ctx.fill();
      ctx.strokeStyle = isSel ? '#00d4aa' : (inVal ? '#00e676aa' : '#ff4444aa');
      ctx.lineWidth = isSel ? 2 : 1.5; ctx.stroke();
      ctx.font = '500 9px "JetBrains Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle = '#ef9a9a'; ctx.fillText(g.label || 'OUT', x+w/2, y+h/2-7);
      ctx.font = 'bold 14px "JetBrains Mono",monospace';
      ctx.fillStyle = inVal ? '#00e676' : '#ff4444'; ctx.fillText(inVal, x+w/2, y+h/2+7);
    }
    getInputPins(g).forEach(p => drawPin(ctx, p.x, p.y, inVal));
    ctx.restore(); return;
  }

  // ---- FLIP-FLOPS ----
  if (['SR_FF','D_FF','JK_FF','T_FF'].includes(g.type)) {
    drawFlipFlop(ctx, g, sigVals, isSel);
    ctx.restore(); return;
  }

  // ---- MSI COMPONENTS ----
  if (['MUX2','MUX4','DEMUX2','DEC2','DEC3','ENC4','PRIO4','BIN2HEX','COMP1','HADD','FADD'].includes(g.type)) {
    drawMSI(ctx, g, sigVals, isSel);
    ctx.restore(); return;
  }

  // ---- STANDARD GATE: background box ----
  // Selection: clean dashed outline, no fill
  if (isSel) {
    ctx.save();
    rr(ctx, x-3, y-3, w+6, h+6, 10);
    ctx.strokeStyle='#00d4aa'; ctx.lineWidth=1.5;
    ctx.setLineDash([5,3]); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }

  // Draw the IEEE shape
  const outVals = sigVals[g.id] ?? [0];
  const out0 = outVals[0] ?? 0;
  const sc = isSel ? '#00d4aa' : col.stroke;
  const sw = 2;
  ctx.strokeStyle = sc; ctx.lineWidth = sw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  const shapeKey = g.type.replace(/[34]$/, '') + (g.type.endsWith('3') ? '3' : g.type.endsWith('4') ? '4' : '');
  if (GATE_SHAPES[g.type]) {
    GATE_SHAPES[g.type](ctx, x, y, w, h, sc, sw);
  } else if (GATE_SHAPES[shapeKey]) {
    GATE_SHAPES[shapeKey](ctx, x, y, w, h, sc, sw);
  }

  // Input pins
  getInputPins(g).forEach((p, i) => {
    const c2 = window._conns?.find(c => c.toId === g.id && c.toPin === i);
    const pv = c2 ? (sigVals[c2.fromId]?.[c2.fromPin??0] ?? 0) : 0;
    drawPin(ctx, p.x, p.y, pv);
  });
  // Output pins
  getOutputPins(g).forEach((p, i) => {
    drawPin(ctx, p.x, p.y, outVals[i] ?? 0);
  });

  ctx.restore();
}

function drawFlipFlop(ctx, g, sigVals, isSel) {
  const def = GATE_DEFS[g.type];
  const col = CAT_COLORS['ff'];
  const x = g.x, y = g.y, w = def.w, h = def.h;
  const outVals = sigVals[g.id] ?? [0, 1];

  rr(ctx, x, y, w, h, 6);
  ctx.fillStyle = col.fill; ctx.fill();
  ctx.strokeStyle = isSel ? '#00d4aa' : col.stroke;
  ctx.lineWidth = isSel ? 2 : 1.5; ctx.stroke();

  // vertical divider
  const divX = x + w * 0.36;
  ctx.beginPath(); ctx.moveTo(divX, y+6); ctx.lineTo(divX, y+h-6);
  ctx.strokeStyle = 'rgba(156,107,255,0.3)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.font = 'bold 10px "JetBrains Mono",monospace';
  ctx.textBaseline = 'middle';

  // Pin labels (left side)
  const inPins = getInputPins(g);
  const leftLabels = {
    'SR_FF': ['S','R','CLK'],
    'D_FF':  ['D','CLK'],
    'JK_FF': ['J','K','CLK'],
    'T_FF':  ['T','CLK'],
  }[g.type] || [];

  inPins.forEach((p, i) => {
    const lbl = leftLabels[i] || '';
    ctx.fillStyle = '#9c6bff'; ctx.textAlign = 'left';
    ctx.fillText(lbl === 'CLK' ? '>' : lbl, x + 5, y + (h/(inPins.length+1))*(i+1));
    // draw stub
    ctx.strokeStyle = '#9c6bff'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x+5, p.y); ctx.stroke();
    // pin circle
    const c2 = window._conns?.find(c => c.toId === g.id && c.toPin === i);
    const pv = c2 ? (sigVals[c2.fromId]?.[c2.fromPin??0] ?? 0) : 0;
    drawPin(ctx, p.x, p.y, pv);
  });

  // Output labels (right side)
  const outPins = getOutputPins(g);
  const rightLabels = ['Q', 'Q̄'];
  outPins.forEach((p, i) => {
    ctx.fillStyle = outVals[i]===1 ? '#00e676' : '#ff4444';
    ctx.textAlign = 'right';
    ctx.fillText(rightLabels[i], x + w - 5, y + (h/(outPins.length+1))*(i+1));
    ctx.strokeStyle = outVals[i]===1 ? '#00e676' : '#ff4444'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 5, p.y); ctx.stroke();
    drawPin(ctx, p.x, p.y, outVals[i]??0);
  });

  // Type label center
  ctx.fillStyle = '#9c6bff'; ctx.textAlign = 'center';
  ctx.font = 'bold 11px "JetBrains Mono",monospace';
  ctx.fillText(GATE_DEFS[g.type].label, x + w/2, y + h/2);

  // Q state display
  ctx.font = '9px "JetBrains Mono",monospace';
  ctx.fillStyle = '#555';
  ctx.fillText('Q=' + (outVals[0]??0), x + w/2, y + h/2 + 12);
}

// ===== MSI COMPONENT DRAWING =====
function drawMSI(ctx, g, sigVals, isSel) {
  const def  = GATE_DEFS[g.type];
  const col  = CAT_COLORS['msi'];
  const x = g.x, y = g.y, w = def.w, h = def.h;
  const outVals = sigVals[g.id] ?? Array(def.outputs).fill(0);

  rr(ctx, x, y, w, h, 6);
  ctx.fillStyle = col.fill; ctx.fill();
  ctx.strokeStyle = isSel ? '#00d4aa' : col.stroke;
  ctx.lineWidth = isSel ? 2 : 1.5; ctx.stroke();

  const divX = x + w * 0.38;
  ctx.beginPath(); ctx.moveTo(divX, y+6); ctx.lineTo(divX, y+h-6);
  ctx.strokeStyle = 'rgba(0,230,118,0.2)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.font = 'bold 9px "JetBrains Mono",monospace';
  ctx.fillStyle = '#00e676'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(def.label, x + w/2, y + 10);

  const PIN_LABELS = {
    MUX2:    { in:['A','B','S'],    out:['Y'] },
    MUX4:    { in:['D0','D1','D2','D3','S0','S1'], out:['Y'] },
    DEMUX2:  { in:['In','S'],       out:['Y0','Y1'] },
    DEC2:    { in:['A','B'],        out:['Y0','Y1','Y2','Y3'] },
    DEC3:    { in:['A','B','C'],    out:['Y0','Y1','Y2','Y3','Y4','Y5','Y6','Y7'] },
    ENC4:    { in:['D0','D1','D2','D3'], out:['A0','A1'] },
    PRIO4:   { in:['D0','D1','D2','D3'], out:['A0','A1','GS'] },
    BIN2HEX: { in:['B0','B1','B2','B3'], out:['H0','H1','H2','H3'] },
    COMP1:   { in:['A','B'],        out:['>'  ,'=','<'] },
    HADD:    { in:['A','B'],        out:['S','C'] },
    FADD:    { in:['A','B','Ci'],   out:['S','Co'] },
  };
  const labels = PIN_LABELS[g.type] || { in:[], out:[] };

  ctx.font = '500 8px "JetBrains Mono",monospace';

  const inPins = getInputPins(g);
  inPins.forEach((p, i) => {
    const lbl = labels.in[i] || ('I'+i);
    const conn = window._conns?.find(c => c.toId === g.id && c.toPin === i);
    const pv = conn ? (sigVals[conn.fromId]?.[conn.fromPin??0] ?? 0) : 0;
    ctx.strokeStyle = '#1a3a2a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x+6, p.y); ctx.stroke();
    ctx.fillStyle = '#7d8a9a'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(lbl, x+8, p.y);
    drawPin(ctx, p.x, p.y, pv);
  });

  const outPins = getOutputPins(g);
  outPins.forEach((p, i) => {
    const lbl = labels.out[i] || ('O'+i);
    const ov = outVals[i] ?? 0;
    ctx.strokeStyle = ov ? '#00e676' : '#ff4444'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x-6, p.y); ctx.stroke();
    ctx.fillStyle = ov ? '#00e676' : '#ef9a9a';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(lbl, p.x-8, p.y);
    drawPin(ctx, p.x, p.y, ov);
  });

  if (g.type === 'BIN2HEX') {
    const b0=outVals[0]??0,b1=outVals[1]??0,b2=outVals[2]??0,b3=outVals[3]??0;
    const hexVal = ((b3<<3)|(b2<<2)|(b1<<1)|b0).toString(16).toUpperCase();
    ctx.font = 'bold 20px "JetBrains Mono",monospace';
    ctx.fillStyle = '#00e676'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('0x'+hexVal, x+w/2, y+h/2+4);
  }
  if (g.type === 'COMP1') {
    const gt=outVals[0]??0,eq=outVals[1]??1,lt=outVals[2]??0;
    const sym = gt?'>':(lt?'<':'=');
    ctx.font = 'bold 18px "JetBrains Mono",monospace';
    ctx.fillStyle = '#00e676'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(sym, x+w/2, y+h/2+4);
  }
}

// ===== WIRE DRAWING =====
function drawWire(ctx, x1, y1, x2, y2, val) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  const dx = x2 - x1;
  ctx.bezierCurveTo(x1 + dx*0.5, y1, x1 + dx*0.5, y2, x2, y2);
  ctx.strokeStyle = sigColor(val);
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.stroke();
  // junction dot if needed
  ctx.restore();
}

function drawPendingWire(ctx, x1, y1, mx, my) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  const dx = mx - x1;
  ctx.bezierCurveTo(x1+dx*0.5, y1, x1+dx*0.5, my, mx, my);
  ctx.strokeStyle = '#40c4ff';
  ctx.lineWidth = 1.8;
  ctx.setLineDash([6,4]);
  ctx.globalAlpha = 0.8;
  ctx.stroke();
  ctx.restore();
}

// ===== HIT TESTING =====
function hitPin(mx, my, g, type) {
  const pins = type==='out' ? getOutputPins(g) : getInputPins(g);
  return pins.find(p => Math.hypot(mx-p.x, my-p.y) < PIN_HIT) ?? null;
}

function hitGate(mx, my, g) {
  const def = GATE_DEFS[g.type];
  if (g.type === 'LED') return Math.hypot(mx-(g.x+def.w/2), my-(g.y+def.h/2)) < def.h/2+4;
  return mx >= g.x-4 && mx <= g.x+def.w+4 && my >= g.y-4 && my <= g.y+def.h+4;
}

// ===== MINIMAP =====
function drawMinimap(mCtx, gates, connections, sigVals, viewState, mainW, mainH, mmW, mmH) {
  mCtx.clearRect(0,0,mmW,mmH);
  mCtx.fillStyle='#080b10'; mCtx.fillRect(0,0,mmW,mmH);
  if (!gates.length) return;

  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  gates.forEach(g=>{ const def=GATE_DEFS[g.type]; minX=Math.min(minX,g.x);minY=Math.min(minY,g.y);maxX=Math.max(maxX,g.x+def.w);maxY=Math.max(maxY,g.y+def.h); });
  const pad=16, bw=maxX-minX+pad*2, bh=maxY-minY+pad*2;
  const sc=Math.min(mmW/bw,mmH/bh)*0.9;
  const ox=(mmW-bw*sc)/2-(minX-pad)*sc, oy=(mmH-bh*sc)/2-(minY-pad)*sc;

  connections.forEach(c=>{
    const fg=gates.find(g=>g.id===c.fromId),tg=gates.find(g=>g.id===c.toId);
    if(!fg||!tg) return;
    const fp=getOutputPins(fg)[c.fromPin??0],tp=getInputPins(tg)[c.toPin??0];
    if(!fp||!tp) return;
    const fv=sigVals[fg.id]?.[c.fromPin??0]??0;
    mCtx.beginPath();
    mCtx.moveTo(fp.x*sc+ox,fp.y*sc+oy); mCtx.lineTo(tp.x*sc+ox,tp.y*sc+oy);
    mCtx.strokeStyle=fv?'rgba(0,230,118,0.55)':'rgba(255,68,68,0.4)';
    mCtx.lineWidth=1; mCtx.stroke();
  });

  gates.forEach(g=>{
    const def=GATE_DEFS[g.type],col=CAT_COLORS[def.cat];
    mCtx.fillStyle=col.fill; mCtx.fillRect(g.x*sc+ox,g.y*sc+oy,def.w*sc,def.h*sc);
    mCtx.strokeStyle=col.stroke; mCtx.lineWidth=0.5;
    mCtx.strokeRect(g.x*sc+ox,g.y*sc+oy,def.w*sc,def.h*sc);
  });

  // viewport rect
  const vx=(-viewState.panX/viewState.zoom)*sc+ox;
  const vy=(-viewState.panY/viewState.zoom)*sc+oy;
  mCtx.strokeStyle='rgba(0,212,170,0.55)'; mCtx.lineWidth=1;
  mCtx.strokeRect(vx,vy,(mainW/viewState.zoom)*sc,(mainH/viewState.zoom)*sc);
}
