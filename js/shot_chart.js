export async function renderShotChart(sel) {
  const SVG = d3.select(sel.svg);
  const tooltip = d3.select(sel.tooltip);
  const playerSel = d3.select(sel.playerSelect);
  const seasonSel = d3.select(sel.seasonSelect);
  const madeSel   = d3.select(sel.madeSelect);
  const titleEl = d3.select(sel.title);

  if (!SVG.attr("height") && !SVG.style("height")) {
    SVG.style("height", "600px");
  }

  SVG.selectAll("*").remove();

  const M = { top: 16, right: 16, bottom: 40, left: 16 };
  const bbox = SVG.node().getBoundingClientRect();
  const W = Math.max(360, bbox.width) - M.left - M.right;
  const H = Math.max(420, bbox.height) - M.top - M.bottom;

  const g = SVG.append("g").attr("transform", `translate(${M.left},${M.top})`);

  const selectedPlayer = playerSel.empty() ? "lebron" : playerSel.property("value");
  console.log("Selected player:", selectedPlayer);
  const FILES = {
    lebron: "data/lebron_shots_2005_2025.json",
    jordan: "data/mj_shots_1984_2003.json"
    };
  const COLORS = { lebron: "#4da3ff", jordan: "#ff4d4d" };

  async function loadPlayer(key) {
    const file = FILES[key];
    if (!file) throw new Error(`Unknown player key: ${key}`);
    const payload = await d3.json(file);
    const shots = (payload?.shots ?? []).map(d => ({ ...d, player: key }));
    return { payload, shots };
  }

  let shots = [];
  let playerName = "";
  let seasons = [];

  try {
    if (selectedPlayer === "both") {
      const [lb, mj] = await Promise.all([loadPlayer("lebron"), loadPlayer("jordan")]);
      shots = [...lb.shots, ...mj.shots];
      playerName = `${lb.payload?.player_name ?? "LeBron James"} vs ${mj.payload?.player_name ?? "Michael Jordan"}`;
      const s1 = lb.payload?.seasons ?? Array.from(new Set(lb.shots.map(d => d.season)));
      const s2 = mj.payload?.seasons ?? Array.from(new Set(mj.shots.map(d => d.season)));
      seasons = Array.from(new Set([...s1, ...s2])).sort();
    } else {
      const { payload, shots: s } = await loadPlayer(selectedPlayer);
      shots = s;
      playerName = payload?.player_name ?? (selectedPlayer === "jordan" ? "Michael Jordan" : "LeBron James");
      seasons = payload?.seasons ?? Array.from(new Set(shots.map(d => d.season)));
    }
  } catch (e) {
    console.error("Failed to load shot data", e);
    g.append("text").attr("x", 10).attr("y", 24).attr("fill", "#f66")
      .text(`Failed to load ${selectedPlayer === "both" ? FILES.lebron + " & " + FILES.jordan : FILES[selectedPlayer]}`);
    return;
  }

  if (!shots.length) {
    g.append("text").attr("x", 10).attr("y", 24).attr("fill", "#f66").text("No shots found.");
    return;
  }

  const xVals = shots.map(d => +d.x_ft);
  const yVals = shots.map(d => +d.y_ft);
  const minX = d3.min(xVals), maxX = d3.max(xVals);
  const minY = d3.min(yVals), maxY = d3.max(yVals);
  console.log("Shot extents (ft): x=[", minX, maxX, "] y=[", minY, maxY, "] count=", shots.length);

  const x = d3.scaleLinear().domain([-25.5, 25.5]).range([0, W]);
  const y = d3.scaleLinear().domain([-5.25, 47.5]).range([H, 0]);

  // Rim
  const HOOP_PX = { x: x(0), y: y(0) };

  function arcPathToHoop(x0, y0, x1 = HOOP_PX.x, y1 = HOOP_PX.y) {
    const cx = (x0 + x1) / 2;
    const cy = Math.min(y0, y1) - Math.max(60, Math.abs(x0 - x1) * 0.15);
    return `M ${x0} ${y0} Q ${cx} ${cy} ${x1} ${y1}`;
  }

  function animateShotToHoop(g, x0, y0) {
    return new Promise(resolve => {
      const path = g.append("path")
        .attr("d", arcPathToHoop(x0, y0))
        .attr("fill", "none")
        .attr("stroke", "none");

      const L = path.node().getTotalLength();

      const ball = g.append("circle")
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

  function spawnScoreText(g, txt, color = "#ffd54f") {
    const R = txt === "+3" ? 11 : 10;

    const grp = g.append("g")
      .attr("transform", `translate(${HOOP_PX.x}, ${HOOP_PX.y - 12})`)
      .style("opacity", 0);

    const bg = grp.append("circle")
      .attr("r", R)
      .attr("fill", d3.color(color).darker(1.2))
      .attr("stroke", d3.color(color).darker(2))
      .attr("stroke-width", 0.8)
      .style("filter", "drop-shadow(0 1px 3px rgba(0,0,0,0.6))");

    // Score text
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
  drawHalfCourt(g, x, y);
  if (selectedPlayer === "both") {
    const legendG = g.append("g")
      .attr("class", "player-legend")
      .attr("transform", `translate(${Math.max(0, W - 140)}, ${-4})`);

    const items = [
      { label: "LeBron James", color: COLORS.lebron },
      { label: "Michael Jordan", color: COLORS.jordan }
    ];

    const row = legendG.selectAll("g.row")
      .data(items)
      .join("g")
      .attr("class", "row")
      .attr("transform", (d, i) => `translate(0, ${i * 18})`);

    row.append("rect")
      .attr("width", 12).attr("height", 12).attr("rx", 2)
      .attr("fill", d => d.color)
      .attr("stroke", "#000").attr("stroke-width", 0.6);

    row.append("text")
      .attr("x", 16).attr("y", 10)
      .attr("fill", "#ddd").attr("font-size", 12)
      .text(d => d.label);
  }

  if (!seasonSel.empty()) {
    seasonSel.selectAll("option").data(["All seasons", ...seasons])
      .join("option").text(d => d).attr("value", d => d);
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

  const pts = g.append("g").attr("class", "shots");

  function applyFilter() {
    const sSeason = seasonSel.empty() ? "All seasons" : seasonSel.property("value");
    const sMade   = madeSel.empty() ? "all" : madeSel.property("value");

    let filt = shots;
    if (sSeason !== "All seasons") filt = filt.filter(d => d.season === sSeason);
    if (sMade === "made")   filt = filt.filter(d => +d.made === 1);
    if (sMade === "missed") filt = filt.filter(d => +d.made === 0);

    const U = pts.selectAll("circle.shot").data(filt, (d,i)=>i);

    const X_SPREAD = 1.2;
    const Y_SPREAD = 1.75;
    
    U.join(
      enter => enter.append("circle")
        .attr("class", "shot")
        .attr("cx", d => x(+d.x_ft * X_SPREAD))
        .attr("cy", d => y(+d.y_ft * Y_SPREAD) - 20)
        .attr("r", 0)
        .style("fill", d => COLORS[d.player ?? selectedPlayer] || "#ccc")
        .style("opacity", d => d.made ? 0.8 : 0.2)
        .on("mousemove", (ev, d) => {
          const who = d.player === "jordan" ? "Michael Jordan" : (d.player === "lebron" ? "LeBron James" : playerName);
          tooltip.style("opacity", 1)
            .style("left", `${ev.pageX + 12}px`)
            .style("top", `${ev.pageY + 12}px`)
            .html(`<b>${who}</b><br>Season: ${d.season}<br>${d.made ? "Made" : "Missed"} — ${d.SHOT_ZONE_BASIC} (${d.SHOT_ZONE_AREA})`);
        })
        .on("mouseleave", () => tooltip.style("opacity", 0))
        .on("mouseenter", function (ev, d) {
          if (+d.made !== 1) return;         
          if (d._animating) return;         
          d._animating = true;

          const cx = +d3.select(this).attr("cx");
          const cy = +d3.select(this).attr("cy");

          d3.select(this).interrupt().transition().duration(100).attr("r", 3.0)
            .transition().duration(200).attr("r", 1.8);

          animateShotToHoop(g, cx, cy).then(() => {
            const three = isThreePointer(d.SHOT_ZONE_BASIC);
            const color = (COLORS && COLORS[d.player ?? selectedPlayer]) || "#ffd54f";
            spawnScoreText(g, three ? "+3" : "+2", color);
          }).finally(() => {
            setTimeout(() => { d._animating = false; }, 100);
          });
        })
        .transition().duration(250)
        .attr("r", 1.5),
      update => update
        .on("mousemove", (ev, d) => {
          const who = d.player === "jordan" ? "Michael Jordan"
                    : d.player === "lebron" ? "LeBron James" : payload.player_name;
          tooltip.style("opacity", 1)
            .style("left", `${ev.pageX + 12}px`)
            .style("top",  `${ev.pageY + 12}px`)
            .html(`<b>${who}</b><br>Season: ${d.season}<br>${d.made ? "Made" : "Missed"} — ${d.SHOT_ZONE_BASIC} (${d.SHOT_ZONE_AREA})`);
        })
        .on("mouseleave", () => tooltip.style("opacity", 0))
        .on("mouseenter", function (ev, d) {
          if (+d.made !== 1) return;
          if (d._animating) return;
          d._animating = true;

          const cx = +d3.select(this).attr("cx");
          const cy = +d3.select(this).attr("cy");

          d3.select(this).interrupt().transition().duration(100).attr("r", 3.0)
            .transition().duration(200).attr("r", 1.8);

          animateShotToHoop(g, cx, cy).then(() => {
            const three = isThreePointer(d.SHOT_ZONE_BASIC);
            const color = (COLORS && COLORS[d.player ?? selectedPlayer]) || "#ffd54f";
            spawnScoreText(g, three ? "+3" : "+2", color);
          }).finally(() => {
            setTimeout(() => { d._animating = false; }, 100); 
          });
        })
        .transition().duration(150)
        .attr("cx", d => x(+d.x_ft * X_SPREAD))
        .attr("cy", d => y(+d.y_ft * Y_SPREAD))
        .style("fill", d => COLORS[d.player ?? selectedPlayer] || "#ccc")
        .style("opacity", d => d.made ? 0.7 : 0.3),
      exit => exit.transition().duration(120).attr("r", 0).remove()
    );
  }

  applyFilter();
  playerSel.on("change", () => renderShotChart(sel));
  seasonSel.on("change", applyFilter);
  madeSel.on("change", applyFilter);

  window.addEventListener("resize", () => {
    renderShotChart(sel);
  }, { passive: true });

    function drawHalfCourt(g, x, y) {
    const court = g.append("g").attr("class", "court");

    // geometry in feet
    const COURT_X = 25;
    const COURT_Y = 50;
    const BASELINE = -5.25;
    const HOOP_Y = 0;
    const RIM_R = 0.75;
    const BACKBOARD_Y = -4;  
    const KEY_W = 16;
    const KEY_H = 19;
    const FT_R = 6;
    const RESTRICT_R = 4;
    const CORNER_X = 22;
    const ARC_R = 23.75;
    const CORNER_JOIN_Y = 9;

    const yJoin = Math.sqrt(ARC_R * ARC_R - CORNER_X * CORNER_X);

    // clip anything below the baseline
    const clipId = "clipAboveBaseline";
    g.append("clipPath").attr("id", clipId)
        .append("rect")
        .attr("x", x(-COURT_X))
        .attr("y", y(COURT_Y))
        .attr("width", x(COURT_X) - x(-COURT_X))
        .attr("height", y(BASELINE) - y(COURT_Y)); 

    court.attr("clip-path", `url(#${clipId})`);

    // outer half-court
    court.append("rect")
        .attr("x", x(-COURT_X)).attr("y", y(COURT_Y))
        .attr("width", x(COURT_X) - x(-COURT_X))
        .attr("height", y(BASELINE) - y(COURT_Y))
        .attr("fill", "#0b0b0b").attr("stroke", "#333");

    // baseline
    court.append("line")
        .attr("x1", x(-COURT_X)).attr("x2", x(COURT_X))
        .attr("y1", y(BASELINE)).attr("y2", y(BASELINE))
        .attr("stroke", "#333");

    // backboard
    court.append("line")
        .attr("x1", x(-3)).attr("x2", x(3))
        .attr("y1", y(BACKBOARD_Y)).attr("y2", y(BACKBOARD_Y))
        .attr("stroke", "#333");

    // rim
    court.append("circle")
        .attr("cx", x(0)).attr("cy", y(HOOP_Y))
        .attr("r", Math.abs(x(RIM_R) - x(0)))
        .attr("fill", "none").attr("stroke", "#333");

    court.append("rect")
        .attr("x", x(-KEY_W/2)).attr("y", y(KEY_H))
        .attr("width", x(KEY_W/2) - x(-KEY_W/2))
        .attr("height", y(BASELINE) - y(KEY_H))
        .attr("fill", "none").attr("stroke", "#333");

    court.append("circle")
        .attr("cx", x(0)).attr("cy", y(KEY_H))
        .attr("r", Math.abs(x(FT_R) - x(0)))
        .attr("fill", "none").attr("stroke", "#333");

    court.append("circle")
        .attr("cx", x(0)).attr("cy", y(HOOP_Y))
        .attr("r", Math.abs(x(RESTRICT_R) - x(0)))
        .attr("fill", "none").attr("stroke", "#333");

    // corner-3 verticals
    court.append("line")
        .attr("x1", x(-CORNER_X)).attr("x2", x(-CORNER_X))
        .attr("y1", y(BASELINE)).attr("y2", y(CORNER_JOIN_Y))
        .attr("stroke", "#333");

        court.append("line")
        .attr("x1", x(CORNER_X)).attr("x2", x(CORNER_X))
        .attr("y1", y(BASELINE)).attr("y2", y(CORNER_JOIN_Y))
        .attr("stroke", "#333");

    // 3PT arc
    const rPix = Math.abs(x(ARC_R) - x(0));
    const pL = [x(-CORNER_X), y(yJoin)];
    const pR = [x(CORNER_X),  y(yJoin)];
    const arcPath = `M ${pL[0]} ${pL[1]} A ${rPix} ${rPix} 0 0 1 ${pR[0]} ${pR[1]}`;
    court.append("path").attr("d", arcPath).attr("fill", "none").attr("stroke", "#333");
    }
  
    SVG.append("text")
    .attr("x", Math.max(10, bbox.width - 10))
    .attr("y", Math.max(12, bbox.height - 10))
    .attr("text-anchor", "end")
    .attr("fill", "#ccc")
    .style("font-size", "10px")
    .style("font-style", "italic")
    .style("opacity", 0.8)
    .attr("class", "citation")
    .text("source: nba_api");

}