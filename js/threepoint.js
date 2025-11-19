export async function render3ptTimeline(sel) {
  const SVG = d3.select(sel.svg);
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

  const num = v => +String(v || "").replace(/,/g, "") || 0;

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

  function sumColumn(rows) {
    const cols = rows.columns || Object.keys(rows[0]);
    const chosen = SUM_COLUMNS.find(c => cols.includes(c));
    const makesCol = MAKES_COLUMNS.find(c => cols.includes(c));
    
    const total = rows.reduce((acc, r) => acc + num(r[chosen]), 0);
    
    let topPlayer = null;
    let topPlayerMakes = 0;
    rows.forEach(r => {
      const makes = num(r[makesCol]);
      if (makes > topPlayerMakes) {
        topPlayerMakes = makes;
        topPlayer = r[PLAYER_COLUMN];
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
        if (!rows.length) return null;
        const { total, topPlayer, topPlayerMakes } = sumColumn(rows);
        return { season: label, attempts: total, topPlayer, topPlayerMakes };
      })
    );
  }

  const data = (await Promise.all(loads)).filter(Boolean).sort((a, b) => d3.ascending(+a.season.slice(0,4), +b.season.slice(0,4)));

  const x = d3.scalePoint()
    .domain(data.map(d => d.season))
    .range([0, W])
    .padding(0.6);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.attempts)])
    .range([H, 0]);

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
    .text("League 3PM");

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
  

  const path = g.append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", "#ffd700")
    .attr("stroke-width", 3)
    .attr("d", line);
  
    const totalLength = path.node().getTotalLength();
    path
      .attr("stroke-dasharray", totalLength + " " + totalLength)
      .attr("stroke-dashoffset", totalLength)
      .transition()
      .duration(2000)
      .ease(d3.easeLinear)
      .attr("stroke-dashoffset", 0);


  const playerImageOverlay = SVG.append("g")
    .attr("class", "player-image-overlay")
    .style("opacity", 0)
    .style("pointer-events", "none");

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

  const seasonText = playerImageOverlay.append("text")
    .attr("x", cardWidth / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("fill", "#fff")
    .style("font-size", "13px")
    .style("font-weight", "bold");

  const leagueText = playerImageOverlay.append("text")
    .attr("x", cardWidth / 2)
    .attr("y", 40)
    .attr("text-anchor", "middle")
    .attr("fill", "#ccc")
    .style("font-size", "11px");

  const playerImage = playerImageOverlay.append("image")
    .attr("x", 10)
    .attr("y", 50)
    .attr("width", 140)
    .attr("height", 140)
    .style("clip-path", "circle(70px at 70px 70px)")
    .attr("preserveAspectRatio", "xMidYMid slice");

  const playerNameText = playerImageOverlay.append("text")
    .attr("x", cardWidth / 2)
    .attr("y", 205)
    .attr("text-anchor", "middle")
    .attr("fill", "#ffd700")
    .style("font-size", "14px")
    .style("font-weight", "bold");

  const playerStatsText = playerImageOverlay.append("text")
    .attr("x", cardWidth / 2)
    .attr("y", 225)
    .attr("text-anchor", "middle")
    .attr("fill", "#fff")
    .style("font-size", "12px");

  const dotSize = 20;

  g.append("g").selectAll("image.threept-dot")
    .data(data)
    .join("image")
    .attr("class", "threept-dot")
    .attr("href", "images/basketball-dot.png")
    .attr("width", dotSize)
    .attr("height", dotSize)
    .attr("x", d => x(d.season) - dotSize / 2)
    .attr("y", d => y(d.attempts) - dotSize / 2)
    .style("cursor", "pointer")
    .style("opacity", 0)
    .transition()
    .duration(300)
    .delay((d, i) => 2000 + i * 50)
    .style("opacity", 1)
    .selection()
    .on("mousemove", (ev, d) => {
      const playerImagePath = SEASON_PLAYER_IMAGES[d.season];
      
      if (playerImagePath) {
        const svgRect = SVG.node().getBoundingClientRect();
        const cardX = Math.max(10, Math.min(ev.pageX - svgRect.left + cardOffsetX, bw - cardWidth - 10));
        const cardY = Math.max(10, Math.min(ev.pageY - svgRect.top + cardOffsetY, bh - cardHeight - 10));
        
        playerImageOverlay.attr("transform", `translate(${cardX},${cardY})`);
        
        seasonText.text(d.season);
        leagueText.text(`League 3PM: ${Math.round(d.attempts).toLocaleString()}`);
        playerImage.attr("href", playerImagePath);
        playerNameText.text(SEASON_PLAYER_NAMES[d.season]);
        playerStatsText.text(`3PM Per Game: ${d.topPlayerMakes.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`);
        playerImageOverlay.transition().duration(200).style("opacity", 1);
      } else {
        playerImageOverlay.style("opacity", 0);
      }
    })
    .on("mouseleave", () => {
      playerImageOverlay.transition().duration(300).style("opacity", 0);
    });


  SVG.append("text")
  .attr("x", bw - 10)
  .attr("y", bh - 10)
  .attr("text-anchor", "end")
  .attr("fill", "#ccc")
  .style("font-size", "10px")
  .style("font-style", "italic")
  .style("opacity", 0.8)
  .text("source: basketball-reference.com");
}