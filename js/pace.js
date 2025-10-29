export function renderPace(sel) {
  const CSV_PATH = "data/cleaned_pace.csv";
  const X_COL = "Season", Y_COL = "Pace", CAT_COL = "Team";
  const MARGIN = { top: 24, right: 24, bottom: 150, left: 60 };

  let series;                 
  let legendItems;            
  const visState = new Map(); 

  const svg = d3.select(sel.svg);
  const legendEl = d3.select(sel.legend);
  const tooltip = d3.select(sel.tooltip);
  const teamSelect = d3.select(sel.teamSelect);
  const clearBtn = d3.select(sel.clearBtn);
  const showAllBox = d3.select(sel.showAll);

  function cssSafe(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, "_"); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function highlightTeam(team) {
    d3.selectAll(".line")
      .classed("dim", d => d && d.team !== team)
      .classed("highlight", d => d && d.team === team);
    d3.selectAll(".team-dot")
      .classed("dim", d => d && d.team !== team);
  }

  function clearHighlight() {
    d3.selectAll(".line").classed("dim highlight", false).style("stroke-width", 2);
    d3.selectAll(".team-dot").classed("dim", false);
  }

  function updateShowAllCheckbox() {
    const allOn = Array.from(visState.values()).every(Boolean);
    showAllBox.property("checked", allOn);
  }

  // Title Case normalization for team names (and strip *)
  function normTeamNameTitle(s) {
    return String(s)
      .replace(/\*/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  // Map of team names to colors
  const aliasToColor = new Map([
    ["Atlanta Hawks","#E03A3E"],["Boston Celtics","#007A33"],["Brooklyn Nets","#000000"],
    ["Charlotte Hornets","#1D1160"],["Chicago Bulls","#CE1141"],["Cleveland Cavaliers","#860038"],
    ["Dallas Mavericks","#00538C"],["Denver Nuggets","#0E2240"],["Detroit Pistons","#C8102E"],
    ["Golden State Warriors","#1D428A"],["Houston Rockets","#CE1141"],["Indiana Pacers","#002D62"],
    ["Los Angeles Clippers","#C8102E"],["Los Angeles Lakers","#552583"],["Memphis Grizzlies","#5D76A9"],
    ["Miami Heat","#98002E"],["Milwaukee Bucks","#00471B"],["Minnesota Timberwolves","#0C2340"],
    ["New Orleans Pelicans","#0C2340"],["New York Knicks","#F58426"],["Oklahoma City Thunder","#007AC1"],
    ["Orlando Magic","#0077C0"],["Philadelphia 76ers","#006BB6"],["Phoenix Suns","#1D1160"],
    ["Portland Trail Blazers","#E03A3E"],["Sacramento Kings","#5A2D81"],["San Antonio Spurs","#C4CED4"],
    ["Toronto Raptors","#CE1141"],["Utah Jazz","#002B5C"],["Washington Wizards","#002B5C"],
    // historical teams:
    ["Seattle SuperSonics","#007AC1"],["New Orleans Hornets","#0C2340"],
    ["New Orleans/Oklahoma City Hornets","#0C2340"],["Charlotte Bobcats","#1D1160"],
    ["New Jersey Nets","#000000"],
  ]);

  let colorFn; 

  d3.csv(CSV_PATH).then(raw => {
    // sanitize
    raw.forEach(d => { d.Season = String(d.Season); d.Pace = +d.Pace; });
    raw = raw.filter(d => d[X_COL] != null && d[Y_COL] != null && d[CAT_COL] != null);

    // sort seasons by start year
    const seasonKey = s => {
      const m = String(s).match(/(19|20)\d{2}/);
      return m ? +m[0] : -Infinity;
    };
    raw.sort((a,b) => d3.ascending(seasonKey(a[X_COL]), seasonKey(b[X_COL])));

    const seasons = Array.from(new Set(raw.map(d => d.Season))).sort((a,b)=>+a.slice(0,4)-+b.slice(0,4));
    const teams = d3.groups(raw, d => d[CAT_COL]).map(([team, values]) => ({ team, values }));

    // init visibility state (all on)
    teams.forEach(t => visState.set(t.team, true));

    // Build fallback palette now that we know teams
    const teamNames = teams.map(t => t.team);
    const rainbow = d3.quantize(d3.interpolateSinebow, teamNames.length);
    const perm = Array.from({length: teamNames.length}, (_, i) => (i * 137) % teamNames.length);
    const fallbackRange = perm.map(i => d3.hsl(rainbow[i]).brighter(0.15).formatHex());
    const fallback = d3.scaleOrdinal(teamNames, fallbackRange);
    colorFn = (team) => aliasToColor.get(normTeamNameTitle(team)) ?? fallback(team);

    // Build controls
    teamSelect.selectAll("option")
      .data(["(select team)…", ...teams.map(t => t.team)])
      .join("option")
      .text(d => d);

    clearBtn.on("click", () => {
      teams.forEach(t => visState.set(t.team, true));
      applyVisibility();
      clearHighlight();
      showAllBox.property("checked", true);
      teamSelect.node().selectedIndex = 0;
      legendEl.selectAll(".legend-item").classed("off", false);
    });

    showAllBox.on("change", (e) => {
      const show = e.target.checked;
      teams.forEach(t => visState.set(t.team, show));
      applyVisibility();
      legendEl.selectAll(".legend-item").classed("off", !show);
      const sel = teamSelect.node().value;
      if (sel && sel !== "(select team)…") highlightTeam(sel); else clearHighlight();
    });

    teamSelect.on("change", function () {
      const team = this.value;
      if (!team || team === "(select team)…") return;
      visState.set(team, true);
      applyVisibility();
      legendEl.selectAll(".legend-item")
        .filter(d => d.team === team)
        .classed("off", false);
      highlightTeam(team);
    });

    // Draw (and re-draw on resize)
    function draw() {
      svg.selectAll("*").remove();
      const { width, height } = svg.node().getBoundingClientRect();
      const w = Math.max(360, width) - MARGIN.left - MARGIN.right;
      const h = Math.max(300, height) - MARGIN.top - MARGIN.bottom;

      const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

      // scales
      const x = d3.scaleBand().domain(seasons).range([0, w]).paddingInner(0.2);
      const xCenter = s => x(s) + x.bandwidth() / 2;
      const y = d3.scaleLinear().domain(d3.extent(raw, d => d[Y_COL])).nice().range([h, 0]);


      g.append("g")
        .attr("transform", `translate(0,${h})`)
        .attr("class", "axis x")
        .call(d3.axisBottom(x).tickValues(seasons));
      g.select(".axis.x").selectAll("text")
        .attr("transform", "rotate(-40)")
        .style("text-anchor", "end")
        .attr("dy", "0.35em");

      g.append("g").attr("class", "axis y")
        .call(d3.axisLeft(y).ticks(7))
        .append("text")
        .attr("x", 0).attr("y", -10).attr("fill", "#ccc").attr("text-anchor", "start")
        .text("Pace");

      // line generator
      const line = d3.line()
        .defined(d => d[Y_COL] != null && !isNaN(d[Y_COL]))
        .x(d => xCenter(String(d[X_COL])))
        .y(d => y(d[Y_COL]));

      // series
      series = g.append("g").attr("class", "series")
        .selectAll(".series-line")
        .data(teams, d => d.team)
        .join("g")
        .attr("class", d => `series-line team-${cssSafe(d.team)}`);

      series.append("path")
        .attr("class", "line")
        .attr("stroke", d => colorFn(d.team))
        .attr("d", d => line(d.values));

      series.selectAll("circle")
        .data(d => d.values.map(v => ({ ...v, team: d.team })))
        .join("circle")
        .attr("class", "team-dot")
        .attr("fill", d => colorFn(d.team))
        .attr("cx", d => xCenter(String(d[X_COL])))
        .attr("cy", d => y(d[Y_COL]))
        .attr("r", 2.5)
        .on("mousemove", (event, d) => {
          const [pageX, pageY] = [event.pageX, event.pageY];
          tooltip.style("opacity", 1)
            .style("left", `${pageX + 12}px`)
            .style("top", `${pageY + 12}px`)
            .html(`<b>${d.Team}</b><br>${d.Season}<br>Pace: ${d3.format(".1f")(d.Pace)}`);
        })
        .on("mouseleave", () => tooltip.style("opacity", 0));

      // legend
      legendEl.selectAll("*").remove();
      const legendData = teams.map(t => ({ team: t.team }));
      legendItems = legendEl.selectAll(".legend-item")
        .data(legendData, d => d.team)
        .join("div")
        .attr("class", "legend-item")
        .classed("off", d => visState.has(d.team) ? !visState.get(d.team) : false)
        .on("click", (_, d) => toggleTeam(d.team));

      legendItems.append("span")
        .attr("class", "legend-swatch")
        .style("background", d => colorFn(d.team));
      legendItems.append("span").text(d => d.team);

      function toggleTeam(team) {
        const on = !visState.get(team);
        visState.set(team, on);
        applyVisibility();
        legendEl.selectAll(".legend-item")
          .filter(d => d.team === team)
          .classed("off", !on);
        updateShowAllCheckbox();
        const sel = teamSelect.node().value;
        if (sel && sel !== "(select team)…") highlightTeam(sel); else clearHighlight();
      }
    }

    function applyVisibility() {
      // hide/show each team group
      series.classed("hidden", d => !visState.get(d.team));
    }

    window.addEventListener("resize", debounce(draw, 150));
    draw();
  }).catch(err => {
    console.error("Failed to load CSV:", err);
    tooltip.style("opacity", 1).html("Error loading data. Check CSV path and format.");
  });
}
