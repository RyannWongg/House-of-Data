export async function render3ptTimeline(sel) {
  const SVG = d3.select(sel.svg);
  const tooltip = d3.select(sel.tooltip);

  if (!SVG.attr("height") && !SVG.style("height")) SVG.style("height", "700px");
  SVG.selectAll("*").remove();

  const M = { top: 20, right: 20, bottom: 40, left: 60 };
  const { width: bw, height: bh } = SVG.node().getBoundingClientRect();
  
  const graphWidth = Math.min(800, bw * 0.85);
  const graphHeight = Math.min(500, bh * 0.7);
  const W = graphWidth - M.left - M.right;
  const H = graphHeight - M.top - M.bottom;

  const graphX = (bw - graphWidth) / 2; 
  const graphY = (bh - graphHeight) / 2;
  
  const g = SVG.append("g").attr("transform", `translate(${graphX + M.left},${graphY + M.top})`);

  const startYear = 2005;
  const endYearExclusive = 2025;
  const seasonName = y => `${y}-${String((y + 1)).padStart(2, "0")}`; 
  const seasonFile = y => `data/${seasonName(y)}.csv`;

  const SUM_COLUMNS = ["3PA", "FG3A"];
  const MAKES_COLUMNS = ["3P", "FG3"];
  const PLAYER_COLUMN = "Player";

  const num = v => +String(v ?? "").replace(/,/g, "") || 0;

  // Hardcoded mapping of season to player image filename
  const SEASON_PLAYER_IMAGES = {
    "2005-2006": "images/allen.png",
    "2006-2007": "images/arenas.png",
    "2007-2008": "images/richardson.png",
    "2008-2009": "images/lewis.png",
    "2009-2010": "images/brooks.PNG",
    "2010-2011": "images/wright.png",
    "2011-2012": "images/anderson.png",
    "2012-2013": "images/curry.png",
    "2013-2014": "images/curry.png",
    "2014-2015": "images/curry.png",
    "2015-2016": "images/curry.png",
    "2016-2017": "images/curry.png",
    "2017-2018": "images/harden.PNG",
    "2018-2019": "images/harden.PNG",
    "2019-2020": "images/harden.PNG",
    "2020-2021": "images/curry.png",
    "2021-2022": "images/curry.png",
    "2022-2023": "images/thompson.png",
    "2023-2024": "images/curry.png",
    "2024-2025": "images/edwards.png"
  };

  // Hardcoded mapping of season to player names (matching the images)
  const SEASON_PLAYER_NAMES = {
    "2005-2006": "Ray Allen",
    "2006-2007": "Gilbert Arenas",
    "2007-2008": "Jason Richardson",
    "2008-2009": "Rashard Lewis",
    "2009-2010": "Aaron Brooks",
    "2010-2011": "Dorell Wright",
    "2011-2012": "Ryan Anderson",
    "2012-2013": "Stephen Curry",
    "2013-2014": "Stephen Curry",
    "2014-2015": "Stephen Curry",
    "2015-2016": "Stephen Curry",
    "2016-2017": "Stephen Curry",
    "2017-2018": "James Harden",
    "2018-2019": "James Harden",
    "2019-2020": "James Harden",
    "2020-2021": "Stephen Curry",
    "2021-2022": "Stephen Curry",
    "2022-2023": "Klay Thompson",
    "2023-2024": "Stephen Curry",
    "2024-2025": "Anthony Edwards"
  };

  // Helper function to get player image path by season
  function getPlayerImagePath(season) {
    console.log('Looking up season:', season, 'Available keys:', Object.keys(SEASON_PLAYER_IMAGES));
    console.log('Match found:', SEASON_PLAYER_IMAGES[season]);
    return SEASON_PLAYER_IMAGES[season] || null;
  }

  // Helper function to get player name by season
  function getPlayerName(season) {
    return SEASON_PLAYER_NAMES[season] || "Unknown";
  }

  function sumColumn(rows) {
    const cols = rows.columns ? rows.columns : Object.keys(rows[0] ?? {});
    const chosen =
      SUM_COLUMNS.find(c => cols.includes(c)) ||
      SUM_COLUMNS.find(c => cols.includes(c.toLowerCase())) ||
      SUM_COLUMNS.find(c => cols.includes(c.toUpperCase()));
    
    const makesCol =
      MAKES_COLUMNS.find(c => cols.includes(c)) ||
      MAKES_COLUMNS.find(c => cols.includes(c.toLowerCase())) ||
      MAKES_COLUMNS.find(c => cols.includes(c.toUpperCase()));
    
    if (!chosen) return { total: 0, col: null, topPlayer: null, topPlayerMakes: 0 };

    const total = rows.reduce((acc, r) => acc + num(r[chosen] ?? r[chosen?.toLowerCase?.()] ?? r[chosen?.toUpperCase?.()]), 0);
    
    // Find player with most 3P makes
    let topPlayer = null;
    let topPlayerMakes = 0;
    rows.forEach(r => {
      const makes = num(r[makesCol] ?? r[makesCol?.toLowerCase?.()] ?? r[makesCol?.toUpperCase?.()]);
      if (makes > topPlayerMakes) {
        topPlayerMakes = makes;
        topPlayer = r[PLAYER_COLUMN] || r.player || r.PLAYER || "Unknown";
      }
    });

    return { total, col: chosen, topPlayer, topPlayerMakes };
  }

  const loads = [];
  for (let y = startYear; y < endYearExclusive; y++) {
    const file = seasonFile(y);
    const label = seasonName(y);
    loads.push(
      d3.csv(file).then(rows => {
        if (!rows?.length) return null;
        const { total, col, topPlayer, topPlayerMakes } = sumColumn(rows);
        return { season: label, attempts: total, colUsed: col, topPlayer, topPlayerMakes };
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
    .call(d3.axisBottom(x).tickValues(data.filter((d, i) => i % 3 === 0).map(d => d.season)));

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
    .attr("d", line);

  // Add player image overlay container
  const playerImageOverlay = SVG.append("g")
    .attr("class", "player-image-overlay")
    .style("opacity", 0)
    .style("pointer-events", "none");

  // Background for player image
  const cardWidth = 160;
  const cardHeight = 240;
  const cardOffsetX = 20;
  const cardOffsetY = -120;

  playerImageOverlay.append("rect")
    .attr("class", "card-bg")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", cardWidth)
    .attr("height", cardHeight)
    .attr("fill", "rgba(0, 0, 0, 0.85)")
    .attr("rx", 10)
    .attr("stroke", "#ffd700")
    .attr("stroke-width", 2);

  // Season text
  const seasonText = playerImageOverlay.append("text")
    .attr("x", cardWidth / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("fill", "#fff")
    .style("font-size", "13px")
    .style("font-weight", "bold");

  // League 3PA text
  const leagueText = playerImageOverlay.append("text")
    .attr("x", cardWidth / 2)
    .attr("y", 40)
    .attr("text-anchor", "middle")
    .attr("fill", "#ccc")
    .style("font-size", "11px");

  // Player image
  const playerImage = playerImageOverlay.append("image")
    .attr("x", 10)
    .attr("y", 50)
    .attr("width", 140)
    .attr("height", 140)
    .style("clip-path", "circle(70px at 70px 70px)")
    .attr("preserveAspectRatio", "xMidYMid slice");

  // Player name text
  const playerNameText = playerImageOverlay.append("text")
    .attr("x", cardWidth / 2)
    .attr("y", 205)
    .attr("text-anchor", "middle")
    .attr("fill", "#ffd700")
    .style("font-size", "14px")
    .style("font-weight", "bold");

  // Player stats text
  const playerStatsText = playerImageOverlay.append("text")
    .attr("x", cardWidth / 2)
    .attr("y", 225)
    .attr("text-anchor", "middle")
    .attr("fill", "#fff")
    .style("font-size", "12px");

  g.append("g").selectAll("circle")
    .data(data)
    .join("circle")
    .attr("cx", d => x(d.season))
    .attr("cy", d => y(d.attempts))
    .attr("r", 4)
    .attr("fill", "#ffd700")
    .attr("stroke", "#fff")
    .attr("stroke-width", 2)
    .style("cursor", "pointer")
    .on("mousemove", (ev, d) => {
      const playerImagePath = getPlayerImagePath(d.season);
      console.log('Season:', d.season, 'Image Path:', playerImagePath); // Debug log
      
      // Update player image overlay
      if (playerImagePath) {
        // Position the card near the cursor
        const svgRect = SVG.node().getBoundingClientRect();
        let cardX = ev.pageX - svgRect.left + cardOffsetX;
        let cardY = ev.pageY - svgRect.top + cardOffsetY;
        
        // Keep card within SVG bounds
        if (cardX + cardWidth > bw) cardX = bw - cardWidth - 10;
        if (cardX < 10) cardX = 10;
        if (cardY < 10) cardY = 10;
        if (cardY + cardHeight > bh) cardY = bh - cardHeight - 10;
        
        playerImageOverlay.attr("transform", `translate(${cardX},${cardY})`);
        
        seasonText.text(d.season);
        leagueText.text(`League 3PA: ${Math.round(d.attempts).toLocaleString()}`);
        playerImage.attr("href", playerImagePath);
        playerNameText.text(getPlayerName(d.season));
        const makesOneDecimal = Number(d.topPlayerMakes).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        playerStatsText.text(`3PM Per Game: ${makesOneDecimal}`);
        playerImageOverlay.transition().duration(200).style("opacity", 1);
      } else {
        playerImageOverlay.style("opacity", 0);
      }
    })
    .on("mouseleave", () => {
      playerImageOverlay.transition().duration(300).style("opacity", 0);
    });

  // Responsive redraw
  window.addEventListener("resize", () => render3ptTimeline(sel), { passive: true });
}