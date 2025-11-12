export async function renderDefense(sel = {}) {
  const TAB_ID = '#tab-defense';
  const container = d3.select(sel.root || TAB_ID);
  if (container.empty()) return;


    let tip = d3.select('#defense-tooltip');
    if (tip.empty()) {
    tip = d3.select('body').append('div')
        .attr('id', 'defense-tooltip')
        .attr('class', 'tooltip')
        .style('opacity', 0);
    }


    let grid = d3.select('#defense-grid');
    if (grid.empty()) {
    const placeholder = d3.select('#futureViz2');
    if (!placeholder.empty()) {
        placeholder.selectAll('*').remove();
        grid = placeholder
        .attr('id', 'defense-grid')
        .classed('placeholder-section', false);
    } else {
        grid = container.append('div').attr('id', 'defense-grid');
    }
    }

    grid
    .style('display', 'grid')
    .style('grid-template-columns', 'repeat(2, minmax(500px, 1fr))')
    .style('gap', '16px')
    .style('margin-top', '0px');


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


  function renderOverlay() {
  grid.selectAll('*').remove();

  // pick the two seasons to compare
  const desiredA = '2005-2006';
  const desiredB = '2024-2025';
  const seasonA = seasons.find(s => s.season === desiredA) || seasons[0];
  const seasonB = seasons.find(s => s.season === desiredB) || seasons[seasons.length - 1];

  if (!seasonA || !seasonB) {
    grid.html('').append('div').attr('class','error')
    .text('Required seasons not found.');
    return;
  }

  const aggA = aggregateByPosition(seasonA.rows);
  const aggB = aggregateByPosition(seasonB.rows);

  const POS = ['PG','SG','SF','PF','C'];
  const axes = ['STL','BLK','DRB'];

  // compute per-axis max
  const axisMax = {};
  axes.forEach(k => {
    axisMax[k] = Math.max(1, d3.max(POS, p => Math.max((aggA[p] && +aggA[p][k]) || 0, (aggB[p] && +aggB[p][k]) || 0)));
  });

  const COLORS = { a: '#6ea8fe', b: '#fb7185' };

  POS.forEach(pos => {
    const totalsA = aggA[pos] || { STL:0, BLK:0, DRB:0 };
    const totalsB = aggB[pos] || { STL:0, BLK:0, DRB:0 };
    drawRadarPanelOverlay({
    gridSel: grid,
    posLabel: pos,
    totalsA,
    totalsB,
    axisMax,
    seasonALabel: seasonA.season,
    seasonBLabel: seasonB.season,
    colorA: COLORS.a,
    colorB: COLORS.b
    });
  });
  }

  renderOverlay();


  function fmt(v){ if(!Number.isFinite(v)) return '0'; return (Math.abs(v)%1)? v.toFixed(1): v.toFixed(0); }
  function coerceRow(d){
    ['STL','BLK','DRB','G','GS','MP','FG','FGA','3P','3PA','FT','FTA','PTS','TRB','ORB','DRB']
      .forEach(k => { if (k in d && d[k] !== '') d[k] = +d[k]; });
    return d;
  }
    function aggregateByPosition(rows){
    const res = { PG:init(), SG:init(), SF:init(), PF:init(), C:init() };
    for (const r of rows) {
        const pos = normalizePos(r.Pos);
        if (!pos) continue;

        const stl = num(r.STL);
        const blk = num(r.BLK);
        const drb = num(r.DRB);

        res[pos].STL += stl;
        res[pos].BLK += blk;
        res[pos].DRB += drb;
    }
    return res;
    }
  function init(){ return { STL:0, BLK:0, DRB:0, G:0 }; }
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


  function drawRadarPanelOverlay({ gridSel, posLabel, totalsA, totalsB, axisMax, seasonALabel, seasonBLabel, colorA, colorB }) {
    const axes = ['STL','BLK','DRB'];

    const card = gridSel.append('div')
      .style('background', '#141414').style('border', '1px solid #222')
      .style('border-radius', '10px').style('padding', '10px')
      .style('box-shadow', '0 2px 10px rgba(0,0,0,.6)');

    // header + small legend
    const header = card.append('div').style('display','flex').style('align-items','center').style('justify-content','space-between');
    header.append('div')
      .text(`${posLabel} — ${seasonALabel} vs ${seasonBLabel}`)
      .style('font-weight','700')
      .style('margin-bottom','6px');

    const legend = header.append('div').style('display','flex').style('gap','8px').style('align-items','center');
    const makeLegend = (col, label) => {
      const g = legend.append('div').style('display','flex').style('align-items','center').style('gap','6px');
      g.append('div').style('width','12px').style('height','12px').style('background',col).style('opacity',.78).style('border-radius','2px');
      g.append('div').text(label).style('font-size','12px').style('color','#bdbdbd');
    };
    makeLegend(colorA, seasonALabel);
    makeLegend(colorB, seasonBLabel);

    const svg = card.append('svg').attr('width','100%').attr('height', 260);
    const bounds = svg.node().getBoundingClientRect();
    const W = Math.max(260, bounds.width), H = 260;
    const cx = W/2, cy = H/2 + 8;
  const R  = Math.min(W,H)/2 - 28;

  const angle = i => (Math.PI*2*i/axes.length) - Math.PI/2; // start at 12 o’clock
  const ringUnit = 90;
  const ringCount = 5;
  const ringMaxVal = ringUnit * ringCount; // 450
  const r = d3.scaleLinear().domain([0, ringMaxVal]).range([0, R]);

    const axisScale = {};
    axes.forEach(k => {
      const am = Math.max(1, axisMax[k] || 1);
      axisScale[k] = ringMaxVal / am;
      // clamp scale to a reasonable range to avoid extreme stretching
      axisScale[k] = Math.min(Math.max(axisScale[k], 1), 8);
    });

    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);

    // Rings (numeric): 100,200,300,400,500 — 1 circle == 100 units
    const ringTicks = d3.range(1, ringCount + 1).map(i => i * ringUnit);
    g.selectAll('circle.ring').data(ringTicks).join('circle')
      .attr('class','ring')
      .attr('r', d => r(d))
      .attr('fill','none')
      .attr('stroke','#2a2a2a');

    // curved ring labels (show percent)
    function arcPathAt(radius, centerDeg = 45, spanDeg = 56) {
      const a0 = (centerDeg - spanDeg/2 - 90) * Math.PI / 180;
      const a1 = (centerDeg + spanDeg/2 - 90) * Math.PI / 180;
      const x0 = Math.cos(a0) * radius, y0 = Math.sin(a0) * radius;
      const x1 = Math.cos(a1) * radius, y1 = Math.sin(a1) * radius;
      const largeArc = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
      const sweep = 1;
      return `M ${x0} ${y0} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${x1} ${y1}`;
    }
    const uid = `${posLabel}-${Math.random().toString(36).slice(2,7)}`;
    const defs = g.append('defs');
    const ringIds = [];
    ringTicks.forEach((t,i) => {
      const radius = Math.max(r(t) - 3, 2);
      const id = `ringPath-${uid}-${i}`;
      ringIds.push({ id, t });
      defs.append('path').attr('id', id).attr('d', arcPathAt(radius, 45, 56)).attr('fill','none').attr('stroke','none');
    });

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

  const valsA = axes.map(k => Math.max(0, +totalsA[k] || 0));
  const valsB = axes.map(k => Math.max(0, +totalsB[k] || 0));

    const dataA = valsA.map((v,i) => {
      const k = axes[i];
      const scaled = v * (axisScale[k] || 1);
      const plotted = Math.min(scaled, ringMaxVal);
      return { k, v, p: polarPoint(angle(i), r(plotted)) };
    });
    const dataB = valsB.map((v,i) => {
      const k = axes[i];
      const scaled = v * (axisScale[k] || 1);
      const plotted = Math.min(scaled, ringMaxVal);
      return { k, v, p: polarPoint(angle(i), r(plotted)) };
    });

    const ptsA = dataA.map(d => d.p);
    const ptsB = dataB.map(d => d.p);

    // polygons
    const pathA = g.append('path')
      .attr('d', toPath(ptsA))
      .attr('fill', colorA).attr('fill-opacity', .24)
      .attr('stroke', colorA).attr('stroke-width', 2)
      .style('filter', 'drop-shadow(0 0 3px rgba(0,0,0,.35))');

    const pathB = g.append('path')
      .attr('d', toPath(ptsB))
      .attr('fill', colorB).attr('fill-opacity', .22)
      .attr('stroke', colorB).attr('stroke-width', 2)
      .style('filter', 'drop-shadow(0 0 3px rgba(0,0,0,.35))');

    // dots + interactions for both seasons
    g.selectAll('circle.ptA').data(dataA).join('circle')
      .attr('class','ptA')
      .attr('r', 3.6).attr('cx', d=>d.p[0]).attr('cy', d=>d.p[1])
      .attr('fill', colorA).style('cursor','pointer')
      .on('mouseenter', () => { pathA.attr('stroke-width', 3); tip.style('opacity',1); })
      .on('mousemove', (ev,d) => {
        tip.style('left', `${ev.pageX + 12}px`).style('top',  `${ev.pageY + 12}px`)
          .html(`<b>${posLabel} — ${seasonALabel}</b><br/><span style="opacity:.85">${d.k}</span>: ${fmt(d.v)}`);
      })
      .on('mouseleave', () => { pathA.attr('stroke-width', 2); tip.style('opacity',0); });

    g.selectAll('circle.ptB').data(dataB).join('circle')
      .attr('class','ptB')
      .attr('r', 3.6).attr('cx', d=>d.p[0]).attr('cy', d=>d.p[1])
      .attr('fill', colorB).style('cursor','pointer')
      .on('mouseenter', () => { pathB.attr('stroke-width', 3); tip.style('opacity',1); })
      .on('mousemove', (ev,d) => {
        tip.style('left', `${ev.pageX + 12}px`).style('top',  `${ev.pageY + 12}px`)
          .html(`<b>${posLabel} — ${seasonBLabel}</b><br/><span style="opacity:.85">${d.k}</span>: ${fmt(d.v)}`);
      })
      .on('mouseleave', () => { pathB.attr('stroke-width', 2); tip.style('opacity',0); });

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
d3.select("#defense-grid")
  .append("div")
  .style("text-align", "right")
  .style("color", "#aaa")
  .style("font-size", "10px")
  .style("font-style", "italic")
  .style("margin-top", "4px")
  .style("margin-left", "600px")
  .text("source: basketball-reference.com");

}
