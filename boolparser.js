/**
 * boolparser.js — Boolean Expression Parser → Gate Circuit
 * =========================================================
 * Parses a Boolean expression string and builds a Gateonix
 * gate/connection graph that can be loaded directly into the canvas.
 *
 * Supported syntax:
 *   Variables : any letter(s), case-sensitive  e.g.  A  B  Cin
 *   NOT       : A'  ~A  !A  NOT A
 *   AND       : AB  A·B  A*B  A AND B  A&B  A&&B
 *   OR        : A+B  A|B  A||B  A OR B
 *   XOR       : A^B  A XOR B  A⊕B
 *   NAND      : A NAND B
 *   NOR       : A NOR B
 *   XNOR      : A XNOR B  A XNOR B
 *   Grouping  : (A+B)·C
 *   Constants : 0  1
 *
 * Operator precedence (high → low):
 *   NOT  >  AND  >  XOR  >  OR  >  NAND/NOR/XNOR (binary)
 *
 * Exported API (attached to window.BoolParser):
 *   BoolParser.parse(expr)         → AST node
 *   BoolParser.buildCircuit(expr)  → { gates, connections, nextId, error }
 *   BoolParser.open()              → open the modal UI
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════
  // TOKENISER
  // ═══════════════════════════════════════════════════════
  const TT = {
    VAR:'VAR', NOT:'NOT', AND:'AND', OR:'OR', XOR:'XOR',
    NAND:'NAND', NOR:'NOR', XNOR:'XNOR',
    LPAREN:'(', RPAREN:')', CONST:'CONST', EOF:'EOF'
  };

  function tokenise(src) {
    const tokens = [];
    let i = 0;
    const s = src.trim();

    while (i < s.length) {
      // skip whitespace
      if (/\s/.test(s[i])) { i++; continue; }

      // XOR symbol ⊕
      if (s[i] === '⊕') { tokens.push({type:TT.XOR}); i++; continue; }

      // parens
      if (s[i] === '(') { tokens.push({type:TT.LPAREN}); i++; continue; }
      if (s[i] === ')') { tokens.push({type:TT.RPAREN}); i++; continue; }

      // NOT operators
      if (s[i] === '~' || s[i] === '!') { tokens.push({type:TT.NOT}); i++; continue; }

      // AND operators
      if (s[i] === '·' || s[i] === '*') { tokens.push({type:TT.AND}); i++; continue; }
      if (s[i] === '&') {
        if (s[i+1] === '&') i++;
        tokens.push({type:TT.AND}); i++; continue;
      }

      // OR operators
      if (s[i] === '+') { tokens.push({type:TT.OR}); i++; continue; }
      if (s[i] === '|') {
        if (s[i+1] === '|') i++;
        tokens.push({type:TT.OR}); i++; continue;
      }

      // XOR
      if (s[i] === '^') { tokens.push({type:TT.XOR}); i++; continue; }

      // apostrophe = postfix NOT
      if (s[i] === "'") { tokens.push({type:'APOSTROPHE'}); i++; continue; }

      // constants
      if (s[i] === '0') { tokens.push({type:TT.CONST, val:0}); i++; continue; }
      if (s[i] === '1') { tokens.push({type:TT.CONST, val:1}); i++; continue; }

      // keywords and variables
      if (/[A-Za-z_]/.test(s[i])) {
        let j = i;
        while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
        const word = s.slice(i, j);
        const upper = word.toUpperCase();
        if (upper === 'NOT')  { tokens.push({type:TT.NOT});  i=j; continue; }
        if (upper === 'AND')  { tokens.push({type:TT.AND});  i=j; continue; }
        if (upper === 'OR')   { tokens.push({type:TT.OR});   i=j; continue; }
        if (upper === 'XOR')  { tokens.push({type:TT.XOR});  i=j; continue; }
        if (upper === 'NAND') { tokens.push({type:TT.NAND}); i=j; continue; }
        if (upper === 'NOR')  { tokens.push({type:TT.NOR});  i=j; continue; }
        if (upper === 'XNOR') { tokens.push({type:TT.XNOR}); i=j; continue; }
        tokens.push({type:TT.VAR, name:word}); i=j; continue;
      }

      throw new Error('Unexpected character: ' + JSON.stringify(s[i]) + ' at position ' + i);
    }

    // Post-process: convert apostrophe tokens into postfix NOTs
    // e.g. VAR(A) APOSTROPHE → NOT_POST VAR(A)
    const out = [];
    for (let k = 0; k < tokens.length; k++) {
      if (tokens[k].type === 'APOSTROPHE') {
        // wrap previous token/group in a postfix-NOT marker
        out.push({type:'APOSTROPHE'});
      } else {
        out.push(tokens[k]);
      }
    }
    out.push({type:TT.EOF});
    return out;
  }

  // ═══════════════════════════════════════════════════════
  // RECURSIVE-DESCENT PARSER
  // ═══════════════════════════════════════════════════════
  // Grammar (simplified, apostrophe handled in tokeniser pass):
  //   expr   = or_expr
  //   or_expr  = xor_expr  { (OR|NOR) xor_expr }
  //   xor_expr = and_expr  { (XOR|XNOR) and_expr }
  //   and_expr = not_expr  { [AND] not_expr }
  //   not_expr = NOT not_expr | atom [APOSTROPHE]
  //   atom     = CONST | VAR | '(' expr ')'

  function parse(src) {
    const tokens = tokenise(src);
    let pos = 0;

    function peek()    { return tokens[pos]; }
    function consume() { return tokens[pos++]; }
    function expect(t) {
      const tok = consume();
      if (tok.type !== t) throw new Error('Expected ' + t + ' but got ' + tok.type);
      return tok;
    }

    function parseExpr()   { return parseOr(); }

    function parseOr() {
      let left = parseXor();
      while (peek().type === TT.OR || peek().type === TT.NOR) {
        const op = consume().type;
        const right = parseXor();
        left = {op, children:[left, right]};
      }
      return left;
    }

    function parseXor() {
      let left = parseAnd();
      while (peek().type === TT.XOR || peek().type === TT.XNOR) {
        const op = consume().type;
        const right = parseAnd();
        left = {op, children:[left, right]};
      }
      return left;
    }

    function parseAnd() {
      let left = parseNot();
      // AND is implicit between adjacent terms OR explicit AND
      while (true) {
        const t = peek().type;
        // explicit AND
        if (t === TT.AND) { consume(); const right = parseNot(); left = {op:'AND', children:[left,right]}; continue; }
        // implicit AND: next token starts a new primary
        if (t === TT.VAR || t === TT.CONST || t === TT.LPAREN || t === TT.NOT) {
          const right = parseNot();
          left = {op:'AND', children:[left,right]};
          continue;
        }
        // NAND as infix (lower precedence than AND but higher than OR for grouping)
        if (t === TT.NAND) { consume(); const right = parseNot(); left = {op:'NAND', children:[left,right]}; continue; }
        break;
      }
      return left;
    }

    function parseNot() {
      if (peek().type === TT.NOT) {
        consume();
        const child = parseNot();
        return {op:'NOT', children:[child]};
      }
      let node = parseAtom();
      // handle postfix apostrophe
      while (peek().type === 'APOSTROPHE') {
        consume();
        node = {op:'NOT', children:[node]};
      }
      return node;
    }

    function parseAtom() {
      const t = peek();
      if (t.type === TT.CONST) { consume(); return {op:'CONST', val:t.val}; }
      if (t.type === TT.VAR)   { consume(); return {op:'VAR',   name:t.name}; }
      if (t.type === TT.LPAREN) {
        consume();
        const node = parseExpr();
        expect(TT.RPAREN);
        // handle postfix apostrophe on a group: (A+B)'
        let n = node;
        while (peek().type === 'APOSTROPHE') {
          consume();
          n = {op:'NOT', children:[n]};
        }
        return n;
      }
      throw new Error('Unexpected token: ' + t.type + (t.name?' ('+t.name+')':''));
    }

    const ast = parseExpr();
    if (peek().type !== TT.EOF) {
      throw new Error('Unexpected token after expression: ' + peek().type);
    }
    return ast;
  }

  // ═══════════════════════════════════════════════════════
  // CIRCUIT BUILDER
  // ═══════════════════════════════════════════════════════
  // Layout strategy:
  //   1. Walk the AST to collect unique variable names (in appearance order)
  //   2. Assign each AST node a "depth" (column from left)
  //   3. Place INPUT gates at col 0
  //   4. Place NOT gates at col 1 (one per variable that appears negated)
  //   5. Place binary gates at computed columns
  //   6. Connect them
  //   7. Add OUTPUT gate at the rightmost column

  function buildCircuit(src) {
    let ast;
    try { ast = parse(src); }
    catch(e) { return { error: e.message }; }

    // ── Collect variables in order of appearance ──
    const varOrder = [];
    const varSet   = new Set();
    (function collectVars(node) {
      if (node.op === 'VAR') {
        if (!varSet.has(node.name)) { varSet.add(node.name); varOrder.push(node.name); }
      }
      (node.children||[]).forEach(collectVars);
    })(ast);

    // ── Gate layout constants ──
    const COL_W   = 130;   // horizontal spacing between columns
    const ROW_H   = 74;    // vertical spacing between gates in same column
    const START_X = 60;

    let idCtr = 1;
    const nid = () => idCtr++;
    const gates = [], conns = [];

    // ── Column 0: INPUT gates ──
    const inputId = {};   // varName → gateId
    varOrder.forEach((name, i) => {
      const id = nid();
      inputId[name] = id;
      gates.push({ id, type:'INPUT', x:START_X, y:60 + i * ROW_H, value:0, label:name });
    });

    // ── Column 1: NOT gates (one per negated variable, shared) ──
    const notId = {};     // varName → gateId (lazy, created on demand)
    function getNot(varName) {
      if (notId[varName]) return notId[varName];
      const id = nid();
      notId[varName] = id;
      const i = varOrder.indexOf(varName);
      gates.push({ id, type:'NOT', x: START_X + COL_W, y: 60 + i * ROW_H });
      conns.push({ fromId: inputId[varName], fromPin:0, toId: id, toPin:0 });
      return id;
    }

    // ── Compute the maximum depth of the AST ──
    function depth(node) {
      if (!node.children || !node.children.length) return 0;
      return 1 + Math.max(...node.children.map(depth));
    }
    const maxDepth = depth(ast);

    // Track per-column gate count for vertical stacking
    const colCount = {};  // col → number of gates placed so far

    // ── Recursive circuit builder ──
    // Returns { gateId, pin } pointing to the output of this subtree.
    // `col` = the column this node should occupy (right-to-left recursion)
    function buildNode(node, col) {
      // ── Leaf: variable ──
      if (node.op === 'VAR') {
        return { gateId: inputId[node.name], pin: 0 };
      }

      // ── Leaf: constant ──
      if (node.op === 'CONST') {
        const id = nid();
        const ci = colCount[col] || 0;
        colCount[col] = ci + 1;
        const y = 60 + ci * ROW_H;
        const x = START_X + col * COL_W;
        gates.push({ id, type:'INPUT', x, y, value: node.val, label: String(node.val) });
        return { gateId: id, pin: 0 };
      }

      // ── NOT ──
      if (node.op === 'NOT') {
        const child = node.children[0];
        // Optimise: NOT(VAR) → use shared NOT gate in col 1
        if (child.op === 'VAR') {
          return { gateId: getNot(child.name), pin: 0 };
        }
        // General NOT
        const src = buildNode(child, col - 1);
        const id  = nid();
        const ci  = colCount[col] || 0;
        colCount[col] = ci + 1;
        const y = 60 + ci * ROW_H;
        const x = START_X + col * COL_W;
        gates.push({ id, type:'NOT', x, y });
        conns.push({ fromId: src.gateId, fromPin: src.pin, toId: id, toPin: 0 });
        return { gateId: id, pin: 0 };
      }

      // ── Binary / multi-input gates ──
      const children = node.children;
      // Build all children at col-1
      const srcs = children.map(c => buildNode(c, col - 1));

      // Choose gate type
      const n = srcs.length;
      let gType;
      switch(node.op) {
        case 'AND':  gType = n<=2?'AND':n===3?'AND3':'AND4'; break;
        case 'OR':   gType = n<=2?'OR' :n===3?'OR3' :'OR4';  break;
        case 'NAND': gType = 'NAND'; break;
        case 'NOR':  gType = 'NOR';  break;
        case 'XOR':  gType = 'XOR';  break;
        case 'XNOR': gType = 'XNOR'; break;
        default: throw new Error('Unknown op: ' + node.op);
      }

      const id = nid();
      const ci = colCount[col] || 0;
      colCount[col] = ci + 1;
      const y = 60 + ci * ROW_H;
      const x = START_X + col * COL_W;
      gates.push({ id, type: gType, x, y });

      srcs.slice(0, 4).forEach((src, pi) => {
        conns.push({ fromId: src.gateId, fromPin: src.pin, toId: id, toPin: pi });
      });

      return { gateId: id, pin: 0 };
    }

    // Build from right to left: root sits at col = maxDepth + 1 (after input col 0 and NOT col 1)
    // But we want variable inputs at col 0 and NOT at col 1, so gates start at col 2.
    // We pass col = maxDepth + 1 to the root.
    const rootCol = maxDepth + 1;
    const rootSrc = buildNode(ast, rootCol);

    // ── OUTPUT gate ──
    const outId = nid();
    const outX  = START_X + (rootCol + 1) * COL_W;
    const outY  = 60 + (varOrder.length / 2 - 0.5) * ROW_H;
    gates.push({ id: outId, type:'OUTPUT', x: outX, y: Math.max(60, outY), label:'F' });
    conns.push({ fromId: rootSrc.gateId, fromPin: rootSrc.pin, toId: outId, toPin: 0 });

    // ── Vertical re-centre each column ──
    // Group gates by column x, space them evenly around the circuit centre
    const colGroups = {};
    gates.forEach(g => {
      const col = Math.round((g.x - START_X) / COL_W);
      if (!colGroups[col]) colGroups[col] = [];
      colGroups[col].push(g);
    });
    const totalH = Math.max(varOrder.length, 1) * ROW_H;
    const centreY = 60 + totalH / 2;
    Object.values(colGroups).forEach(grp => {
      const h = grp.length * ROW_H;
      const top = centreY - h / 2;
      grp.forEach((g, i) => { g.y = top + i * ROW_H; });
    });

    return { gates, connections: conns, nextId: idCtr, error: null };
  }

  // ═══════════════════════════════════════════════════════
  // MODAL UI
  // ═══════════════════════════════════════════════════════
  const EXAMPLES = [
    { label:"A'B + AB'",       expr:"A'B + AB'"      },
    { label:"(A+B)(A'+C)",     expr:"(A+B)(A'+C)"    },
    { label:"A XOR B",         expr:"A XOR B"        },
    { label:"AB'C + A'BC'",    expr:"AB'C + A'BC'"   },
    { label:"(A NAND B) NOR C",expr:"(A NAND B) NOR C"},
    { label:"A⊕B⊕C",          expr:"A⊕B⊕C"          },
    { label:"~A & (B | ~C)",   expr:"~A & (B | ~C)"  },
    { label:"ABCD",            expr:"ABCD"            },
  ];

  function injectStyles() {
    if (document.getElementById('boolparser-styles')) return;
    const style = document.createElement('style');
    style.id = 'boolparser-styles';
    style.textContent = `
#bp-modal-overlay {
  display:none;position:fixed;inset:0;z-index:5000;
  background:rgba(4,6,10,0.85);backdrop-filter:blur(10px);
  align-items:center;justify-content:center;padding:20px;
}
#bp-modal-overlay.open { display:flex; }
#bp-modal {
  background:#0d1117;border:1px solid rgba(255,255,255,0.12);
  border-radius:18px;width:100%;max-width:580px;
  box-shadow:0 40px 100px rgba(0,0,0,0.8);
  animation:bp-in .2s cubic-bezier(.22,.68,0,1.15);
  font-family:'JetBrains Mono',monospace;
}
@keyframes bp-in{from{opacity:0;transform:scale(.92) translateY(18px)}to{opacity:1;transform:none}}
#bp-head {
  padding:20px 24px 16px;border-bottom:1px solid rgba(255,255,255,0.07);
  display:flex;align-items:center;justify-content:space-between;
}
#bp-head-left { display:flex;align-items:center;gap:10px; }
#bp-head-icon { font-size:20px; color:#00d4aa; }
#bp-head-title { font-family:'Syne',sans-serif;font-weight:800;font-size:17px;color:#e2e8f0;letter-spacing:-.02em; }
#bp-head-sub { font-family:'JetBrains Mono',monospace;font-size:10px;color:#64748b;margin-top:2px; }
#bp-close {
  width:28px;height:28px;border-radius:7px;background:rgba(255,255,255,0.05);
  border:none;color:#64748b;font-size:15px;cursor:pointer;display:flex;
  align-items:center;justify-content:center;transition:all .14s;
}
#bp-close:hover{background:rgba(248,113,113,0.1);color:#f87171;}
#bp-body { padding:20px 24px 24px;display:flex;flex-direction:column;gap:16px; }

/* input area */
#bp-input-wrap { position:relative; }
#bp-input {
  width:100%;padding:13px 16px;background:#161b24;
  border:1px solid rgba(255,255,255,0.12);border-radius:10px;
  color:#e2e8f0;font-family:'JetBrains Mono',monospace;font-size:15px;
  outline:none;transition:border-color .15s,box-shadow .15s;
  caret-color:#00d4aa;
}
#bp-input:focus{border-color:#00d4aa;box-shadow:0 0 0 3px rgba(0,212,170,0.12);}
#bp-input.err{border-color:#f87171;box-shadow:0 0 0 3px rgba(248,113,113,0.1);}
#bp-input::placeholder{color:#3d4a5a;}

