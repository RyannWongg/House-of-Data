export function renderPace(sel) {
  const CSV_PATH = "data/cleaned_pace.csv";
  const X_COL = "Season", Y_COL = "Pace", CAT_COL = "Team";
  const MARGIN = { top: 24, right: 24, bottom: 150, left: 60 };

  let series;                 
  let legendItems;            
  const visState = new Map(); 
  let focusTeam = null;
  let prevVisState = null;   // snapshot of visState
  let prevFocusTeam = null;  // snapshot of focus

  const svg = d3.select(sel.svg);
  const legendEl = d3.select(sel.legend);
  const tooltip = d3.select(sel.tooltip);
  const teamSelect = d3.select(sel.teamSelect);
  const clearBtn = d3.select(sel.clearBtn);
  const showAllBox = d3.select(sel.showAll);

  function cssSafe(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, "_"); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  function syncLegend() {
    const items = legendEl.selectAll(".legend-item");
    if (!items.empty()) {
      items.classed("off", d => !visState.get(d.team));
    }
  }

  function setVisFromMap(srcMap) {
    visState.clear();
    for (const [k, v] of srcMap.entries()) visState.set(k, v);
  }


  function clearHighlight() {
    d3.selectAll(".line").classed("dim highlight", false).style("stroke-width", 2);
    d3.selectAll(".team-dot").classed("dim", false);
  }

  function updateShowAllCheckbox() {
    const allOn = focusTeam == null && Array.from(visState.values()).every(Boolean);
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
      focusTeam = null;
      teams.forEach(t => visState.set(t.team, true));
      showAllBox.property("checked", true);
      if (teamSelect.node()) teamSelect.node().selectedIndex = 0;
      syncLegend();
      applyVisibility(120);
    });

    showAllBox.on("change", (e) => {
      const showAll = e.target.checked;

      if (showAll) {
        // snapshot current state
        prevVisState = new Map(visState);
        prevFocusTeam = focusTeam;

        // clear focus + show everything
        focusTeam = null;
        teams.forEach(t => visState.set(t.team, true));
        if (teamSelect.node()) teamSelect.node().selectedIndex = 0;

        syncLegend();
        applyVisibility(120);
      } else {
        // restore previous snapshot if available
        if (prevVisState) {
          setVisFromMap(prevVisState);   // <-- mutate, don't reassign
          focusTeam = prevFocusTeam;     // may be null
        } else {
          teams.forEach(t => visState.set(t.team, true));
          focusTeam = null;
        }

        syncLegend();
        applyVisibility(120);
        updateShowAllCheckbox();

        // clear snapshot so next cycle gets a fresh one
        prevVisState = null;
        prevFocusTeam = null;
      }
    });

    teamSelect.on("change", function () {
      const team = this.value;
      if (!team || team === "(select team)…") return;

      focusTeam = team;                     // ← set focus
      visState.set(team, true);             // make sure it’s on
      showAllBox.property("checked", false);
      syncLegend();
      applyVisibility(120);
    });

    let firstRender = true;

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

      // --- timing knobs ---
      const TOTAL = 5000;         // total time to sweep first->last season
      const DOT_POP = 140;      // fast pop once line reaches the dot
      const DOT_LAG = 10;       // slight lag after the line hits (ms)
      const EASE = d3.easeCubicOut;

      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

      // helper: get index of a season string like "2014-15"
      const seasonIdx = s => seasons.indexOf(String(s));

      function lengthAtX(pathNode, targetX, totalLen) {
        // binary search along the path length
        let lo = 0, hi = totalLen, it = 0;
        while (lo <= hi && it++ < 30) {
          const mid = (lo + hi) / 2;
          const p = pathNode.getPointAtLength(mid);
          if (Math.abs(p.x - targetX) < 0.5) return mid;
          if (p.x < targetX) lo = mid + 0.5;
          else hi = mid - 0.5;
        }
        return Math.max(0, Math.min(totalLen, lo));
      }
      
      // series
      series = g.append("g").attr("class", "series")
        .selectAll(".series-line")
        .data(teams, d => d.team)
        .join("g")
        .attr("class", d => `series-line team-${cssSafe(d.team)}`);
  
      const pathInfo = new Map(); // team -> { node, total }
      
      series.append("path")
        .attr("class", "line")
        .attr("stroke", d => colorFn(d.team))
        .attr("d", d => line(d.values))
        .each(function (d) {
          // cache path node + length for dot timing
          const total = this.getTotalLength?.() || 0;
          pathInfo.set(d.team, { node: this, total });
          if (!firstRender) return;              // don’t replay on resize
          d3.select(this)
            .attr("stroke-dasharray", `${total} ${total}`)
            .attr("stroke-dashoffset", total)
            .transition()
            .duration(reduceMotion ? 0 : TOTAL)
            .ease(EASE)
            .attr("stroke-dashoffset", 0);
      });

      series.selectAll("circle")
        .data(d => d.values.map(v => ({ ...v, team: d.team })))
        .join("circle")
        .attr("class", "team-dot")
        .attr("fill", d => colorFn(d.team))
        .attr("cx", d => xCenter(String(d[X_COL])))
        .attr("cy", d => y(d[Y_COL]))
        .attr("r", firstRender ? 0 : 2.5)
        .style("opacity", firstRender ? 0 : 1)
        .on("mousemove", (event, d) => {
          const [pageX, pageY] = [event.pageX, event.pageY];
          tooltip.style("opacity", 1)
            .style("left", `${pageX + 12}px`)
            .style("top", `${pageY + 12}px`)
            .html(`<b>${d.Team}</b><br>${d.Season}<br>Pace: ${d3.format(".1f")(d.Pace)}`);
        })
        .on("mouseleave", () => tooltip.style("opacity", 0))
        .transition()
        .delay(d => {
          if (!firstRender || reduceMotion) return 0;
          const info = pathInfo.get(d.team);
          if (!info) return 0;

          const cx = xCenter(String(d[X_COL]));
          const lenAtX = lengthAtX(info.node, cx, info.total);
          // time = fraction of path length * TOTAL + tiny lag
          return (info.total ? (lenAtX / info.total) * TOTAL : 0) + DOT_LAG;
        })
        .duration(reduceMotion ? 0 : DOT_POP)
        .ease(EASE)
        .attr("r", 2.5)
        .style("opacity", 1);

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
        applyVisibility(120);
        legendEl.selectAll(".legend-item")
          .filter(d => d.team === team)
          .classed("off", !on);
        updateShowAllCheckbox();
      }
      
      firstRender = false;
    }

    function applyVisibility(dur = 200) {
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      const D = reduceMotion ? 0 : dur;

      // interrupt any ongoing transitions so new one starts immediately
      series.selectAll(".line").interrupt();
      series.selectAll("circle").interrupt();

      const t = d3.transition().duration(D).ease(d3.easeLinear);

      series.selectAll(".line")
        .transition(t)
        .style("opacity", d => {
          if (focusTeam) return d.team === focusTeam ? 0.98 : 0.08;
          return visState.get(d.team) ? 0.95 : 0;
        })
        .style("stroke-width", d => (focusTeam && d.team === focusTeam) ? 3.5 : 2);

      series.selectAll("circle")
        .transition(t)
        .style("opacity", d => {
          if (focusTeam) return d.team === focusTeam ? 1 : 0.08;
          return visState.get(d.team) ? 1 : 0;
        });
    }

    window.addEventListener("resize", debounce(draw, 150));
    draw();
  }).catch(err => {
    console.error("Failed to load CSV:", err);
    tooltip.style("opacity", 1).html("Error loading data. Check CSV path and format.");
  });
}
