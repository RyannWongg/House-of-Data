export async function renderLeBronShots(sel) {
  const SVG = d3.select(sel.svg);
  const tooltip = d3.select(sel.tooltip);
  const seasonSel = d3.select(sel.seasonSelect);
  const madeSel   = d3.select(sel.madeSelect);

  // Ensure the SVG has a height (fallback if CSS missing)
  if (!SVG.attr("height") && !SVG.style("height")) {
    SVG.style("height", "600px");
  }

  SVG.selectAll("*").remove();

  const M = { top: 16, right: 16, bottom: 40, left: 16 };
  const bbox = SVG.node().getBoundingClientRect();
  const W = Math.max(360, bbox.width) - M.left - M.right;
  const H = Math.max(420, bbox.height) - M.top - M.bottom;

  const g = SVG.append("g").attr("transform", `translate(${M.left},${M.top})`);

  // 1) Load data
  let payload;
  try {
    payload = await d3.json("data/lebron_shots_2005_2024.json");
  } catch (e) {
    console.error("Failed to load JSON", e);
    g.append("text").attr("x", 10).attr("y", 24).attr("fill", "#f66")
      .text("Failed to load data/lebron_shots_2005_2024.json");
    return;
  }

  const shots = payload?.shots ?? [];
  const seasons = payload?.seasons ?? Array.from(new Set(shots.map(d => d.season)));
  if (shots.length === 0) {
    g.append("text").attr("x", 10).attr("y", 24).attr("fill", "#f66").text("No shots found.");
    return;
  }

  // 2) Inspect ranges (once in console)
  const xVals = shots.map(d => +d.x_ft);
  const yVals = shots.map(d => +d.y_ft);
  const minX = d3.min(xVals), maxX = d3.max(xVals);
  const minY = d3.min(yVals), maxY = d3.max(yVals);
  console.log("Shot extents (ft): x=[", minX, maxX, "] y=[", minY, maxY, "] count=", shots.length);

  // 3) Scales — widen domains to be safe
  // Half-court is typically x∈[-25,25], y∈[0,47]. Some data have small negatives on y; include a buffer.
  const x = d3.scaleLinear().domain([-25.5, 25.5]).range([0, W]);
  const y = d3.scaleLinear().domain([-5.25, 47.5]).range([H, 0]);

  // 4) Court
  drawHalfCourt(g, x, y);

  // 5) Controls
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

  // 6) Points layer
  const pts = g.append("g").attr("class", "shots");

  function applyFilter() {
    const sSeason = seasonSel.empty() ? "All seasons" : seasonSel.property("value");
    const sMade   = madeSel.empty() ? "all" : madeSel.property("value");

    let filt = shots;
    if (sSeason !== "All seasons") filt = filt.filter(d => d.season === sSeason);
    if (sMade === "made")   filt = filt.filter(d => +d.made === 1);
    if (sMade === "missed") filt = filt.filter(d => +d.made === 0);

    const U = pts.selectAll("circle.shot").data(filt, (d,i)=>i);

    U.join(
      enter => enter.append("circle")
        .attr("class", "shot")
        .attr("cx", d => x(+d.x_ft))
        .attr("cy", d => y(+d.y_ft))
        .attr("r", 0)
        .style("fill", d => d.made ? "#ffffff" : "#9aa0a6")
        .style("opacity", d => d.made ? 0.95 : 0.45)
        .on("mousemove", (ev, d) => {
          tooltip.style("opacity", 1)
            .style("left", `${ev.pageX + 12}px`)
            .style("top",  `${ev.pageY + 12}px`)
            .html(`<b>${payload.player_name || "LeBron James"}</b><br>
                   Season: ${d.season}<br>
                   ${d.made ? "Made" : "Missed"} — ${d.SHOT_ZONE_BASIC} (${d.SHOT_ZONE_AREA})`);
        })
        .on("mouseleave", () => tooltip.style("opacity", 0))
        .transition().duration(250)
        .attr("r", 2.2),
      update => update
        .transition().duration(150)
        .attr("cx", d => x(+d.x_ft))
        .attr("cy", d => y(+d.y_ft))
        .style("fill", d => d.made ? "#ffffff" : "#9aa0a6")
        .style("opacity", d => d.made ? 0.95 : 0.45),
      exit => exit.transition().duration(120).attr("r", 0).remove()
    );
  }

  applyFilter();
  seasonSel.on("change", applyFilter);
  madeSel.on("change", applyFilter);

  // IMPORTANT: simple resize handler (no d3.timeout misuse)
  window.addEventListener("resize", () => {
    // Rerun layout quickly by re-calling the module (idempotent)
    renderLeBronShots(sel);
  }, { passive: true });

    function drawHalfCourt(g, x, y) {
    const court = g.append("g").attr("class", "court");

    // geometry in FEET (hoop at 0, baseline at -5.25)
    const COURT_X = 25;
    const COURT_Y = 47;
    const BASELINE = -5.25;
    const HOOP_Y = 0;
    const RIM_R = 0.75;
    const BACKBOARD_Y = -4;     // ≈ 6 inches in front of baseline
    const KEY_W = 16;
    const KEY_H = 19;
    const FT_R = 6;
    const RESTRICT_R = 4;
    const CORNER_X = 22;
    const ARC_R = 23.75;
    const CORNER_JOIN_Y = 9;

    // where the 3PT arc meets the corner lines (above the hoop)
    const yJoin = Math.sqrt(ARC_R * ARC_R - CORNER_X * CORNER_X); // ≈ 8.95 ft

    // clip anything below the baseline
    const clipId = "clipAboveBaseline";
    g.append("clipPath").attr("id", clipId)
        .append("rect")
        .attr("x", x(-COURT_X))
        .attr("y", y(COURT_Y))
        .attr("width", x(COURT_X) - x(-COURT_X))
        .attr("height", y(BASELINE) - y(COURT_Y)); // only draw from baseline up

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

    // restricted circle (only the part above baseline is visible due to clip)
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

    // 3PT arc between corner join points (SVG 'A' arc with pixel radius)
    const rPix = Math.abs(x(ARC_R) - x(0));
    const pL = [x(-CORNER_X), y(yJoin)];
    const pR = [x(CORNER_X),  y(yJoin)];
    const arcPath = `M ${pL[0]} ${pL[1]} A ${rPix} ${rPix} 0 0 1 ${pR[0]} ${pR[1]}`;
    court.append("path").attr("d", arcPath).attr("fill", "none").attr("stroke", "#333");
    }



}