/* operator cheatsheet */
#bp-ops {
  display:flex;flex-wrap:wrap;gap:6px;
}
.bp-op {
  font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;
  color:#94a3b8;background:#161b24;border:1px solid rgba(255,255,255,0.1);
  border-radius:6px;padding:4px 10px;cursor:pointer;transition:all .14s;
  user-select:none;
}
.bp-op:hover{color:#00d4aa;border-color:rgba(0,212,170,0.35);background:rgba(0,212,170,0.07);}
.bp-op-label{font-family:'JetBrains Mono',monospace;font-size:9px;color:#64748b;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px;}

/* examples */
#bp-examples{display:flex;flex-wrap:wrap;gap:6px;}
.bp-example{
  font-family:'JetBrains Mono',monospace;font-size:10px;color:#7d8a9a;
  background:#161b24;border:1px solid rgba(255,255,255,0.08);
  border-radius:6px;padding:4px 10px;cursor:pointer;transition:all .14s;
}
.bp-example:hover{color:#e2e8f0;border-color:rgba(255,255,255,0.2);}

/* error / preview */
#bp-error{
  font-family:'JetBrains Mono',monospace;font-size:11px;color:#f87171;
  background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);
  border-radius:8px;padding:9px 14px;display:none;
}
#bp-error.show{display:block;}
#bp-preview{
  font-family:'JetBrains Mono',monospace;font-size:11px;color:#64748b;
  background:rgba(0,212,170,0.04);border:1px solid rgba(0,212,170,0.12);
  border-radius:8px;padding:9px 14px;display:none;line-height:1.6;
}
#bp-preview.show{display:block;color:#7d8a9a;}
#bp-preview strong{color:#00d4aa;}

