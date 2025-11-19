export async function renderShotChart(sel) {
  const SVG = d3.select(sel.svg);

  SVG.selectAll("*").remove();

  const Y_SPREAD = 1.75;
  const VB_W = 960, VB_H = 640;

  const VIEWBOX_H = VB_H;
  function depthScaleFromCy(cy) {
    const z = 1 - (cy / VIEWBOX_H);
    const k = 0.65;
    return 1 / (1 + k * z);
  }
  function dotDepth(d) {
    const cy = y(+d.y_ft * Y_SPREAD) - 20;
    return depthScaleFromCy(cy);
  }

  const tooltip = d3.select(sel.tooltip);
  const playerSel = d3.select(sel.playerSelect);
  const seasonSel = d3.select(sel.seasonSelect);
  const madeSel   = d3.select(sel.madeSelect);

  if (!SVG.attr("height") && !SVG.style("height")) {
    SVG.style("height", "600px");
  }

  SVG.attr("viewBox", `0 0 ${VB_W} ${VB_H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  const M = { top: 16, right: 16, bottom: 40, left: 16 };
  const W = VB_W - M.left - M.right;
  const H = VB_H - M.top - M.bottom;

  const g = SVG.append("g").attr("transform", `translate(${M.left},${M.top})`);
  const gCourt = g.append("g").attr("class", "layer-court");
  const gShots = g.append("g").attr("class", "layer-shots");
  const gFx    = g.append("g").attr("class", "layer-fx");

  const selectedPlayer = playerSel.empty() ? "lebron" : playerSel.property("value");
  const FILES = {
    lebron: "data/lebron_shots_2005_2025.json",
    jordan: "data/mj_shots_1984_2003.json"
    };
  const COLORS = { lebron: "#4da3ff", jordan: "#ff4d4d" };

  async function loadPlayer(key) {
    const file = FILES[key];
    const payload = await d3.json(file);
    const shots = (payload?.shots ?? []).map(d => ({ ...d, player: key }));
    return { payload, shots };
  }

  let shots = [];
  let playerName = "";
  let seasons = [];

    if (selectedPlayer === "both") {
      const [lb, mj] = await Promise.all([loadPlayer("lebron"), loadPlayer("jordan")]);
      const lbShots = normalizeShots(lb.shots, "lebron");
      const mjShots = normalizeShots(mj.shots, "jordan");
      shots = [...lbShots, ...mjShots];

      const s1 = lb.payload?.seasons ?? Array.from(new Set(lbShots.map(d => d.season_str)));
      const s2 = mj.payload?.seasons ?? Array.from(new Set(mjShots.map(d => d.season_str)));
      seasons = Array.from(new Set([...s1, ...s2])).sort();
    } else {
      const { payload, shots: s } = await loadPlayer(selectedPlayer);
      shots = normalizeShots(s, selectedPlayer);
      seasons = payload?.seasons ?? Array.from(new Set(shots.map(d => d.season_str))).sort();
    }

  if (!shots.length) {
    g.append("text").attr("x", 10).attr("y", 24).attr("fill", "#f66").text("No shots found.");
    return;
  }

  function normalizeShots(arr, playerKey) {
    return (arr ?? []).map(d => {
      const madeRaw = d.made ?? d.SHOT_MADE_FLAG ?? d.shot_made_flag ?? 0;
      const madeNum = +madeRaw === 1 ? 1 : 0;

      const seasonRaw = d.season ?? d.SEASON ?? d.season_name ?? "";
      const seasonStr = String(seasonRaw || "");

      const xft = d.x_ft ?? d.LOC_X_FT ?? (Number.isFinite(+d.LOC_X) ? (+d.LOC_X / 12) : +d.x);
      const yft = d.y_ft ?? d.LOC_Y_FT ?? (Number.isFinite(+d.LOC_Y) ? (+d.LOC_Y / 12) : +d.y);

      return {
        ...d,
        player: d.player ?? playerKey,
        made_num: madeNum,
        made_bool: madeNum === 1,
        season_str: seasonStr,
        x_ft: xft,
        y_ft: yft
      };
    });
  }


  const x = d3.scaleLinear().domain([-25.5, 25.5]).range([0, W]);
  const y = d3.scaleLinear().domain([47.5, -5.25]).range([H, 0]);

  const HOOP_PX = { x: x(0), y: y(0) };

  function arcPathToHoop(x0, y0, x1 = HOOP_PX.x, y1 = HOOP_PX.y) {
    const cx = (x0 + x1) / 2;
    const cy = Math.min(y0, y1) - Math.max(60, Math.abs(x0 - x1) * 0.15);
    return `M ${x0} ${y0} Q ${cx} ${cy} ${x1} ${y1}`;
  }

  function animateShotToHoop(x0, y0) {
    return new Promise(resolve => {
      const path = gFx.append("path")
        .attr("d", arcPathToHoop(x0, y0))
        .attr("fill", "none")
        .attr("stroke", "none");

      const L = path.node().getTotalLength();

      const ball = gFx.append("circle")
        .attr("r", 3)
        .attr("cx", x0)
        .attr("cy", y0)
        .attr("fill", "#ffd54f")
        .attr("stroke", "#ffb300")
        .style("pointer-events", "none");

      ball.transition()
        .duration(650)
        .ease(d3.easeQuadOut)
        .attrTween("cx", () => t => path.node().getPointAtLength(t * L).x)
        .attrTween("cy", () => t => path.node().getPointAtLength(t * L).y)
        .on("end", () => {
          resolve();
          ball.transition().duration(150).attr("r", 0).remove();
          path.remove();
        });
    });
  }

  function spawnScoreText(txt, color = "#ffd54f") {
    const R = txt === "+3" ? 11 : 10;

    const grp = gFx.append("g")
      .attr("transform", `translate(${HOOP_PX.x}, ${HOOP_PX.y - 12})`)
      .style("opacity", 0);

    grp.append("circle")
      .attr("r", R)
      .attr("fill", d3.color(color).darker(1.2))
      .attr("stroke", d3.color(color).darker(2))
      .attr("stroke-width", 0.8)
      .style("filter", "drop-shadow(0 1px 3px rgba(0,0,0,0.6))");

    grp.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", 14)
      .attr("font-weight", 700)
      .attr("fill", "#fff")
      .attr("stroke", d3.color(color).darker(2))
      .attr("stroke-width", 0.6)
      .attr("paint-order", "stroke")
      .text(txt);

    grp.transition()
      .duration(120)
      .style("opacity", 1)
      .transition()
      .duration(600)
      .ease(d3.easeQuadOut)
      .attrTween("transform", () => {
        const x0 = HOOP_PX.x, y0 = HOOP_PX.y - 12;
        const y1 = HOOP_PX.y - 28;
        return t => `translate(${x0}, ${y0 + (y1 - y0) * t})`;
      })
      .transition()
      .duration(250)
      .style("opacity", 0)
      .on("end", () => grp.remove());
  }

  function isThreePointer(zoneBasic) {
    return String(zoneBasic || "").includes("3");
  }
  
  drawHalfCourt(gCourt, x, y);
  const overlayLegend = d3.select('#lbLegend2D');
  const overlayFooter = d3.select('#lbFooter2D');
  overlayLegend.selectAll('*').remove();

  if (selectedPlayer === 'both') {
    const items = [
      { label: 'LeBron James',   color: COLORS.lebron },
      { label: 'Michael Jordan', color: COLORS.jordan }
    ];

    const row = overlayLegend.selectAll('.legend-row')
      .data(items)
      .join('div')
      .attr('class', 'legend-row')
      .style('display', 'flex')
      .style('align-items', 'center')
      .style('gap', '8px')
      .style('margin', '4px 0');

    row.append('span')
      .style('display', 'inline-block')
      .style('width', '12px')
      .style('height', '12px')
      .style('border-radius', '3px')
      .style('border', '1px solid #000')
      .style('background', d => d.color);

    row.append('span').text(d => d.label);
  } else {
    overlayLegend.text('');
  }

  overlayFooter.text('source: nba_api');

  if (!seasonSel.empty()) {
    seasonSel.selectAll("option")
      .data(["All seasons", ...seasons])
      .join("option")
      .text(d => d)
      .attr("value", d => d);
    seasonSel.property("value", "All seasons");
  }
  if (!madeSel.empty()) {
    madeSel.selectAll("option").data([
      {v:"all",t:"All shots"},
      {v:"made",t:"Made only"},
      {v:"missed",t:"Missed only"}
    ]).join("option").attr("value", d=>d.v).text(d=>d.t);
    madeSel.property("value", "all");
  }

  const pts = gShots;

  let tipRAF = 0;
  function showTip(ev, html) {
    if (tipRAF) return;
    tipRAF = requestAnimationFrame(() => {
      tooltip.style("opacity", 1)
        .style("left", `${ev.pageX + 12}px`)
        .style("top",  `${ev.pageY + 12}px`)
        .html(html);
      tipRAF = 0;
    });
  }

  function applyFilter() {
    const sSeason = seasonSel.empty() ? "All seasons" : seasonSel.property("value");
    const sMade   = madeSel.empty() ? "all" : madeSel.property("value");

    let filt = shots;
    if (sSeason !== "All seasons") filt = filt.filter(d => d.season === sSeason);
    if (sMade === "made")   filt = filt.filter(d => d.made_num === 1);
    if (sMade === "missed") filt = filt.filter(d => d.made_num === 0);

    filt.forEach(d => d._id ||= `${d.season}|${d.game_id||''}|${d.event_id||''}|${d.x_ft}|${d.y_ft}|${+d.made}`);
      const U = pts.selectAll("circle.shot").data(filt, d => (
        d._id ||= `${d.season_str}|${d.game_id||''}|${d.event_id||''}|${d.x_ft}|${d.y_ft}|${d.made}`
      ));

    const X_SPREAD = 1.2, Y_SPREAD = 1.75;
    for (const d of filt) {
      d._cx = x(+d.x_ft * X_SPREAD);
      d._cy = y(+d.y_ft * Y_SPREAD) + 30;
      const z = 1 - ( (d._cy) / 800 );
      d._k  = 1 / (1 + 0.65 * z);
    }

    U.join(
      enter => enter.append("circle")
        .attr("class", "shot")
        .attr("cx", d => d._cx)
        .attr("cy", d => d._cy)
        .attr("r", 0)
        .style("fill", d => COLORS[d.player ?? selectedPlayer] || "#ccc")
        .style("opacity", d => d.made_bool ? 0.8 : 0.2)
        .on("mousemove", (ev, d) => {
          const who = d.player === "jordan" ? "Michael Jordan" : (d.player === "lebron" ? "LeBron James" : playerName);
          showTip(ev, `<b>${who}</b><br>Season: ${d.season}<br>${d.made_bool? "Made":"Missed"} — ${d.SHOT_ZONE_BASIC} (${d.SHOT_ZONE_AREA})`);
        })
        .on("mouseleave", () => tooltip.style("opacity", 0))
        .on("mouseenter", function (ev, d) {
          if (+d.made_num !== 1) return;         
          if (d._animating) return;         
          d._animating = true;

          const cx = +d3.select(this).attr("cx");
          const cy = +d3.select(this).attr("cy");
          const k  = dotDepth(d);

          d3.select(this).interrupt().transition().duration(100).attr("r", 3.0*k)
            .transition().duration(200).attr("r", 1.8*k);

          animateShotToHoop(cx, cy).then(() => {
            const three = isThreePointer(d.SHOT_ZONE_BASIC);
            const color = COLORS[d.player ?? selectedPlayer] || "#ffd54f";
            spawnScoreText(three ? "+3" : "+2", color);
          }).finally(() => {
            setTimeout(() => { d._animating = false; }, 100);
          });
        })
        .transition().duration(250)
        .attr("r", d => 3 * d._k),
      update => update
        .on("mousemove", (ev, d) => {
          const who = d.player === "jordan" ? "Michael Jordan"
                    : d.player === "lebron" ? "LeBron James" : playerName;
          showTip(ev, `<b>${who}</b><br>Season: ${d.season}<br>${d.made_bool? "Made":"Missed"} — ${d.SHOT_ZONE_BASIC} (${d.SHOT_ZONE_AREA})`);
        })
        .on("mouseleave", () => tooltip.style("opacity", 0))
        .on("mouseenter", function (ev, d) {
          if (+d.made_num !== 1) return;
          if (d._animating) return;
          d._animating = true;

          const cx = +d3.select(this).attr("cx");
          const cy = +d3.select(this).attr("cy");
          const k  = dotDepth(d);

          d3.select(this).interrupt().transition().duration(100).attr("r", 3.0 * k)
            .transition().duration(200).attr("r", 1.8 * k);

          animateShotToHoop(g, cx, cy).then(() => {
            const three = isThreePointer(d.SHOT_ZONE_BASIC);
            const color = COLORS[d.player ?? selectedPlayer] || "#ffd54f";
            spawnScoreText(g, three ? "+3" : "+2", color);
          }).finally(() => {
            setTimeout(() => { d._animating = false; }, 100); 
          });
        })
        .transition().duration(150)
        .attr("cx", d => d._cx)
        .attr("cy", d => d._cy)
        .attr("r",  d => 1.5 * d._k)
        .style("fill", d => COLORS[d.player ?? selectedPlayer] || "#ccc")
        .style("opacity", d => d.made_num ? 0.7 : 0.3),
      exit => exit.transition().duration(120).attr("r", 0).remove()
    );
  }

  applyFilter();
  const tiltWrap = d3.select('#tab-lebron .shotchart-tilt');
  const tiltToggle = d3.select('#tiltToggle');

  if (!tiltWrap.empty() && !tiltToggle.empty()) {
    tiltToggle.on('change.shot', null).on('change.shot', function () {
      tiltWrap.style('transform', this.checked
        ? 'perspective(900px) rotateX(55deg) translateY(-60px) scale(1.1)'
        : 'none');
    });

    tiltWrap.style('transform', tiltToggle.property('checked')
      ? 'perspective(900px) rotateX(55deg) translateY(-60px) scale(1.1)'
      : 'none');
  }

  const TILT_DEFAULTS = {
    perspective: 900,
    rx: 55,
    ry: 0,
    raise: -60,
    scale: 1.1,
  };

  const sPersp    = document.getElementById('tiltPerspective');
  const sX        = document.getElementById('tiltX');
  const sY        = document.getElementById('tiltY');
  const sRaise    = document.getElementById('tiltRaise');
  const sScale    = document.getElementById('tiltScale');
  const tiltReset = document.getElementById('tiltResetBtn');

  function applyTiltFromUI() {
    if (tiltWrap.empty()) return;
    const p  = Number(sPersp?.value ?? TILT_DEFAULTS.perspective);
    const rx = Number(sX?.value ?? TILT_DEFAULTS.rx);
    const ry = Number(sY?.value ?? TILT_DEFAULTS.ry);
    const dy = Number(sRaise?.value ?? TILT_DEFAULTS.raise);
    const sc = Number(sScale?.value ?? TILT_DEFAULTS.scale);

    tiltWrap.style('transform',
      `perspective(${p}px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(${dy}px) scale(${sc})`
    );
  }

  function resetTilt() {
    if (sPersp) sPersp.value = TILT_DEFAULTS.perspective;
    if (sX)     sX.value     = TILT_DEFAULTS.rx;
    if (sY)     sY.value     = TILT_DEFAULTS.ry;
    if (sRaise) sRaise.value = TILT_DEFAULTS.raise;
    if (sScale) sScale.value = TILT_DEFAULTS.scale;

    if (tiltToggle) {
      tiltToggle.checked = true;
    }
    applyTiltFromUI();
  }

  if (tiltReset) {
    tiltReset.addEventListener('click', resetTilt);
  }

  [sPersp, sX, sY, sRaise, sScale].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('input', applyTiltFromUI);
    inp.addEventListener('change', applyTiltFromUI);
  });

  applyTiltFromUI();

  playerSel.on("change", null).on("change", () => renderShotChart(sel));
  seasonSel.on("change", null).on("change", applyFilter);
  madeSel  .on("change", null).on("change", applyFilter);

function drawHalfCourt(g, x, y) {
  const court = g.append("g").attr("class", "court");

  const COURT_X = 25;
  const COURT_Y = 50;
  const BASELINE = -5.25;
  const HOOP_Y = 0;
  const RIM_R = 0.75;
  const BACKBOARD_Y = -2;
  const KEY_W = 16;
  const KEY_H = 19;
  const FT_R = 6;
  const RESTRICT_R = 4;
  const CORNER_X = 22;
  const ARC_R = 23.75;
  const CORNER_JOIN_Y = 9;

  const yJoin = Math.sqrt(ARC_R * ARC_R - CORNER_X * CORNER_X);

  const yTop = (a, b) => Math.min(y(a), y(b));
  const h    = (a, b) => Math.abs(y(a) - y(b));

  const clipId = "clipAboveBaseline";
  g.append("clipPath").attr("id", clipId)
    .append("rect")
    .attr("x", x(-COURT_X))
    .attr("y", yTop(COURT_Y, BASELINE))
    .attr("width", x(COURT_X) - x(-COURT_X))
    .attr("height", h(COURT_Y, BASELINE));

  court.attr("clip-path", `url(#${clipId})`);

  court.append("rect")
    .attr("x", x(-COURT_X))
    .attr("y", yTop(COURT_Y, BASELINE))
    .attr("width", x(COURT_X) - x(-COURT_X))
    .attr("height", h(COURT_Y, BASELINE))
    .attr("fill", "#0b0b0b")
    .attr("stroke", "#333");

  court.append("line")
    .attr("x1", x(-COURT_X)).attr("x2", x(COURT_X))
    .attr("y1", y(BASELINE)).attr("y2", y(BASELINE))
    .attr("stroke", "#333");

  court.append("line")
    .attr("x1", x(-3)).attr("x2", x(3))
    .attr("y1", y(BACKBOARD_Y)).attr("y2", y(BACKBOARD_Y))
    .attr("stroke", "#333");

  court.append("circle")
    .attr("cx", x(0)).attr("cy", y(HOOP_Y))
    .attr("r", Math.abs(x(RIM_R) - x(0)))
    .attr("fill", "none").attr("stroke", "#333");

  court.append("rect")
    .attr("x", x(-KEY_W / 2)).attr("y", yTop(KEY_H, BASELINE))
    .attr("width", x(KEY_W / 2) - x(-KEY_W / 2))
    .attr("height", h(KEY_H, BASELINE))
    .attr("fill", "none").attr("stroke", "#333");

  court.append("circle")
    .attr("cx", x(0)).attr("cy", y(KEY_H))
    .attr("r", Math.abs(x(FT_R) - x(0)))
    .attr("fill", "none").attr("stroke", "#333");

  court.append("circle")
    .attr("cx", x(0)).attr("cy", y(HOOP_Y))
    .attr("r", Math.abs(x(RESTRICT_R) - x(0)))
    .attr("fill", "none").attr("stroke", "#333");

  court.append("line")
    .attr("x1", x(-CORNER_X)).attr("x2", x(-CORNER_X))
    .attr("y1", y(BASELINE)).attr("y2", y(CORNER_JOIN_Y)+90)
    .attr("stroke", "#333");

  court.append("line")
    .attr("x1", x(CORNER_X)).attr("x2", x(CORNER_X))
    .attr("y1", y(BASELINE)).attr("y2", y(CORNER_JOIN_Y)+90)
    .attr("stroke", "#333");

  const rPix = Math.abs(x(ARC_R) - x(0)+40);
  const pL = [x(-CORNER_X), y(yJoin+8)];
  const pR = [x(CORNER_X),  y(yJoin+8)];
  const arcPath = `M ${pL[0]} ${pL[1]} A ${rPix} ${rPix} 1 0 0 ${pR[0]} ${pR[1]}`;
  court.append("path").attr("d", arcPath).attr("fill", "none").attr("stroke", "#333");
}
}