/* app.js — Main controller: auth guard, circuit save/load, undo/redo, clock, events */

// ===== AUTH GUARD =====
const currentUser = sessionStorage.getItem('lf_user');
if (!currentUser) { window.location.href = 'login.html'; }
document.getElementById('user-name').textContent = currentUser;
document.getElementById('btn-logout').addEventListener('click', () => {
  sessionStorage.removeItem('lf_user');
  window.location.href = 'login.html';
});

// ===== STATE =====
let gates       = [];
let connections = [];
let selected    = null;
let multiSelected = new Set(); // IDs of multi-selected gates
let nextId      = 1;
window._conns   = connections; // used by canvas.js for pin value lookup

let dragging    = null;
let dragOffset  = { x:0, y:0 };
let pendingWire = null;
let isPanning   = false;
let panStart    = { x:0, y:0 };

// Rubber-band selection box
let selBox        = null;    // { x1,y1,x2,y2 } in world coords while drawing
let selBoxStart   = null;    // world pos where rubber-band drag started
let isDraggingMulti   = false;
let multiDragOffsets  = [];  // [{id,dx,dy}] offsets from pointer for each gate

const view = { zoom:1, panX:0, panY:0 };

const undoStack = [], redoStack = [];
let clockOn     = false;
let clockTimer  = null;
const CLOCK_MS  = 500;

let sigVals = {};

// ===== DOM =====
const mainCanvas = document.getElementById('main-canvas');
const ctx        = mainCanvas.getContext('2d');
const miniCanvas = document.getElementById('mini-canvas');
const mCtx       = miniCanvas.getContext('2d');
const statusEl   = document.getElementById('status-msg');
const clockBadge = document.getElementById('clock-badge');
const zLabel     = document.getElementById('z-label');
const propArea   = document.getElementById('prop-area')   || { innerHTML:'' };
const ttWrap     = document.getElementById('tt-wrap')     || { innerHTML:'' };
const ttType     = document.getElementById('tt-type')     || { textContent:'' };

// ===== RESIZE =====
function resize() {
  const wrap = document.getElementById('canvas-area');
  mainCanvas.width  = wrap.clientWidth;
  mainCanvas.height = wrap.clientHeight;
  miniCanvas.width  = 140; miniCanvas.height = 88;
  render();
}
window.addEventListener('resize', resize);

// ===== COORD TRANSFORM =====
function s2w(sx, sy) { return { x:(sx-view.panX)/view.zoom, y:(sy-view.panY)/view.zoom }; }
function w2s(wx, wy) { return { x:wx*view.zoom+view.panX, y:wy*view.zoom+view.panY }; }
function getPos(e) {
  const r=mainCanvas.getBoundingClientRect();
  const cl=e.touches?e.touches[0]:e;
  return s2w(cl.clientX-r.left, cl.clientY-r.top);
}

// ===== SIMULATE =====
function simulate() {
  window._conns = connections;
  sigVals = simulateCircuit(gates, connections);
  if (typeof WF !== 'undefined') WF.push(sigVals, gates);
  if (typeof CodePanel !== 'undefined') CodePanel.push();
}

