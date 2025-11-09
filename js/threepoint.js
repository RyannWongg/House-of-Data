export async function render3ptTimeline(sel) {
  const SVG = d3.select(sel.svg);
  const tooltip = d3.select(sel.tooltip);

  if (!SVG.attr("height") && !SVG.style("height")) SVG.style("height", "700px");
  SVG.selectAll("*").remove();

  const M = { top: 20, right: 20, bottom: 40, left: 60 };
  const { width: bw, height: bh } = SVG.node().getBoundingClientRect();
  
  const graphWidth = Math.min(400, bw * 0.4);
  const graphHeight = Math.min(200, bh * 0.3);
  const W = graphWidth - M.left - M.right;
  const H = graphHeight - M.top - M.bottom;

  const defs = SVG.append("defs");
  const pattern = defs.append("pattern")
    .attr("id", "curry-bg")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", bw)
    .attr("height", bh);

  pattern.append("image")
    .attr("href", "image.png") 
    .attr("width", bw)
    .attr("height", bh)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("opacity", 1); 

  SVG.append("rect")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("fill", "url(#curry-bg)");

  const graphX = (bw - graphWidth) / 2; 
  const graphY = bh * 0.65;
  
  const g = SVG.append("g").attr("transform", `translate(${graphX + M.left},${graphY + M.top})`);


  const startYear = 2005;
  const endYearExclusive = 2025;
  const seasonName = y => `${y}-${String((y + 1)).padStart(2, "0")}`; 
  const seasonFile = y => `data/${seasonName(y)}.csv`;

  const SUM_COLUMNS = ["3PA", "FG3A"];

  const num = v => +String(v ?? "").replace(/,/g, "") || 0;

  function sumColumn(rows) {
    const cols = rows.columns ? rows.columns : Object.keys(rows[0] ?? {});
    const chosen =
      SUM_COLUMNS.find(c => cols.includes(c)) ||
      SUM_COLUMNS.find(c => cols.includes(c.toLowerCase())) ||
      SUM_COLUMNS.find(c => cols.includes(c.toUpperCase()));
    if (!chosen) return { total: 0, col: null };

    const total = rows.reduce((acc, r) => acc + num(r[chosen] ?? r[chosen?.toLowerCase?.()] ?? r[chosen?.toUpperCase?.()]), 0);
    return { total, col: chosen };
  }

  const loads = [];
  for (let y = startYear; y < endYearExclusive; y++) {
    const file = seasonFile(y);
    const label = seasonName(y);
    loads.push(
      d3.csv(file).then(rows => {
        if (!rows?.length) return null;
        const { total, col } = sumColumn(rows);
        return { season: label, attempts: total, colUsed: col };
      }).catch(() => null)
    );
  }

  let data = (await Promise.all(loads)).filter(Boolean);
  if (!data.length) {
    g.append("text").attr("x", 8).attr("y", 18).attr("fill", "#f66")
      .text("No season CSVs loaded or 3PA column not found.");
    return;
  }

  data.sort((a, b) => d3.ascending(+a.season.slice(0,4), +b.season.slice(0,4)));

  // Scales
  const x = d3.scalePoint()
    .domain(data.map(d => d.season))
    .range([0, W])
    .padding(0.6);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.attempts)]).nice()
    .range([H, 0]);

  // Axes with enhanced visibility over the image
  const xAxis = g.append("g")
    .attr("transform", `translate(0,${H})`)
    .attr("class", "axis x")
    .call(d3.axisBottom(x).tickValues(data.filter((d, i) => i % 3 === 0).map(d => d.season)));  // Show every 3rd year

  xAxis.selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end")
    .attr("dx", "-0.5em")
    .attr("dy", "0.15em")
    .style("fill", "#fff")
    .style("font-weight", "bold")
    .style("font-size", "10px");

  xAxis.selectAll("line, path")
    .style("stroke", "#fff")
    .style("stroke-width", 1.5);

  const yAxisG = g.append("g").attr("class", "axis y")
    .call(d3.axisLeft(y).ticks(4).tickFormat(d => d3.format(".1s")(d)));

  yAxisG.selectAll("text")
    .style("fill", "#fff")
    .style("font-weight", "bold")
    .style("font-size", "10px");

  yAxisG.selectAll("line, path")
    .style("stroke", "#fff")
    .style("stroke-width", 1.5);

  yAxisG.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -H / 2)
    .attr("y", -45)
    .attr("fill", "#ffd700")
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("font-weight", "bold")
    .style("text-shadow", "2px 2px 4px rgba(0,0,0,0.9)")
    .text("League 3PA");

  g.insert("rect", ":first-child")
    .attr("x", -M.left)
    .attr("y", -M.top)
    .attr("width", graphWidth)
    .attr("height", graphHeight)
    .attr("fill", "rgba(0, 0, 0, 0.7)")
    .attr("rx", 10);

  SVG.append("text")
    .attr("x", graphX + graphWidth / 2)
    .attr("y", graphY - 5)
    .attr("fill", "#ffd700")
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("text-shadow", "2px 2px 4px rgba(0,0,0,0.9)")
    .text("3-Point Revolution");

  const line = d3.line()
    .x(d => x(d.season))
    .y(d => y(d.attempts))
    .defined(d => d.attempts != null)
    .curve(d3.curveMonotoneX);

  g.append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", "#ffd700")
    .attr("stroke-width", 3)
    .style("filter", "drop-shadow(0 0 6px #ffd700)")
    .attr("d", line);

  g.append("g").selectAll("circle")
    .data(data)
    .join("circle")
    .attr("cx", d => x(d.season))
    .attr("cy", d => y(d.attempts))
    .attr("r", 4)
    .attr("fill", "#ffd700")
    .attr("stroke", "#fff")
    .attr("stroke-width", 2)
    .style("filter", "drop-shadow(0 0 3px #ffd700)")
    .style("cursor", "pointer")
    .on("mousemove", (ev, d) => {
      tooltip.style("opacity", 1)
        .style("left", `${ev.pageX + 12}px`)
        .style("top",  `${ev.pageY + 12}px`)
        .html(`<b>${d.season}</b><br/>League 3PA: ${Math.round(d.attempts).toLocaleString()}`);
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  // Responsive redraw
  window.addEventListener("resize", () => render3ptTimeline(sel), { passive: true });
}
