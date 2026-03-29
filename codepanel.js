/* codepanel.js — Code Panel + Circuit Validator for LogicForge
   =============================================================
   Two panel modes selectable at the top of the right panel:
     1. Code     — JSON / Python / C / C++ / Verilog / VHDL
     2. Validate — Circuit validation & error highlighting
   ============================================================= */

window.CodePanel = (function () {
  var currentLang  = 'json';
  var currentPanel = 'code'; // 'code' | 'validate'

  // exposed so canvas.js drawGate() can highlight errored gates
  window._validationErrors = {}; // { gateId: [{severity, msg}] }

  // ================================================================
  //  SIGNAL / NAME HELPERS
  // ================================================================
  function sigName(gs,gid,pin){
    var g=gs.find(function(x){return x.id===gid;});
    if(!g) return '0';
    if(g.type==='INPUT') return sanitize(g.label||'in'+gid);
    if(g.type==='CLOCK') return 'clk';
    return 'w'+gid+(pin?'_'+pin:'');
  }
  function sanitize(s){return String(s).replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'').toLowerCase()||'sig';}
  function buildConnMap(cs){var m={};cs.forEach(function(c){m[c.toId+'_'+(c.toPin||0)]={fromId:c.fromId,fromPin:c.fromPin||0};});return m;}
  function getIn(gs,m,gid,pin){var c=m[gid+'_'+pin];return c?sigName(gs,c.fromId,c.fromPin):'0';}
  function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  // ================================================================
  //  CODE GENERATORS
  // ================================================================
  function genJSON(gs,cs,nid){
    return JSON.stringify({nextId:nid,
      gates:gs.map(function(g){var o={id:g.id,type:g.type,x:Math.round(g.x),y:Math.round(g.y)};if(g.label)o.label=g.label;if(g.type==='INPUT')o.value=g.value||0;return o;}),
      connections:cs.map(function(c){var o={fromId:c.fromId,toId:c.toId};if(c.fromPin)o.fromPin=c.fromPin;if(c.toPin)o.toPin=c.toPin;return o;})
    },null,2);
  }

  function genPython(gs,cs){
    if(!gs.length) return '# Empty circuit\n';
    var inputs=gs.filter(function(g){return g.type==='INPUT';});
    var outputs=gs.filter(function(g){return g.type==='OUTPUT'||g.type==='LED';});
    var logic=gs.filter(function(g){return !['INPUT','OUTPUT','LED','CLOCK'].includes(g.type);});
    var m=buildConnMap(cs);
    var L=['"""','LogicForge Circuit — Python','Gates: '+gs.length+' | Wires: '+cs.length,'"""',''];
    if(inputs.length){L.push('# Inputs');inputs.forEach(function(g){L.push(sanitize(g.label||'in'+g.id)+' = '+(g.value||0));});L.push('');}
    logic.forEach(function(g){
      var a=getIn(gs,m,g.id,0),b=getIn(gs,m,g.id,1),c2=getIn(gs,m,g.id,2),out='w'+g.id;
      switch(g.type){
        case 'AND':case 'AND3':case 'AND4':var ai=[a,b];if(g.type!=='AND'){ai.push(c2);}if(g.type==='AND4'){ai.push(getIn(gs,m,g.id,3));}L.push(out+' = int('+ai.join(' and ')+')');break;
        case 'OR':case 'OR3':case 'OR4':var oi=[a,b];if(g.type!=='OR'){oi.push(c2);}if(g.type==='OR4'){oi.push(getIn(gs,m,g.id,3));}L.push(out+' = int('+oi.join(' or ')+')');break;
        case 'NOT':L.push(out+' = int(not '+a+')');break;
        case 'NAND':L.push(out+' = int(not ('+a+' and '+b+'))');break;
        case 'NOR':L.push(out+' = int(not ('+a+' or '+b+'))');break;
        case 'XOR':L.push(out+' = int('+a+' ^ '+b+')');break;
        case 'XNOR':L.push(out+' = int(not ('+a+' ^ '+b+'))');break;
        case 'BUFFER':L.push(out+' = '+a);break;
        case 'HADD':L.push(out+'_sum = int('+a+' ^ '+b+')  # Sum');L.push(out+'_carry = int('+a+' & '+b+')  # Carry');break;
        case 'FADD':L.push(out+'_sum = int('+a+' ^ '+b+' ^ '+c2+')');L.push(out+'_cout = int(('+a+' & '+b+')|('+b+' & '+c2+')|('+a+' & '+c2+'))');break;
        case 'MUX2':L.push(out+' = '+b+' if '+c2+' else '+a);break;
        case 'COMP1':L.push(out+'_gt=int('+a+'>'+b+'); '+out+'_eq=int('+a+'=='+b+'); '+out+'_lt=int('+a+'<'+b+')');break;
        default:L.push('# '+g.type+' #'+g.id+' — not implemented');
      }
    });
    if(outputs.length){L.push('');L.push('# Outputs');outputs.forEach(function(g){var n=sanitize(g.label||'out'+g.id),src=getIn(gs,m,g.id,0);L.push(n+' = '+src);});L.push('');L.push('# Print');outputs.forEach(function(g){var n=sanitize(g.label||'out'+g.id);L.push('print(f"'+n+' = {'+n+'}")');});}
    return L.join('\n');
  }

  function genC(gs,cs){
    if(!gs.length) return '/* Empty circuit */\n';
    var inputs=gs.filter(function(g){return g.type==='INPUT';});
    var outputs=gs.filter(function(g){return g.type==='OUTPUT'||g.type==='LED';});
    var logic=gs.filter(function(g){return !['INPUT','OUTPUT','LED','CLOCK'].includes(g.type);});
    var m=buildConnMap(cs);
    var L=['/* LogicForge Circuit — C */','/* Gates: '+gs.length+' | Wires: '+cs.length+' */','#include <stdio.h>','','int main(void) {'];
    inputs.forEach(function(g){L.push('    int '+sanitize(g.label||'in'+g.id)+' = '+(g.value||0)+';');});
    if(inputs.length)L.push('');
    logic.forEach(function(g){
      var a=getIn(gs,m,g.id,0),b=getIn(gs,m,g.id,1),c2=getIn(gs,m,g.id,2),out='w'+g.id;
      switch(g.type){
        case 'AND':case 'AND3':case 'AND4':var ai=[a,b];if(g.type!=='AND'){ai.push(c2);}if(g.type==='AND4'){ai.push(getIn(gs,m,g.id,3));}L.push('    int '+out+' = ('+ai.join(' & ')+') & 1;');break;
        case 'OR':case 'OR3':case 'OR4':var oi=[a,b];if(g.type!=='OR'){oi.push(c2);}if(g.type==='OR4'){oi.push(getIn(gs,m,g.id,3));}L.push('    int '+out+' = ('+oi.join(' | ')+') & 1;');break;
        case 'NOT':L.push('    int '+out+' = (!'+a+') & 1;');break;
        case 'NAND':L.push('    int '+out+' = (!('+a+' & '+b+')) & 1;');break;
        case 'NOR':L.push('    int '+out+' = (!('+a+' | '+b+')) & 1;');break;
        case 'XOR':L.push('    int '+out+' = ('+a+' ^ '+b+') & 1;');break;
        case 'XNOR':L.push('    int '+out+' = (!('+a+' ^ '+b+')) & 1;');break;
        case 'BUFFER':L.push('    int '+out+' = '+a+';');break;
        case 'HADD':L.push('    int '+out+'_sum   = ('+a+' ^ '+b+') & 1;');L.push('    int '+out+'_carry = ('+a+' & '+b+') & 1;');break;
        case 'FADD':L.push('    int '+out+'_sum  = ('+a+' ^ '+b+' ^ '+c2+') & 1;');L.push('    int '+out+'_cout = (('+a+'&'+b+')|('+b+'&'+c2+')|('+a+'&'+c2+')) & 1;');break;
        case 'MUX2':L.push('    int '+out+' = '+c2+' ? '+b+' : '+a+';');break;
        default:L.push('    /* '+g.type+' #'+g.id+' — TODO */ int '+out+' = 0;');
      }
    });
    if(outputs.length){L.push('');outputs.forEach(function(g){var n=sanitize(g.label||'out'+g.id),src=getIn(gs,m,g.id,0);L.push('    int '+n+' = '+src+';');});L.push('');outputs.forEach(function(g){var n=sanitize(g.label||'out'+g.id);L.push('    printf("'+n+' = %d\\n", '+n+');');});}
    L.push('    return 0;');L.push('}');
    return L.join('\n');
  }

  function genCpp(gs,cs){
    return genC(gs,cs)
      .replace('/* LogicForge Circuit — C */','/* LogicForge Circuit — C++ */')
      .replace('#include <stdio.h>','#include <iostream>\nusing namespace std;')
      .replace(/printf\("(.+) = %d\\n", (.+)\);/g,'cout << "$1 = " << $2 << endl;')
      .replace('int main(void)','int main()');
  }

  function genVerilog(gs,cs){
    if(!gs.length) return '// Empty circuit\n';
    var inputs=gs.filter(function(g){return g.type==='INPUT'||g.type==='CLOCK';});
    var outputs=gs.filter(function(g){return g.type==='OUTPUT'||g.type==='LED';});
    var logic=gs.filter(function(g){return !['INPUT','OUTPUT','LED','CLOCK'].includes(g.type);});
    var m=buildConnMap(cs);
    var inPorts=inputs.map(function(g){return sanitize(g.label||'in'+g.id);});
    var outPorts=outputs.map(function(g){return sanitize(g.label||'out'+g.id);});
    var L=['// LogicForge Circuit — Verilog','// Gates: '+gs.length+' | Wires: '+cs.length,''];
    L.push('module circuit (');
    inPorts.forEach(function(n){L.push('    input  wire '+n+',');});
    outPorts.forEach(function(n,i){L.push('    output wire '+n+(i<outPorts.length-1?',':''));});
    L.push(');','');
    var wires=[];
    logic.forEach(function(g){
      if(g.type==='HADD'){wires.push('wire w'+g.id+'_sum, w'+g.id+'_carry;');}
      else if(g.type==='FADD'){wires.push('wire w'+g.id+'_sum, w'+g.id+'_cout;');}
      else wires.push('wire w'+g.id+';');
    });
    if(wires.length){L=L.concat(wires);L.push('');}
    logic.forEach(function(g){
      var a=getIn(gs,m,g.id,0),b=getIn(gs,m,g.id,1),c2=getIn(gs,m,g.id,2),out='w'+g.id;
      switch(g.type){
        case 'AND':case 'AND3':case 'AND4':var ai=[a,b];if(g.type!=='AND'){ai.push(c2);}if(g.type==='AND4'){ai.push(getIn(gs,m,g.id,3));}L.push('assign '+out+' = '+ai.join(' & ')+';');break;
        case 'OR':case 'OR3':case 'OR4':var oi=[a,b];if(g.type!=='OR'){oi.push(c2);}if(g.type==='OR4'){oi.push(getIn(gs,m,g.id,3));}L.push('assign '+out+' = '+oi.join(' | ')+';');break;
        case 'NOT':L.push('assign '+out+' = ~'+a+';');break;
        case 'NAND':L.push('assign '+out+' = ~('+a+' & '+b+');');break;
        case 'NOR':L.push('assign '+out+' = ~('+a+' | '+b+');');break;
        case 'XOR':L.push('assign '+out+' = '+a+' ^ '+b+';');break;
        case 'XNOR':L.push('assign '+out+' = ~('+a+' ^ '+b+');');break;
        case 'BUFFER':L.push('assign '+out+' = '+a+';');break;
        case 'HADD':L.push('assign '+out+'_sum   = '+a+' ^ '+b+';');L.push('assign '+out+'_carry = '+a+' & '+b+';');break;
        case 'FADD':L.push('assign '+out+'_sum  = '+a+' ^ '+b+' ^ '+c2+';');L.push('assign '+out+'_cout = ('+a+'&'+b+')|('+b+'&'+c2+')|('+a+'&'+c2+');');break;
        case 'MUX2':L.push('assign '+out+' = '+c2+' ? '+b+' : '+a+';');break;
        default:L.push('// assign '+out+' = /* '+g.type+' */ 0;');
      }
    });
    L.push('');outputs.forEach(function(g,i){L.push('assign '+outPorts[i]+' = '+getIn(gs,m,g.id,0)+';');});L.push('','endmodule');
    return L.join('\n');
  }

  function genVHDL(gs,cs){
    if(!gs.length) return '-- Empty circuit\n';
    var inputs=gs.filter(function(g){return g.type==='INPUT'||g.type==='CLOCK';});
    var outputs=gs.filter(function(g){return g.type==='OUTPUT'||g.type==='LED';});
    var logic=gs.filter(function(g){return !['INPUT','OUTPUT','LED','CLOCK'].includes(g.type);});
    var m=buildConnMap(cs);
    var inPorts=inputs.map(function(g){return sanitize(g.label||'in'+g.id);});
    var outPorts=outputs.map(function(g){return sanitize(g.label||'out'+g.id);});
    var L=['-- LogicForge Circuit — VHDL','-- Gates: '+gs.length+' | Wires: '+cs.length,'','library IEEE;','use IEEE.STD_LOGIC_1164.ALL;','','entity circuit is','    port ('];
    inPorts.forEach(function(n){L.push('        '+n+' : in  STD_LOGIC;');});
    outPorts.forEach(function(n,i){L.push('        '+n+' : out STD_LOGIC'+(i<outPorts.length-1?';':''));});
    L.push('    );','end circuit;','','architecture Behavioral of circuit is','');
    logic.forEach(function(g){
      if(g.type==='HADD'){L.push('    signal w'+g.id+'_sum, w'+g.id+'_carry : STD_LOGIC;');}
      else if(g.type==='FADD'){L.push('    signal w'+g.id+'_sum, w'+g.id+'_cout : STD_LOGIC;');}
      else L.push('    signal w'+g.id+' : STD_LOGIC;');
    });
    L.push('','begin','');
    logic.forEach(function(g){
      var a=getIn(gs,m,g.id,0),b=getIn(gs,m,g.id,1),c2=getIn(gs,m,g.id,2),out='w'+g.id;
      switch(g.type){
        case 'AND':case 'AND3':case 'AND4':var ai=[a,b];if(g.type!=='AND'){ai.push(c2);}if(g.type==='AND4'){ai.push(getIn(gs,m,g.id,3));}L.push('    '+out+' <= '+ai.join(' and ')+';');break;
        case 'OR':case 'OR3':case 'OR4':var oi=[a,b];if(g.type!=='OR'){oi.push(c2);}if(g.type==='OR4'){oi.push(getIn(gs,m,g.id,3));}L.push('    '+out+' <= '+oi.join(' or ')+';');break;
        case 'NOT':L.push('    '+out+' <= not '+a+';');break;
        case 'NAND':L.push('    '+out+' <= not ('+a+' and '+b+');');break;
        case 'NOR':L.push('    '+out+' <= not ('+a+' or '+b+');');break;
        case 'XOR':L.push('    '+out+' <= '+a+' xor '+b+';');break;
        case 'XNOR':L.push('    '+out+' <= not ('+a+' xor '+b+');');break;
        case 'BUFFER':L.push('    '+out+' <= '+a+';');break;
        case 'HADD':L.push('    '+out+'_sum   <= '+a+' xor '+b+';');L.push('    '+out+'_carry <= '+a+' and '+b+';');break;
        case 'FADD':L.push('    '+out+'_sum  <= '+a+' xor '+b+' xor '+c2+';');L.push('    '+out+'_cout <= ('+a+' and '+b+') or ('+b+' and '+c2+') or ('+a+' and '+c2+');');break;
        case 'MUX2':L.push("    "+out+" <= "+b+" when "+c2+" = '1' else "+a+";");break;
        default:L.push('    -- '+g.type+' #'+g.id+' <= TODO');
      }
    });
    L.push('');outputs.forEach(function(g,i){L.push('    '+outPorts[i]+' <= '+getIn(gs,m,g.id,0)+';');});L.push('','end Behavioral;');
    return L.join('\n');
  }

  function generate(lang){
    var gs=(typeof gates!=='undefined')?gates:[];
    var cs=(typeof connections!=='undefined')?connections:[];
    var n=(typeof nextId!=='undefined')?nextId:1;
    if(lang==='python') return genPython(gs,cs);
    if(lang==='c')      return genC(gs,cs);
    if(lang==='cpp')    return genCpp(gs,cs);
    if(lang==='verilog') return genVerilog(gs,cs);
    if(lang==='vhdl')   return genVHDL(gs,cs);
    return genJSON(gs,cs,n);
  }

  // ================================================================
  //  VALIDATION ENGINE
  // ================================================================
  function runValidation(){
    var gs  = (typeof gates!=='undefined') ? gates : [];
    var cs  = (typeof connections!=='undefined') ? connections : [];
    // Try every possible way GATE_DEFS might be exposed
    var defs = (typeof GATE_DEFS !== 'undefined') ? GATE_DEFS
             : (window.GATE_DEFS)                 ? window.GATE_DEFS
             : null;

    var issues = [];
    var errorMap = {};

    function addIssue(severity, gateId, msg){
      issues.push({severity:severity, gateId:gateId, msg:msg});
      if(gateId !== null){
        if(!errorMap[gateId]) errorMap[gateId]=[];
        errorMap[gateId].push({severity:severity, msg:msg});
      }
    }

    if(!gs.length){
      window._validationErrors={};
      if(typeof render==='function') render();
      renderValidation([{severity:'info',gateId:null,msg:'Canvas is empty — add gates to validate.'}]);
      return;
    }

    // Known gate types and their input counts (fallback if GATE_DEFS unavailable)
    var KNOWN_INPUTS = {
      'INPUT':0,'CLOCK':0,'OUTPUT':1,'LED':1,
      'AND':2,'OR':2,'NOT':1,'NAND':2,'NOR':2,'XOR':2,'XNOR':2,'BUFFER':1,
      'AND3':3,'OR3':3,'AND4':4,'OR4':4,
      'SR_FF':2,'D_FF':2,'JK_FF':3,'T_FF':2,
      'MUX2':3,'MUX4':6,'DEMUX2':2,'DEC2':2,'DEC3':3,
      'ENC4':4,'PRIO4':4,'BIN2HEX':4,'COMP1':2,'HADD':2,'FADD':3
    };

    function getInputCount(type){
      if(defs && defs[type]) return defs[type].inputs || 0;
      return (KNOWN_INPUTS[type] !== undefined) ? KNOWN_INPUTS[type] : -1;
    }
    function isKnownType(type){
      if(defs && defs[type]) return true;
      return KNOWN_INPUTS[type] !== undefined;
    }

    // Connection lookup maps
    var connsByTo   = {}; // "toId_toPin" → connection
    var connsByFrom = {}; // fromId → [connections]
    cs.forEach(function(c){
      connsByTo[c.toId+'_'+(c.toPin||0)] = c;
      if(!connsByFrom[c.fromId]) connsByFrom[c.fromId]=[];
      connsByFrom[c.fromId].push(c);
    });

    var inputs  = gs.filter(function(g){return g.type==='INPUT'||g.type==='CLOCK';});
    var outputs = gs.filter(function(g){return g.type==='OUTPUT'||g.type==='LED';});

    // 1. No inputs / outputs
    if(!inputs.length)  addIssue('warning',null,'No INPUT or CLOCK gates — circuit has no stimulus.');
    if(!outputs.length) addIssue('warning',null,'No OUTPUT or LED gates — circuit produces no visible result.');

    // 2. Per-gate pin checks
    gs.forEach(function(g){
      if(!isKnownType(g.type)){
        addIssue('error',g.id,'Unknown gate type "'+g.type+'".');
        return;
      }
      var lbl = g.label ? '"'+g.label+'"' : g.type+' #'+g.id;
      var numInputs = getInputCount(g.type);

      // Floating input pins
      if(!['INPUT','CLOCK'].includes(g.type)){
        for(var pin=0; pin<numInputs; pin++){
          if(!connsByTo[g.id+'_'+pin]){
            addIssue('error', g.id,
              lbl+' — input pin '+(pin+1)+'/'+numInputs+' is floating (not connected).');
          }
        }
      }

      // Output drives nothing
      if(!['OUTPUT','LED'].includes(g.type)){
        if(!(connsByFrom[g.id]||[]).length){
          addIssue('warning',g.id, lbl+' — output pin drives nothing.');
        }
      }

      // OUTPUT/LED has no driver
      if(g.type==='OUTPUT'||g.type==='LED'){
        if(!connsByTo[g.id+'_0']){
          addIssue('error',g.id, lbl+' — '+g.type+' has no input connected.');
        }
      }

      // INPUT/CLOCK drives nothing
      if(g.type==='INPUT'||g.type==='CLOCK'){
        if(!(connsByFrom[g.id]||[]).length){
          addIssue('warning',g.id, lbl+' — '+g.type+' is placed but not wired to anything.');
        }
      }
    });

    // 3. Duplicate labels
    var labelMap={};
    inputs.forEach(function(g){
      var lbl=(g.label||'').trim().toLowerCase();
      if(!lbl) return;
      if(labelMap[lbl]) addIssue('warning',g.id,'Label "'+g.label+'" is duplicated (also on gate #'+labelMap[lbl]+').');
      else labelMap[lbl]=g.id;
    });

    // 4. Self-loops
    cs.forEach(function(c){
      if(c.fromId===c.toId){
        var g=gs.find(function(x){return x.id===c.fromId;});
        addIssue('error',c.fromId,(g?g.type:'Gate')+' #'+c.fromId+' has a wire looped back to itself.');
      }
    });

    // 5. Combinational cycle detection (Kahn's algorithm)
    var inDeg={};
    gs.forEach(function(g){inDeg[g.id]=0;});
    cs.forEach(function(c){inDeg[c.toId]=(inDeg[c.toId]||0)+1;});
    var queue=gs.filter(function(g){return inDeg[g.id]===0;}).map(function(g){return g.id;});
    var visited=0;
    var adj={};
    gs.forEach(function(g){adj[g.id]=[];});
    cs.forEach(function(c){if(!adj[c.fromId].includes(c.toId))adj[c.fromId].push(c.toId);});
    while(queue.length){
      var cur=queue.shift(); visited++;
      adj[cur].forEach(function(nb){inDeg[nb]--;if(inDeg[nb]===0)queue.push(nb);});
    }
    if(visited<gs.length){
      gs.forEach(function(g){
        if(inDeg[g.id]>0) addIssue('error',g.id,(g.label||g.type+' #'+g.id)+' is part of a combinational loop (cycle).');
      });
    }

    // 6. Completely isolated gate
    gs.forEach(function(g){
      if(['INPUT','OUTPUT','LED','CLOCK'].includes(g.type)) return;
      var linked=cs.some(function(c){return c.fromId===g.id||c.toId===g.id;});
      if(!linked) addIssue('info',g.id,g.type+' #'+g.id+' is completely isolated — no connections at all.');
    });

    window._validationErrors = errorMap;
    if(typeof render==='function') render();
    renderValidation(issues);
  }

  // ── Render issue list in the validator panel ──────────────────────
  function renderValidation(issues){
    var wrap=document.getElementById('vld-body');
    var sb=document.getElementById('vld-summary');
    if(!wrap) return;

    var errors  =issues.filter(function(i){return i.severity==='error';});
    var warnings=issues.filter(function(i){return i.severity==='warning';});
    var infos   =issues.filter(function(i){return i.severity==='info';});

    // Summary strip
    if(sb){
      if(!errors.length&&!warnings.length){
        sb.innerHTML='<span class="vld-ok">✔ No errors or warnings</span>';
        sb.className='vld-summary ok';
      } else if(errors.length){
        sb.innerHTML='<span class="vld-err-count">✖ '+errors.length+' error'+(errors.length!==1?'s':'')+
          '</span><span class="vld-warn-count">  ⚠ '+warnings.length+' warning'+(warnings.length!==1?'s':'')+
          '</span>';
        sb.className='vld-summary has-errors';
      } else {
        sb.innerHTML='<span class="vld-warn-count">⚠ '+warnings.length+' warning'+(warnings.length!==1?'s':'')+
          '</span>';
        sb.className='vld-summary has-warnings';
      }
    }

    var html='';
    [{list:errors,icon:'✖',cls:'err',label:'Errors'},
     {list:warnings,icon:'⚠',cls:'warn',label:'Warnings'},
     {list:infos,icon:'ℹ',cls:'info',label:'Info'}
    ].forEach(function(group){
      if(!group.list.length) return;
      html+='<div class="vld-group-label '+group.cls+'">'+group.icon+' '+group.label+'</div>';
      group.list.forEach(function(issue){
        var chip='';
        if(issue.gateId!==null){
          var gs2=(typeof gates!=='undefined')?gates:[];
          var g2=gs2.find(function(x){return x.id===issue.gateId;});
          chip=g2?'<span class="vld-gate-chip">'+(g2.label||g2.type)+' #'+g2.id+'</span>':'';
        }
        html+='<div class="vld-item '+group.cls+'" data-gid="'+(issue.gateId||'')+'">'+
          '<span class="vld-icon '+group.cls+'">'+group.icon+'</span>'+
          '<div class="vld-text">'+chip+
          '<span class="vld-msg">'+escHtml(issue.msg)+'</span></div></div>';
      });
    });
    wrap.innerHTML=html;

    // Click to select + pan to gate
    wrap.querySelectorAll('.vld-item[data-gid]').forEach(function(el){
      var gid=parseInt(el.getAttribute('data-gid'));
      if(!gid) return;
      el.addEventListener('click',function(){
        var gs2=(typeof gates!=='undefined')?gates:[];
        var g2=gs2.find(function(x){return x.id===gid;});
        if(!g2) return;
        window.selected=gid;
        var mc=document.getElementById('main-canvas');
        if(mc&&typeof view!=='undefined'&&window.GATE_DEFS){
          var def=window.GATE_DEFS[g2.type];
          view.panX=mc.width/2-(g2.x+def.w/2)*view.zoom;
          view.panY=mc.height/2-(g2.y+def.h/2)*view.zoom;
        }
        if(typeof simulate==='function') simulate();
        if(typeof render==='function') render();
        if(typeof updateProps==='function') updateProps();
        wrap.querySelectorAll('.vld-item').forEach(function(e){e.classList.remove('selected');});
        el.classList.add('selected');
      });
    });
  }

  // ================================================================
  //  GATE TRUTH TABLE (shown in bottom half of Truth tab when gate selected)
  // ================================================================
  function runGateTruthTable() {
    var wrap  = document.getElementById('tt-gate-wrap');
    var body  = document.getElementById('tt-gate-body');
    var title = document.getElementById('tt-gate-title');
    if (!wrap || !body) return;

    var sel = (typeof selected !== 'undefined') ? selected : null;
    var gs  = (typeof gates    !== 'undefined') ? gates    : [];
    var g   = sel ? gs.find(function(x){ return x.id === sel; }) : null;

    // Only show for gates that have a meaningful truth table
    var hasTable = g && typeof buildTruthTable === 'function' && buildTruthTable(g.type);
    if (!hasTable) {
      wrap.style.display = 'none';
      return;
    }

    wrap.style.display = 'flex';
    var def = (typeof GATE_DEFS !== 'undefined') ? GATE_DEFS[g.type] : null;
    var lbl = (def ? def.label : g.type) || g.type;
    if (title) title.textContent = lbl + ' — ' + g.type + ' #' + g.id;

    // Build gate truth table HTML
    var rows = buildTruthTable(g.type);
    if (!rows || !rows.length) { body.innerHTML = '<div class="tt-empty">No truth table for this gate.</div>'; return; }

    var n = rows[0].ins.length;
    var m = rows[0].outs.length;

    // Input pin labels per gate type
    var inLabels = {
      'NOT':['A'], 'BUFFER':['A'],
      'AND':['A','B'],'OR':['A','B'],'NAND':['A','B'],'NOR':['A','B'],'XOR':['A','B'],'XNOR':['A','B'],
      'AND3':['A','B','C'],'OR3':['A','B','C'],
      'AND4':['A','B','C','D'],'OR4':['A','B','C','D'],
      'HADD':['A','B'],'FADD':['A','B','Ci'],
      'COMP1':['A','B'],
      'SR_FF':['S','R'],'D_FF':['D','CLK'],'JK_FF':['J','K'],'T_FF':['T','CLK'],
    };
    var outLabels = {
      'HADD':['S','C'],'FADD':['S','Co'],
      'COMP1':['>','=','<'],
      'SR_FF':['Q','Q\''],'D_FF':['Q','Q\''],'JK_FF':['Q','Q\''],'T_FF':['Q','Q\''],
    };
    var iLbls = inLabels[g.type]  || Array.from({length:n},function(_,i){return String.fromCharCode(65+i);});
    var oLbls = outLabels[g.type] || (m===1?['Out']:Array.from({length:m},function(_,i){return 'Y'+i;}));

    // Current live input values for highlight
    var sv = (typeof sigVals !== 'undefined') ? sigVals : {};
    var cs = (typeof connections !== 'undefined') ? connections : [];
    var liveIns = Array.from({length:n}, function(_,i){
      var conn = cs.find(function(c){ return c.toId===g.id && c.toPin===i; });
      return conn ? (sv[conn.fromId]?.[conn.fromPin||0]??0) : 0;
    });
    var liveMask = liveIns.reduce(function(acc,v,i){return acc|(v<<(n-1-i));},0);

    var html = '<table class="tt-tbl"><thead><tr>';
    iLbls.forEach(function(l){ html += '<th>'+escHtml(l)+'</th>'; });
    oLbls.forEach(function(l){ html += '<th class="tt-out">'+escHtml(l)+'</th>'; });
    html += '</tr></thead><tbody>';

    rows.forEach(function(row, mask){
      var isLive = (mask === liveMask);
      html += '<tr class="tt-row '+(isLive?'tt-live tt-row-hi':'')+ '">';
      row.ins.forEach(function(v){  html += '<td class="'+(v?'tt-v1':'tt-v0')+'">'+v+'</td>'; });
      row.outs.forEach(function(v){ html += '<td class="tt-out-v '+(v?'tt-v1':'tt-v0')+'">'+v+'</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table>';
    body.innerHTML = html;
  }

  // ================================================================
  //  TRUTH TABLE ENGINE
  // ================================================================
  var _ttRunning = false;  // re-entrancy guard
  var _ttDebounce = null;  // debounce timer for auto mode

  function runTruthTable(){
    // Prevent re-entrant calls (simulate/render triggering push → runTruthTable again)
    if(_ttRunning) return;
    _ttRunning = true;

    var wrap=document.getElementById('tt-panel-body');
    if(!wrap){ _ttRunning=false; return; }
    var gs=(typeof gates!=='undefined')?gates:[];
    var cs=(typeof connections!=='undefined')?connections:[];

    var inputs =gs.filter(function(g){return g.type==='INPUT';});
    var outputs=gs.filter(function(g){return g.type==='OUTPUT'||g.type==='LED';});

    if(!inputs.length||!outputs.length){
      wrap.innerHTML='<div class="tt-empty">Add INPUT and OUTPUT gates<br>to generate truth table.</div>';
      _ttRunning=false; return;
    }
    if(inputs.length>4){
      wrap.innerHTML='<div class="tt-empty">Too many inputs (max 4)<br>for truth table display.</div>';
      _ttRunning=false; return;
    }

    var n=inputs.length, rows=1<<n;
    // Save current live input values
    var saved=inputs.map(function(g){return g.value;});
    // Which row matches current live state
    var liveRow=saved.reduce(function(acc,v,i){return acc|(v<<(n-1-i));},0);

    var html='<table class="tt-tbl"><thead><tr>';
    html+='<th class="tt-idx">#</th>';
    inputs.forEach(function(g){html+='<th>'+(g.label||'IN')+'</th>';});
    outputs.forEach(function(g){html+='<th class="tt-out">'+(g.label||'OUT')+'</th>';});
    html+='</tr></thead><tbody>';

    for(var mask=0;mask<rows;mask++){
      var inVals=Array.from({length:n},function(_,b){return (mask>>(n-1-b))&1;});
      inputs.forEach(function(g,i){g.value=inVals[i];});
      var sv=(typeof simulateCircuit==='function')?simulateCircuit(gs,cs):{};
      var outVals=outputs.map(function(g){return sv['in_'+g.id]??0;});
      var isLive=(mask===liveRow);
      var allHi=outVals.every(function(v){return v===1;});
      html+='<tr class="tt-row '+(allHi?'tt-row-hi':'tt-row-lo')+(isLive?' tt-live':'')
           +'" data-mask="'+mask+'" style="cursor:pointer" title="Click to apply these inputs">';
      html+='<td class="tt-idx-val">'+(isLive?'▶':mask)+'</td>';
      inVals.forEach(function(v){html+='<td class="'+(v?'tt-v1':'tt-v0')+'">'+v+'</td>';});
      outVals.forEach(function(v){html+='<td class="tt-out-v '+(v?'tt-v1':'tt-v0')+'">'+v+'</td>';});
      html+='</tr>';
    }
    html+='</tbody></table>';
    wrap.innerHTML=html;

    // Restore original input values WITHOUT calling simulate/render
    // (those would trigger push() → runTruthTable() infinite loop)
    inputs.forEach(function(g,i){g.value=saved[i];});

    // Release guard before attaching listeners
    _ttRunning=false;

    // Wire up row clicks — apply input values live to canvas
    wrap.querySelectorAll('tr.tt-row').forEach(function(row){
      row.addEventListener('click',function(){
        var mask=parseInt(row.getAttribute('data-mask'));
        var gs2=(typeof gates!=='undefined')?gates:[];
        var inp=gs2.filter(function(g){return g.type==='INPUT';});
        if(!inp.length) return;
        var nn=inp.length;
        inp.forEach(function(g,i){g.value=(mask>>(nn-1-i))&1;});
        // simulate+render WITHOUT going through push() to avoid loop
        if(typeof simulate==='function') simulate();
        if(typeof render==='function') render();
        if(typeof updateProps==='function') updateProps();
        // Update live indicator only — re-run table directly (guard ensures no loop)
        runTruthTable();
      });
    });
  }

  // ================================================================
  //  INSPECTOR
  // ================================================================
  function renderInspector() {
    var circSec = document.getElementById('insp-circuit-sec');
    var gateSec = document.getElementById('insp-gate-sec');
    var hint    = document.getElementById('insp-hint');
    if (!circSec || !gateSec) return;

    var gs  = (typeof gates       !== 'undefined') ? gates       : [];
    var cs  = (typeof connections !== 'undefined') ? connections : [];
    var sv  = (typeof sigVals     !== 'undefined') ? sigVals     : {};
    var sel = (typeof selected    !== 'undefined') ? selected    : null;

    // ── Circuit Summary ──────────────────────────────────────────
    var cats = {io:0, basic:0, multi:0, ff:0, msi:0};
    var clocks=0, inputs=0, outputs=0;
    gs.forEach(function(g){
      var def = (typeof GATE_DEFS!=='undefined') ? GATE_DEFS[g.type] : null;
      if (def && cats[def.cat] !== undefined) cats[def.cat]++;
      if (g.type==='CLOCK')  clocks++;
      if (g.type==='INPUT')  inputs++;
      if (g.type==='OUTPUT' || g.type==='LED') outputs++;
    });

    var catChips = '';
    var catMeta = {io:'IO',basic:'Gates',multi:'Multi',ff:'FF',msi:'MSI'};
    Object.keys(cats).forEach(function(k){
      if(cats[k]>0) catChips += '<span class="insp-cat-chip '+k+'">'+catMeta[k]+' ×'+cats[k]+'</span>';
    });

    // ── Gates Used breakdown (only logic gates: basic + multi) ──
    var gateTypeCounts = {};
    gs.forEach(function(g) {
      var def = (typeof GATE_DEFS !== 'undefined') ? GATE_DEFS[g.type] : null;
      if (def && (def.cat === 'basic' || def.cat === 'multi')) {
        gateTypeCounts[g.type] = (gateTypeCounts[g.type] || 0) + 1;
      }
    });
    var gateTypeKeys = Object.keys(gateTypeCounts);
    var gatesUsedHTML = '';
    if (gateTypeKeys.length > 0) {
      var gateRows = gateTypeKeys.map(function(type) {
        var def = (typeof GATE_DEFS !== 'undefined') ? GATE_DEFS[type] : null;
        var lbl = def ? def.label : type;
        var inputCount = def ? def.inputs : '?';
        var count = gateTypeCounts[type];
        return '<div class="insp-gate-used-row">'+
          '<span class="insp-gate-used-badge">'+lbl+(inputCount>2?inputCount:'')+'</span>'+
          '<span class="insp-gate-used-name">'+type.replace(/(\d+)$/,' ($1-input)')+'</span>'+
          '<span class="insp-gate-used-count">×'+count+'</span>'+
        '</div>';
      }).join('');
      gatesUsedHTML =
        '<div class="insp-sec" style="margin-top:8px">'+
          '<div class="insp-sec-hdr"><span class="insp-icon">🔲</span>Gates Used</div>'+
          '<div class="insp-gates-used-list">'+gateRows+'</div>'+
        '</div>';
    } else {
      gatesUsedHTML =
        '<div class="insp-sec" style="margin-top:8px">'+
          '<div class="insp-sec-hdr"><span class="insp-icon">🔲</span>Gates Used</div>'+
          '<div class="insp-empty" style="font-size:10px;padding:6px 0">No logic gates placed</div>'+
        '</div>';
    }

    circSec.innerHTML =
      '<div class="insp-sec">'+
        '<div class="insp-sec-hdr"><span class="insp-icon">⚡</span>Circuit Summary</div>'+
        '<div class="insp-stat-grid">'+
          '<div class="insp-stat-cell"><div class="insp-stat-num">'+gs.length+'</div><div class="insp-stat-lbl">COMPONENTS</div></div>'+
          '<div class="insp-stat-cell"><div class="insp-stat-num">'+cs.length+'</div><div class="insp-stat-lbl">WIRES</div></div>'+
          '<div class="insp-stat-cell"><div class="insp-stat-num">'+inputs+'</div><div class="insp-stat-lbl">INPUTS</div></div>'+
          '<div class="insp-stat-cell"><div class="insp-stat-num">'+outputs+'</div><div class="insp-stat-lbl">OUTPUTS</div></div>'+
        '</div>'+
        (catChips ? '<div class="insp-cat-row">'+catChips+'</div>' : '')+
        '<div class="insp-row"><span class="insp-lbl">Clock sources</span><span class="insp-val '+(clocks?'accent':'warn')+'">'+clocks+'</span></div>'+
        '<div class="insp-row"><span class="insp-lbl">Unconnected pins</span><span class="insp-val '+(_countUnconnected(gs,cs)?'warn':'hi')+'">'+_countUnconnected(gs,cs)+'</span></div>'+
      '</div>'+
      gatesUsedHTML;

    // ── Gate Inspector ───────────────────────────────────────────
    if (!sel) {
      if (hint) hint.textContent = 'Click a gate to inspect';
      gateSec.innerHTML = '<div class="insp-empty">↖ Click any gate on the canvas<br>to see its properties here</div>';
      return;
    }
    var g = gs.find(function(x){ return x.id===sel; });
    if (!g) { gateSec.innerHTML=''; return; }
    if (hint) hint.textContent = g.type + ' #' + g.id;

    var def = (typeof GATE_DEFS!=='undefined') ? GATE_DEFS[g.type] : {inputs:0,outputs:0,w:0,h:0,cat:'',label:g.type};
    var outVals = sv[g.id] || [0];

    // Signal value rows
    function sigBadge(v) {
      if (v===1) return '<span class="insp-badge hi">● HIGH</span>';
      if (v===0) return '<span class="insp-badge lo">○ LOW</span>';
      return '<span class="insp-badge nc">— N/C</span>';
    }

    // Input connections
    var inConns = '';
    for (var i=0; i<def.inputs; i++) {
      var conn = cs.find(function(c){ return c.toId===g.id && c.toPin===i; });
      var pinLabels = {
        'INPUT':[], 'CLOCK':[], 'OUTPUT':['In'], 'LED':['In'],
        'BUFFER':['A'], 'NOT':['A'],
        'AND':['A','B'],'OR':['A','B'],'NAND':['A','B'],'NOR':['A','B'],'XOR':['A','B'],'XNOR':['A','B'],
        'AND3':['A','B','C'],'OR3':['A','B','C'],'AND4':['A','B','C','D'],'OR4':['A','B','C','D'],
        'SR_FF':['S','R','CLK'],'D_FF':['D','CLK'],'JK_FF':['J','K','CLK'],'T_FF':['T','CLK'],
        'MUX2':['A','B','S'],'MUX4':['D0','D1','D2','D3','S0','S1'],
        'DEMUX2':['In','S'],'DEC2':['A','B'],'DEC3':['A','B','C'],
        'ENC4':['D0','D1','D2','D3'],'PRIO4':['D0','D1','D2','D3'],
        'BIN2HEX':['B0','B1','B2','B3'],'COMP1':['A','B'],
        'HADD':['A','B'],'FADD':['A','B','Ci'],
      };
      var lbl = (pinLabels[g.type]||[])[i] || ('pin'+i);
      var srcName = '(unconnected)';
      var sigVal  = null;
      if (conn) {
        var srcGate = gs.find(function(x){ return x.id===conn.fromId; });
        srcName = srcGate ? (srcGate.type+(srcGate.label?' "'+srcGate.label+'"':'')+ ' #'+srcGate.id) : ('Gate #'+conn.fromId);
        sigVal = (sv[conn.fromId]||[])[conn.fromPin||0];
        if (sigVal===undefined) sigVal=null;
      }
      inConns +=
        '<div class="insp-conn-item">'+
          '<span style="color:#546e7a;min-width:24px">'+lbl+'</span>'+
          '<span class="insp-conn-arrow">←</span>'+
          '<span style="flex:1">'+escHtml(srcName)+'</span>'+
          (sigVal!==null ? '<span class="insp-conn-val '+(sigVal?'hi':'lo')+'">'+sigVal+'</span>' : '<span class="insp-conn-val" style="color:#3d4a5a">—</span>')+
        '</div>';
    }

    // Output connections
    var outConns = '';
    var outLabels = {
      'SR_FF':['Q','Q\''],'D_FF':['Q','Q\''],'JK_FF':['Q','Q\''],'T_FF':['Q','Q\''],
      'HADD':['S','C'],'FADD':['S','Co'],'COMP1':['>','=','<'],
      'DEMUX2':['Y0','Y1'],'DEC2':['Y0','Y1','Y2','Y3'],
      'ENC4':['A0','A1'],'PRIO4':['A0','A1','GS'],
      'BIN2HEX':['H0','H1','H2','H3'],
    };
    for (var j=0; j<def.outputs; j++) {
      var destConns = cs.filter(function(c){ return c.fromId===g.id && (c.fromPin||0)===j; });
      var oLbl = (outLabels[g.type]||[])[j] || (def.outputs===1?'Out':'Out'+j);
      var ov = (outVals[j]!==undefined) ? outVals[j] : (j===1?1:0);
      outConns +=
        '<div class="insp-conn-item">'+
          '<span style="color:#546e7a;min-width:24px">'+oLbl+'</span>'+
          '<span class="insp-conn-arrow '+(ov?'hi':'lo')+'">'+ov+'</span>'+
          '<span style="flex:1">'+(destConns.length ? destConns.map(function(c){
            var dg=gs.find(function(x){return x.id===c.toId;});
            return dg?(dg.type+(dg.label?' "'+dg.label+'"':'')+'#'+dg.id):'#'+c.toId;
          }).join(', ') : '<span style="color:#3d4a5a">(unconnected)</span>')+'</span>'+
        '</div>';
    }

    // FF state section
    var ffState = '';
    if (['SR_FF','D_FF','JK_FF','T_FF'].includes(g.type)) {
      ffState =
        '<div class="insp-sec">'+
          '<div class="insp-sec-hdr"><span class="insp-icon">⟳</span>Flip-Flop State</div>'+
          '<div class="insp-row"><span class="insp-lbl">Q (stored)</span>'+sigBadge(g.q??0)+'</div>'+
          '<div class="insp-row"><span class="insp-lbl">Q\' (complement)</span>'+sigBadge(g.nq??1)+'</div>'+
          '<div class="insp-row"><span class="insp-lbl">Prev CLK</span><span class="insp-val">'+( g.prevClk??0)+'</span></div>'+
          '<div class="insp-row"><span class="insp-lbl">Trigger edge</span><span class="insp-val '+(g.fallingEdge?'warn':'accent')+'">'+(g.fallingEdge?'Falling ↓':'Rising ↑')+'</span></div>'+
        '</div>';
    }

    // Clock state
    var clkState = '';
    if (g.type==='CLOCK') {
      clkState =
        '<div class="insp-sec">'+
          '<div class="insp-sec-hdr"><span class="insp-icon">⏱</span>Clock State</div>'+
          '<div class="insp-row"><span class="insp-lbl">Current value</span>'+sigBadge(g.clockVal??0)+'</div>'+
        '</div>';
    }

    // INPUT / OUTPUT signal
    var ioState = '';
    if (g.type==='INPUT') {
      ioState =
        '<div class="insp-sec">'+
          '<div class="insp-sec-hdr"><span class="insp-icon">▶</span>Signal</div>'+
          '<div class="insp-row"><span class="insp-lbl">Value</span>'+sigBadge(g.value??0)+'</div>'+
        '</div>';
    }
    if (g.type==='OUTPUT'||g.type==='LED') {
      var iv = sv['in_'+g.id]??0;
      ioState =
        '<div class="insp-sec">'+
          '<div class="insp-sec-hdr"><span class="insp-icon">◀</span>Signal</div>'+
          '<div class="insp-row"><span class="insp-lbl">Received</span>'+sigBadge(iv)+'</div>'+
        '</div>';
    }

    // Main gate info
    gateSec.innerHTML =
      '<div class="insp-sec">'+
        '<div class="insp-sec-hdr"><span class="insp-icon">⬡</span>Gate Properties</div>'+
        '<div class="insp-row"><span class="insp-lbl">Type</span><span class="insp-val accent">'+g.type+'</span></div>'+
        '<div class="insp-row"><span class="insp-lbl">ID</span><span class="insp-val">#'+g.id+'</span></div>'+
        '<div class="insp-row"><span class="insp-lbl">Label</span><span class="insp-val">'+(g.label||'—')+'</span></div>'+
        '<div class="insp-row"><span class="insp-lbl">Category</span><span class="insp-val '+(def.cat||'')+'" style="text-transform:uppercase;letter-spacing:.06em">'+(def.cat||'—')+'</span></div>'+
        '<div class="insp-row"><span class="insp-lbl">Inputs / Outputs</span><span class="insp-val">'+def.inputs+' / '+def.outputs+'</span></div>'+
        '<div class="insp-row"><span class="insp-lbl">Size (w×h)</span><span class="insp-val">'+def.w+'×'+def.h+'</span></div>'+
        '<div class="insp-row"><span class="insp-lbl">Position</span><span class="insp-val">('+Math.round(g.x)+', '+Math.round(g.y)+')</span></div>'+
      '</div>'+
      ioState + clkState + ffState +
      (def.inputs>0 ? '<div class="insp-sec"><div class="insp-sec-hdr"><span class="insp-icon">↙</span>Input Connections</div><div class="insp-conn-list">'+inConns+'</div></div>' : '')+
      (def.outputs>0 ? '<div class="insp-sec"><div class="insp-sec-hdr"><span class="insp-icon">↗</span>Output Connections</div><div class="insp-conn-list">'+outConns+'</div></div>' : '');
  }

  function _countUnconnected(gs, cs) {
    var count = 0;
    gs.forEach(function(g) {
      var def = (typeof GATE_DEFS!=='undefined') ? GATE_DEFS[g.type] : null;
      if (!def) return;
      for (var i=0; i<def.inputs; i++) {
        if (!cs.find(function(c){ return c.toId===g.id && c.toPin===i; })) count++;
      }
    });
    return count;
  }

  function push(){
    if(currentPanel==='validate'){
      var autoChk=document.getElementById('vld-auto-chk');
      if(autoChk&&autoChk.checked) runValidation();
      return;
    }
    if(currentPanel==='truthtable'){
      var ttAuto=document.getElementById('tt-auto-chk');
      if(ttAuto&&ttAuto.checked){
        if(_ttDebounce) clearTimeout(_ttDebounce);
        _ttDebounce=setTimeout(function(){ runTruthTable(); runGateTruthTable(); },300);
      }
      return;
    }
    if(currentPanel==='inspect'){
      renderInspector();
      return;
    }
    // Code mode
    var ed=document.getElementById('cp-editor'); if(!ed) return;
    var code=generate(currentLang);
    if(ed.value===code) return;
    ed.value=code; updateLines();
    var gc=(typeof gates!=='undefined')?gates.length:0;
    var cc=(typeof connections!=='undefined')?connections.length:0;
    setStatus('ok','Synced — '+gc+' gates · '+cc+' wires');
  }

  // ── Apply JSON → canvas ──────────────────────────────────────────
  function applyCode(){
    if(currentLang!=='json'){setStatus('warn','Switch to JSON tab to apply');return;}
    var ed=document.getElementById('cp-editor'); if(!ed) return;
    try{
      var obj=JSON.parse(ed.value);
      if(!Array.isArray(obj.gates))       throw new Error('"gates" must be an array');
      if(!Array.isArray(obj.connections)) throw new Error('"connections" must be an array');
      var defs=(typeof GATE_DEFS!=='undefined')?GATE_DEFS:(window.GATE_DEFS||null);
      obj.gates.forEach(function(g,i){
        if(!g.type)                   throw new Error('gate['+i+'] missing type');
        if(defs&&!defs[g.type])       throw new Error('gate['+i+'] unknown type "'+g.type+'"');
        if(typeof g.x!=='number')     throw new Error('gate['+i+'] x must be number');
        if(typeof g.y!=='number')     throw new Error('gate['+i+'] y must be number');
        if(g.id===undefined)          throw new Error('gate['+i+'] missing id');
      });
      var ids=new Set(obj.gates.map(function(g){return g.id;}));
      obj.connections.forEach(function(c,i){
        if(!ids.has(c.fromId)) throw new Error('connection['+i+'] unknown fromId '+c.fromId);
        if(!ids.has(c.toId))   throw new Error('connection['+i+'] unknown toId '+c.toId);
      });
      if(typeof snapshot==='function') snapshot();
      var prev={};
      if(typeof gates!=='undefined') gates.forEach(function(g){prev[g.id]=g;});
      window.gates=obj.gates.map(function(g){
        var p=prev[g.id]||{};
        return{id:g.id,type:g.type,x:g.x,y:g.y,
          label:g.label||p.label||'',value:g.value!==undefined?g.value:(p.value||0),
          clockVal:p.clockVal||0,q:p.q||0,nq:p.nq!==undefined?p.nq:1,prevClk:p.prevClk||0};
      });
      window.connections=obj.connections.map(function(c){
        return{fromId:c.fromId,fromPin:c.fromPin||0,toId:c.toId,toPin:c.toPin||0};
      });
      if(typeof obj.nextId==='number') window.nextId=obj.nextId;
      window._conns=window.connections;
      if(typeof simulate==='function') simulate();
      if(typeof render==='function') render();
      if(typeof updateProps==='function') updateProps();
      if(typeof renderCircuitTruthTable==='function') renderCircuitTruthTable();
      setStatus('ok','✓ Applied — '+obj.gates.length+' gates · '+obj.connections.length+' wires');
    }catch(err){setStatus('error','✖ '+err.message);}
  }

  function setStatus(type,msg){
    var dot=document.getElementById('cp-dot'),el=document.getElementById('cp-msg');
    if(dot) dot.className=type==='error'?'err':type==='warn'?'warn':'';
    if(el)  el.textContent=msg;
  }
  function updateLines(){
    var ed=document.getElementById('cp-editor'),ln=document.getElementById('cp-line-nums');
    if(!ed||!ln) return;
    var n=ed.value.split('\n').length,t='';
    for(var i=1;i<=n;i++) t+=i+'\n';
    ln.textContent=t; ln.scrollTop=ed.scrollTop;
  }

  // ================================================================
  //  BUILD
  // ================================================================
  function build(){
    // ── Inject styles ──────────────────────────────────────────────
    var s=document.createElement('style');
    s.textContent=`
      #right-panel{width:260px;min-width:180px;max-width:600px;flex-shrink:0;background:#0d1117;
        border-left:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;
        overflow:hidden;font-family:'JetBrains Mono',monospace;position:relative;}

      /* ── Mode switcher bar ── */
      #cp-mode-bar{flex-shrink:0;display:flex;gap:0;background:#060910;
        border-bottom:2px solid rgba(255,255,255,.08);padding:8px 10px 0;}
      .cp-mode-btn{flex:1;padding:7px 8px;font-family:'JetBrains Mono',monospace;
        font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
        background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);
        color:#3d4a5a;cursor:pointer;transition:all .15s;text-align:center;
        border-bottom:none;border-radius:6px 6px 0 0;}
      .cp-mode-btn+.cp-mode-btn{border-left:none;}
      .cp-mode-btn:hover{color:#7d8a9a;background:rgba(255,255,255,.06);}
      .cp-mode-btn.active[data-mode="code"]{background:#0d1117;color:#00d4aa;
        border-color:rgba(0,212,170,.28);box-shadow:0 -2px 0 #00d4aa inset;}
      .cp-mode-btn.active[data-mode="validate"]{background:#0d1117;color:#ffa726;
        border-color:rgba(255,167,38,.28);box-shadow:0 -2px 0 #ffa726 inset;}

      /* ── Code panel ── */
      #cp-header{flex-shrink:0;background:#080b10;border-bottom:1px solid rgba(255,255,255,.07);padding:8px 10px 0;}
      #cp-title-row{display:flex;align-items:center;gap:6px;margin-bottom:7px;}
      #cp-icon{font-size:13px;color:#00d4aa;}
      #cp-title{font-size:11px;font-weight:700;color:#cdd5e0;}
      #cp-badge{font-size:8px;background:rgba(0,212,170,.1);border:1px solid rgba(0,212,170,.25);color:#00d4aa;border-radius:10px;padding:1px 6px;}
      #cp-lang-tabs{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;padding-bottom:0;}
      #cp-lang-tabs::-webkit-scrollbar{display:none;}
      .cp-lang{flex-shrink:0;padding:4px 9px;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:600;
        border:1px solid transparent;border-bottom:none;background:transparent;color:#3d4a5a;
        cursor:pointer;border-radius:4px 4px 0 0;transition:all .13s;letter-spacing:.04em;text-transform:uppercase;}
      .cp-lang:hover{color:#7d8a9a;background:rgba(255,255,255,.04);}
      .cp-lang.active{background:#0d1117;color:#00d4aa;border-color:rgba(255,255,255,.08);border-bottom-color:#0d1117;position:relative;z-index:1;}
      #cp-editor-wrap{flex:1;display:flex;overflow:hidden;min-height:0;}
      #cp-line-nums{width:30px;flex-shrink:0;background:#080b10;border-right:1px solid rgba(255,255,255,.04);
        padding:10px 4px 10px 0;font-size:10px;line-height:1.65;color:#2a3a4a;text-align:right;
        user-select:none;overflow:hidden;scrollbar-width:none;}
      #cp-editor{flex:1;resize:none;outline:none;border:none;background:transparent;color:#cdd5e0;
        font-family:'JetBrains Mono',monospace;font-size:10.5px;line-height:1.65;
        padding:10px 8px;white-space:pre;overflow:auto;tab-size:2;caret-color:#00d4aa;
        scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.06) transparent;}
      #cp-editor::selection{background:rgba(0,212,170,.2);}
      #cp-actions{flex-shrink:0;display:flex;gap:4px;padding:6px 8px;
        background:#080b10;border-top:1px solid rgba(255,255,255,.06);}
      .cpab{flex:1;padding:4px 6px;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:600;
        border-radius:4px;cursor:pointer;border:1px solid rgba(255,255,255,.1);
        background:rgba(255,255,255,.04);color:#7d8a9a;transition:all .12s;letter-spacing:.03em;}
      .cpab:hover{background:rgba(255,255,255,.09);color:#cdd5e0;}
      .cpab.ok{background:rgba(0,212,170,.14);border-color:rgba(0,212,170,.35);color:#00d4aa;}
      .cpab.ok:hover{background:rgba(0,212,170,.24);}
      .cpab:disabled{opacity:.3;cursor:not-allowed;}
      #cp-status{flex-shrink:0;display:flex;align-items:center;gap:6px;padding:4px 10px;
        background:#080b10;border-top:1px solid rgba(255,255,255,.04);font-size:9px;min-height:24px;}
      #cp-dot{width:5px;height:5px;border-radius:50%;background:#00e676;flex-shrink:0;transition:background .2s;}
      #cp-dot.err{background:#ff5252;} #cp-dot.warn{background:#ffa726;}
      #cp-msg{color:#3d4a5a;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      #cp-hint{color:#2a3a4a;flex-shrink:0;}

      /* ── Validator panel ── */
      #vld-panel{flex:1;display:none;flex-direction:column;overflow:hidden;min-height:0;}
      #vld-toolbar{flex-shrink:0;display:flex;align-items:center;gap:8px;
        padding:8px 10px;background:#080b10;border-bottom:1px solid rgba(255,255,255,.06);}
      #vld-run-btn{padding:5px 14px;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;
        background:rgba(255,167,38,.14);border:1px solid rgba(255,167,38,.35);color:#ffa726;
        border-radius:5px;cursor:pointer;letter-spacing:.06em;transition:all .13s;}
      #vld-run-btn:hover{background:rgba(255,167,38,.28);box-shadow:0 0 8px rgba(255,167,38,.2);}
      #vld-auto-label{font-size:9px;color:#3d4a5a;display:flex;align-items:center;gap:5px;
        cursor:pointer;user-select:none;margin-left:auto;}
      #vld-auto-chk{accent-color:#ffa726;width:12px;height:12px;cursor:pointer;}
      #vld-summary{flex-shrink:0;padding:7px 12px;font-size:10px;font-weight:600;
        border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:8px;
        font-family:'JetBrains Mono',monospace;min-height:32px;}
      #vld-summary.ok{background:rgba(0,230,118,.05);color:#00e676;}
      #vld-summary.has-errors{background:rgba(255,82,82,.06);}
      #vld-summary.has-warnings{background:rgba(255,167,38,.05);}
      .vld-ok{color:#00e676;}
      .vld-err-count{color:#ff5252;}
      .vld-warn-count{color:#ffa726;}
      #vld-body{flex:1;overflow-y:auto;padding:6px 6px 12px;
        scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.06) transparent;}
      .vld-group-label{font-size:8px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
        padding:8px 8px 3px;margin-top:4px;}
      .vld-group-label.err{color:#ff5252;}
      .vld-group-label.warn{color:#ffa726;}
      .vld-group-label.info{color:#4a6a8a;}
      .vld-item{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;margin-bottom:4px;
        border-radius:6px;border:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.02);
        cursor:pointer;transition:all .13s;}
      .vld-item:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.13);}
      .vld-item.selected{border-color:rgba(255,167,38,.45);background:rgba(255,167,38,.07);}
      .vld-item.err{border-left:3px solid rgba(255,82,82,.8);}
      .vld-item.warn{border-left:3px solid rgba(255,167,38,.8);}
      .vld-item.info{border-left:3px solid rgba(74,106,138,.8);}
      .vld-icon{font-size:12px;flex-shrink:0;margin-top:1px;line-height:1;}
      .vld-icon.err{color:#ff5252;}
      .vld-icon.warn{color:#ffa726;}
      .vld-icon.info{color:#4a8aaa;}
      .vld-text{display:flex;flex-direction:column;gap:4px;min-width:0;width:100%;}
      .vld-gate-chip{display:inline-block;font-size:8px;font-weight:700;letter-spacing:.05em;
        background:rgba(255,167,38,.12);border:1px solid rgba(255,167,38,.25);
        color:#ffa726;border-radius:4px;padding:1px 6px;margin-bottom:1px;}
      .vld-msg{font-size:10px;color:#7d8a9a;line-height:1.55;word-break:break-word;}

      /* ── Resizer ── */
      #cp-resizer{position:absolute;left:0;top:0;bottom:0;width:4px;cursor:col-resize;z-index:10;transition:background .15s;}
      #cp-resizer:hover{background:rgba(0,212,170,.35);}

      /* ── Light theme ── */
      [data-theme="light"] #right-panel{background:#fff;border-left:1px solid rgba(0,0,0,.1);}
      [data-theme="light"] #cp-mode-bar{background:#f0f2f5;border-bottom:2px solid rgba(0,0,0,.08);}
      [data-theme="light"] .cp-mode-btn{background:rgba(0,0,0,.03);border-color:rgba(0,0,0,.1);color:#8896a8;}
      [data-theme="light"] .cp-mode-btn:hover{background:rgba(0,0,0,.06);color:#4a5568;}
      [data-theme="light"] .cp-mode-btn.active[data-mode="code"]{background:#fff;color:#00a884;border-color:rgba(0,168,132,.3);box-shadow:0 -2px 0 #00a884 inset;}
      [data-theme="light"] .cp-mode-btn.active[data-mode="validate"]{background:#fff;color:#d97706;border-color:rgba(217,119,6,.3);box-shadow:0 -2px 0 #d97706 inset;}
      [data-theme="light"] #cp-header{background:#f5f7fa;border-bottom:1px solid rgba(0,0,0,.08);}
      [data-theme="light"] #cp-title{color:#1a2030;}
      [data-theme="light"] #cp-icon{color:#00a884;}
      [data-theme="light"] #cp-badge{background:rgba(0,168,132,.1);border-color:rgba(0,168,132,.25);color:#00a884;}
      [data-theme="light"] .cp-lang{color:#8896a8;}
      [data-theme="light"] .cp-lang:hover{background:rgba(0,0,0,.04);color:#4a5568;}
      [data-theme="light"] .cp-lang.active{background:#f5f7fa;color:#00a884;border-color:rgba(0,0,0,.1);border-bottom-color:#f5f7fa;}
      [data-theme="light"] #cp-line-nums{background:#eaecf0;border-right:1px solid rgba(0,0,0,.08);color:#8896a8;}
      [data-theme="light"] #cp-editor{color:#1a2030;caret-color:#00a884;}
      [data-theme="light"] #cp-editor-wrap{background:#f5f7fa;}
      [data-theme="light"] #cp-actions{background:#f0f2f5;border-top:1px solid rgba(0,0,0,.08);}
      [data-theme="light"] .cpab{background:rgba(0,0,0,.04);border-color:rgba(0,0,0,.12);color:#4a5568;}
      [data-theme="light"] .cpab:hover{background:rgba(0,0,0,.08);color:#1a2030;}
      [data-theme="light"] .cpab.ok{background:rgba(0,168,132,.12);border-color:rgba(0,168,132,.3);color:#00a884;}
      [data-theme="light"] #cp-status{background:#f0f2f5;border-top:1px solid rgba(0,0,0,.06);}
      [data-theme="light"] #cp-msg{color:#8896a8;}
      [data-theme="light"] #cp-hint{color:#aab4be;}
      [data-theme="light"] #vld-toolbar{background:#f0f2f5;border-bottom:1px solid rgba(0,0,0,.08);}
      [data-theme="light"] #vld-summary.ok{background:rgba(0,168,85,.07);color:#00a050;}
      [data-theme="light"] #vld-summary.has-errors{background:rgba(217,53,53,.06);}
      [data-theme="light"] #vld-summary.has-warnings{background:rgba(217,119,6,.06);}
      [data-theme="light"] .vld-item{background:rgba(0,0,0,.02);border-color:rgba(0,0,0,.07);}
      [data-theme="light"] .vld-item:hover{background:rgba(0,0,0,.05);border-color:rgba(0,0,0,.12);}
      [data-theme="light"] .vld-msg{color:#4a5568;}
    `;
    document.head.appendChild(s);

    var rp=document.getElementById('right-panel'); if(!rp) return;

    // Resizer
    var res=document.createElement('div'); res.id='cp-resizer'; rp.insertBefore(res,rp.firstChild);

    // Mode bar — 3 tabs
    var modeBar=document.createElement('div'); modeBar.id='cp-mode-bar';
    modeBar.innerHTML=
      '<button class="cp-mode-btn active" data-mode="code">⌨ Code</button>'+
      '<button class="cp-mode-btn" data-mode="validate">🛡 Validate</button>'+
      '<button class="cp-mode-btn" data-mode="truthtable">⊞ Truth</button>'+
      '<button class="cp-mode-btn" data-mode="inspect">🔍 Inspect</button>';
    rp.insertBefore(modeBar, res.nextSibling);

    // Validator panel (appended after existing code sections)
    var vldPanel=document.createElement('div'); vldPanel.id='vld-panel';
    vldPanel.innerHTML=
      '<div id="vld-toolbar">'+
        '<button id="vld-run-btn">▶ Run Check</button>'+
        '<label id="vld-auto-label">'+
          '<input type="checkbox" id="vld-auto-chk" checked> Auto-validate'+
        '</label>'+
      '</div>'+
      '<div id="vld-summary" class="ok"><span class="vld-ok">✔ Click Run Check to start</span></div>'+
      '<div id="vld-body"></div>';
    rp.appendChild(vldPanel);

    // Truth Table panel
    var ttPanel=document.createElement('div'); ttPanel.id='tt-panel';
    ttPanel.innerHTML=
      '<div id="tt-toolbar">'+
        '<button id="tt-run-btn">▶ Generate</button>'+
        '<label id="tt-auto-label">'+
          '<input type="checkbox" id="tt-auto-chk" checked> Auto'+
        '</label>'+
        '<span id="tt-info"></span>'+
      '</div>'+
      /* Circuit truth table — always shown */
      '<div id="tt-circuit-wrap">'+
        '<div class="tt-sec-hdr"><span class="tt-sec-icon">⚡</span>Circuit Truth Table</div>'+
        '<div id="tt-panel-body"><div class="tt-empty">Circuit truth table will<br>appear here.</div></div>'+
      '</div>'+
      /* Gate truth table — shown only when a gate is selected */
      '<div id="tt-gate-wrap" style="display:none">'+
        '<div class="tt-sec-hdr tt-sec-hdr-gate">'+
          '<span class="tt-sec-icon">⬡</span>'+
          '<span id="tt-gate-title">Gate Truth Table</span>'+
        '</div>'+
        '<div id="tt-gate-body"></div>'+
      '</div>';
    rp.appendChild(ttPanel);

    // ── Inspect panel ─────────────────────────────────────────────
    var inspPanel = document.createElement('div'); inspPanel.id = 'insp-panel';
    inspPanel.innerHTML =
      '<div id="insp-toolbar">'+
        '<span id="insp-title">🔍 Inspector</span>'+
        '<span id="insp-hint">Click a gate to inspect</span>'+
      '</div>'+
      '<div id="insp-body">'+
        '<div id="insp-circuit-sec"></div>'+
        '<div id="insp-gate-sec"></div>'+
      '</div>';
    rp.appendChild(inspPanel);

    // Inject Inspect CSS
    var inspCSS = document.createElement('style');
    inspCSS.textContent = `
      #insp-panel{flex:1;display:none;flex-direction:column;overflow:hidden;min-height:0;}
      #insp-toolbar{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;
        padding:8px 12px;background:#080b10;border-bottom:1px solid rgba(255,255,255,.06);}
      #insp-title{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;
        color:#00d4aa;letter-spacing:.06em;}
      #insp-hint{font-family:'JetBrains Mono',monospace;font-size:9px;color:#3d4a5a;}
      #insp-body{flex:1;overflow-y:auto;padding:10px 8px;display:flex;flex-direction:column;gap:10px;
        scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.06) transparent;}

      .insp-sec{background:#0d1117;border:1px solid rgba(255,255,255,.07);border-radius:8px;overflow:hidden;}
      .insp-sec-hdr{padding:7px 12px;background:rgba(0,0,0,.3);
        font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;
        color:#546e7a;letter-spacing:.1em;text-transform:uppercase;
        display:flex;align-items:center;gap:6px;}
      .insp-sec-hdr .insp-icon{font-size:11px;}
      .insp-row{display:flex;justify-content:space-between;align-items:center;
        padding:5px 12px;border-top:1px solid rgba(255,255,255,.04);}
      .insp-row:first-of-type{border-top:none;}
      .insp-lbl{font-family:'JetBrains Mono',monospace;font-size:10px;color:#546e7a;}
      .insp-val{font-family:'JetBrains Mono',monospace;font-size:10px;color:#e2e8f0;font-weight:600;}
      .insp-val.hi{color:#00e676;}
      .insp-val.lo{color:#ff5252;}
      .insp-val.accent{color:#00d4aa;}
      .insp-val.warn{color:#ffa726;}
      .insp-val.purple{color:#9c6bff;}

      .insp-badge{display:inline-flex;align-items:center;gap:4px;
        padding:2px 8px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;}
      .insp-badge.hi{background:rgba(0,230,118,.12);color:#00e676;border:1px solid rgba(0,230,118,.25);}
      .insp-badge.lo{background:rgba(255,82,82,.1);color:#ff5252;border:1px solid rgba(255,82,82,.2);}
      .insp-badge.nc{background:rgba(84,110,122,.12);color:#546e7a;border:1px solid rgba(84,110,122,.2);}

      .insp-conn-list{padding:6px 10px;display:flex;flex-direction:column;gap:4px;}
      .insp-conn-item{font-family:'JetBrains Mono',monospace;font-size:9px;
        padding:4px 8px;background:rgba(0,0,0,.25);border-radius:4px;
        color:#7d8a9a;border-left:2px solid rgba(255,255,255,.08);
        display:flex;align-items:center;gap:6px;}
      .insp-conn-item .insp-conn-arrow{color:#00d4aa;font-size:11px;}
      .insp-conn-item .insp-conn-val{margin-left:auto;}
      .insp-conn-item .hi{color:#00e676;font-weight:700;}
      .insp-conn-item .lo{color:#ff5252;font-weight:700;}

      .insp-stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:rgba(255,255,255,.04);}
      .insp-stat-cell{padding:8px 12px;background:#0d1117;display:flex;flex-direction:column;gap:2px;}
      .insp-stat-num{font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:700;color:#00d4aa;}
      .insp-stat-lbl{font-family:'JetBrains Mono',monospace;font-size:9px;color:#546e7a;letter-spacing:.06em;}

      .insp-empty{font-family:'JetBrains Mono',monospace;font-size:10px;color:#3d4a5a;
        text-align:center;padding:32px 12px;line-height:2;}
      .insp-cat-row{display:flex;flex-wrap:wrap;gap:5px;padding:8px 12px;}
      .insp-cat-chip{padding:3px 9px;border-radius:20px;font-family:'JetBrains Mono',monospace;
        font-size:9px;font-weight:700;letter-spacing:.04em;}
      .insp-cat-chip.io   {background:rgba(255,167,38,.1);color:#ffa726;border:1px solid rgba(255,167,38,.2);}
      .insp-cat-chip.basic{background:rgba(107,172,212,.1);color:#6bacd4;border:1px solid rgba(107,172,212,.2);}
      .insp-cat-chip.multi{background:rgba(38,198,218,.1);color:#26c6da;border:1px solid rgba(38,198,218,.2);}
      .insp-cat-chip.ff   {background:rgba(156,107,255,.1);color:#9c6bff;border:1px solid rgba(156,107,255,.2);}
      .insp-cat-chip.msi  {background:rgba(0,230,118,.1); color:#00e676;border:1px solid rgba(0,230,118,.2);}

      .insp-gates-used-list{padding:4px 12px 8px;}
      .insp-gate-used-row{display:flex;align-items:center;gap:8px;padding:4px 0;
        border-top:1px solid rgba(255,255,255,.04);font-family:'JetBrains Mono',monospace;}
      .insp-gate-used-row:first-child{border-top:none;}
      .insp-gate-used-badge{background:rgba(107,172,212,.12);color:#6bacd4;
        border:1px solid rgba(107,172,212,.25);border-radius:4px;
        padding:1px 6px;font-size:9px;font-weight:700;letter-spacing:.04em;min-width:36px;text-align:center;}
      .insp-gate-used-name{flex:1;font-size:10px;color:#546e7a;}
      .insp-gate-used-count{font-size:11px;font-weight:700;color:#00d4aa;}

      /* light theme */
      [data-theme="light"] #insp-panel{background:#fff;}
      [data-theme="light"] #insp-toolbar{background:#f0f2f5;border-bottom-color:rgba(0,0,0,.08);}
      [data-theme="light"] #insp-title{color:#00a884;}
      [data-theme="light"] #insp-hint{color:#8896a8;}
      [data-theme="light"] .insp-sec{background:#f8fafc;border-color:rgba(0,0,0,.08);}
      [data-theme="light"] .insp-sec-hdr{background:rgba(0,0,0,.03);color:#8896a8;}
      [data-theme="light"] .insp-row{border-top-color:rgba(0,0,0,.05);}
      [data-theme="light"] .insp-lbl{color:#8896a8;}
      [data-theme="light"] .insp-val{color:#1a2030;}
      [data-theme="light"] .insp-conn-item{background:rgba(0,0,0,.03);color:#5a6a7a;border-left-color:rgba(0,0,0,.1);}
      [data-theme="light"] .insp-stat-cell{background:#f8fafc;}
      [data-theme="light"] .insp-stat-grid{background:rgba(0,0,0,.06);}
      [data-theme="light"] .insp-stat-num{color:#00a884;}
      [data-theme="light"] .insp-empty{color:#8896a8;}

      /* 4th mode btn */
      .cp-mode-btn.active[data-mode="inspect"]{background:#0d1117;color:#00d4aa;
        border-color:rgba(0,212,170,.28);box-shadow:0 -2px 0 #00d4aa inset;}
      [data-theme="light"] .cp-mode-btn.active[data-mode="inspect"]{background:#fff;color:#00a884;
        border-color:rgba(0,168,132,.3);box-shadow:0 -2px 0 #00a884 inset;}
    `;
    document.head.appendChild(inspCSS);

    // Add truth table CSS to the injected style
    var tts=document.createElement('style');
    tts.textContent=`
      #tt-panel{flex:1;display:none;flex-direction:column;overflow:hidden;min-height:0;}
      #tt-toolbar{flex-shrink:0;display:flex;align-items:center;gap:8px;
        padding:8px 10px;background:#080b10;border-bottom:1px solid rgba(255,255,255,.06);}

      /* Two-section scroll container */
      #tt-circuit-wrap{flex-shrink:0;display:flex;flex-direction:column;max-height:55%;border-bottom:2px solid rgba(255,255,255,.07);}
      #tt-gate-wrap{flex:1;display:flex;flex-direction:column;min-height:0;}

      .tt-sec-hdr{flex-shrink:0;display:flex;align-items:center;gap:7px;
        padding:6px 10px;background:rgba(0,0,0,.35);
        font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;
        color:#546e7a;letter-spacing:.1em;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,.05);}
      .tt-sec-icon{font-size:11px;}
      .tt-sec-hdr-gate{color:#9c6bff;}
      .tt-sec-hdr-gate .tt-sec-icon{color:#9c6bff;}
      #tt-toolbar{flex-shrink:0;display:flex;align-items:center;gap:8px;
        padding:8px 10px;background:#080b10;border-bottom:1px solid rgba(255,255,255,.06);}
      #tt-run-btn{padding:5px 14px;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;
        background:rgba(100,200,255,.14);border:1px solid rgba(100,200,255,.35);color:#40c4ff;
        border-radius:5px;cursor:pointer;letter-spacing:.06em;transition:all .13s;}
      #tt-run-btn:hover{background:rgba(100,200,255,.26);}
      #tt-auto-label{font-size:9px;color:#3d4a5a;display:flex;align-items:center;gap:5px;
        cursor:pointer;user-select:none;}
      #tt-auto-chk{accent-color:#40c4ff;width:12px;height:12px;cursor:pointer;}
      #tt-info{font-size:9px;color:#3d4a5a;margin-left:auto;}
      #tt-panel-body{flex:1;overflow-y:auto;padding:8px 6px;
        scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.06) transparent;}
      #tt-gate-body{flex:1;overflow-y:auto;padding:8px 6px;
        scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.06) transparent;}
      .tt-empty{font-family:'JetBrains Mono',monospace;font-size:10px;color:#3d4a5a;
        text-align:center;padding:24px 12px;line-height:1.9;}
      .tt-tbl{width:100%;border-collapse:collapse;font-family:'JetBrains Mono',monospace;font-size:10px;}
      .tt-tbl th{padding:4px 8px;background:#0a1520;color:#40c4ff;text-align:center;
        border:1px solid rgba(255,255,255,.07);position:sticky;top:0;font-size:9px;letter-spacing:.06em;}
      .tt-tbl th.tt-out{color:#ffa726;}
      .tt-tbl td{padding:3px 8px;text-align:center;border:1px solid rgba(255,255,255,.05);}
      .tt-row{transition:background .1s;}
      .tt-row:hover{background:rgba(255,255,255,.06) !important;filter:brightness(1.15);}
      .tt-row.tt-live{background:rgba(0,212,170,.1) !important;border-left:3px solid #00d4aa;}
      .tt-row.tt-live td{color:#00d4aa;font-weight:700;}
      .tt-row-hi td{background:rgba(0,230,118,.04);}
      .tt-idx{color:#3d4a5a !important;font-size:8px;width:18px;}
      .tt-idx-val{color:#3d4a5a;font-size:9px;text-align:center;}
      .tt-v1{color:#00e676;font-weight:700;}
      .tt-v0{color:#ff5252;}
      .tt-out-v{font-weight:700;}

      /* light theme truth table */
      [data-theme="light"] #tt-panel{background:#fff;}
      [data-theme="light"] #tt-toolbar{background:#f0f2f5;border-bottom:1px solid rgba(0,0,0,.08);}
      [data-theme="light"] #tt-circuit-wrap{border-bottom-color:rgba(0,0,0,.1);}
      [data-theme="light"] .tt-sec-hdr{background:rgba(0,0,0,.03);color:#8896a8;border-bottom-color:rgba(0,0,0,.06);}
      [data-theme="light"] .tt-sec-hdr-gate{color:#7c4ddb;}
      [data-theme="light"] .tt-tbl th{background:#eaecf0;color:#0369a1;border-color:rgba(0,0,0,.1);}
      [data-theme="light"] .tt-tbl th.tt-out{color:#c47000;}
      [data-theme="light"] .tt-tbl td{border-color:rgba(0,0,0,.07);}
      [data-theme="light"] .tt-row-hi td{background:rgba(0,160,80,.05);}
      [data-theme="light"] .tt-v1{color:#00a050;}
      [data-theme="light"] .tt-v0{color:#d93535;}

      /* 3rd mode btn */
      .cp-mode-btn.active[data-mode="truthtable"]{background:#0d1117;color:#40c4ff;
        border-color:rgba(64,196,255,.28);box-shadow:0 -2px 0 #40c4ff inset;}
      [data-theme="light"] .cp-mode-btn.active[data-mode="truthtable"]{background:#fff;color:#0369a1;
        border-color:rgba(3,105,161,.3);box-shadow:0 -2px 0 #0369a1 inset;}
    `;
    document.head.appendChild(tts);

    // ── Panel show/hide ───────────────────────────────────────────
    var cpHeader  = document.getElementById('cp-header');
    var cpEdWrap  = document.getElementById('cp-editor-wrap');
    var cpActions = document.getElementById('cp-actions');
    var cpStatus  = document.getElementById('cp-status');

    function showPanel(mode){
      currentPanel=mode;
      var isCode=(mode==='code');
      var isVld =(mode==='validate');
      var isTT  =(mode==='truthtable');
      var isInsp=(mode==='inspect');
      if(cpHeader)  cpHeader.style.display  = isCode?'':'none';
      if(cpEdWrap)  cpEdWrap.style.display  = isCode?'':'none';
      if(cpActions) cpActions.style.display = isCode?'':'none';
      if(cpStatus)  cpStatus.style.display  = isCode?'':'none';
      vldPanel.style.display  = isVld  ?'flex':'none';
      ttPanel.style.display   = isTT   ?'flex':'none';
      inspPanel.style.display = isInsp ?'flex':'none';
      modeBar.querySelectorAll('.cp-mode-btn').forEach(function(b){
        b.classList.toggle('active', b.getAttribute('data-mode')===mode);
      });
      if(isCode){ push(); }
      else if(isVld){ window._validationErrors={}; if(typeof render==='function')render(); runValidation(); }
      else if(isTT) { runTruthTable(); runGateTruthTable(); }
      else if(isInsp){ renderInspector(); }
    }

    modeBar.querySelectorAll('.cp-mode-btn').forEach(function(btn){
      btn.addEventListener('click',function(){ showPanel(btn.getAttribute('data-mode')); });
    });

    document.getElementById('vld-run-btn').addEventListener('click', runValidation);
    document.getElementById('tt-run-btn').addEventListener('click', runTruthTable);

    // ── Lang tabs ─────────────────────────────────────────────────
    document.querySelectorAll('.cp-lang').forEach(function(btn){
      btn.addEventListener('click',function(){
        document.querySelectorAll('.cp-lang').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active'); currentLang=btn.dataset.lang;
        var ab=document.getElementById('cpab-apply');
        if(ab) ab.disabled=(currentLang!=='json');
        var hint=document.getElementById('cp-hint');
        if(hint) hint.textContent=currentLang==='json'?'Ctrl+Enter to apply':'Read-only';
        push();
      });
    });

    // ── Editor ────────────────────────────────────────────────────
    var ed=document.getElementById('cp-editor');
    if(ed){
      ed.addEventListener('scroll',function(){
        var ln=document.getElementById('cp-line-nums'); if(ln) ln.scrollTop=ed.scrollTop;
      });
      ed.addEventListener('input',function(){
        updateLines();
        if(currentLang==='json') setStatus('warn','Unsaved — Ctrl+Enter to apply');
      });
      ed.addEventListener('keydown',function(e){
        if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();applyCode();}
        if(e.key==='Tab'){
          e.preventDefault();
          var st=ed.selectionStart,en=ed.selectionEnd;
          ed.value=ed.value.slice(0,st)+'  '+ed.value.slice(en);
          ed.selectionStart=ed.selectionEnd=st+2; updateLines();
        }
      });
    }

    // ── Action buttons ────────────────────────────────────────────
    var ab=document.getElementById('cpab-apply'); if(ab) ab.addEventListener('click',applyCode);
    var fb=document.getElementById('cpab-format');
    if(fb) fb.addEventListener('click',function(){
      var ed2=document.getElementById('cp-editor'); if(!ed2) return;
      if(currentLang==='json'){
        try{ed2.value=JSON.stringify(JSON.parse(ed2.value),null,2);updateLines();setStatus('ok','Formatted ✓');}
        catch(e){setStatus('error','Invalid JSON: '+e.message);}
      }
    });
    var cb=document.getElementById('cpab-copy');
    if(cb) cb.addEventListener('click',function(){
      var ed2=document.getElementById('cp-editor'); if(!ed2) return;
      if(navigator.clipboard){
        navigator.clipboard.writeText(ed2.value).then(function(){
          setStatus('ok','Copied ✓'); setTimeout(function(){setStatus('ok','Synced');},2000);
        });
      } else { ed2.select(); document.execCommand('copy'); setStatus('ok','Copied ✓'); }
    });

    // ── Drag resize ───────────────────────────────────────────────
    var dragging=false,startX,startW;
    res.addEventListener('mousedown',function(e){
      dragging=true;startX=e.clientX;startW=rp.offsetWidth;
      document.body.style.cursor='col-resize';document.body.style.userSelect='none';
    });
    document.addEventListener('mousemove',function(e){
      if(!dragging) return;
      rp.style.width=Math.max(200,Math.min(600,startW+(startX-e.clientX)))+'px';
    });
    document.addEventListener('mouseup',function(){
      if(!dragging) return; dragging=false;
      document.body.style.cursor='';document.body.style.userSelect='';
      if(typeof resize==='function') resize();
    });

    push();
  }

  return { build:build, push:push,
    refreshInspector: function(){ if(currentPanel==='inspect') renderInspector(); },
    refreshGateTT:    function(){ if(currentPanel==='truthtable') runGateTruthTable(); }
  };
})();
