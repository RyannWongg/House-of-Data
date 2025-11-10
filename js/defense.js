// js/defense.js — Dual-layer RADAR (Totals vs Per-Game) + position colors
export async function renderDefense(sel = {}) {
  const TAB_ID = '#tab-defense';
  const container = d3.select(sel.root || TAB_ID);
  if (container.empty()) return;

  // shared tooltip for Defense tab
    let tip = d3.select('#defense-tooltip');
    if (tip.empty()) {
    tip = d3.select('body').append('div')
        .attr('id', 'defense-tooltip')
        .attr('class', 'tooltip')         // uses your existing .tooltip CSS
        .style('opacity', 0);
    }


  // --- Controls (after <h3>) ---
  let controls = d3.select('#defense-controls');
  if (controls.empty()) {
    const el = document.createElement('section');
    el.id = 'defense-controls';
    el.className = 'controls';
    el.innerHTML = `
      <label>Season:
        <select id="defenseSeasonSelect"></select>
      </label>
    `;
    const tabNode = d3.select(TAB_ID).node();
    const header  = d3.select(TAB_ID).select('h3').node();
    (header && header.parentNode === tabNode)
      ? header.parentNode.insertBefore(el, header.nextSibling)
      : tabNode.appendChild(el);
  }
  const seasonSel = d3.select('#defenseSeasonSelect');

  // --- Grid (layout via CSS; e.g., #defense-grid { grid-template-columns: 1fr; }) ---
  let grid = d3.select('#defense-grid');
  if (grid.empty()) {
    grid = container.append('div').attr('id', 'defense-grid')
      .style('display', 'grid').style('gap', '16px');
  }

  // --- Load CSVs named 2005-2006.csv ... 2024-2025.csv ---
  const PATH = 'data/';
  const startY = 2005, endY = 2025;
  const files = d3.range(startY, endY).map(y => ({
    label: `${y}-${y+1}`, file: `${PATH}${y}-${y+1}.csv`
  }));

  if (!renderDefense._seasonCache) {
    const seasons = [];
    for (const f of files) {
      try {
        const rows = await d3.csv(f.file, coerceRow);
        if (rows?.length) seasons.push({ season: f.label, rows });
      } catch {}
    }
    renderDefense._seasonCache = seasons;
  }
  const seasons = renderDefense._seasonCache || [];
  if (!seasons.length) {
    grid.html('').append('div').attr('class','error')
      .text('No season CSVs found in /data (expected names like 2005-2006.csv).');
    return;
  }

  // Populate dropdown once
  if (seasonSel.selectAll('option').empty()) {
    seasonSel.selectAll('option').data(seasons.map(d => d.season))
      .join('option').attr('value', d => d).text(d => d);
    seasonSel.property('value', seasons[seasons.length - 1].season);
  }

    function renderSeason(seasonLabel) {
    grid.selectAll('*').remove();

    const table = seasons.find(s => s.season === seasonLabel);
    if (!table) return;

    const agg = aggregateByPosition(table.rows);

    console.group(`Defense totals — ${seasonLabel}`);
    ['PG','SG','SF','PF','C'].forEach(pos => {
        const a = agg[pos] || { STL:0, BLK:0, DRB:0, G:0 };
        console.log(`${pos}:`, `STL=${fmt(a.STL)}`, `BLK=${fmt(a.BLK)}`, `DRB=${fmt(a.DRB)}`, `(G=${fmt(a.G)})`);
    });
    console.groupEnd();

    const POS = ['PG','SG','SF','PF','C'];
    const yMax = (d3.max(POS, p => {
        const a = agg[p] || { STL:0, BLK:0, DRB:0, ORB:0 };
        return Math.max(a.STL, a.BLK, a.DRB, a.ORB);
    }) || 1) * 1.08;

    const POS_COLORS = {
        PG: '#8ab4f8', // blue
        SG: '#a78bfa', // violet
        SF: '#34d399', // green
        PF: '#fbbf24', // amber
        C:  '#f87171'  // red
    };

    POS.forEach(pos => {
        const totals = agg[pos] || { STL:0, BLK:0, DRB:0 };
        drawRadarPanel({
        gridSel: grid,
        posLabel: pos,
        totals,
        yMax,
        color: POS_COLORS[pos]
        });
    });
    }


  renderSeason(seasonSel.property('value'));
  seasonSel.on('change.defense', () => renderSeason(seasonSel.property('value')));

  // ========= Helpers =========
  function fmt(v){ if(!Number.isFinite(v)) return '0'; return (Math.abs(v)%1)? v.toFixed(1): v.toFixed(0); }
  function coerceRow(d){
    ['STL','BLK','DRB','G','GS','MP','FG','FGA','3P','3PA','FT','FTA','PTS','TRB','ORB','DRB']
      .forEach(k => { if (k in d && d[k] !== '') d[k] = +d[k]; });
    return d;
  }
    function aggregateByPosition(rows){
    // CSV has per-game stats; convert to season totals via stat_per_game * G
    const res = { PG:init(), SG:init(), SF:init(), PF:init(), C:init() };
    for (const r of rows) {
        const pos = normalizePos(r.Pos);
        if (!pos) continue;

        const stl = num(r.STL);
        const blk = num(r.BLK);
        const drb = num(r.DRB);
        const orb = num(r.ORB);

        res[pos].STL += stl;
        res[pos].BLK += blk;
        res[pos].DRB += drb;
        res[pos].DRB += orb;
    }
    return res;
    }
  function init(){ return { STL:0, BLK:0, DRB:0, ORB:0, G:0 }; }
  function num(v){ const n = +v; return Number.isFinite(n)? n: 0; }
  function normalizePos(p){
    if (!p) return null;
    const s = String(p).toUpperCase();
    if (s.includes('PG')) return 'PG';
    if (s.includes('SG')) return 'SG';
    if (s.includes('SF')) return 'SF';
    if (s.includes('PF')) return 'PF';
    if (s.includes('C'))  return 'C';
    if (s === 'G') return 'SG';
    if (s === 'F') return 'SF';
    return null;
  }

  // ========= Radar drawing (dual-layer) =========
  function drawRadarPanel({ gridSel, posLabel, totals, yMax, color }) {
    const axes = ['STL','BLK','DRB','ORB'];

    const card = gridSel.append('div')
        .style('background', '#141414').style('border', '1px solid #222')
        .style('border-radius', '10px').style('padding', '10px')
        .style('box-shadow', '0 2px 10px rgba(0,0,0,.6)');

    card.append('div')
        .text(`${posLabel} — Per Game Totals`)
        .style('font-weight','700')
        .style('margin-bottom','6px');

    const svg = card.append('svg').attr('width','100%').attr('height', 260);
    const bounds = svg.node().getBoundingClientRect();
    const W = Math.max(260, bounds.width), H = 260;
    const cx = W/2, cy = H/2 + 8;
    const R  = Math.min(W,H)/2 - 28;
    const MIN_R = 8;

    const angle = i => (Math.PI*2*i/axes.length) - Math.PI/2; // start at 12 o’clock
    const r = d3.scaleLinear()
        .domain([0, yMax])
        .nice()
        .range([0, R]);

    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);

    // Rings
    const ringTicks = r.ticks(4).filter(d => d > 0);

    g.selectAll('circle.ring').data(ringTicks).join('circle')
    .attr('class','ring')
    .attr('r', d => r(d))
    .attr('fill','none')
    .attr('stroke','#2a2a2a');

    // ---- Curved ring labels (textPath along a short inner arc) ----

    // tiny helper to build a short arc path centered on the right side (0°)
    function arcPath(radius, a0Deg = -28, a1Deg = 28) {
    const a0 = (a0Deg - 90) * Math.PI / 180; // our chart starts at -90° (12 o'clock)
    const a1 = (a1Deg - 90) * Math.PI / 180;
    const x0 = Math.cos(a0) * radius, y0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius, y1 = Math.sin(a1) * radius;
    const largeArc = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    const sweep = 1;
    return `M ${x0} ${y0} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${x1} ${y1}`;
    }

    // Unique suffix per panel so ids don’t clash
    const uid = `${posLabel}-${Math.random().toString(36).slice(2,7)}`;

    // Define arc paths per ring (slightly inside each ring so text sits “inside”)
    const defs = g.append('defs');
    const ringIds = [];
    ringTicks.forEach((t, i) => {
    const radius = r(t) - 3;                 // nudge inward
    const id = `ringPath-${uid}-${i}`;
    ringIds.push({ id, t });
    defs.append('path')
        .attr('id', id)
        .attr('d', arcPath(radius))            // short arc around the right side
        .attr('fill', 'none')
        .attr('stroke', 'none');
    });

    // Draw curved labels following each ring
    g.append('g')
    .attr('class', 'ring-labels')
    .selectAll('text')
    .data(ringIds)
    .join('text')
        .attr('font-size', 10)
        .attr('fill', '#9a9a9a')
        .style('pointer-events', 'none')
    .append('textPath')
        .attr('href', d => `#${d.id}`)
        .attr('startOffset', '50%')            // center text on the arc
        .attr('text-anchor', 'middle')
        .text(d => fmt(d.t));

    // Spokes + axis labels
    const axisG = g.append('g');
    axes.forEach((k,i)=>{
        const a = angle(i), x2 = Math.cos(a)*R, y2 = Math.sin(a)*R;
        axisG.append('line').attr('x1',0).attr('y1',0).attr('x2',x2).attr('y2',y2).attr('stroke','#2f2f2f');
        axisG.append('text')
        .attr('x', Math.cos(a)*(R+12))
        .attr('y', Math.sin(a)*(R+12) + 4)
        .attr('text-anchor', anchorForAngle(a))
        .attr('font-size', 12)
        .attr('fill', '#c8c8c8')
        .text(k);
    });

    // Totals values and points
    const totalsVals = axes.map(k => Math.max(0, +totals[k] || 0));
    const totalsPts  = totalsVals.map((v,i)=>polarPoint(angle(i), r(v)));

    // Polygon (no pointer events)
    const totalsPath = g.append('path')
        .attr('d', toPath(totalsPts))
        .attr('fill', color).attr('fill-opacity', .28)
        .attr('stroke', color).attr('stroke-width', 2)
        .style('pointer-events', 'none')
        .style('filter', 'drop-shadow(0 0 3px rgba(255,255,255,.08))')
        .attr('opacity', 0).attr('transform', 'scale(0.94)')
        .transition().duration(350).attr('opacity',1).attr('transform','scale(1)')
        .selection();

    // Shared tooltip (create once in renderDefense; using existing .tooltip CSS)
    let tip = d3.select('#defense-tooltip');
    if (tip.empty()) {
        tip = d3.select('body').append('div')
        .attr('id', 'defense-tooltip')
        .attr('class', 'tooltip')
        .style('opacity', 0);
    }

    // Dots with tooltip on hover
    g.selectAll('circle.totPt').data(totalsPts.map((p,i)=>({
        k: axes[i], v: totalsVals[i], p
    }))).join('circle')
        .attr('class','totPt')
        .attr('r', 3.6)
        .attr('cx', d=>d.p[0])
        .attr('cy', d=>d.p[1])
        .attr('fill', color)
        .style('cursor','pointer')
        .on('mouseenter', function() {
        totalsPath.attr('stroke-width', 3);
        tip.style('opacity', 1);
        })
        .on('mousemove', function(ev, d) {
        tip
            .style('left', `${ev.pageX + 12}px`)
            .style('top',  `${ev.pageY + 12}px`)
            .html(`
            <b>${posLabel}</b> — <span style="opacity:.85">${d.k}</span><br/>
            <div style="display:flex;gap:12px;margin-top:4px;">
                <span>
                <span style="display:inline-block;width:10px;height:10px;border:1px solid ${color};background:${color};opacity:.28;margin-right:6px;border-radius:2px;"></span>
                Total: ${fmt(d.v)}
                </span>
            </div>
            `);
        })
        .on('mouseleave', function() {
        totalsPath.attr('stroke-width', 2);
        tip.style('opacity', 0);
        });

    // helpers
    function polarPoint(a, rr){ return [Math.cos(a)*rr, Math.sin(a)*rr]; }
    function toPath(points){ return points.length ? `M ${points.map(p=>p.join(',')).join(' L ')} Z` : ''; }
    function anchorForAngle(a){
        const deg = a*180/Math.PI;
        if (deg > -60 && deg < 60) return 'start';
        if (deg > 120 || deg < -120) return 'end';
        return 'middle';
    }
}


}