// ===== RENDER =====
function render() {
  const W=mainCanvas.width, H=mainCanvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.translate(view.panX, view.panY);
  ctx.scale(view.zoom, view.zoom);

  // wires
  connections.forEach(c=>{
    const fg=gates.find(g=>g.id===c.fromId), tg=gates.find(g=>g.id===c.toId);
    if(!fg||!tg) return;
    const fp=getOutputPins(fg)[c.fromPin??0], tp=getInputPins(tg)[c.toPin??0];
    if(!fp||!tp) return;
    const fv=sigVals[fg.id]?.[c.fromPin??0]??0;
    drawWire(ctx, fp.x,fp.y, tp.x,tp.y, fv);
  });

  // pending wire
  if(pendingWire && pendingWire._mouse) {
    const fg=gates.find(g=>g.id===pendingWire.gateId);
    if(fg) {
      const fp=getOutputPins(fg)[pendingWire.pinIdx??0];
      if(fp) drawPendingWire(ctx, fp.x,fp.y, pendingWire._mouse.x, pendingWire._mouse.y);
    }
  }

  // gates
  gates.forEach(g => drawGate(ctx, g, sigVals, selected, multiSelected));

  // rubber-band selection box
  if (selBox) {
    const bx = Math.min(selBox.x1, selBox.x2);
    const by = Math.min(selBox.y1, selBox.y2);
    const bw = Math.abs(selBox.x2 - selBox.x1);
    const bh = Math.abs(selBox.y2 - selBox.y1);
    ctx.save();
    ctx.fillStyle   = 'rgba(0,212,170,0.07)';
    ctx.strokeStyle = 'rgba(0,212,170,0.75)';
    ctx.lineWidth   = 1.2 / view.zoom;
    ctx.setLineDash([5 / view.zoom, 3 / view.zoom]);
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.restore();
  drawMinimap(mCtx, gates, connections, sigVals, view, W, H, 140, 88);
}

// ===== UNDO/REDO =====
function snapshot() {
  undoStack.push(JSON.stringify({ gates, connections, nextId }));
  if(undoStack.length>80) undoStack.shift();
  redoStack.length=0;
}
function undo() {
  if(!undoStack.length) return;
  redoStack.push(JSON.stringify({ gates, connections, nextId }));
  apply(JSON.parse(undoStack.pop()));
}
function redo() {
  if(!redoStack.length) return;
  undoStack.push(JSON.stringify({ gates, connections, nextId }));
  apply(JSON.parse(redoStack.pop()));
}
function apply(s) {
  gates=s.gates; connections=s.connections; nextId=s.nextId;
  window._conns=connections; selected=null;
  simulate(); render(); updateProps(); renderCircuitTruthTable();
}

// ===== STATUS =====
function setStatus(msg) { statusEl.textContent = msg; }

// ===== PROPERTIES PANEL =====
function updateProps() {
  if(!selected) {
    propArea.innerHTML = '<div class="prop-empty">Select a gate<br>to inspect properties</div>';
    ttType.textContent = ''; ttWrap.innerHTML = ''; return;
  }
  const g=gates.find(g=>g.id===selected);
  if(!g) return;
  const def=GATE_DEFS[g.type];
  const outVals=sigVals[g.id]??[0];
  const out0=outVals[0]??0;

  let html=`<div class="prop-sec"><div class="prop-sec-title">Gate</div>
    <div class="prop-row"><span class="prop-lbl">Type</span><span class="prop-val">${g.type}</span></div>
    <div class="prop-row"><span class="prop-lbl">ID</span><span class="prop-val">#${g.id}</span></div>
    <div class="prop-row"><span class="prop-lbl">Inputs</span><span class="prop-val">${def.inputs}</span></div>
    <div class="prop-row"><span class="prop-lbl">Position</span><span class="prop-val">(${Math.round(g.x)}, ${Math.round(g.y)})</span></div>
  </div>`;

  if(g.type==='INPUT') {
    html+=`<div class="prop-sec"><div class="prop-sec-title">Control</div>
      <div class="prop-row"><span class="prop-lbl">Value</span><span class="prop-val ${g.value?'hi':'lo'}">${g.value}</span></div>
      <button class="toggle-btn ${g.value?'hi-btn':'lo-btn'}" id="prop-tog">
        ${g.value?'● HIGH (1) → click LOW':'○ LOW (0) → click HIGH'}
      </button>
      <div style="margin-top:8px"><div class="prop-sec-title">Label</div>
        <input class="prop-input" id="prop-lbl-inp" value="${g.label||''}" placeholder="A, B, Cin…"/>
      </div>
    </div>`;
  }
  if(g.type==='OUTPUT'||g.type==='LED') {
    const iv=sigVals['in_'+g.id]??0;
    html+=`<div class="prop-sec"><div class="prop-sec-title">Signal</div>
      <div class="prop-row"><span class="prop-lbl">Input</span><span class="sig-badge ${iv?'hi':'lo'}">${iv?'HIGH':'LOW'}</span></div>
      <div style="margin-top:8px"><div class="prop-sec-title">Label</div>
        <input class="prop-input" id="prop-lbl-inp" value="${g.label||''}" placeholder="Sum, Cout…"/>
      </div>
    </div>`;
  }
  if(!['INPUT','OUTPUT','LED','CLOCK'].includes(g.type)) {
    html+=`<div class="prop-sec"><div class="prop-sec-title">Output</div>
      <div class="prop-row"><span class="prop-lbl">Q / Out</span><span class="sig-badge ${out0?'hi':'lo'}">${out0?'HIGH':'LOW'}</span></div>`;
    if(def.outputs===2){const v1=outVals[1]??1; html+=`<div class="prop-row"><span class="prop-lbl">Q̄</span><span class="sig-badge ${v1?'hi':'lo'}">${v1?'HIGH':'LOW'}</span></div>`; }
    html+=`</div>`;
  }
  if(['SR_FF','D_FF','JK_FF','T_FF'].includes(g.type)) {
    html+=`<div class="prop-sec"><div class="prop-sec-title">FF State</div>
      <div class="prop-row"><span class="prop-lbl">Q</span><span class="prop-val ${(g.q??0)?'hi':'lo'}">${g.q??0}</span></div>
      <div class="prop-row"><span class="prop-lbl">Q̄</span><span class="prop-val ${(g.nq??1)?'hi':'lo'}">${g.nq??1}</span></div>
    </div>`;
  }

  propArea.innerHTML = html;

  const tog=document.getElementById('prop-tog');
  if(tog) tog.addEventListener('click',()=>{ snapshot(); g.value=g.value?0:1; simulate();render();updateProps();setStatus(`Input #${g.id} → ${g.value}`); });
  const li=document.getElementById('prop-lbl-inp');
  if(li) li.addEventListener('input',e=>{g.label=e.target.value;render();});

  // Gate truth table
  const rows=buildTruthTable(g.type);
  if(rows){ ttType.textContent='('+g.type+')'; ttWrap.innerHTML=renderTruthTable(g.type); }
  else { ttType.textContent=''; ttWrap.innerHTML=''; }

  // Circuit truth table
  renderCircuitTruthTable();

  // Refresh inspector panel and gate truth table if open
  if(typeof CodePanel!=='undefined' && CodePanel.refreshInspector) CodePanel.refreshInspector();
  if(typeof CodePanel!=='undefined' && CodePanel.refreshGateTT)    CodePanel.refreshGateTT();
}

// ===== MOUSE EVENTS =====
function screenPinHit(e, type) {
  const pos = getPos(e);
  const hitR = PIN_HIT / view.zoom;
  for(const g of [...gates].reverse()) {
    const pins = type==='out' ? getOutputPins(g) : getInputPins(g);
    for(const p of pins) {
      if(Math.hypot(pos.x - p.x, pos.y - p.y) < hitR) return {g, p};
    }
  }
  return null;
}

mainCanvas.addEventListener('mousedown', e=>{
  if(e.button===1||(e.button===0&&e.altKey)){
    isPanning=true; mainCanvas.style.cursor='grabbing';
    panStart={x:e.clientX-view.panX, y:e.clientY-view.panY}; return;
  }
  const pos=getPos(e);

  // ── Active wire: complete or redirect ──
  if(pendingWire){
    const inHit=screenPinHit(e,'in');
    if(inHit){
      if(inHit.g.id!==pendingWire.gateId){
        snapshot();
        connections=connections.filter(c=>!(c.toId===inHit.g.id&&c.toPin===inHit.p.idx));
        connections.push({fromId:pendingWire.gateId,fromPin:pendingWire.pinIdx,toId:inHit.g.id,toPin:inHit.p.idx});
        window._conns=connections;
        setStatus('Connected!');
      }
      pendingWire=null; mainCanvas.style.cursor='';
      simulate();render();updateProps();renderCircuitTruthTable(); return;
    }
    const outHit2=screenPinHit(e,'out');
    if(outHit2){
      pendingWire={gateId:outHit2.g.id, pinIdx:outHit2.p.idx, _mouse:pos};
      mainCanvas.style.cursor='crosshair'; return;
    }
    pendingWire=null; mainCanvas.style.cursor=''; render(); return;
  }

  // ── Check output pin — starts a wire ──
  const outHit=screenPinHit(e,'out');
  if(outHit){
    pendingWire={gateId:outHit.g.id, pinIdx:outHit.p.idx, _mouse:pos};
    mainCanvas.style.cursor='crosshair';
    setStatus('Click an input pin to connect — Esc to cancel'); return;
  }

  // ── Click input pin with no pending wire → remove connected wire ──
  const inHit=screenPinHit(e,'in');
  if(inHit){
    const existing=connections.find(c=>c.toId===inHit.g.id&&c.toPin===inHit.p.idx);
    if(existing){
      snapshot();
      connections=connections.filter(c=>!(c.toId===inHit.g.id&&c.toPin===inHit.p.idx));
      window._conns=connections;
      setStatus('Wire removed');
      simulate();render();updateProps();renderCircuitTruthTable(); return;
    }
  }

  // ── Gate body — select + prepare drag ──
  const g=[...gates].reverse().find(g=>hitGate(pos.x,pos.y,g));
  if(g){
    const nearPin = screenPinHit(e,'in') || screenPinHit(e,'out');

    if(e.shiftKey){
      // Shift+click: toggle in/out of multi-selection
      if(multiSelected.has(g.id)) multiSelected.delete(g.id);
      else multiSelected.add(g.id);
      selected = g.id;
      simulate();render();updateProps();renderCircuitTruthTable(); return;
    }

    // If clicking a gate already in multi-selection → drag all of them
    if(multiSelected.size > 1 && multiSelected.has(g.id)){
      isDraggingMulti = true;
      multiDragOffsets = [...multiSelected].map(id=>{
        const gg = gates.find(x=>x.id===id);
        return { id, dx: pos.x - gg.x, dy: pos.y - gg.y };
      });
      _dragStartPos = {x:pos.x,y:pos.y}; _didDrag=false;
      simulate();render();updateProps();renderCircuitTruthTable(); return;
    }

    // Normal single-click → clear multi, select this gate
    multiSelected.clear();
    selected=g.id;
    dragging=g; dragOffset={x:pos.x-g.x,y:pos.y-g.y};
    _dragStartPos={x:pos.x,y:pos.y};
    _didDrag=false;
    if(g.type==='INPUT' && !nearPin){
      snapshot(); g.value=g.value?0:1;
      setStatus(`Input #${g.id} → ${g.value}`);
    }
    simulate();render();updateProps();renderCircuitTruthTable();
  } else {
    // Click on empty space — start rubber-band OR pan
    if(!e.shiftKey){
      multiSelected.clear();
      selected=null;
    }
    // Start rubber-band selection box
    selBox      = { x1:pos.x, y1:pos.y, x2:pos.x, y2:pos.y };
    selBoxStart = { x:pos.x, y:pos.y };
    isPanning   = false; // will be set to panning if box stays tiny
    simulate();render();updateProps();
  }
});

let _didDrag = false; // track if gate actually moved during drag
let _dragStartPos = null; // world pos where drag started
const DRAG_THRESHOLD = 4; // world units before drag activates

mainCanvas.addEventListener('mousemove', e=>{
  if(isPanning){
    view.panX=e.clientX-panStart.x; view.panY=e.clientY-panStart.y; render(); return;
  }
  const pos=getPos(e);

  // ── Multi-gate drag ──
  if(isDraggingMulti){
    if(!_didDrag && _dragStartPos){
      const dist=Math.hypot(pos.x-_dragStartPos.x, pos.y-_dragStartPos.y);
      if(dist < DRAG_THRESHOLD/view.zoom) return;
    }
    _didDrag=true;
    multiDragOffsets.forEach(({id,dx,dy})=>{
      const gg=gates.find(x=>x.id===id);
      if(gg){ gg.x=snapV(pos.x-dx); gg.y=snapV(pos.y-dy); }
    });
    simulate();render(); return;
  }

  // ── Rubber-band selection ──
  if(selBox){
    selBox.x2=pos.x; selBox.y2=pos.y;
    const moved=Math.hypot(pos.x-selBoxStart.x, pos.y-selBoxStart.y);
    if(moved < 3/view.zoom){ render(); return; } // tiny move, just redraw
    mainCanvas.style.cursor='crosshair';
    // Highlight gates inside box live
    const bx=Math.min(selBox.x1,selBox.x2), by=Math.min(selBox.y1,selBox.y2);
    const bw=Math.abs(selBox.x2-selBox.x1), bh=Math.abs(selBox.y2-selBox.y1);
    gates.forEach(g=>{
      const def=GATE_DEFS[g.type];
      const inside=(g.x+def.w>bx&&g.x<bx+bw&&g.y+def.h>by&&g.y<by+bh);
      if(inside) multiSelected.add(g.id);
      else if(!e.shiftKey) multiSelected.delete(g.id);
    });
    render(); return;
  }

  // ── Single gate drag ──
  if(dragging){
    if(!_didDrag && _dragStartPos){
      const dist = Math.hypot(pos.x - _dragStartPos.x, pos.y - _dragStartPos.y);
      if(dist < DRAG_THRESHOLD / view.zoom) return;
    }
    const nx=snapV(pos.x-dragOffset.x), ny=snapV(pos.y-dragOffset.y);
    _didDrag=true;
    dragging.x=nx; dragging.y=ny;
    simulate();render();
  }
  else if(pendingWire){ pendingWire._mouse=pos; render(); }
  else {
    const hovered=[...gates].reverse().find(g=>hitGate(pos.x,pos.y,g));
    const pinHit=screenPinHit(e,'out')||screenPinHit(e,'in');
    if(!hovered&&!pinHit) mainCanvas.style.cursor='grab';
    else mainCanvas.style.cursor=pinHit?'crosshair':'default';
  }
});

mainCanvas.addEventListener('mouseup', ()=>{
  if(isDraggingMulti && _didDrag){ snapshot(); }
  isDraggingMulti=false; multiDragOffsets=[];
  if(dragging && _didDrag){ snapshot(); }
  dragging=null; isPanning=false; _didDrag=false; _dragStartPos=null;
  if(selBox){
    // Finalise rubber-band: anything inside box is selected
    const bx=Math.min(selBox.x1,selBox.x2), by=Math.min(selBox.y1,selBox.y2);
    const bw=Math.abs(selBox.x2-selBox.x1), bh=Math.abs(selBox.y2-selBox.y1);
    if(bw>4 && bh>4){
      gates.forEach(g=>{
        const def=GATE_DEFS[g.type];
        if(g.x+def.w>bx&&g.x<bx+bw&&g.y+def.h>by&&g.y<by+bh) multiSelected.add(g.id);
      });
      if(multiSelected.size===1) selected=[...multiSelected][0];
      updateMultiSelectStatus();
    } else {
      // Tiny drag = treated as pan that didn't move → already cleared
    }
    selBox=null; selBoxStart=null;
  }
  if(!pendingWire) mainCanvas.style.cursor='';
  render();
});

function updateMultiSelectStatus(){
  if(multiSelected.size>1) setStatus(`${multiSelected.size} components selected — Delete to remove, drag to move`);
}

window.addEventListener('keydown', e=>{
  if(e.key==='Escape'){
    pendingWire=null; selBox=null; selBoxStart=null;
    if(!multiSelected.size){ multiSelected.clear(); selected=null; }
    mainCanvas.style.cursor=''; render();
  }
  if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){ e.preventDefault();undo(); }
  if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.shiftKey&&e.key==='z'))){ e.preventDefault();redo(); }
  if((e.ctrlKey||e.metaKey)&&e.key==='a'){
    e.preventDefault();
    multiSelected=new Set(gates.map(g=>g.id));
    selected=null;
    updateMultiSelectStatus(); render(); return;
  }
  if((e.key==='Delete'||e.key==='Backspace')&&document.activeElement===document.body){
    if(multiSelected.size>0) deleteMultiSelected();
    else if(selected) deleteSelected();
  }
});


