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
  const rippleLayer = g.append("g")
    .attr("class", "ripples")
    .style("pointer-events", "none");   // ripples shouldn't block hover
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;


  const mode = playerSel.empty() ? "both" : playerSel.property("value");

  const files = {
    lebron: "data/lebron_shots_2005_2025.json",
    jordan: "data/mj_shots_1984_2003.json"
  };

  async function loadOne(who) {
    const p = await d3.json(files[who]);
    const shots = (p?.shots ?? []).map(d => ({ ...d, who }));
    return { player_name: p?.player_name ?? (who === 'lebron' ? "LeBron James" : "Michael Jordan"), shots };
  }

  let shots = [];
  let playerNames = {};
  try {
    if (mode === "both") {
      const [L, J] = await Promise.all([loadOne("lebron"), loadOne("jordan")]);
      shots = [...L.shots, ...J.shots];
      playerNames = { lebron: L.player_name, jordan: J.player_name };
    } else {
      const one = await loadOne(mode);
      shots = one.shots;
      playerNames = { [mode]: one.player_name };
    }
  } catch (e) {
    console.error("Failed to load shot JSON(s)", e);
    g.append("text").attr("x", 10).attr("y", 24).attr("fill", "#f66")
      .text("Failed to load shot data");
    return;
  }

  if (!shots.length) {
    g.append("text").attr("x", 10).attr("y", 24).attr("fill", "#f66")
      .text("No shots found.");
    return;
  }

  // const selectedPlayer = playerSel.empty() ? "lebron" : playerSel.property("value");
  // console.log("Selected player:", selectedPlayer);

  // let payload;
  // let dataFile;

  // if (selectedPlayer === "jordan") {
  //   dataFile = "data/mj_shots_1984_2003.json";
  // } else {
  //   dataFile = "data/lebron_shots_2005_2025.json";
  // }

  // try {
  //   payload = await d3.json(dataFile);
  // } catch (e) {
  //   console.error("Failed to load JSON", e);
  //   g.append("text").attr("x", 10).attr("y", 24).attr("fill", "#f66")
  //     .text("Failed to load ${dataFile}");
  //   return;
  // }

  // const shots = payload?.shots ?? [];
  // const seasons = payload?.seasons ?? Array.from(new Set(shots.map(d => d.season)));
  // if (shots.length === 0) {
  //   g.append("text").attr("x", 10).attr("y", 24).attr("fill", "#f66").text("No shots found.");
  //   return;
  // }

  // const xVals = shots.map(d => +d.x_ft);
  // const yVals = shots.map(d => +d.y_ft);
  // const minX = d3.min(xVals), maxX = d3.max(xVals);
  // const minY = d3.min(yVals), maxY = d3.max(yVals);
  // console.log("Shot extents (ft): x=[", minX, maxX, "] y=[", minY, maxY, "] count=", shots.length);

  const x = d3.scaleLinear().domain([-25.5, 25.5]).range([0, W]);
  const y = d3.scaleLinear().domain([-5.25, 47.5]).range([H, 0]);

  drawHalfCourt(g, x, y);

  const seasons = Array.from(new Set(shots.map(d => d.season))).sort((a,b) => d3.ascending(+a.slice(0,4), +b.slice(0,4)));
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

  const whoColor = d => d.who === "lebron" ? "#4ea1ff" : "#ff5a5a";
  // 6) Points layer
  const pts = g.append("g").attr("class", "shots");
  g.select(".court").lower();   // court at the very back
  pts.raise();                  // shots above court
  rippleLayer.raise(); 

  const PALETTE = {
    lebron: { made: "#1b95faff", miss: "#395372ff" }, // bright blue vs deep navy
    jordan: { made: "#ff2727ff", miss: "#63282bff" }  // bright red vs deep maroon
  };
  const fillColor = d => PALETTE[d.who]?.[d.made ? "made" : "miss"] ?? (d.made ? "#e6e6e6" : "#6b7280");
  const strokeColor = d => d.made ? "#ffffffA6" : "none"; // subtle white edge only for makes
  const radius = d => d.made ? 2.0 : 1.15;                // makes slightly larger
  const opacity = d => d.made ? 0.95 : 0.32;              // much stronger contrast
  function hexToRgb(hex) {
    const m = String(hex).replace('#','').match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (!m) return {r:255,g:255,b:255};
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const num = parseInt(h, 16);
    return { r: (num>>16)&255, g: (num>>8)&255, b: num&255 };
  }
  function rgba(hex, a) {
    const {r,g,b} = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }


  // Make overlapping brights blend nicely
  pts.style("mix-blend-mode", "screen");

  function applyFilter() {
    const sSeason = seasonSel.empty() ? "All seasons" : seasonSel.property("value");
    const sMade   = madeSel.empty() ? "all" : madeSel.property("value");

    let filt = shots;
    if (sSeason !== "All seasons") filt = filt.filter(d => d.season === sSeason);
    if (sMade === "made")   filt = filt.filter(d => +d.made === 1);
    if (sMade === "missed") filt = filt.filter(d => +d.made === 0);

    filt = filt.slice().sort((a,b) => (+a.made - +b.made));

    const U = pts.selectAll("circle.shot").data(filt, (d,i)=>i);


    const X_SPREAD = 1.2;
    const Y_SPREAD = 1.90;
    
    U.join(
      enter => enter.append("circle")
        .attr("class", "shot")
        .attr("cx", d => x(+d.x_ft * X_SPREAD))
        .attr("cy", d => y(+d.y_ft * Y_SPREAD))
        .attr("r", 0)
        .style("fill", fillColor)
        .style("opacity", opacity)
        .style("stroke", strokeColor)
        .style("stroke-width", d => d.made ? 0.6 : 0)
        .on("mouseenter", function (ev, d) {
          if (reduceMotion) return;
          const cx = +this.getAttribute("cx");
          const cy = +this.getAttribute("cy");

          // match the point color for the ripple
          const color = this.style.fill || "#fff";

          // optional: cancel too-many ripples (keeps things tidy)
          rippleLayer.selectAll("circle.ring").filter(function(){
            // remove old rings at (almost) same spot
            const dx = Math.abs(+this.getAttribute("cx") - cx);
            const dy = Math.abs(+this.getAttribute("cy") - cy);
            return dx < 1 && dy < 1;
          }).remove();

          rippleLayer.append("circle")
            .attr("class", "ring")
            .attr("cx", cx)
            .attr("cy", cy)
            .attr("r", 0.6)
            .style("fill", "none")
            .style("stroke", color)
            .style("stroke-width", 1.5)
            .style("stroke-opacity", 0.9)
            .transition()
            .duration(450)
            .ease(d3.easeCubicOut)
            .attr("r", 12)                 // how big the ripple grows
            .style("stroke-opacity", 0)    // fade out
            .remove();
        })
        .on("mousemove", (ev, d) => {
          const hue = fillColor(d);         // same color as the dot
          const glow = rgba(hue, 0.35);     // shadow color
          const bg   = rgba(hue, d.made ? 0.18 : 0.12); // lighter for makes, subtler for misses
          const badgeBg = rgba(hue, d.made ? 0.35 : 0.22);
          tooltip.style("opacity", 1)
            .style("left", `${ev.pageX + 12}px`)
            .style("top",  `${ev.pageY + 12}px`)
            .style("background", bg)
            .style("border-color", hue)
            .style("box-shadow", `0 8px 28px ${glow}`)
            .html(`<b>${d.who === "lebron" ? (playerNames.lebron || "LeBron James") : (playerNames.jordan || "Michael Jordan")}</b><br>
              Season: ${d.season}<br>
              ${d.made ? "Made" : "Missed"} — ${d.SHOT_ZONE_BASIC} (${d.SHOT_ZONE_AREA})`);
        })
        .on("mouseleave", () => tooltip.style("opacity", 0))
        .transition().duration(250)
        .attr("r", 1.5),
      update => update
        .transition().duration(150)
        .attr("cx", d => x(+d.x_ft * X_SPREAD))
        .attr("cy", d => y(+d.y_ft * Y_SPREAD))
        .attr("r", radius)
        .style("fill", fillColor)
        .style("opacity", opacity)
        .style("stroke", strokeColor)
        .style("stroke-width", d => d.made ? 0.6 : 0)
        .on("mouseenter", function (ev, d) {
          if (reduceMotion) return;
          const cx = +this.getAttribute("cx");
          const cy = +this.getAttribute("cy");

          // match the point color for the ripple
          const color = this.style.fill || "#fff";

          // optional: cancel too-many ripples (keeps things tidy)
          rippleLayer.selectAll("circle.ring").filter(function(){
            // remove old rings at (almost) same spot
            const dx = Math.abs(+this.getAttribute("cx") - cx);
            const dy = Math.abs(+this.getAttribute("cy") - cy);
            return dx < 1 && dy < 1;
          }).remove();

          rippleLayer.append("circle")
            .attr("class", "ring")
            .attr("cx", cx)
            .attr("cy", cy)
            .attr("r", 0.6)
            .style("fill", "none")
            .style("stroke", color)
            .style("stroke-width", 1.5)
            .style("stroke-opacity", 0.9)
            .transition()
            .duration(450)
            .ease(d3.easeCubicOut)
            .attr("r", 12)                 // how big the ripple grows
            .style("stroke-opacity", 0)    // fade out
            .remove();
        }),
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
    const COURT_Y = 47;
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

    // where the 3PT arc meets the corner lines 
    const yJoin = Math.sqrt(ARC_R * ARC_R - CORNER_X * CORNER_X); // ≈ 8.95 ft

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

    // rim (centered at hoop)
    court.append("circle")
        .attr("cx", x(0)).attr("cy", y(HOOP_Y))
        .attr("r", Math.abs(x(RIM_R) - x(0)))
        .attr("fill", "none").attr("stroke", "#333");

    // lane / paint
    court.append("rect")
        .attr("x", x(-KEY_W/2)).attr("y", y(KEY_H))
        .attr("width", x(KEY_W/2) - x(-KEY_W/2))
        .attr("height", y(BASELINE) - y(KEY_H))
        .attr("fill", "none").attr("stroke", "#333");

    // free-throw circle
    court.append("circle")
        .attr("cx", x(0)).attr("cy", y(KEY_H))
        .attr("r", Math.abs(x(FT_R) - x(0)))
        .attr("fill", "none").attr("stroke", "#333");

    // restricted circle 
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

    // 3PT arc between corner join points
    const rPix = Math.abs(x(ARC_R) - x(0));
    const pL = [x(-CORNER_X), y(yJoin)];
    const pR = [x(CORNER_X),  y(yJoin)];
    const arcPath = `M ${pL[0]} ${pL[1]} A ${rPix} ${rPix} 0 0 1 ${pR[0]} ${pR[1]}`;
    court.append("path").attr("d", arcPath).attr("fill", "none").attr("stroke", "#333");
    }



}
