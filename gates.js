/* gates.js — Gate defs, IEEE SVG shapes, logic eval, truth tables, templates */

// ===== GATE DEFINITIONS =====
const GATE_DEFS = {
  // I/O
  INPUT:   { label:'IN',      inputs:0, outputs:1, w:70,  h:38, cat:'io' },
  CLOCK:   { label:'CLK',     inputs:0, outputs:1, w:70,  h:38, cat:'io' },
  OUTPUT:  { label:'OUT',     inputs:1, outputs:0, w:70,  h:38, cat:'io' },
  LED:     { label:'LED',     inputs:1, outputs:0, w:38,  h:38, cat:'io' },
  // Basic gates
  BUFFER:  { label:'BUF',     inputs:1, outputs:1, w:72,  h:42, cat:'basic' },
  NOT:     { label:'NOT',     inputs:1, outputs:1, w:72,  h:42, cat:'basic' },
  AND:     { label:'AND',     inputs:2, outputs:1, w:72,  h:50, cat:'basic' },
  OR:      { label:'OR',      inputs:2, outputs:1, w:72,  h:50, cat:'basic' },
  NAND:    { label:'NAND',    inputs:2, outputs:1, w:76,  h:50, cat:'basic' },
  NOR:     { label:'NOR',     inputs:2, outputs:1, w:76,  h:50, cat:'basic' },
  XOR:     { label:'XOR',     inputs:2, outputs:1, w:76,  h:50, cat:'basic' },
  XNOR:    { label:'XNOR',   inputs:2, outputs:1, w:80,  h:50, cat:'basic' },
  // Multi-input
  AND3:    { label:'AND',     inputs:3, outputs:1, w:72,  h:58, cat:'multi' },
  OR3:     { label:'OR',      inputs:3, outputs:1, w:72,  h:58, cat:'multi' },
  AND4:    { label:'AND',     inputs:4, outputs:1, w:72,  h:66, cat:'multi' },
  OR4:     { label:'OR',      inputs:4, outputs:1, w:72,  h:66, cat:'multi' },
  // Flip-flops
  SR_FF:   { label:'SR',      inputs:3, outputs:2, w:84,  h:66, cat:'ff' },
  D_FF:    { label:'D-FF',    inputs:2, outputs:2, w:84,  h:58, cat:'ff' },
  JK_FF:   { label:'JK',      inputs:3, outputs:2, w:84,  h:66, cat:'ff' },
  T_FF:    { label:'T-FF',    inputs:2, outputs:2, w:84,  h:58, cat:'ff' },
  // MSI Components
  MUX2:    { label:'MUX 2:1', inputs:3, outputs:1, w:96,  h:66, cat:'msi' },  // A,B,Sel → Out
  MUX4:    { label:'MUX 4:1', inputs:6, outputs:1, w:96,  h:100,cat:'msi' },  // D0-D3,S0,S1 → Out
  DEMUX2:  { label:'DMUX 1:2',inputs:2, outputs:2, w:96,  h:66, cat:'msi' },  // In,Sel → Y0,Y1
  DEC2:    { label:'DEC 2:4', inputs:2, outputs:4, w:96,  h:90, cat:'msi' },  // A,B → Y0-Y3
  DEC3:    { label:'DEC 3:8', inputs:3, outputs:8, w:96,  h:140,cat:'msi' },  // A,B,C → Y0-Y7
  ENC4:    { label:'ENC 4:2', inputs:4, outputs:2, w:96,  h:90, cat:'msi' },  // D0-D3 → A0,A1
  PRIO4:   { label:'PRIO 4:2',inputs:4, outputs:3, w:96,  h:90, cat:'msi' },  // D0-D3 → A0,A1,GS
  BIN2HEX: { label:'BIN→HEX', inputs:4, outputs:4, w:96,  h:90, cat:'msi' },  // B0-B3 → hex nibble passthrough with display
  COMP1:   { label:'1-bit CMP',inputs:2, outputs:3, w:96,  h:74, cat:'msi' },  // A,B → A>B, A=B, A<B
  HADD:    { label:'HALF ADD', inputs:2, outputs:2, w:96,  h:58, cat:'msi' },  // A,B → Sum,Carry
  FADD:    { label:'FULL ADD', inputs:3, outputs:2, w:96,  h:66, cat:'msi' },  // A,B,Cin → Sum,Cout
};

const CAT_COLORS = {
  basic: { stroke:'#2a3d5a', fill:'#111827', text:'#6bacd4', out:'#4a90d9' },
  io:    { stroke:'#5a3a10', fill:'#1a1208', text:'#ffa726', out:'#ffa726' },
  multi: { stroke:'#0f3a40', fill:'#081418', text:'#26c6da', out:'#26c6da' },
  ff:    { stroke:'#3a2060', fill:'#120d20', text:'#9c6bff', out:'#9c6bff' },
  msi:   { stroke:'#1a3a2a', fill:'#0a1a12', text:'#00e676', out:'#00e676' },
};

// ===== IEEE GATE SHAPES (drawn on canvas) =====
// Each function receives (ctx, x, y, w, h, strokeColor, strokeWidth)