// ===== DRAG FROM PANEL =====
document.querySelectorAll('.chip').forEach(chip=>{
  chip.addEventListener('dragstart', e=>e.dataTransfer.setData('gate-type', chip.dataset.type));
});
document.getElementById('canvas-area').addEventListener('dragover', e=>e.preventDefault());
document.getElementById('canvas-area').addEventListener('drop', e=>{
  e.preventDefault();
  const type=e.dataTransfer.getData('gate-type');
  if(!type||!GATE_DEFS[type]) return;
  const r=mainCanvas.getBoundingClientRect();
  const pos=s2w(e.clientX-r.left, e.clientY-r.top);
  const def=GATE_DEFS[type];
  snapshot();
  gates.push({id:nextId++,type,x:snapV(pos.x-def.w/2),y:snapV(pos.y-def.h/2),value:0,clockVal:0,q:0,nq:1,prevClk:0,label:''});
  simulate();render(); setStatus(type+' added');
});

// ===== TOOLBAR =====
function deleteSelected(){
  if(!selected) return; snapshot();
  connections=connections.filter(c=>c.fromId!==selected&&c.toId!==selected);
  gates=gates.filter(g=>g.id!==selected); window._conns=connections;
  selected=null; simulate();render();updateProps(); setStatus('Deleted');
}
function deleteMultiSelected(){
  if(!multiSelected.size) return; snapshot();
  const ids=multiSelected;
  connections=connections.filter(c=>!ids.has(c.fromId)&&!ids.has(c.toId));
  gates=gates.filter(g=>!ids.has(g.id)); window._conns=connections;
  const count=ids.size; multiSelected=new Set(); selected=null;
  simulate();render();updateProps(); setStatus(count+' component'+(count>1?'s':'')+' deleted');
}
document.getElementById('btn-delete').addEventListener('click', ()=>{
  if(multiSelected.size>0) deleteMultiSelected(); else deleteSelected();
});
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);
document.getElementById('btn-new').addEventListener('click', ()=>{
  if(gates.length&&!confirm('Start new circuit? Unsaved changes will be lost.')) return;
  snapshot(); gates=[];connections=[];selected=null;multiSelected=new Set();nextId=1;window._conns=[];
  simulate();render();updateProps(); setStatus('New circuit');
});