/* footer */
#bp-footer{display:flex;gap:10px;justify-content:flex-end;align-items:center;}
#bp-hint{font-family:'JetBrains Mono',monospace;font-size:10px;color:#3d4a5a;flex:1;}
#bp-cancel{
  font-family:'JetBrains Mono',monospace;font-size:11px;color:#64748b;
  background:transparent;border:1px solid rgba(255,255,255,0.1);
  border-radius:8px;padding:9px 16px;cursor:pointer;transition:all .15s;
}
#bp-cancel:hover{color:#e2e8f0;border-color:rgba(255,255,255,0.2);}
#bp-build{
  font-family:'Syne',sans-serif;font-weight:700;font-size:13px;
  color:#050e0b;background:#00d4aa;border:none;
  border-radius:8px;padding:10px 24px;cursor:pointer;transition:all .15s;
}
#bp-build:hover{background:#00ffcc;transform:translateY(-1px);box-shadow:0 6px 20px rgba(0,212,170,0.3);}
#bp-build:active{transform:none;box-shadow:none;}
#bp-build:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none;}
    `;
    document.head.appendChild(style);
  }

  function injectModal() {
    if (document.getElementById('bp-modal-overlay')) return;
    injectStyles();
    const opsData = [
      {sym:"'", tip:"NOT (postfix)"},
      {sym:"~", tip:"NOT (prefix)"},
      {sym:"+", tip:"OR"},
      {sym:"·", tip:"AND"},
      {sym:"^", tip:"XOR"},
      {sym:"(", tip:"Open group"},
      {sym:")", tip:"Close group"},
    ];
    const div = document.createElement('div');
    div.innerHTML = `