const GATE_SHAPES = {

  AND(ctx, x, y, w, h, sc, sw) {
    const cx = x + w * 0.52, cy = y + h / 2;
    const r  = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.18, y);
    ctx.lineTo(cx, y);
    ctx.arc(cx, cy, r, -Math.PI/2, Math.PI/2);
    ctx.lineTo(x + w * 0.18, y + h);
    ctx.closePath();
    ctx.strokeStyle = sc; ctx.lineWidth = sw; ctx.stroke();
    // input stubs
    const pins = inputYPositions(2, h);
    pins.forEach(py => {
      ctx.beginPath(); ctx.moveTo(x, y + py); ctx.lineTo(x + w * 0.18, y + py); ctx.stroke();
    });
    // output stub
    ctx.beginPath(); ctx.moveTo(x + w * 0.52 + r, y + h/2); ctx.lineTo(x + w, y + h/2); ctx.stroke();
  },

  OR(ctx, x, y, w, h, sc, sw) {
    const ax = x + w * 0.12;
    ctx.beginPath();
    ctx.moveTo(ax, y);
    ctx.quadraticCurveTo(ax + w * 0.28, y + h/2, ax, y + h);
    ctx.quadraticCurveTo(ax + w * 0.55, y + h * 0.72, x + w * 0.86, y + h/2);
    ctx.quadraticCurveTo(ax + w * 0.55, y + h * 0.28, ax, y);
    ctx.strokeStyle = sc; ctx.lineWidth = sw; ctx.stroke();
    const pins = inputYPositions(2, h);
    pins.forEach(py => {
      const startX = ax + curveOffsetOR(py / h);
      ctx.beginPath(); ctx.moveTo(x, y + py); ctx.lineTo(startX, y + py); ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(x + w * 0.86, y + h/2); ctx.lineTo(x + w, y + h/2); ctx.stroke();
  },

  NOT(ctx, x, y, w, h, sc, sw) {
    const bw = w * 0.7;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.1, y + 2);
    ctx.lineTo(x + w * 0.1, y + h - 2);
    ctx.lineTo(x + w * 0.1 + bw - 8, y + h / 2);
    ctx.closePath();
    ctx.strokeStyle = sc; ctx.lineWidth = sw; ctx.stroke();
    // bubble
    const bx = x + w * 0.1 + bw - 8 + 5;
    ctx.beginPath(); ctx.arc(bx, y + h/2, 4.5, 0, Math.PI*2);
    ctx.strokeStyle = sc; ctx.lineWidth = sw; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + h/2); ctx.lineTo(x + w * 0.1, y + h/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + 4.5, y + h/2); ctx.lineTo(x + w, y + h/2); ctx.stroke();
  },

  BUFFER(ctx, x, y, w, h, sc, sw) {
    const bw = w * 0.76;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.1, y + 2);
    ctx.lineTo(x + w * 0.1, y + h - 2);
    ctx.lineTo(x + w * 0.1 + bw, y + h / 2);
    ctx.closePath();
    ctx.strokeStyle = sc; ctx.lineWidth = sw; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + h/2); ctx.lineTo(x + w * 0.1, y + h/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w * 0.1 + bw, y + h/2); ctx.lineTo(x + w, y + h/2); ctx.stroke();
  },

  NAND(ctx, x, y, w, h, sc, sw) {
    const bodyW = w * 0.7;
    const cx = x + w * 0.18 + bodyW * 0.52, cy = y + h / 2;
    const r  = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.18, y);
    ctx.lineTo(cx, y);
    ctx.arc(cx, cy, r, -Math.PI/2, Math.PI/2);
    ctx.lineTo(x + w * 0.18, y + h);
    ctx.closePath();
    ctx.strokeStyle = sc; ctx.lineWidth = sw; ctx.stroke();
    const bx = cx + r + 5;
    ctx.beginPath(); ctx.arc(bx, cy, 4.5, 0, Math.PI*2); ctx.stroke();
    inputYPositions(2, h).forEach(py => {
      ctx.beginPath(); ctx.moveTo(x, y + py); ctx.lineTo(x + w * 0.18, y + py); ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(bx + 4.5, cy); ctx.lineTo(x + w, cy); ctx.stroke();
  },

  NOR(ctx, x, y, w, h, sc, sw) {
    const ax = x + w * 0.1;
    const bodyRight = x + w * 0.72;
    ctx.beginPath();
    ctx.moveTo(ax, y);
    ctx.quadraticCurveTo(ax + w * 0.26, y + h/2, ax, y + h);
    ctx.quadraticCurveTo(ax + w * 0.5, y + h * 0.72, bodyRight, y + h/2);
    ctx.quadraticCurveTo(ax + w * 0.5, y + h * 0.28, ax, y);
    ctx.strokeStyle = sc; ctx.lineWidth = sw; ctx.stroke();
    const bx = bodyRight + 5;
    ctx.beginPath(); ctx.arc(bx, y + h/2, 4.5, 0, Math.PI*2); ctx.stroke();
    inputYPositions(2, h).forEach(py => {
      const sx = ax + curveOffsetOR(py / h) * 0.9;
      ctx.beginPath(); ctx.moveTo(x, y + py); ctx.lineTo(sx, y + py); ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(bx + 4.5, y + h/2); ctx.lineTo(x + w, y + h/2); ctx.stroke();
  },

  XOR(ctx, x, y, w, h, sc, sw) {
    const ax = x + w * 0.18;
    ctx.beginPath();
    ctx.moveTo(ax, y);
    ctx.quadraticCurveTo(ax + w * 0.28, y + h/2, ax, y + h);
    ctx.quadraticCurveTo(ax + w * 0.52, y + h * 0.72, x + w * 0.88, y + h/2);
    ctx.quadraticCurveTo(ax + w * 0.52, y + h * 0.28, ax, y);
    ctx.strokeStyle = sc; ctx.lineWidth = sw; ctx.stroke();
    // extra curved line
    ctx.beginPath();
    ctx.moveTo(ax - 7, y);
    ctx.quadraticCurveTo(ax - 7 + w * 0.28, y + h/2, ax - 7, y + h);
    ctx.stroke();
    inputYPositions(2, h).forEach(py => {
      const sx = ax + curveOffsetOR(py / h);
      ctx.beginPath(); ctx.moveTo(x, y + py); ctx.lineTo(sx, y + py); ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(x + w * 0.88, y + h/2); ctx.lineTo(x + w, y + h/2); ctx.stroke();
  },

  XNOR(ctx, x, y, w, h, sc, sw) {
    const ax = x + w * 0.16;
    const bodyRight = x + w * 0.72;
    ctx.beginPath();
    ctx.moveTo(ax, y);
    ctx.quadraticCurveTo(ax + w * 0.27, y + h/2, ax, y + h);
    ctx.quadraticCurveTo(ax + w * 0.48, y + h * 0.72, bodyRight, y + h/2);
    ctx.quadraticCurveTo(ax + w * 0.48, y + h * 0.28, ax, y);
    ctx.strokeStyle = sc; ctx.lineWidth = sw; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax - 7, y);
    ctx.quadraticCurveTo(ax - 7 + w * 0.27, y + h/2, ax - 7, y + h);
    ctx.stroke();
    const bx = bodyRight + 5;
    ctx.beginPath(); ctx.arc(bx, y + h/2, 4.5, 0, Math.PI*2); ctx.stroke();
    inputYPositions(2, h).forEach(py => {
      const sx = ax + curveOffsetOR(py / h) * 0.9;
      ctx.beginPath(); ctx.moveTo(x, y + py); ctx.lineTo(sx, y + py); ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(bx + 4.5, y + h/2); ctx.lineTo(x + w, y + h/2); ctx.stroke();
  },

  AND3(ctx, x, y, w, h, sc, sw) {
    const cx = x + w * 0.52, cy = y + h / 2, r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.18, y); ctx.lineTo(cx, y);
    ctx.arc(cx, cy, r, -Math.PI/2, Math.PI/2);
    ctx.lineTo(x + w * 0.18, y + h); ctx.closePath();
    ctx.strokeStyle = sc; ctx.lineWidth = sw; ctx.stroke();
    inputYPositions(3, h).forEach(py => {
      ctx.beginPath(); ctx.moveTo(x, y + py); ctx.lineTo(x + w * 0.18, y + py); ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(cx + r, cy); ctx.lineTo(x + w, cy); ctx.stroke();
  },

  OR3(ctx, x, y, w, h, sc, sw) {
    const ax = x + w * 0.12;
    ctx.beginPath();
    ctx.moveTo(ax, y);
    ctx.quadraticCurveTo(ax + w * 0.3, y + h/2, ax, y + h);
    ctx.quadraticCurveTo(ax + w * 0.56, y + h * 0.72, x + w * 0.88, y + h/2);
    ctx.quadraticCurveTo(ax + w * 0.56, y + h * 0.28, ax, y);
    ctx.strokeStyle = sc; ctx.lineWidth = sw; ctx.stroke();
    inputYPositions(3, h).forEach(py => {
      const sx = ax + curveOffsetOR(py / h);
      ctx.beginPath(); ctx.moveTo(x, y + py); ctx.lineTo(sx, y + py); ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(x + w * 0.88, y + h/2); ctx.lineTo(x + w, y + h/2); ctx.stroke();
  },

  AND4(ctx, x, y, w, h, sc, sw) {
    const cx = x + w * 0.52, cy = y + h / 2, r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.18, y); ctx.lineTo(cx, y);
    ctx.arc(cx, cy, r, -Math.PI/2, Math.PI/2);
    ctx.lineTo(x + w * 0.18, y + h); ctx.closePath();
    ctx.strokeStyle = sc; ctx.lineWidth = sw; ctx.stroke();
    inputYPositions(4, h).forEach(py => {
      ctx.beginPath(); ctx.moveTo(x, y + py); ctx.lineTo(x + w * 0.18, y + py); ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(cx + r, cy); ctx.lineTo(x + w, cy); ctx.stroke();
  },

  OR4(ctx, x, y, w, h, sc, sw) {
    const ax = x + w * 0.12;
    ctx.beginPath();
    ctx.moveTo(ax, y);
    ctx.quadraticCurveTo(ax + w * 0.3, y + h/2, ax, y + h);
    ctx.quadraticCurveTo(ax + w * 0.56, y + h * 0.72, x + w * 0.88, y + h/2);
    ctx.quadraticCurveTo(ax + w * 0.56, y + h * 0.28, ax, y);
    ctx.strokeStyle = sc; ctx.lineWidth = sw; ctx.stroke();
    inputYPositions(4, h).forEach(py => {
      const sx = ax + curveOffsetOR(py / h);
      ctx.beginPath(); ctx.moveTo(x, y + py); ctx.lineTo(sx, y + py); ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(x + w * 0.88, y + h/2); ctx.lineTo(x + w, y + h/2); ctx.stroke();
  },
};

// Helper: evenly space pin Y positions within gate height
function inputYPositions(n, h) {
  const positions = [];
  for (let i = 0; i < n; i++) {
    positions.push((h / (n + 1)) * (i + 1));
  }
  return positions;
}

// Offset for OR-family input stubs on curved left side
function curveOffsetOR(t) {
  // t = 0..1, returns x offset of the left curve at that point
  // approximation: parabolic curve peaking at t=0.5
  const dt = t - 0.5;
  return Math.max(0, (0.25 - dt * dt * 4) * 14);
}

// ===== PIN POSITIONS =====

function getInputPins(g) {
  const def = GATE_DEFS[g.type];
  const n = def.inputs;
  if (n === 0) return [];
  return inputYPositions(n, def.h).map((py, i) => ({ x: g.x, y: g.y + py, idx: i }));
}

function getOutputPins(g) {
  const def = GATE_DEFS[g.type];
  const n = def.outputs;
  if (n === 0) return [];
  if (n === 1) return [{ x: g.x + def.w, y: g.y + def.h / 2, idx: 0 }];
  // 2 outputs: Q top, /Q bottom (flip-flops)
  if (n === 2 && ['SR_FF','D_FF','JK_FF','T_FF'].includes(g.type)) {
    return [
      { x: g.x + def.w, y: g.y + def.h * 0.33, idx: 0 },
      { x: g.x + def.w, y: g.y + def.h * 0.67, idx: 1 },
    ];
  }
  // Multi-output MSI: evenly spaced
  return Array.from({length:n}, (_,i) => ({
    x: g.x + def.w,
    y: g.y + (def.h / (n + 1)) * (i + 1),
    idx: i
  }));
}

// ===== LOGIC EVALUATION =====

function evaluateGate(type, inputs, state) {
  const a = inputs[0] ?? 0, b = inputs[1] ?? 0, c = inputs[2] ?? 0;
  switch (type) {
    case 'INPUT':   return [state.value ?? 0];
    case 'CLOCK':   return [state.clockVal ?? 0];
    case 'OUTPUT':  return [];
    case 'LED':     return [];
    case 'BUFFER':  return [a];
    case 'NOT':     return [a^1];
    case 'AND':     return [a & b];
    case 'OR':      return [a | b];
    case 'NAND':    return [(a & b)^1];
    case 'NOR':     return [(a | b)^1];
    case 'XOR':     return [a ^ b];
    case 'XNOR':    return [(a ^ b)^1];
    case 'AND3':    return [a & b & c];
    case 'OR3':     return [a | b | c];
    case 'AND4':    return [a & b & c & (inputs[3]??0)];
    case 'OR4':     return [a | b | c | (inputs[3]??0)];
    // ── MSI Components ──────────────────────────────────────────
    case 'MUX2': {
      // inputs: A(0), B(1), Sel(2)
      const sel = inputs[2]??0;
      return [sel ? (inputs[1]??0) : (inputs[0]??0)];
    }
    case 'MUX4': {
      // inputs: D0,D1,D2,D3,S0,S1
      const s = ((inputs[5]??0)<<1)|(inputs[4]??0);
      return [inputs[s]??0];
    }
    case 'DEMUX2': {
      // inputs: In(0), Sel(1) → Y0,Y1
      const inp=inputs[0]??0, sel2=inputs[1]??0;
      return sel2 ? [0,inp] : [inp,0];
    }
    case 'DEC2': {
      // inputs: A(0),B(1) → Y0,Y1,Y2,Y3
      const val=(b<<1)|a;
      return [val===0?1:0, val===1?1:0, val===2?1:0, val===3?1:0];
    }
    case 'DEC3': {
      // inputs: A,B,C → Y0..Y7
      const val3=(c<<2)|(b<<1)|a;
      return [0,1,2,3,4,5,6,7].map(i=>i===val3?1:0);
    }
    case 'ENC4': {
      // inputs: D0,D1,D2,D3 → A0,A1 (priority to highest)
      const d=inputs; let idx=-1;
      for(let i=3;i>=0;i--) if(d[i]) {idx=i;break;}
      if(idx<0) return [0,0];
      return [idx&1, (idx>>1)&1];
    }
    case 'PRIO4': {
      // inputs: D0,D1,D2,D3 → A0,A1,GS
      const dp=inputs; let ip=-1;
      for(let i=3;i>=0;i--) if(dp[i]) {ip=i;break;}
      if(ip<0) return [0,0,0];
      return [ip&1, (ip>>1)&1, 1];
    }
    case 'BIN2HEX': {
      // inputs: B0,B1,B2,B3 → same bits out (display handled in canvas)
      return [inputs[0]??0, inputs[1]??0, inputs[2]??0, inputs[3]??0];
    }
    case 'COMP1': {
      // inputs: A,B → A>B, A=B, A<B
      return [a>b?1:0, a===b?1:0, a<b?1:0];
    }
    case 'HADD': {
      // inputs: A,B → Sum,Carry
      return [a^b, a&b];
    }
    case 'FADD': {
      // inputs: A,B,Cin → Sum,Cout
      const cin=inputs[2]??0;
      const s=(a^b^cin);
      const co=((a&b)|(b&cin)|(a&cin));
      return [s,co];
    }
    case 'SR_FF': {
      const S = a, R = b, CLK = c;
      if (CLK === 1 && (state.prevClk ?? 0) === 0) { // rising edge
        if (S && R) { /* invalid state — hold */ }
        else if (S)  { state.q = 1; state.nq = 0; }
        else if (R)  { state.q = 0; state.nq = 1; }
        // S=0, R=0 → hold (no change)
      }
      state.prevClk = CLK;
      return [state.q ?? 0, state.nq ?? 1];
    }
    case 'D_FF': {
      const D = a, CLK = b;
      if (CLK === 1 && (state.prevClk ?? 0) === 0) { // rising edge
        state.q = D; state.nq = D ^ 1;
      }
      state.prevClk = CLK;
      return [state.q ?? 0, state.nq ?? 1];
    }
    case 'JK_FF': {
      const J = a, K = b, CLK = c;
      if (CLK === 1 && (state.prevClk ?? 0) === 0) {
        if (J && K)      { state.q = (state.q ?? 0) ^ 1; }
        else if (J)      { state.q = 1; }
        else if (K)      { state.q = 0; }
        state.nq = (state.q ?? 0) ^ 1;
      }
      state.prevClk = CLK;
      return [state.q ?? 0, state.nq ?? 1];
    }
    case 'T_FF': {
      const T = a, CLK = b;
      const prev = state.prevClk ?? 0;
      const risingEdge  = CLK === 1 && prev === 0;
      const fallingEdge = CLK === 0 && prev === 1;
      const trigger = state.fallingEdge ? fallingEdge : risingEdge;
      if (trigger) {
        if (T) { state.q = (state.q ?? 0) ^ 1; state.nq = state.q ^ 1; }
      }
      state.prevClk = CLK;
      return [state.q ?? 0, state.nq ?? 1];
    }
    default: return [0];
  }
}

const FF_TYPES = new Set(['SR_FF','D_FF','JK_FF','T_FF']);

function simulateCircuit(gates, connections) {
  const vals = {};

  // Seed initial values
  gates.forEach(g => {
    if (g.type === 'INPUT') vals[g.id] = [g.value ?? 0];
    if (g.type === 'CLOCK') vals[g.id] = [g.clockVal ?? 0];
    if (FF_TYPES.has(g.type)) vals[g.id] = [g.q ?? 0, g.nq ?? 1];
  });

  // Helper: resolve inputs for a gate from current vals
  function getIns(g) {
    const def = GATE_DEFS[g.type];
    const ins = [];
    for (let i = 0; i < def.inputs; i++) {
      const conn = connections.find(c => c.toId === g.id && c.toPin === i);
      ins.push(conn ? (vals[conn.fromId]?.[conn.fromPin ?? 0] ?? 0) : 0);
    }
    return ins;
  }

  // --- Phase 1: settle combinational (non-FF) logic ---
  for (let pass = 0; pass < 20; pass++) {
    gates.forEach(g => {
      if (g.type === 'INPUT' || g.type === 'CLOCK' || FF_TYPES.has(g.type)) return;
      vals[g.id] = evaluateGate(g.type, getIns(g), g);
    });
  }

  // --- Phase 2: evaluate FFs in topological order (ripple support) ---
  // For synchronous FFs (clocked by same external CLK), snapshot ALL inputs first,
  // then apply — so they don't see each other's new outputs.
  // For ripple/async FFs (clocked by another FF's Q), we need multiple passes
  // so downstream FFs see the updated Q of upstream FFs.

  // Snapshot which FFs share the same CLK source (synchronous group)
  // vs which are driven by another FF's output (ripple group).
  function getClkSource(g) {
    const def = GATE_DEFS[g.type];
    const clkPin = def.inputs - 1; // CLK is always the last input pin
    const conn = connections.find(c => c.toId === g.id && c.toPin === clkPin);
    return conn ? conn.fromId : null;
  }

  const ffGates = gates.filter(g => FF_TYPES.has(g.type));
  const ffIds   = new Set(ffGates.map(g => g.id));

  // Separate into sync group (CLK from non-FF) and ripple group (CLK from another FF)
  const syncFFs   = ffGates.filter(g => !ffIds.has(getClkSource(g)));
  const rippleFFs = ffGates.filter(g =>  ffIds.has(getClkSource(g)));

  // Sync FFs: snapshot inputs first, then apply all at once (parallel semantics)
  const syncSnap = syncFFs.map(g => ({ g, ins: getIns(g) }));
  syncSnap.forEach(({ g, ins }) => {
    vals[g.id] = evaluateGate(g.type, ins, g);
  });

  // Ripple FFs: evaluate in up to N passes so each stage can see its upstream's new output
  // (real ripple propagation — each pass is one gate-delay)
  for (let pass = 0; pass < rippleFFs.length + 1; pass++) {
    rippleFFs.forEach(g => {
      vals[g.id] = evaluateGate(g.type, getIns(g), g);
    });
  }

  // --- Phase 3: settle combinational after FF updates ---
  for (let pass = 0; pass < 10; pass++) {
    gates.forEach(g => {
      if (g.type === 'INPUT' || g.type === 'CLOCK' || FF_TYPES.has(g.type)) return;
      vals[g.id] = evaluateGate(g.type, getIns(g), g);
    });
  }
  // resolve input vals for sinks
  gates.forEach(g => {
    if (g.type === 'OUTPUT' || g.type === 'LED') {
      const conn = connections.find(c => c.toId === g.id && c.toPin === 0);
      vals['in_' + g.id] = conn ? (vals[conn.fromId]?.[conn.fromPin ?? 0] ?? 0) : 0;
    }
  });
  return vals;
}

// ===== TRUTH TABLES =====

function buildTruthTable(type) {
  const def = GATE_DEFS[type];
  if (!def || def.inputs < 1 || def.inputs > 2) return null;
  const n = def.inputs;
  return Array.from({ length: 1 << n }, (_, mask) => {
    const ins = Array.from({ length: n }, (_, b) => (mask >> (n - 1 - b)) & 1);
    return { ins, outs: evaluateGate(type, ins, {}) };
  });
}

function renderTruthTable(type) {
  const rows = buildTruthTable(type);
  if (!rows) return '<div style="color:var(--text-3);font-family:var(--font-mono);font-size:10px;padding:6px">No truth table</div>';
  const def = GATE_DEFS[type];
  const iL  = def.inputs === 1 ? ['A'] : ['A','B'];
  const oL  = def.outputs >= 2 ? ['Q','Q̄'] : ['Out'];
  let html  = '<table><thead><tr>' + iL.map(l=>`<th>${l}</th>`).join('') + oL.map(l=>`<th>${l}</th>`).join('') + '</tr></thead><tbody>';
  rows.forEach(r => {
    html += `<tr class="${r.outs[0]===1?'hi':'lo'}">` + r.ins.map(v=>`<td>${v}</td>`).join('') + r.outs.map(v=>`<td><b>${v}</b></td>`).join('') + '</tr>';
  });
  return html + '</tbody></table>';
}

// ===== TEMPLATES =====

const TEMPLATES = {
  halfadder: {
    name: 'Half Adder',
    gates: [
      {id:1,type:'INPUT',  x:50,  y:90,  value:0, label:'A'},
      {id:2,type:'INPUT',  x:50,  y:190, value:0, label:'B'},
      {id:3,type:'XOR',    x:220, y:112},
      {id:4,type:'AND',    x:220, y:200},
      {id:5,type:'OUTPUT', x:390, y:129, label:'Sum'},
      {id:6,type:'OUTPUT', x:390, y:217, label:'Carry'},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:3,toPin:0},{fromId:2,fromPin:0,toId:3,toPin:1},
      {fromId:1,fromPin:0,toId:4,toPin:0},{fromId:2,fromPin:0,toId:4,toPin:1},
      {fromId:3,fromPin:0,toId:5,toPin:0},{fromId:4,fromPin:0,toId:6,toPin:0},
    ]
  },
  fulladder: {
    name: 'Full Adder',
    gates: [
      {id:1,type:'INPUT', x:40, y:80,  value:0, label:'A'},
      {id:2,type:'INPUT', x:40, y:170, value:0, label:'B'},
      {id:3,type:'INPUT', x:40, y:260, value:0, label:'Cin'},
      {id:4,type:'XOR',   x:190,y:100},
      {id:5,type:'XOR',   x:360,y:120},
      {id:6,type:'AND',   x:190,y:195},
      {id:7,type:'AND',   x:360,y:200},
      {id:8,type:'OR',    x:510,y:195},
      {id:9,type:'OUTPUT',x:650,y:137, label:'Sum'},
      {id:10,type:'OUTPUT',x:650,y:212, label:'Cout'},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:4,toPin:0},{fromId:2,fromPin:0,toId:4,toPin:1},
      {fromId:4,fromPin:0,toId:5,toPin:0},{fromId:3,fromPin:0,toId:5,toPin:1},
      {fromId:1,fromPin:0,toId:6,toPin:0},{fromId:2,fromPin:0,toId:6,toPin:1},
      {fromId:4,fromPin:0,toId:7,toPin:0},{fromId:3,fromPin:0,toId:7,toPin:1},
      {fromId:6,fromPin:0,toId:8,toPin:0},{fromId:7,fromPin:0,toId:8,toPin:1},
      {fromId:5,fromPin:0,toId:9,toPin:0},{fromId:8,fromPin:0,toId:10,toPin:0},
    ]
  },
  mux: {
    name:'2:1 Multiplexer',
    gates:[
      {id:1,type:'INPUT',x:50,y:60,  value:0,label:'A'},
      {id:2,type:'INPUT',x:50,y:150, value:0,label:'B'},
      {id:3,type:'INPUT',x:50,y:240, value:0,label:'Sel'},
      {id:4,type:'NOT',  x:200,y:252},
      {id:5,type:'AND',  x:320,y:88},
      {id:6,type:'AND',  x:320,y:178},
      {id:7,type:'OR',   x:460,y:133},
      {id:8,type:'OUTPUT',x:600,y:150,label:'Out'},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:5,toPin:0},{fromId:3,fromPin:0,toId:4,toPin:0},
      {fromId:4,fromPin:0,toId:5,toPin:1},{fromId:2,fromPin:0,toId:6,toPin:0},
      {fromId:3,fromPin:0,toId:6,toPin:1},{fromId:5,fromPin:0,toId:7,toPin:0},
      {fromId:6,fromPin:0,toId:7,toPin:1},{fromId:7,fromPin:0,toId:8,toPin:0},
    ]
  },
  decoder: {
    name:'2-to-4 Decoder',
    gates:[
      {id:1,type:'INPUT',x:40,y:80,  value:0,label:'A'},
      {id:2,type:'INPUT',x:40,y:190, value:0,label:'B'},
      {id:3,type:'NOT',  x:180,y:92},
      {id:4,type:'NOT',  x:180,y:202},
      {id:5,type:'AND',  x:320,y:70},
      {id:6,type:'AND',  x:320,y:158},
      {id:7,type:'AND',  x:320,y:246},
      {id:8,type:'AND',  x:320,y:334},
      {id:9,type:'OUTPUT',x:470,y:87, label:'Y0'},
      {id:10,type:'OUTPUT',x:470,y:175,label:'Y1'},
      {id:11,type:'OUTPUT',x:470,y:263,label:'Y2'},
      {id:12,type:'OUTPUT',x:470,y:351,label:'Y3'},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:3,toPin:0},{fromId:2,fromPin:0,toId:4,toPin:0},
      {fromId:3,fromPin:0,toId:5,toPin:0},{fromId:4,fromPin:0,toId:5,toPin:1},
      {fromId:1,fromPin:0,toId:6,toPin:0},{fromId:4,fromPin:0,toId:6,toPin:1},
      {fromId:3,fromPin:0,toId:7,toPin:0},{fromId:2,fromPin:0,toId:7,toPin:1},
      {fromId:1,fromPin:0,toId:8,toPin:0},{fromId:2,fromPin:0,toId:8,toPin:1},
      {fromId:5,fromPin:0,toId:9,toPin:0},{fromId:6,fromPin:0,toId:10,toPin:0},
      {fromId:7,fromPin:0,toId:11,toPin:0},{fromId:8,fromPin:0,toId:12,toPin:0},
    ]
  },
  mux2: {
    name:'2:1 Multiplexer (IC)',
    gates:[
      {id:1,type:'INPUT',x:40,y:60, value:0,label:'A'},
      {id:2,type:'INPUT',x:40,y:150,value:0,label:'B'},
      {id:3,type:'INPUT',x:40,y:240,value:0,label:'Sel'},
      {id:4,type:'MUX2', x:200,y:110},
      {id:5,type:'OUTPUT',x:370,y:142,label:'Out'},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:4,toPin:0},{fromId:2,fromPin:0,toId:4,toPin:1},
      {fromId:3,fromPin:0,toId:4,toPin:2},{fromId:4,fromPin:0,toId:5,toPin:0},
    ]
  },
  dec2ic: {
    name:'2-to-4 Decoder (IC)',
    gates:[
      {id:1,type:'INPUT',x:40,y:100,value:0,label:'A'},
      {id:2,type:'INPUT',x:40,y:210,value:0,label:'B'},
      {id:3,type:'DEC2', x:200,y:80},
      {id:4,type:'OUTPUT',x:380,y:87, label:'Y0'},
      {id:5,type:'OUTPUT',x:380,y:132,label:'Y1'},
      {id:6,type:'OUTPUT',x:380,y:177,label:'Y2'},
      {id:7,type:'OUTPUT',x:380,y:222,label:'Y3'},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:3,toPin:0},{fromId:2,fromPin:0,toId:3,toPin:1},
      {fromId:3,fromPin:0,toId:4,toPin:0},{fromId:3,fromPin:1,toId:5,toPin:0},
      {fromId:3,fromPin:2,toId:6,toPin:0},{fromId:3,fromPin:3,toId:7,toPin:0},
    ]
  },
  dec3ic: {
    name:'3-to-8 Decoder (IC)',
    gates:[
      {id:1,type:'INPUT',x:40,y:80, value:0,label:'A'},
      {id:2,type:'INPUT',x:40,y:190,value:0,label:'B'},
      {id:3,type:'INPUT',x:40,y:300,value:0,label:'C'},
      {id:4,type:'DEC3', x:200,y:60},
      {id:5, type:'OUTPUT',x:390,y:67,  label:'Y0'},
      {id:6, type:'OUTPUT',x:390,y:102, label:'Y1'},
      {id:7, type:'OUTPUT',x:390,y:137, label:'Y2'},
      {id:8, type:'OUTPUT',x:390,y:172, label:'Y3'},
      {id:9, type:'OUTPUT',x:390,y:207, label:'Y4'},
      {id:10,type:'OUTPUT',x:390,y:242, label:'Y5'},
      {id:11,type:'OUTPUT',x:390,y:277, label:'Y6'},
      {id:12,type:'OUTPUT',x:390,y:312, label:'Y7'},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:4,toPin:0},{fromId:2,fromPin:0,toId:4,toPin:1},
      {fromId:3,fromPin:0,toId:4,toPin:2},
      {fromId:4,fromPin:0,toId:5,toPin:0},{fromId:4,fromPin:1,toId:6,toPin:0},
      {fromId:4,fromPin:2,toId:7,toPin:0},{fromId:4,fromPin:3,toId:8,toPin:0},
      {fromId:4,fromPin:4,toId:9,toPin:0},{fromId:4,fromPin:5,toId:10,toPin:0},
      {fromId:4,fromPin:6,toId:11,toPin:0},{fromId:4,fromPin:7,toId:12,toPin:0},
    ]
  },
  bin2hex: {
    name:'Binary to Hex Display',
    gates:[
      {id:1,type:'INPUT',x:40,y:60, value:0,label:'B0'},
      {id:2,type:'INPUT',x:40,y:140,value:0,label:'B1'},
      {id:3,type:'INPUT',x:40,y:220,value:0,label:'B2'},
      {id:4,type:'INPUT',x:40,y:300,value:0,label:'B3'},
      {id:5,type:'BIN2HEX',x:200,y:140},
      {id:6, type:'OUTPUT',x:390,y:147,label:'H0'},
      {id:7, type:'OUTPUT',x:390,y:192,label:'H1'},
      {id:8, type:'OUTPUT',x:390,y:237,label:'H2'},
      {id:9, type:'OUTPUT',x:390,y:282,label:'H3'},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:5,toPin:0},{fromId:2,fromPin:0,toId:5,toPin:1},
      {fromId:3,fromPin:0,toId:5,toPin:2},{fromId:4,fromPin:0,toId:5,toPin:3},
      {fromId:5,fromPin:0,toId:6,toPin:0},{fromId:5,fromPin:1,toId:7,toPin:0},
      {fromId:5,fromPin:2,toId:8,toPin:0},{fromId:5,fromPin:3,toId:9,toPin:0},
    ]
  },
  comparator: {
    name:'1-bit Comparator',
    gates:[
      {id:1,type:'INPUT',x:40,y:100,value:0,label:'A'},
      {id:2,type:'INPUT',x:40,y:210,value:0,label:'B'},
      {id:3,type:'COMP1',x:200,y:120},
      {id:4,type:'OUTPUT',x:390,y:127,label:'A>B'},
      {id:5,type:'OUTPUT',x:390,y:172,label:'A=B'},
      {id:6,type:'OUTPUT',x:390,y:217,label:'A<B'},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:3,toPin:0},{fromId:2,fromPin:0,toId:3,toPin:1},
      {fromId:3,fromPin:0,toId:4,toPin:0},{fromId:3,fromPin:1,toId:5,toPin:0},
      {fromId:3,fromPin:2,toId:6,toPin:0},
    ]
  },
  enc4ic: {
    name:'4-to-2 Priority Encoder',
    gates:[
      {id:1,type:'INPUT',x:40,y:60, value:0,label:'D0'},
      {id:2,type:'INPUT',x:40,y:140,value:0,label:'D1'},
      {id:3,type:'INPUT',x:40,y:220,value:0,label:'D2'},
      {id:4,type:'INPUT',x:40,y:300,value:0,label:'D3'},
      {id:5,type:'PRIO4',x:200,y:140},
      {id:6,type:'OUTPUT',x:390,y:147,label:'A0'},
      {id:7,type:'OUTPUT',x:390,y:192,label:'A1'},
      {id:8,type:'OUTPUT',x:390,y:237,label:'GS'},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:5,toPin:0},{fromId:2,fromPin:0,toId:5,toPin:1},
      {fromId:3,fromPin:0,toId:5,toPin:2},{fromId:4,fromPin:0,toId:5,toPin:3},
      {fromId:5,fromPin:0,toId:6,toPin:0},{fromId:5,fromPin:1,toId:7,toPin:0},
      {fromId:5,fromPin:2,toId:8,toPin:0},
    ]
  },
  counter2bit: {
    name:'2-bit Counter (Sync)',
    gates:[
      {id:1,type:'CLOCK',  x:40,  y:160, value:0, label:'CLK', clockVal:0},
      {id:2,type:'INPUT',  x:40,  y:60,  value:1,  label:'T=1'},
      // FF0 (LSB) — toggles every rising edge
      {id:3,type:'T_FF',   x:200, y:80,  q:0, nq:1, prevClk:0},
      // FF1 (MSB) — T=Q0, toggles when Q0=1
      {id:4,type:'T_FF',   x:380, y:80,  q:0, nq:1, prevClk:0},
      // Outputs: Q1 MSB on top, Q0 LSB below
      {id:5,type:'OUTPUT', x:580, y:60,  label:'Q1 (MSB)'},
      {id:6,type:'OUTPUT', x:580, y:130, label:'Q0 (LSB)'},
      // LEDs: left=MSB, right=LSB
      {id:7,type:'LED',    x:580, y:220},
      {id:8,type:'LED',    x:628, y:220},
    ],
    connections:[
      // FF0: T=1, CLK=clock
      {fromId:2,fromPin:0,toId:3,toPin:0},
      {fromId:1,fromPin:0,toId:3,toPin:1},
      // FF1: T=Q0(FF0), CLK=clock
      {fromId:3,fromPin:0,toId:4,toPin:0},
      {fromId:1,fromPin:0,toId:4,toPin:1},
      // Q1 output = FF1, Q0 output = FF0
      {fromId:4,fromPin:0,toId:5,toPin:0},
      {fromId:3,fromPin:0,toId:6,toPin:0},
      // LEDs: left(id7)=Q1 MSB, right(id8)=Q0 LSB
      {fromId:4,fromPin:0,toId:7,toPin:0},
      {fromId:3,fromPin:0,toId:8,toPin:0},
    ]
  },
  async2bitcounter: {
    name:'Async 2-bit Ripple Counter (T-FF)',
    gates:[
      {id:1, type:'CLOCK',  x:40,  y:170, value:0, label:'CLK', clockVal:0},
      {id:2, type:'INPUT',  x:40,  y:60,  value:1, label:'T=1'},
      // FF0 (LSB) — clocked by external CLK rising edge
      {id:3, type:'T_FF',   x:220, y:80,  q:0, nq:1, prevClk:0},
      // FF1 (MSB) — clocked by Q0' (nq of FF0) rising edge = Q0 falling edge
      {id:4, type:'T_FF',   x:420, y:80,  q:0, nq:1, prevClk:1},
      // Outputs: Q1 MSB on top, Q0 LSB below
      {id:5, type:'OUTPUT', x:620, y:60,  label:'Q1 (MSB)'},
      {id:6, type:'OUTPUT', x:620, y:130, label:'Q0 (LSB)'},
      // LEDs: left=MSB(Q1), right=LSB(Q0)
      {id:7, type:'LED',    x:620, y:220},
      {id:8, type:'LED',    x:668, y:220},
    ],
    connections:[
      // FF0: T=1, CLK = external clock
      {fromId:2, fromPin:0, toId:3, toPin:0},
      {fromId:1, fromPin:0, toId:3, toPin:1},
      // FF1: T=1, CLK = Q0' (nq = pin 1) of FF0 — rising edge of Q0' = falling edge of Q0
      {fromId:2, fromPin:0, toId:4, toPin:0},
      {fromId:3, fromPin:1, toId:4, toPin:1},
      // Q1=FF1(MSB), Q0=FF0(LSB)
      {fromId:4, fromPin:0, toId:5, toPin:0},
      {fromId:3, fromPin:0, toId:6, toPin:0},
      // LEDs: left(id7)=Q1 MSB, right(id8)=Q0 LSB
      {fromId:4, fromPin:0, toId:7, toPin:0},
      {fromId:3, fromPin:0, toId:8, toPin:0},
    ]
  },
  // ── UNIVERSAL GATE REALIZATIONS ─────────────────────────────

  and_nand: {
    name: 'AND using NAND Gates',
    gates: [
      {id:1,type:'INPUT', x:50, y:100,value:0,label:'A'},
      {id:2,type:'INPUT', x:50, y:200,value:0,label:'B'},
      {id:3,type:'NAND',  x:210,y:125},
      {id:4,type:'NAND',  x:370,y:125},
      {id:5,type:'OUTPUT',x:530,y:142,label:'A·B'},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:3,toPin:0},{fromId:2,fromPin:0,toId:3,toPin:1},
      {fromId:3,fromPin:0,toId:4,toPin:0},{fromId:3,fromPin:0,toId:4,toPin:1},
      {fromId:4,fromPin:0,toId:5,toPin:0},
    ]
  },

  or_nand: {
    name: 'OR using NAND Gates',
    gates: [
      {id:1,type:'INPUT', x:50, y:80, value:0,label:'A'},
      {id:2,type:'INPUT', x:50, y:220,value:0,label:'B'},
      {id:3,type:'NAND',  x:200,y:92},
      {id:4,type:'NAND',  x:200,y:205},
      {id:5,type:'NAND',  x:370,y:148},
      {id:6,type:'OUTPUT',x:530,y:165,label:'A+B'},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:3,toPin:0},{fromId:1,fromPin:0,toId:3,toPin:1},
      {fromId:2,fromPin:0,toId:4,toPin:0},{fromId:2,fromPin:0,toId:4,toPin:1},
      {fromId:3,fromPin:0,toId:5,toPin:0},{fromId:4,fromPin:0,toId:5,toPin:1},
      {fromId:5,fromPin:0,toId:6,toPin:0},
    ]
  },

  not_nand: {
    name: 'NOT using NAND Gate',
    gates: [
      {id:1,type:'INPUT', x:50, y:130,value:0,label:'A'},
      {id:2,type:'NAND',  x:220,y:130},
      {id:3,type:'OUTPUT',x:390,y:147,label:"A'"},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:2,toPin:0},{fromId:1,fromPin:0,toId:2,toPin:1},
      {fromId:2,fromPin:0,toId:3,toPin:0},
    ]
  },

  xor_nand: {
    name: 'XOR using NAND Gates',
    gates: [
      {id:1,type:'INPUT', x:40, y:100,value:0,label:'A'},
      {id:2,type:'INPUT', x:40, y:230,value:0,label:'B'},
      {id:3,type:'NAND',  x:190,y:148},
      {id:4,type:'NAND',  x:340,y:88},
      {id:5,type:'NAND',  x:340,y:208},
      {id:6,type:'NAND',  x:490,y:148},
      {id:7,type:'OUTPUT',x:650,y:165,label:'A⊕B'},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:3,toPin:0},{fromId:2,fromPin:0,toId:3,toPin:1},
      {fromId:1,fromPin:0,toId:4,toPin:0},{fromId:3,fromPin:0,toId:4,toPin:1},
      {fromId:2,fromPin:0,toId:5,toPin:0},{fromId:3,fromPin:0,toId:5,toPin:1},
      {fromId:4,fromPin:0,toId:6,toPin:0},{fromId:5,fromPin:0,toId:6,toPin:1},
      {fromId:6,fromPin:0,toId:7,toPin:0},
    ]
  },

  and_nor: {
    name: 'AND using NOR Gates',
    gates: [
      {id:1,type:'INPUT', x:50, y:80, value:0,label:'A'},
      {id:2,type:'INPUT', x:50, y:220,value:0,label:'B'},
      {id:3,type:'NOR',   x:200,y:92},
      {id:4,type:'NOR',   x:200,y:205},
      {id:5,type:'NOR',   x:370,y:148},
      {id:6,type:'OUTPUT',x:530,y:165,label:'A·B'},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:3,toPin:0},{fromId:1,fromPin:0,toId:3,toPin:1},
      {fromId:2,fromPin:0,toId:4,toPin:0},{fromId:2,fromPin:0,toId:4,toPin:1},
      {fromId:3,fromPin:0,toId:5,toPin:0},{fromId:4,fromPin:0,toId:5,toPin:1},
      {fromId:5,fromPin:0,toId:6,toPin:0},
    ]
  },

  or_nor: {
    name: 'OR using NOR Gates',
    gates: [
      {id:1,type:'INPUT', x:50, y:100,value:0,label:'A'},
      {id:2,type:'INPUT', x:50, y:200,value:0,label:'B'},
      {id:3,type:'NOR',   x:210,y:125},
      {id:4,type:'NOR',   x:370,y:125},
      {id:5,type:'OUTPUT',x:530,y:142,label:'A+B'},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:3,toPin:0},{fromId:2,fromPin:0,toId:3,toPin:1},
      {fromId:3,fromPin:0,toId:4,toPin:0},{fromId:3,fromPin:0,toId:4,toPin:1},
      {fromId:4,fromPin:0,toId:5,toPin:0},
    ]
  },

  not_nor: {
    name: 'NOT using NOR Gate',
    gates: [
      {id:1,type:'INPUT', x:50, y:130,value:0,label:'A'},
      {id:2,type:'NOR',   x:220,y:130},
      {id:3,type:'OUTPUT',x:390,y:147,label:"A'"},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:2,toPin:0},{fromId:1,fromPin:0,toId:2,toPin:1},
      {fromId:2,fromPin:0,toId:3,toPin:0},
    ]
  },

  xor_nor: {
    name: 'XOR using NOR Gates',
    gates: [
      {id:1,type:'INPUT', x:40, y:100,value:0,label:'A'},
      {id:2,type:'INPUT', x:40, y:260,value:0,label:'B'},
      {id:3,type:'NOR',   x:190,y:178},
      {id:4,type:'NOR',   x:340,y:88},
      {id:5,type:'NOR',   x:340,y:248},
      {id:6,type:'NOR',   x:490,y:168},
      {id:7,type:'NOR',   x:640,y:168},
      {id:8,type:'OUTPUT',x:800,y:185,label:'A⊕B'},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:3,toPin:0},{fromId:2,fromPin:0,toId:3,toPin:1},
      {fromId:1,fromPin:0,toId:4,toPin:0},{fromId:3,fromPin:0,toId:4,toPin:1},
      {fromId:2,fromPin:0,toId:5,toPin:0},{fromId:3,fromPin:0,toId:5,toPin:1},
      {fromId:4,fromPin:0,toId:6,toPin:0},{fromId:5,fromPin:0,toId:6,toPin:1},
      {fromId:6,fromPin:0,toId:7,toPin:0},{fromId:6,fromPin:0,toId:7,toPin:1},
      {fromId:7,fromPin:0,toId:8,toPin:0},
    ]
  },

  // ── FLIP-FLOP CONVERSIONS ────────────────────────────────────

  sr_to_d: {
    name:'SR FF → D FF conversion',
    gates:[
      {id:1,type:'INPUT', x:40, y:80, value:0,label:'D'},
      {id:2,type:'CLOCK', x:40, y:220,value:0,label:'CLK',clockVal:0},
      {id:3,type:'NOT',   x:180,y:92},
      {id:4,type:'SR_FF', x:340,y:100,q:0,nq:1,prevClk:0},
      {id:5,type:'OUTPUT',x:530,y:107,label:'Q'},
      {id:6,type:'OUTPUT',x:530,y:152,label:"Q'"},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:4,toPin:0},
      {fromId:1,fromPin:0,toId:3,toPin:0},
      {fromId:3,fromPin:0,toId:4,toPin:1},
      {fromId:2,fromPin:0,toId:4,toPin:2},
      {fromId:4,fromPin:0,toId:5,toPin:0},{fromId:4,fromPin:1,toId:6,toPin:0},
    ]
  },

  sr_to_jk: {
    name:'SR FF → JK FF conversion',
    gates:[
      {id:1,type:'INPUT', x:40, y:60, value:0,label:'J'},
      {id:2,type:'INPUT', x:40, y:180,value:0,label:'K'},
      {id:3,type:'CLOCK', x:40, y:300,value:0,label:'CLK',clockVal:0},
      {id:4,type:'AND',   x:200,y:70},
      {id:5,type:'AND',   x:200,y:185},
      {id:6,type:'SR_FF', x:380,y:140,q:0,nq:1,prevClk:0},
      {id:7,type:'OUTPUT',x:570,y:147,label:'Q'},
      {id:8,type:'OUTPUT',x:570,y:192,label:"Q'"},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:4,toPin:0},{fromId:6,fromPin:1,toId:4,toPin:1},
      {fromId:2,fromPin:0,toId:5,toPin:0},{fromId:6,fromPin:0,toId:5,toPin:1},
      {fromId:4,fromPin:0,toId:6,toPin:0},{fromId:5,fromPin:0,toId:6,toPin:1},
      {fromId:3,fromPin:0,toId:6,toPin:2},
      {fromId:6,fromPin:0,toId:7,toPin:0},{fromId:6,fromPin:1,toId:8,toPin:0},
    ]
  },

  sr_to_t: {
    name:'SR FF → T FF conversion',
    gates:[
      {id:1,type:'INPUT', x:40, y:120,value:0,label:'T'},
      {id:2,type:'CLOCK', x:40, y:290,value:0,label:'CLK',clockVal:0},
      {id:3,type:'AND',   x:200,y:80},
      {id:4,type:'AND',   x:200,y:195},
      {id:5,type:'SR_FF', x:380,y:135,q:0,nq:1,prevClk:0},
      {id:6,type:'OUTPUT',x:570,y:142,label:'Q'},
      {id:7,type:'OUTPUT',x:570,y:187,label:"Q'"},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:3,toPin:0},{fromId:5,fromPin:1,toId:3,toPin:1},
      {fromId:1,fromPin:0,toId:4,toPin:0},{fromId:5,fromPin:0,toId:4,toPin:1},
      {fromId:3,fromPin:0,toId:5,toPin:0},{fromId:4,fromPin:0,toId:5,toPin:1},
      {fromId:2,fromPin:0,toId:5,toPin:2},
      {fromId:5,fromPin:0,toId:6,toPin:0},{fromId:5,fromPin:1,toId:7,toPin:0},
    ]
  },

  d_to_sr: {
    name:'D FF → SR FF conversion',
    gates:[
      {id:1,type:'INPUT', x:40, y:60, value:0,label:'S'},
      {id:2,type:'INPUT', x:40, y:200,value:0,label:'R'},
      {id:3,type:'CLOCK', x:40, y:320,value:0,label:'CLK',clockVal:0},
      {id:4,type:'NOT',   x:180,y:212},
      {id:5,type:'AND',   x:320,y:145},
      {id:6,type:'OR',    x:460,y:90},
      {id:7,type:'D_FF',  x:610,y:100,q:0,nq:1,prevClk:0},
      {id:8,type:'OUTPUT',x:790,y:107,label:'Q'},
      {id:9,type:'OUTPUT',x:790,y:152,label:"Q'"},
    ],
    connections:[
      {fromId:2,fromPin:0,toId:4,toPin:0},
      {fromId:7,fromPin:0,toId:5,toPin:0},{fromId:4,fromPin:0,toId:5,toPin:1},
      {fromId:1,fromPin:0,toId:6,toPin:0},{fromId:5,fromPin:0,toId:6,toPin:1},
      {fromId:6,fromPin:0,toId:7,toPin:0},{fromId:3,fromPin:0,toId:7,toPin:1},
      {fromId:7,fromPin:0,toId:8,toPin:0},{fromId:7,fromPin:1,toId:9,toPin:0},
    ]
  },

  d_to_jk: {
    name:'D FF → JK FF conversion',
    gates:[
      {id:1,type:'INPUT', x:40, y:60, value:0,label:'J'},
      {id:2,type:'INPUT', x:40, y:230,value:0,label:'K'},
      {id:3,type:'CLOCK', x:40, y:350,value:0,label:'CLK',clockVal:0},
      {id:4,type:'NOT',   x:180,y:242},
      {id:5,type:'AND',   x:340,y:75},
      {id:6,type:'AND',   x:340,y:210},
      {id:7,type:'OR',    x:490,y:142},
      {id:8,type:'D_FF',  x:640,y:130,q:0,nq:1,prevClk:0},
      {id:9,type:'OUTPUT',x:820,y:137,label:'Q'},
      {id:10,type:'OUTPUT',x:820,y:182,label:"Q'"},
    ],
    connections:[
      {fromId:2,fromPin:0,toId:4,toPin:0},
      {fromId:1,fromPin:0,toId:5,toPin:0},{fromId:8,fromPin:1,toId:5,toPin:1},
      {fromId:4,fromPin:0,toId:6,toPin:0},{fromId:8,fromPin:0,toId:6,toPin:1},
      {fromId:5,fromPin:0,toId:7,toPin:0},{fromId:6,fromPin:0,toId:7,toPin:1},
      {fromId:7,fromPin:0,toId:8,toPin:0},{fromId:3,fromPin:0,toId:8,toPin:1},
      {fromId:8,fromPin:0,toId:9,toPin:0},{fromId:8,fromPin:1,toId:10,toPin:0},
    ]
  },

  d_to_t: {
    name:'D FF → T FF conversion',
    gates:[
      {id:1,type:'INPUT', x:40, y:120,value:0,label:'T'},
      {id:2,type:'CLOCK', x:40, y:280,value:0,label:'CLK',clockVal:0},
      {id:3,type:'XOR',   x:230,y:130},
      {id:4,type:'D_FF',  x:420,y:120,q:0,nq:1,prevClk:0},
      {id:5,type:'OUTPUT',x:610,y:127,label:'Q'},
      {id:6,type:'OUTPUT',x:610,y:172,label:"Q'"},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:3,toPin:0},{fromId:4,fromPin:0,toId:3,toPin:1},
      {fromId:3,fromPin:0,toId:4,toPin:0},{fromId:2,fromPin:0,toId:4,toPin:1},
      {fromId:4,fromPin:0,toId:5,toPin:0},{fromId:4,fromPin:1,toId:6,toPin:0},
    ]
  },

  jk_to_sr: {
    name:'JK FF → SR FF conversion',
    gates:[
      {id:1,type:'INPUT', x:40, y:80, value:0,label:'S'},
      {id:2,type:'INPUT', x:40, y:190,value:0,label:'R'},
      {id:3,type:'CLOCK', x:40, y:300,value:0,label:'CLK',clockVal:0},
      {id:4,type:'JK_FF', x:280,y:120,q:0,nq:1,prevClk:0},
      {id:5,type:'OUTPUT',x:470,y:127,label:'Q'},
      {id:6,type:'OUTPUT',x:470,y:172,label:"Q'"},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:4,toPin:0},{fromId:2,fromPin:0,toId:4,toPin:1},
      {fromId:3,fromPin:0,toId:4,toPin:2},
      {fromId:4,fromPin:0,toId:5,toPin:0},{fromId:4,fromPin:1,toId:6,toPin:0},
    ]
  },

  jk_to_d: {
    name:'JK FF → D FF conversion',
    gates:[
      {id:1,type:'INPUT', x:40, y:120,value:0,label:'D'},
      {id:2,type:'CLOCK', x:40, y:290,value:0,label:'CLK',clockVal:0},
      {id:3,type:'NOT',   x:190,y:200},
      {id:4,type:'JK_FF', x:360,y:120,q:0,nq:1,prevClk:0},
      {id:5,type:'OUTPUT',x:550,y:127,label:'Q'},
      {id:6,type:'OUTPUT',x:550,y:172,label:"Q'"},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:4,toPin:0},
      {fromId:1,fromPin:0,toId:3,toPin:0},{fromId:3,fromPin:0,toId:4,toPin:1},
      {fromId:2,fromPin:0,toId:4,toPin:2},
      {fromId:4,fromPin:0,toId:5,toPin:0},{fromId:4,fromPin:1,toId:6,toPin:0},
    ]
  },

  jk_to_t: {
    name:'JK FF → T FF conversion',
    gates:[
      {id:1,type:'INPUT', x:40, y:150,value:0,label:'T'},
      {id:2,type:'CLOCK', x:40, y:290,value:0,label:'CLK',clockVal:0},
      {id:3,type:'JK_FF', x:280,y:120,q:0,nq:1,prevClk:0},
      {id:4,type:'OUTPUT',x:470,y:127,label:'Q'},
      {id:5,type:'OUTPUT',x:470,y:172,label:"Q'"},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:3,toPin:0},{fromId:1,fromPin:0,toId:3,toPin:1},
      {fromId:2,fromPin:0,toId:3,toPin:2},
      {fromId:3,fromPin:0,toId:4,toPin:0},{fromId:3,fromPin:1,toId:5,toPin:0},
    ]
  },

  

  t_to_d: {
    name:'T FF → D FF conversion',
    gates:[
      {id:1,type:'INPUT', x:40, y:120,value:0,label:'D'},
      {id:2,type:'CLOCK', x:40, y:280,value:0,label:'CLK',clockVal:0},
      {id:3,type:'XOR',   x:230,y:130},
      {id:4,type:'T_FF',  x:420,y:120,q:0,nq:1,prevClk:0},
      {id:5,type:'OUTPUT',x:610,y:127,label:'Q'},
      {id:6,type:'OUTPUT',x:610,y:172,label:"Q'"},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:3,toPin:0},{fromId:4,fromPin:0,toId:3,toPin:1},
      {fromId:3,fromPin:0,toId:4,toPin:0},{fromId:2,fromPin:0,toId:4,toPin:1},
      {fromId:4,fromPin:0,toId:5,toPin:0},{fromId:4,fromPin:1,toId:6,toPin:0},
    ]
  },

  t_to_jk: {
    name:'T FF → JK FF conversion',
    gates:[
      {id:1,type:'INPUT', x:40, y:60, value:0,label:'J'},
      {id:2,type:'INPUT', x:40, y:230,value:0,label:'K'},
      {id:3,type:'CLOCK', x:40, y:360,value:0,label:'CLK',clockVal:0},
      {id:4,type:'AND',   x:210,y:75},
      {id:5,type:'AND',   x:210,y:205},
      {id:6,type:'OR',    x:380,y:140},
      {id:7,type:'T_FF',  x:550,y:130,q:0,nq:1,prevClk:0},
      {id:8,type:'OUTPUT',x:740,y:137,label:'Q'},
      {id:9,type:'OUTPUT',x:740,y:182,label:"Q'"},
    ],
    connections:[
      {fromId:1,fromPin:0,toId:4,toPin:0},{fromId:7,fromPin:1,toId:4,toPin:1},
      {fromId:2,fromPin:0,toId:5,toPin:0},{fromId:7,fromPin:0,toId:5,toPin:1},
      {fromId:4,fromPin:0,toId:6,toPin:0},{fromId:5,fromPin:0,toId:6,toPin:1},
      {fromId:6,fromPin:0,toId:7,toPin:0},{fromId:3,fromPin:0,toId:7,toPin:1},
      {fromId:7,fromPin:0,toId:8,toPin:0},{fromId:7,fromPin:1,toId:9,toPin:0},
    ]
  },

  // ── CUSTOM SEQUENCE COUNTERS ─────────────────────────────────
  //
  // DESIGN METHOD (from GeeksforGeeks reference):
  //   1. List state transitions for the desired sequence
  //   2. Build excitation table using T-FF rule: T = Q(t) XOR Q(t+1)
  //      (T=1 when bit changes, T=0 when bit stays)
  //   3. Minimise each T equation via K-Map
  //   4. Implement the minimised expressions as combinational logic
  //      feeding into the T inputs of the flip-flops
  //
  // ── COUNTER 1: 0→1→3→4→5→7→0  (GFG example, 3-bit T-FF) ────
  //  K-map derived: T3=Q2, T2=Q1, T1=Q2+Q1'
  //  i.e. T1 = OR(Q2, NOT(Q1))
  cnt_013457: {
    name: 'Seq Counter: 0→1→3→4→5→7 (T-FF)',
    gates: [
      // Clock
      {id:1, type:'CLOCK',  x:40,  y:340, clockVal:0, label:'CLK'},
      // Three T flip-flops: FF1(Q1 LSB), FF2(Q2), FF3(Q3 MSB)
      // FF1 – pin0=T, pin1=CLK
      {id:2, type:'T_FF',   x:500, y:60,  q:0, nq:1, prevClk:0},
      // FF2
      {id:3, type:'T_FF',   x:500, y:190, q:0, nq:1, prevClk:0},
      // FF3
      {id:4, type:'T_FF',   x:500, y:320, q:0, nq:1, prevClk:0},
      // NOT Q1 (for T1 expression)
      {id:5, type:'NOT',    x:180, y:75},
      // OR: T1 = Q2 + Q1'
      {id:6, type:'OR',     x:330, y:72},
      // Outputs
      {id:7, type:'OUTPUT', x:700, y:67,  label:'Q1(LSB)'},
      {id:8, type:'OUTPUT', x:700, y:197, label:'Q2'},
      {id:9, type:'OUTPUT', x:700, y:327, label:'Q3(MSB)'},
      // LEDs for visual state display
      {id:10,type:'LED',    x:700, y:420},
      {id:11,type:'LED',    x:748, y:420},
      {id:12,type:'LED',    x:796, y:420},
    ],
    connections: [
      // NOT Q1: input = Q1 output (pin0 of FF1)
      {fromId:2, fromPin:0, toId:5, toPin:0},
      // OR: T1 = Q2 + Q1'
      {fromId:3, fromPin:0, toId:6, toPin:0},   // Q2 → OR pin0
      {fromId:5, fromPin:0, toId:6, toPin:1},   // Q1' → OR pin1
      // FF1 T input = OR output (T1)
      {fromId:6, fromPin:0, toId:2, toPin:0},
      // FF2 T input = Q1 (T2 = Q1)
      {fromId:2, fromPin:0, toId:3, toPin:0},
      // FF3 T input = Q2 (T3 = Q2)
      {fromId:3, fromPin:0, toId:4, toPin:0},
      // Clock to all FFs
      {fromId:1, fromPin:0, toId:2, toPin:1},
      {fromId:1, fromPin:0, toId:3, toPin:1},
      {fromId:1, fromPin:0, toId:4, toPin:1},
      // Outputs
      {fromId:2, fromPin:0, toId:7, toPin:0},
      {fromId:3, fromPin:0, toId:8, toPin:0},
      {fromId:4, fromPin:0, toId:9, toPin:0},
      // LEDs: Q3(MSB), Q2, Q1(LSB)
      {fromId:4, fromPin:0, toId:10,toPin:0},
      {fromId:3, fromPin:0, toId:11,toPin:0},
      {fromId:2, fromPin:0, toId:12,toPin:0},
    ]
  },

  

  shift4: {
    name:'4-bit Shift Register (D-FF)',
    gates:[
      // Inputs
      {id:1,type:'INPUT',  x:40,  y:60,  value:0, label:'D-in'},
      {id:2,type:'CLOCK',  x:40,  y:170, value:0, label:'CLK', clockVal:0},
      // 4 D flip-flops in series
      {id:3,type:'D_FF',   x:180, y:100, q:0, nq:1, prevClk:0},
      {id:4,type:'D_FF',   x:340, y:100, q:0, nq:1, prevClk:0},
      {id:5,type:'D_FF',   x:500, y:100, q:0, nq:1, prevClk:0},
      {id:6,type:'D_FF',   x:660, y:100, q:0, nq:1, prevClk:0},
      // Outputs Q0..Q3
      {id:7,type:'OUTPUT', x:830, y:60,  label:'Q3'},
      {id:8,type:'OUTPUT', x:830, y:130, label:'Q2'},
      {id:9,type:'OUTPUT', x:830, y:200, label:'Q1'},
      {id:10,type:'OUTPUT',x:830, y:270, label:'Q0'},
    ],
    connections:[
      // Data chain: D-in → FF0 → FF1 → FF2 → FF3
      {fromId:1, fromPin:0,toId:3, toPin:0},
      {fromId:3, fromPin:0,toId:4, toPin:0},
      {fromId:4, fromPin:0,toId:5, toPin:0},
      {fromId:5, fromPin:0,toId:6, toPin:0},
      // Clock to all FFs
      {fromId:2, fromPin:0,toId:3, toPin:1},
      {fromId:2, fromPin:0,toId:4, toPin:1},
      {fromId:2, fromPin:0,toId:5, toPin:1},
      {fromId:2, fromPin:0,toId:6, toPin:1},
      // Outputs
      {fromId:6, fromPin:0,toId:7, toPin:0},
      {fromId:5, fromPin:0,toId:8, toPin:0},
      {fromId:4, fromPin:0,toId:9, toPin:0},
      {fromId:3, fromPin:0,toId:10,toPin:0},
    ]
  }
};