// Export JSON
document.getElementById('btn-export').addEventListener('click', ()=>{
  const blob=new Blob([JSON.stringify({gates,connections,nextId},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='circuit.json'; a.click();
  setStatus('Exported circuit.json');
});
// Import JSON
document.getElementById('btn-import').addEventListener('click', ()=>document.getElementById('file-input').click());
document.getElementById('file-input').addEventListener('change', e=>{
  const f=e.target.files[0]; if(!f) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const d=JSON.parse(ev.target.result);
      snapshot(); gates=d.gates||[]; connections=d.connections||[]; nextId=d.nextId||99;
      window._conns=connections; selected=null; simulate();render();fitView();updateProps();
      setStatus('Imported: '+f.name);
    }catch{alert('Invalid circuit file');}
  };
  reader.readAsText(f); e.target.value='';
});

// Zoom controls
document.getElementById('z-in').addEventListener('click',  ()=>setZoom(view.zoom*1.2));
document.getElementById('z-out').addEventListener('click', ()=>setZoom(view.zoom*0.82));
document.getElementById('z-fit').addEventListener('click', fitView);
function setZoom(z){
  view.zoom=Math.max(0.2,Math.min(3.5,z));
  zLabel.textContent=Math.round(view.zoom*100)+'%'; render();
}
function fitView(){
  if(!gates.length) return;
  const W=mainCanvas.width,H=mainCanvas.height;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  gates.forEach(g=>{const def=GATE_DEFS[g.type];minX=Math.min(minX,g.x);minY=Math.min(minY,g.y);maxX=Math.max(maxX,g.x+def.w);maxY=Math.max(maxY,g.y+def.h);});
  const pad=70,bw=maxX-minX+pad*2,bh=maxY-minY+pad*2;
  const z=Math.max(0.3,Math.min(2.2,Math.min(W/bw,H/bh)));
  view.zoom=z; view.panX=(W-(maxX+minX)*z)/2; view.panY=(H-(maxY+minY)*z)/2;
  zLabel.textContent=Math.round(z*100)+'%'; render();
}

// Clock
document.getElementById('btn-clock').addEventListener('click', ()=>{
  clockOn=!clockOn;
  if(clockOn){
    clockBadge.className='clk-on';
    document.getElementById('btn-clock').textContent='⏸ Clock';
    clockTimer=setInterval(()=>{
      gates.forEach(g=>{if(g.type==='CLOCK') g.clockVal=g.clockVal?0:1;});
      simulate();render();updateProps();
    }, CLOCK_MS);
    setStatus('Clock running');
  } else {
    clearInterval(clockTimer); clockBadge.className='clk-off';
    document.getElementById('btn-clock').textContent='▶ Clock';
    setStatus('Clock stopped');
  }
});

// Templates (built-in)
document.querySelectorAll('.tmpl-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const t=TEMPLATES[btn.dataset.tmpl]; if(!t) return;
    if(gates.length&&!confirm(`Load "${t.name}"? Current circuit will be replaced.`)) return;
    snapshot();
    gates=t.gates.map(g=>({...g,clockVal:0,q:0,nq:1,prevClk:0}));
    connections=t.connections.map(c=>({...c}));
    nextId=gates.reduce((m,g)=>Math.max(m,g.id),0)+1;
    window._conns=connections; selected=null;
    simulate();render(); setTimeout(fitView,60); setStatus('Template: '+t.name);
  });
});