<div id="bp-modal-overlay">
  <div id="bp-modal" role="dialog" aria-modal="true" aria-labelledby="bp-head-title">
    <div id="bp-head">
      <div id="bp-head-left">
        <span id="bp-head-icon">&#x03A3;</span>
        <div>
          <div id="bp-head-title">Boolean Expression Parser</div>
          <div id="bp-head-sub">Type any Boolean expression &rarr; auto-builds gate circuit</div>
        </div>
      </div>
      <button id="bp-close" aria-label="Close">&times;</button>
    </div>
    <div id="bp-body">

      <div>
        <div class="bp-op-label">Expression</div>
        <div id="bp-input-wrap">
          <input id="bp-input" type="text" placeholder="e.g.  A'B + AB'  or  (A+B)(A'+C)" autocomplete="off" spellcheck="false"/>
        </div>
      </div>

      <div>
        <div class="bp-op-label">Quick insert</div>
        <div id="bp-ops">
          ${opsData.map(o=>`<span class="bp-op" title="${o.tip}" data-ins="${o.sym}">${o.sym}</span>`).join('')}
        </div>
      </div>

      <div>
        <div class="bp-op-label">Examples</div>
        <div id="bp-examples">
          ${EXAMPLES.map(e=>`<span class="bp-example" data-expr="${e.expr}">${e.label}</span>`).join('')}
        </div>
      </div>

      <div id="bp-error"></div>
      <div id="bp-preview"></div>

      <div id="bp-footer">
        <span id="bp-hint">Supports: NOT &nbsp;AND &nbsp;OR &nbsp;XOR &nbsp;NAND &nbsp;NOR &nbsp;XNOR &nbsp;&middot;&nbsp; Use A' ~A !A for NOT</span>
        <button id="bp-cancel">Cancel</button>
        <button id="bp-build" disabled>&#x26A1; Build Circuit</button>
      </div>
    </div>
  </div>
