/* export.js — PNG / SVG / PDF export for Gateonix
   ====================================================
   No strict mode, no classes, no frameworks.
   Requires: gates.js (GATE_DEFS, getInputPins, getOutputPins,
             evaluateGate, sigColor), app.js globals (gates,
             connections, sigVals, view)
   PDF uses jsPDF loaded from CDN in index.html.
   ==================================================== */

window.LFExport = (function() {

  /* ── helpers ─────────────────────────────────────────────────── */
  function circuitBounds(pad) {
    pad = pad || 40;
    if (!gates.length) return { x:0, y:0, w:400, h:300 };
    var minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    for (var i=0;i<gates.length;i++){
      var g=gates[i], def=GATE_DEFS[g.type];
      minX=Math.min(minX,g.x); minY=Math.min(minY,g.y);
      maxX=Math.max(maxX,g.x+def.w); maxY=Math.max(maxY,g.y+def.h);
    }
    return { x:minX-pad, y:minY-pad, w:maxX-minX+pad*2, h:maxY-minY+pad*2 };
  }

  function download(url, filename) {
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
  }

  function circuitName() {
    return (document.getElementById('save-name') &&
            document.getElementById('save-name').value.trim()) ||
           'circuit';
  }

  /* ══════════════════════════════════════════════════════════════
     PNG EXPORT
     Renders the circuit onto a fresh offscreen canvas at 2x
     resolution for crisp output.
  ══════════════════════════════════════════════════════════════ */
  function exportPNG() {
    var b    = circuitBounds(48);
    var scale= 2;
    var circW = Math.round(b.w * scale);
    var circH = Math.round(b.h * scale);

    /* Build truth table data */
    var ttData = buildExportTruthTable();
    var ttW = 0, ttH = 0, ttPad = 14 * scale;
    var colW = 0, rowH = 16 * scale, headerH = 22 * scale;
    if (ttData) {
      var cols = ttData.inLabels.length + ttData.outLabels.length;
      colW = Math.max(28, Math.round(48 * scale / cols)) * scale;
      ttW  = cols * colW + ttPad * 2;
      ttH  = (ttData.rows.length + 1) * rowH + headerH + ttPad * 2;
    }

    /* Canvas size: circuit + truth table in bottom-right corner */
    var W = Math.max(circW, ttData ? circW : 0);
    var H = circH;
    if (ttData) {
      W = Math.max(circW, ttW + 20 * scale);
      H = circH + ttH + 20 * scale;
    }

    var off  = document.createElement('canvas');
    off.width = W; off.height = H;
    var c = off.getContext('2d');

    /* Background */
    c.fillStyle = '#080b10'; c.fillRect(0, 0, W, H);

    /* Grid */
    c.strokeStyle = 'rgba(255,255,255,0.018)'; c.lineWidth = 1;
    var gs = 20 * scale;
    for (var gx=0; gx<W; gx+=gs){ c.beginPath(); c.moveTo(gx,0); c.lineTo(gx,H); c.stroke(); }
    for (var gy=0; gy<H; gy+=gs){ c.beginPath(); c.moveTo(0,gy); c.lineTo(W,gy); c.stroke(); }

    /* Circuit */
    c.save();
    c.translate(-b.x * scale, -b.y * scale);
    c.scale(scale, scale);
    for (var wi=0; wi<connections.length; wi++) {
      var conn = connections[wi];
      var fg = gateById(conn.fromId), tg = gateById(conn.toId);
      if (!fg || !tg) continue;
      var fp = getOutputPins(fg)[conn.fromPin||0];
      var tp = getInputPins(tg)[conn.toPin||0];
      if (!fp || !tp) continue;
      var fv = (sigVals[fg.id] && sigVals[fg.id][conn.fromPin||0]) || 0;
      drawWire(c, fp.x, fp.y, tp.x, tp.y, fv);
    }
    for (var gi=0; gi<gates.length; gi++) drawGate(c, gates[gi], sigVals, null);
    c.restore();

    /* Truth table panel */
    if (ttData) {
      var tx = W - ttW - 10 * scale;
      var ty = circH + 10 * scale;
      var cols2 = ttData.inLabels.length + ttData.outLabels.length;
      colW = Math.round((ttW - ttPad * 2) / cols2);

      /* Panel background */
      c.fillStyle = 'rgba(13,17,23,0.95)';
      c.strokeStyle = 'rgba(0,212,170,0.4)'; c.lineWidth = 1.5 * scale;
      roundRect(c, tx, ty, ttW, ttH, 6 * scale);
      c.fill(); c.stroke();

      /* Title */
      c.font = 'bold ' + (10*scale) + 'px "JetBrains Mono",monospace';
      c.fillStyle = '#00d4aa'; c.textAlign = 'left'; c.textBaseline = 'top';
      c.fillText('Circuit Truth Table', tx + ttPad, ty + ttPad);

      /* Header row */
      var hy = ty + ttPad + headerH;
      c.fillStyle = 'rgba(255,255,255,0.05)';
      c.fillRect(tx + ttPad, hy - rowH, ttW - ttPad*2, rowH);
      c.font = 'bold ' + (8*scale) + 'px "JetBrains Mono",monospace';
      c.textBaseline = 'middle';
      var allLabels = ttData.inLabels.concat(ttData.outLabels);
      for (var li = 0; li < allLabels.length; li++) {
        c.fillStyle = li < ttData.inLabels.length ? '#ffa726' : '#00e676';
        c.textAlign = 'center';
        c.fillText(allLabels[li], tx + ttPad + li * colW + colW/2, hy - rowH/2);
      }

      /* Data rows */
      c.font = (8*scale) + 'px "JetBrains Mono",monospace';
      for (var ri = 0; ri < ttData.rows.length; ri++) {
        var row = ttData.rows[ri];
        var ry = hy + ri * rowH;
        if (ri % 2 === 0) { c.fillStyle = 'rgba(255,255,255,0.02)'; c.fillRect(tx+ttPad, ry, ttW-ttPad*2, rowH); }
        var allVals = row.inVals.concat(row.outVals);
        for (var vi = 0; vi < allVals.length; vi++) {
          var isOut = vi >= row.inVals.length;
          c.fillStyle = isOut ? (allVals[vi] ? '#00e676' : '#ff4444') : '#7d8a9a';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(allVals[vi], tx + ttPad + vi * colW + colW/2, ry + rowH/2);
        }
      }

      /* Divider between inputs and outputs */
      var divX = tx + ttPad + ttData.inLabels.length * colW;
      c.strokeStyle = 'rgba(0,212,170,0.2)'; c.lineWidth = scale;
      c.beginPath(); c.moveTo(divX, ty + ttPad + headerH - rowH); c.lineTo(divX, ty + ttH - ttPad); c.stroke();
    }

    /* Watermark */
    c.font = 'bold ' + (11*scale) + 'px "JetBrains Mono",monospace';
    c.fillStyle = 'rgba(0,212,170,0.35)';
    c.textAlign = 'right'; c.textBaseline = 'bottom';
    c.fillText('Gateonix', W - 10, H - 8);

    download(off.toDataURL('image/png'), circuitName() + '.png');
    if (typeof setStatus === 'function') setStatus('Exported PNG');
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x+r, y); c.lineTo(x+w-r, y); c.arcTo(x+w,y,x+w,y+r,r);
    c.lineTo(x+w, y+h-r); c.arcTo(x+w,y+h,x+w-r,y+h,r);
    c.lineTo(x+r, y+h); c.arcTo(x,y+h,x,y+h-r,r);
    c.lineTo(x, y+r); c.arcTo(x,y,x+r,y,r);
    c.closePath();
  }

  function buildExportTruthTable() {
    var inputs  = gates.filter(function(g){ return g.type==='INPUT'; });
    var outputs = gates.filter(function(g){ return g.type==='OUTPUT'||g.type==='LED'; });
    if (!inputs.length || !outputs.length || inputs.length > 6) return null;
    var n = inputs.length;
    var saved = inputs.map(function(g){ return g.value; });
    var rows = [];
    for (var mask=0; mask < (1<<n); mask++) {
      var inVals = [];
      for (var b=0; b<n; b++) inVals.push((mask>>(n-1-b))&1);
      inputs.forEach(function(g,i){ g.value=inVals[i]; });
      var sv = simulateCircuit(gates, connections);
      var outVals = outputs.map(function(g){ return sv['in_'+g.id]||0; });
      rows.push({ inVals:inVals, outVals:outVals });
    }
    inputs.forEach(function(g,i){ g.value=saved[i]; });
    simulateCircuit(gates, connections);
    return {
      inLabels:  inputs.map(function(g){ return g.label||'IN'; }),
      outLabels: outputs.map(function(g){ return g.label||'OUT'; }),
      rows: rows
    };
  }

  /* ══════════════════════════════════════════════════════════════
     SVG EXPORT
     Builds SVG markup by re-drawing every wire and gate using
     SVG path equivalents. Produces clean vector output.
  ══════════════════════════════════════════════════════════════ */
  function exportSVG() {
    var b = circuitBounds(48);
    var W = b.w, H = b.h;
    var ox = -b.x, oy = -b.y;   /* offset to make coords positive */

    var lines = [];

    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">');

    /* Background */
    lines.push('<rect width="' + W + '" height="' + H + '" fill="#080b10"/>');

    /* Grid */
    lines.push('<defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">');
    lines.push('<path d="M20 0H0V20" fill="none" stroke="rgba(255,255,255,0.018)" stroke-width="0.5"/>');
    lines.push('</pattern></defs>');
    lines.push('<rect width="' + W + '" height="' + H + '" fill="url(#grid)"/>');

    /* Wires */
    for (var wi=0; wi<connections.length; wi++) {
      var conn = connections[wi];
      var fg = gateById(conn.fromId), tg = gateById(conn.toId);
      if (!fg || !tg) continue;
      var fp = getOutputPins(fg)[conn.fromPin||0];
      var tp = getInputPins(tg)[conn.toPin||0];
      if (!fp || !tp) continue;
      var fv = (sigVals[fg.id] && sigVals[fg.id][conn.fromPin||0]) || 0;
      var col = fv ? '#00e676' : '#ff4444';
      var x1=fp.x+ox, y1=fp.y+oy, x2=tp.x+ox, y2=tp.y+oy;
      var dx = x2-x1;
      var cpx = dx*0.5;
      lines.push('<path d="M'+x1+' '+y1+' C'+(x1+cpx)+' '+y1+','+(x1+cpx)+' '+y2+','+x2+' '+y2+'"' +
        ' fill="none" stroke="'+col+'" stroke-width="2.2" stroke-linecap="round"/>');
    }

    /* Gates */
    for (var gi=0; gi<gates.length; gi++) {
      var g   = gates[gi];
      var def = GATE_DEFS[g.type];
      var gx  = g.x + ox, gy = g.y + oy;
      var gw  = def.w, gh  = def.h;
      var col2 = gateColor(g);
      var outV = (sigVals[g.id] && sigVals[g.id][0]) || 0;

      lines.push('<g>');

      /* Box / circle background */
      if (g.type === 'LED') {
        var cx2=gx+gw/2, cy2=gy+gh/2, r2=gh/2-2;
        lines.push('<circle cx="'+cx2+'" cy="'+cy2+'" r="'+r2+'"' +
          ' fill="'+(outV?'rgba(0,230,118,0.22)':'rgba(255,68,68,0.1)')+'"' +
          ' stroke="'+(outV?'#00e676':'#ff4444')+'" stroke-width="1.5"/>');
        lines.push('<text x="'+cx2+'" y="'+(cy2+1)+'" text-anchor="middle" dominant-baseline="middle"' +
          ' font-family="JetBrains Mono,monospace" font-size="12" font-weight="bold"' +
          ' fill="'+(outV?'#fff':'#555')+'">'+outV+'</text>');
      } else if (['SR_FF','D_FF','JK_FF','T_FF'].includes(g.type)) {
        lines.push(svgRRect(gx,gy,gw,gh,6,col2.fill,col2.stroke,1.5));
        lines.push(svgText(gx+gw/2, gy+gh/2-6, def.label, '#9c6bff', 11, 'bold'));
        lines.push(svgText(gx+gw/2, gy+gh/2+7, 'Q='+(g.q||0), '#555', 9, 'normal'));
      } else if (g.type==='INPUT' || g.type==='CLOCK') {
        var v2 = g.type==='INPUT'?(g.value||0):(g.clockVal||0);
        lines.push(svgRRect(gx,gy,gw,gh,6,
          v2?'rgba(0,230,118,0.12)':'rgba(255,68,68,0.1)',
          v2?'#00e676':'#ff4444', 1.5));
        lines.push(svgText(gx+gw/2,gy+gh/2-7, g.type==='CLOCK'?'CLK':(g.label||'IN'),'#ffa726',9,'500'));
        lines.push(svgText(gx+gw/2,gy+gh/2+7, String(v2), v2?'#00e676':'#ff4444',14,'bold'));
      } else if (g.type==='OUTPUT') {
        var iv2 = sigVals['in_'+g.id]||0;
        lines.push(svgRRect(gx,gy,gw,gh,6,
          iv2?'rgba(0,230,118,0.12)':'rgba(255,68,68,0.08)',
          iv2?'#00e676aa':'#ff4444aa',1.5));
        lines.push(svgText(gx+gw/2,gy+gh/2-7, g.label||'OUT','#ef9a9a',9,'500'));
        lines.push(svgText(gx+gw/2,gy+gh/2+7, String(iv2), iv2?'#00e676':'#ff4444',14,'bold'));
      } else {
        /* Standard gate — grey box with type label */
        lines.push(svgRRect(gx,gy,gw,gh,6,col2.fill,col2.stroke,1.5));
        lines.push(svgText(gx+gw/2,gy+gh/2, def.label, col2.text, 11, 'bold'));
      }

      /* Pin dots */
      var inPins2 = getInputPins(g);
      for (var pi=0; pi<inPins2.length; pi++) {
        var pc = connForPin(g.id, pi);
        var pv2 = pc ? ((sigVals[pc.fromId]&&sigVals[pc.fromId][pc.fromPin||0])||0) : 0;
        lines.push(svgPin(inPins2[pi].x+ox, inPins2[pi].y+oy, pv2));
      }
      var outPins2 = getOutputPins(g);
      for (var po=0; po<outPins2.length; po++) {
        var ov2 = (sigVals[g.id]&&sigVals[g.id][po])||0;
        lines.push(svgPin(outPins2[po].x+ox, outPins2[po].y+oy, ov2));
      }

      lines.push('</g>');
    }

    /* Watermark */
    lines.push('<text x="'+(W-8)+'" y="'+(H-8)+'" text-anchor="end"' +
      ' font-family="JetBrains Mono,monospace" font-size="10" fill="rgba(0,212,170,0.35)">Gateonix</text>');

    lines.push('</svg>');

    var blob = new Blob([lines.join('\n')], {type:'image/svg+xml'});
    download(URL.createObjectURL(blob), circuitName()+'.svg');
    if (typeof setStatus === 'function') setStatus('Exported SVG');
  }

  /* ── SVG helpers ─────────────────────────────────────────────── */
  function svgRRect(x,y,w,h,r,fill,stroke,sw) {
    return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'"' +
      ' fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
  }
  function svgText(x,y,text,fill,size,weight) {
    return '<text x="'+x+'" y="'+y+'" text-anchor="middle" dominant-baseline="middle"' +
      ' font-family="JetBrains Mono,monospace" font-size="'+size+'"' +
      ' font-weight="'+weight+'" fill="'+fill+'">'+escXml(String(text))+'</text>';
  }
  function svgPin(x,y,val) {
    var fill = val?'rgba(0,230,118,0.2)':'rgba(255,68,68,0.18)';
    var stroke = val?'#00e676':'#ff4444';
    return '<circle cx="'+x+'" cy="'+y+'" r="5" fill="'+fill+'" stroke="'+stroke+'" stroke-width="1.5"/>';
  }
  function escXml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ══════════════════════════════════════════════════════════════
     PDF EXPORT
     Renders to PNG first, then embeds in a PDF page using jsPDF.
     jsPDF is loaded from CDN in index.html.
  ══════════════════════════════════════════════════════════════ */
  function exportPDF() {
    /* jsPDF must be loaded */
    if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
      setStatus('Loading PDF library…');
      var scr = document.createElement('script');
      scr.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      scr.onload  = function() { renderPDF(); };
      scr.onerror = function() { alert('Could not load PDF library. Check your internet connection.'); };
      document.head.appendChild(scr);
    } else {
      renderPDF();
    }
  }

  function renderPDF() {
    var jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDF) { alert('PDF library not available.'); return; }

    var b     = circuitBounds(48);
    var scale = 2;
    var W     = Math.round(b.w * scale);
    var H     = Math.round(b.h * scale);

    /* Render to offscreen canvas same as PNG */
    var off = document.createElement('canvas');
    off.width = W; off.height = H;
    var c = off.getContext('2d');

    c.fillStyle = '#080b10'; c.fillRect(0,0,W,H);
    c.strokeStyle='rgba(255,255,255,0.018)'; c.lineWidth=1;
    var gs=20*scale;
    for(var gx2=0;gx2<W;gx2+=gs){c.beginPath();c.moveTo(gx2,0);c.lineTo(gx2,H);c.stroke();}
    for(var gy2=0;gy2<H;gy2+=gs){c.beginPath();c.moveTo(0,gy2);c.lineTo(W,gy2);c.stroke();}

    c.save();
    c.translate(-b.x*scale, -b.y*scale);
    c.scale(scale, scale);
    for(var wi=0;wi<connections.length;wi++){
      var conn=connections[wi];
      var fg=gateById(conn.fromId),tg=gateById(conn.toId);
      if(!fg||!tg) continue;
      var fp=getOutputPins(fg)[conn.fromPin||0],tp=getInputPins(tg)[conn.toPin||0];
      if(!fp||!tp) continue;
      var fv=(sigVals[fg.id]&&sigVals[fg.id][conn.fromPin||0])||0;
      drawWire(c,fp.x,fp.y,tp.x,tp.y,fv);
    }
    for(var gi=0;gi<gates.length;gi++) drawGate(c,gates[gi],sigVals,null);
    c.restore();

    /* Watermark */
    c.font='bold 11px "JetBrains Mono",monospace';
    c.fillStyle='rgba(0,212,170,0.35)';
    c.textAlign='right'; c.textBaseline='bottom';
    c.fillText('Gateonix',W-10,H-8);

    var imgData = off.toDataURL('image/png');

    /* Page size: A4 landscape if wide, portrait if tall */
    var mmW = b.w * 0.264583;   /* px → mm at 96dpi */
    var mmH = b.h * 0.264583;
    var margin = 14;             /* mm */
    var pageW = mmW + margin*2;
    var pageH = mmH + margin*2 + 18; /* 18mm for header */

    var doc = new jsPDF({
      orientation: pageW > pageH ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [pageW, pageH]
    });

    /* Header bar */
    doc.setFillColor(13, 17, 23);
    doc.rect(0, 0, pageW, 14, 'F');

    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 212, 170);
    doc.text('Gateonix — ' + circuitName(), margin, 9);

    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    doc.setTextColor(61, 74, 90);
    doc.text(new Date().toLocaleString(), pageW - margin, 9, {align:'right'});

    /* Circuit image */
    doc.addImage(imgData, 'PNG', margin, 16, mmW, mmH);

    /* Footer */
    doc.setFontSize(7);
    doc.setTextColor(61, 74, 90);
    doc.text(gates.length + ' gates · ' + connections.length + ' wires',
             margin, pageH - 4);

    doc.save(circuitName() + '.pdf');
    if (typeof setStatus === 'function') setStatus('Exported PDF');
  }

  /* ── Shared utils ────────────────────────────────────────────── */
  function gateById(id) {
    for (var i=0;i<gates.length;i++) if (gates[i].id===id) return gates[i];
    return null;
  }
  function connForPin(toId, toPin) {
    for (var i=0;i<connections.length;i++)
      if (connections[i].toId===toId && connections[i].toPin===toPin) return connections[i];
    return null;
  }
  function gateColor(g) {
    var def = GATE_DEFS[g.type];
    var CAT_COLORS_LOCAL = {
      basic: { stroke:'#2a3d5a', fill:'#111827', text:'#6bacd4' },
      io:    { stroke:'#5a3a10', fill:'#1a1208', text:'#ffa726' },
      multi: { stroke:'#0f3a40', fill:'#081418', text:'#26c6da' },
      ff:    { stroke:'#3a2060', fill:'#120d20', text:'#9c6bff' },
    };
    return CAT_COLORS_LOCAL[def.cat] || CAT_COLORS_LOCAL.basic;
  }

  /* ══════════════════════════════════════════════════════════════
     EXPORT MODAL UI
  ══════════════════════════════════════════════════════════════ */
  function buildModal() {
    var s = document.createElement('style');
    s.textContent =
      '#exp-modal{display:none;position:fixed;inset:0;z-index:3000;' +
        'background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);' +
        'align-items:center;justify-content:center}' +
      '#exp-modal.open{display:flex}' +
      '#exp-box{background:#0d1117;border:1px solid rgba(255,255,255,0.12);' +
        'border-radius:12px;padding:24px;width:340px;max-width:95vw;' +
        'box-shadow:0 24px 64px rgba(0,0,0,0.7)}' +
      '#exp-box h3{font:700 14px "Syne",sans-serif;color:#cdd5e0;margin-bottom:6px}' +
      '#exp-box p{font:400 10px "JetBrains Mono",monospace;color:#3d4a5a;' +
        'margin-bottom:18px;line-height:1.7}' +
      '.exp-btn{width:100%;padding:11px;margin-bottom:9px;border-radius:7px;' +
        'cursor:pointer;font:600 12px "Syne",sans-serif;border:1px solid;' +
        'transition:all .13s;text-align:left;display:flex;align-items:center;gap:10px}' +
      '.exp-png{background:rgba(0,230,118,0.07);border-color:rgba(0,230,118,0.3);color:#00e676}' +
      '.exp-png:hover{background:rgba(0,230,118,0.14)}' +
      '.exp-svg{background:rgba(38,198,218,0.07);border-color:rgba(38,198,218,0.3);color:#26c6da}' +
      '.exp-svg:hover{background:rgba(38,198,218,0.14)}' +
      '.exp-pdf{background:rgba(255,82,82,0.07);border-color:rgba(255,82,82,0.3);color:#ff5252}' +
      '.exp-pdf:hover{background:rgba(255,82,82,0.14)}' +
      '.exp-sub{font:400 10px "JetBrains Mono",monospace;color:#3d4a5a;margin-left:auto;font-weight:400}' +
      '#exp-cancel{width:100%;padding:8px;margin-top:4px;border-radius:6px;' +
        'cursor:pointer;font:500 11px "JetBrains Mono",monospace;' +
        'background:#161b23;border:1px solid rgba(255,255,255,0.1);color:#7d8a9a}' +
      '#exp-cancel:hover{color:#cdd5e0;background:#1c2333}';
    document.head.appendChild(s);

    var m = document.createElement('div');
    m.id = 'exp-modal';
    m.innerHTML =
      '<div id="exp-box">' +
        '<h3>📤 Export Circuit</h3>' +
        '<p>Choose a format to export your circuit diagram.</p>' +
        '<button class="exp-btn exp-png" id="exp-png">'+
          '<span>🖼</span><span>PNG Image</span>'+
          '<span class="exp-sub">High-res · transparent grid</span></button>' +
        '<button class="exp-btn exp-svg" id="exp-svg">'+
          '<span>✦</span><span>SVG Vector</span>'+
          '<span class="exp-sub">Scalable · edit in Illustrator</span></button>' +
        '<button class="exp-btn exp-pdf" id="exp-pdf">'+
          '<span>📄</span><span>PDF Document</span>'+
          '<span class="exp-sub">Print-ready · with metadata</span></button>' +
        '<button id="exp-cancel">Cancel</button>' +
      '</div>';
    document.body.appendChild(m);

    document.getElementById('exp-png').onclick    = function(){ closeModal(); exportPNG(); };
    document.getElementById('exp-svg').onclick    = function(){ closeModal(); exportSVG(); };
    document.getElementById('exp-pdf').onclick    = function(){ closeModal(); exportPDF(); };
    document.getElementById('exp-cancel').onclick = closeModal;
    m.onclick = function(e){ if(e.target===m) closeModal(); };
  }

  function openModal()  { document.getElementById('exp-modal').classList.add('open'); }
  function closeModal() { document.getElementById('exp-modal').classList.remove('open'); }

  function init() {
    buildModal();
    /* Wire up the toolbar button */
    var btn = document.getElementById('btn-export-img');
    if (btn) btn.onclick = openModal;
  }

  return { init:init, png:exportPNG, svg:exportSVG, pdf:exportPDF };

})();