// ===== CIRCUIT TRUTH TABLE =====
function renderCircuitTruthTable() {
  // ctt-wrap removed from index.html — truth table now lives in CodePanel
  // Just push to CodePanel so the Truth tab refreshes
  if (typeof CodePanel !== 'undefined') CodePanel.push();
}
// ===== USER TEMPLATES =====
function getUserTemplateStore() {
  return JSON.parse(localStorage.getItem('lf_user_templates_'+currentUser)||'[]');
}
function setUserTemplateStore(list) {
  localStorage.setItem('lf_user_templates_'+currentUser, JSON.stringify(list));
}
function renderUserTemplates() {
  const list  = getUserTemplateStore();
  const wrap  = document.getElementById('user-tmpl-list');
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = '<div class="utmpl-empty">No saved templates yet.<br>Build a circuit and click<br>"+ Save".</div>'; return;
  }
  wrap.innerHTML = list.map((t,i)=>`
    <div class="utmpl-item">
      <span class="utmpl-name" title="${escHtml(t.name)}">${escHtml(t.name)}</span>
      <div class="utmpl-btns">
        <button class="utmpl-btn load" data-i="${i}">▶</button>
        <button class="utmpl-btn del"  data-i="${i}">✕</button>
      </div>
    </div>`).join('');
  wrap.querySelectorAll('.utmpl-btn.load').forEach(btn=>btn.addEventListener('click',()=>{
    const t=getUserTemplateStore()[+btn.dataset.i]; if(!t) return;
    if(gates.length&&!confirm(`Load "${t.name}"?`)) return;
    snapshot();
    gates=t.gates.map(g=>({...g,clockVal:0,q:0,nq:1,prevClk:0}));
    connections=t.connections.map(c=>({...c}));
    nextId=gates.reduce((m,g)=>Math.max(m,g.id),0)+1;
    window._conns=connections; selected=null;
    simulate();render();setTimeout(fitView,60);updateProps();renderCircuitTruthTable();
    setStatus('Loaded template: '+t.name);
  }));
  wrap.querySelectorAll('.utmpl-btn.del').forEach(btn=>btn.addEventListener('click',()=>{
    const list2=getUserTemplateStore();
    const t=list2[+btn.dataset.i];
    if(!confirm(`Delete "${t.name}"?`)) return;
    list2.splice(+btn.dataset.i,1); setUserTemplateStore(list2); renderUserTemplates();
    setStatus(`Deleted: "${t.name}"`);
  }));
}
const saveTmplBtn = document.getElementById('btn-save-tmpl');
if (saveTmplBtn) saveTmplBtn.addEventListener('click',()=>{
  if(!gates.length){ alert('Nothing to save.'); return; }
  const name=prompt('Template name:','My Circuit');
  if(!name||!name.trim()) return;
  const list=getUserTemplateStore();
  const existing=list.findIndex(t=>t.name===name.trim());
  const entry={ name:name.trim(), gates:JSON.parse(JSON.stringify(gates)), connections:JSON.parse(JSON.stringify(connections)), savedAt:new Date().toLocaleString() };
  if(existing>=0){ if(!confirm(`"${name.trim()}" exists. Overwrite?`)) return; list[existing]=entry; }
  else { list.unshift(entry); }
  setUserTemplateStore(list); renderUserTemplates();
  setStatus(`Template "${name.trim()}" saved`);
});