</div>`;
    document.body.appendChild(div.firstElementChild);
    wireModal();
  }

  function wireModal() {
    const overlay  = document.getElementById('bp-modal-overlay');
    const input    = document.getElementById('bp-input');
    const errorEl  = document.getElementById('bp-error');
    const previewEl= document.getElementById('bp-preview');
    const buildBtn = document.getElementById('bp-build');

    // close
    document.getElementById('bp-close').addEventListener('click', close);
    document.getElementById('bp-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });

    // quick-insert operators
    document.querySelectorAll('.bp-op').forEach(btn => {
      btn.addEventListener('click', () => {
        const ins = btn.dataset.ins;
        const start = input.selectionStart, end = input.selectionEnd;
        input.value = input.value.slice(0,start) + ins + input.value.slice(end);
        input.setSelectionRange(start+ins.length, start+ins.length);
        input.focus();
        onInput();
      });
    });

    // examples
    document.querySelectorAll('.bp-example').forEach(btn => {
      btn.addEventListener('click', () => {
        input.value = btn.dataset.expr;
        input.focus();
        onInput();
      });
    });

    // live validation
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !buildBtn.disabled) buildAndClose();
    });

    function onInput() {
      const expr = input.value.trim();
      if (!expr) {
        errorEl.className=''; previewEl.className='';
        input.className=''; buildBtn.disabled=true; return;
      }
      try {
        const result = buildCircuit(expr);
        if (result.error) throw new Error(result.error);

        // count unique vars
        const vars = new Set();
        result.gates.forEach(g => { if (g.type==='INPUT' && g.label && g.label!=='0' && g.label!=='1') vars.add(g.label); });
        const gateCount = result.gates.filter(g=>!['INPUT','OUTPUT'].includes(g.type)).length;

        errorEl.className='';
        previewEl.className='show';
        previewEl.innerHTML =
          '<strong>&#x2713; Valid</strong> &nbsp;&middot;&nbsp; '
          + vars.size + ' input' + (vars.size!==1?'s':'')
          + ' (' + [...vars].join(', ') + ')'
          + ' &nbsp;&middot;&nbsp; '
          + gateCount + ' logic gate' + (gateCount!==1?'s':'')
          + ' &nbsp;&middot;&nbsp; '
          + result.connections.length + ' wire' + (result.connections.length!==1?'s':'');
        input.className='';
        buildBtn.disabled=false;
      } catch(err) {
        errorEl.className='show';
        errorEl.textContent = '&#x26A0; ' + err.message;
        previewEl.className='';
        input.className='err';
        buildBtn.disabled=true;
      }
    }

    // build button
    buildBtn.addEventListener('click', buildAndClose);

    function buildAndClose() {
      const expr = input.value.trim();
      const result = buildCircuit(expr);
      if (result.error) return;
      close();
      // Inject into the simulator canvas via app.js globals
      if (typeof snapshot === 'function') snapshot();
      if (typeof apply === 'function') {
        apply({ gates: result.gates, connections: result.connections, nextId: result.nextId });
        if (typeof setStatus === 'function') {
          setStatus('Built from "' + expr + '" — ' + result.gates.length + ' gates, ' + result.connections.length + ' wires');
        }
      } else {
        // Fallback: cross-page via localStorage
        localStorage.setItem('lf_kmap_export', JSON.stringify(result));
        window.location.href = 'index.html';
      }
    }

    function close() {
      overlay.classList.remove('open');
    }
  }

  function open() {
    injectModal();
    document.getElementById('bp-modal-overlay').classList.add('open');
    setTimeout(() => document.getElementById('bp-input').focus(), 80);
  }

  // ═══════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════
  window.BoolParser = { parse, buildCircuit, open };

})();