// ===== CIRCUIT SAVE SYSTEM (localStorage) =====
function getCircuitStore() {
  const key = 'lf_circuits_' + currentUser;
  return JSON.parse(localStorage.getItem(key)||'[]');
}
function setCircuitStore(list) {
  localStorage.setItem('lf_circuits_' + currentUser, JSON.stringify(list));
}

// Open save modal
document.getElementById('btn-save-named').addEventListener('click', ()=>{
  document.getElementById('modal-save').classList.add('open');
  document.getElementById('save-name').focus();
});
document.getElementById('save-cancel').addEventListener('click', ()=>{
  document.getElementById('modal-save').classList.remove('open');
});
document.getElementById('save-ok').addEventListener('click', ()=>{
  const name=(document.getElementById('save-name').value||'').trim();
  const desc=(document.getElementById('save-desc').value||'').trim();
  if(!name){ document.getElementById('save-name').focus(); return; }
  const store=getCircuitStore();
  const existing=store.findIndex(c=>c.name===name);
  const entry={
    name, desc,
    savedAt: new Date().toLocaleString(),
    gateCount: gates.length,
    wireCount: connections.length,
    data: JSON.stringify({gates,connections,nextId})
  };
  if(existing>=0){
    if(!confirm(`"${name}" already exists. Overwrite?`)) return;
    store[existing]=entry;
  } else {
    store.unshift(entry);
  }
  setCircuitStore(store);
  document.getElementById('modal-save').classList.remove('open');
  document.getElementById('save-name').value='';
  document.getElementById('save-desc').value='';
  setStatus(`Circuit saved: "${name}"`);
});

// Enter key in save modal
document.getElementById('save-name').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('save-ok').click(); });

// Open circuits modal
document.getElementById('btn-open-saved').addEventListener('click', ()=>{
  renderCircuitsList();
  document.getElementById('modal-circuits').classList.add('open');
});
document.getElementById('circuits-close').addEventListener('click', ()=>{
  document.getElementById('modal-circuits').classList.remove('open');
});

function renderCircuitsList() {
  const store=getCircuitStore();
  const list=document.getElementById('circuits-list');
  if(!store.length){
    list.innerHTML='<div class="circuit-empty">No saved circuits yet.<br>Build something and click "Save Circuit"!</div>'; return;
  }
  list.innerHTML=store.map((c,i)=>`
    <div class="circuit-item">
      <div class="ci-info">
        <div class="ci-name">${escHtml(c.name)}</div>
        <div class="ci-desc">${escHtml(c.desc||'No description')}</div>
        <div class="ci-meta">${c.gateCount} gates · ${c.wireCount} wires · ${c.savedAt}</div>
      </div>
      <div class="ci-actions">
        <button class="ci-btn load" data-i="${i}">Load</button>
        <button class="ci-btn del"  data-i="${i}">✕</button>
      </div>
    </div>
  `).join('');
  list.querySelectorAll('.ci-btn.load').forEach(btn=>btn.addEventListener('click',()=>{
    const c=store[+btn.dataset.i];
    if(gates.length&&!confirm(`Load "${c.name}"? Unsaved changes will be lost.`)) return;
    const d=JSON.parse(c.data);
    snapshot(); gates=d.gates; connections=d.connections; nextId=d.nextId;
    window._conns=connections; selected=null;
    simulate();render();setTimeout(fitView,60);updateProps();
    document.getElementById('modal-circuits').classList.remove('open');
    setStatus(`Loaded: "${c.name}"`);
  }));
  list.querySelectorAll('.ci-btn.del').forEach(btn=>btn.addEventListener('click',()=>{
    const c=store[+btn.dataset.i];
    if(!confirm(`Delete "${c.name}"?`)) return;
    store.splice(+btn.dataset.i,1); setCircuitStore(store); renderCircuitsList();
    setStatus(`Deleted: "${c.name}"`);
  }));
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(ov=>{
  ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('open');});
});

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== INIT =====
resize();
(function init(){
  gates=[]; connections=[]; nextId=1;
  window._conns=connections;

  // ── K-Map export: load pending circuit if redirected from kmap.html ──
  const pending = localStorage.getItem('lf_kmap_export');
  if (pending) {
    localStorage.removeItem('lf_kmap_export');
    try {
      const d = JSON.parse(pending);
      gates = d.gates || []; connections = d.connections || []; nextId = d.nextId || 1;
      window._conns = connections;
      simulate(); render();
      renderUserTemplates();
      renderCircuitTruthTable();
      if (typeof CodePanel !== 'undefined') CodePanel.push();
      setStatus('K-Map circuit loaded! ' + gates.length + ' gates \u00b7 ' + connections.length + ' wires');
      return;
    } catch(e) { /* fall through */ }
  }

  // © 2026 Siddharth Kumar — Gateonix
// Unauthorized use or reproduction is prohibited.
// github.com/SiD4422/gateonix

  simulate(); render();
  renderUserTemplates();
  renderCircuitTruthTable();
  if (typeof CodePanel !== 'undefined') CodePanel.push();
  setStatus('Welcome, ' + currentUser + '! Drag gates from the panel to start');
})();
