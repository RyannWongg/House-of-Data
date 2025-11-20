export function renderPace(sel) {
  const CSV_PATH = "data/cleaned_pace.csv";
  const X_COL = "Season", Y_COL = "Pace", CAT_COL = "Team";
  const MARGIN = { top: 24, right: 24, bottom: 45, left: 60 };

  let series;                 
  const visState = new Map(); 
  let focusTeam = null;
  let prevVisState = null;
  let prevFocusTeam = null;
  let isPlaying = false;
  let progress = 0;             
  let rafId = null;

  let didAutoStart = false;
  const ANIM_MS = 3000;
  const EASE =  t => t;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const svg = d3.select(sel.svg);
  const legendEl = d3.select(sel.legend);
  const tooltip = d3.select(sel.tooltip);
  const clearBtn = d3.select(sel.clearBtn);
  const showAllBox = d3.select(sel.showAll);
  const MIN_CHART_HEIGHT = 400;

  let layout = d3.select("#paceLayout");
  if (layout.empty()) {
    const chartHost = svg.node().parentNode;  
    const outer = chartHost.parentNode;

    layout = d3.select(outer)
      .insert("div", () => chartHost) 
      .attr("id", "paceLayout");

    const left  = layout.append("div").attr("id", "paceLeft");
    const right = layout.append("div").attr("id", "paceRight");

    left.node().appendChild(chartHost);

    if (!legendEl.empty()) {
      right.node().appendChild(legendEl.node());
    } else {
      d3.select(right.node())
        .append("div")
        .attr("id", sel.legend?.replace('#','') || "legend");
    }
  }

  const paceLeft = d3.select("#paceLeft");

  if (d3.select("#paceDescription").empty()) {
    paceLeft.insert("div", ":first-child")
      .attr("id", "paceDescription")
      .style("margin", "6px 0 10px")
      .style("color", "#ccc")
      .style("font-size", "0.95em")
      .html(`<strong>Pace (points per game)</strong>: Measure of how many points a team scores on average. Changes in pace reflect how the speed of the game has changed over time`);
  }


  function cssSafe(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, "_"); }

  function syncLegend() {
    const items = legendEl.selectAll(".legend-item");
    if (items.empty()) return;
    items
      .classed("off", d => !visState.get(d.team))
      .classed("is-focused", d => focusTeam === d.team)
      .classed("is-dimmed", d => !!focusTeam && focusTeam !== d.team && visState.get(d.team) !== false);
    items.select(".legend-pill")
      .attr("aria-pressed", d => (focusTeam === d.team ? "true" : "false"));
  }

  function syncLegendHeight() {
    const chartEl = svg.node();
    const mapWrap = document.getElementById("paceMapWrap");
    const chartH = chartEl ? chartEl.getBoundingClientRect().height : 0;
    const mapH   = mapWrap ? mapWrap.getBoundingClientRect().height : 0;

    const total = Math.max(0, Math.round(chartH + mapH));
    legendEl
      .style("max-height", total ? `${total}px` : null)
      .style("overflow", "auto");
  }


  function activeTeams() {
    if (!visState.size) return null;
    const on = new Set();
    for (const [team, isOn] of visState.entries()) if (isOn) on.add(team);
    return on;          
  }

  function setVisFromMap(srcMap) {
    visState.clear();
    for (const [k, v] of srcMap.entries()) visState.set(k, v);
  }

  function updateShowAllCheckbox() {
    const allOn = focusTeam == null && Array.from(visState.values()).every(Boolean);
    showAllBox.property("checked", allOn);
  }

  function normTeamNameTitle(s) {
    return String(s)
      .replace(/\*/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase());
  }

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
    ["Toronto Raptors","#8f0024ff"],["Utah Jazz","#002B5C"],["Washington Wizards","#002B5C"],
    ["Seattle SuperSonics","#007AC1"],["New Orleans Hornets","#0C2340"],
    ["New Orleans/Oklahoma City Hornets","#0C2340"],["Charlotte Bobcats","#1D1160"],
    ["New Jersey Nets","#000000"],
  ]);

  function teamSlug(name) {
    return String(name)
      .toLowerCase()
      .replace(/\*/g,'')
      .replace(/[^a-z0-9]+/g,' ')
      .trim()
      .replace(/\s+(los angeles|la)\b/g,'')
      .replace(/\s+(new york)\b/g,'ny')
      .replace(/\s+(golden state)\b/g,'warriors')
      .replace(/\s+(portland)\b/g,'trail blazers')
      .replace(/\s+(san antonio)\b/g,'spurs')
      .replace(/\s+/g,'-');
  }

  const LOGO_BASE = 'images/logos';

  function logoFor(team) {
    const alias = {
      'new orleans/oklahoma city hornets': 'hornets',
      'charlotte bobcats': 'hornets',
      'new jersey nets': 'nets',
      'seattle supersonics': 'supersonics'
    };
    let slug = teamSlug(team);
    if (alias[slug]) slug = alias[slug];
    return `${LOGO_BASE}/${slug}.png`;
  }

  function lightenHex(hex, { lAdd = 0.22, sMul = 0.92 } = {}) {
    const c = d3.hsl(hex);
    c.l = Math.min(1, c.l + lAdd);
    c.s = Math.max(0, c.s * sMul);
    return c.formatHex();
  }

  let colorFn; 

  d3.csv(CSV_PATH).then(raw => {
    raw.forEach(d => { d.Season = String(d.Season); d.Pace = +d.Pace; });
    raw = raw.filter(d => d[X_COL] != null && d[Y_COL] != null && d[CAT_COL] != null);

    const seasonKey = s => {
      const m = String(s).match(/(19|20)\d{2}/);
      return m ? +m[0] : -Infinity;
    };
    raw.sort((a,b) => d3.ascending(seasonKey(a[X_COL]), seasonKey(b[X_COL])));

    const seasons = Array.from(new Set(raw.map(d => d.Season))).sort((a,b)=>+a.slice(0,4)-+b.slice(0,4));
    const teams = d3.groups(raw, d => d[CAT_COL]).map(([team, values]) => ({ team, values }));

    function seasonFromProgress(p) {
      const t = EASE(Math.max(0, Math.min(1, p)));
      const idx = Math.min(seasons.length - 1, Math.max(0, Math.floor(t * (seasons.length - 1) + 1e-6)));
      return seasons[idx];
    }

    function syncMapToProgress() {
      const s = seasonFromProgress(progress);
      const mapSeasonSelEl = d3.select("#paceMapSeason");
      if (!mapSeasonSelEl.empty()) mapSeasonSelEl.property("value", s);
      if (typeof drawMapForSeason === "function") drawMapForSeason(s);
    }

    teams.forEach(t => visState.set(t.team, true));

    const teamNames = teams.map(t => t.team);
    const rainbow = d3.quantize(d3.interpolateSinebow, teamNames.length);
    const perm = Array.from({length: teamNames.length}, (_, i) => (i * 137) % teamNames.length);
    const fallbackRange = perm.map(i => d3.hsl(rainbow[i]).brighter(0.15).formatHex());
    const fallback = d3.scaleOrdinal(teamNames, fallbackRange);
    colorFn = (team) => {
      const base = aliasToColor.get(normTeamNameTitle(team)) ?? fallback(team);
      return lightenHex(base, { lAdd: 0.22, sMul: 0.92 });
    };


    clearBtn.on("click", () => {
      focusTeam = null;
      teams.forEach(t => visState.set(t.team, false));
      showAllBox.property("checked", false);
      syncLegend();
      applyVisibility(120);
      
      const curSeason = (typeof seasonFromProgress === 'function')
        ? seasonFromProgress(progress)
        : d3.select("#paceMapSeason").property("value");
      if (curSeason && typeof drawMapForSeason === 'function') {
        drawMapForSeason(curSeason);
      }
    });

    showAllBox.on("change", (e) => {
      const showAll = e.target.checked;

      if (showAll) {
        prevVisState = new Map(visState);
        prevFocusTeam = focusTeam;

        focusTeam = null;
        teams.forEach(t => visState.set(t.team, true));

        syncLegend();
        applyVisibility(120);
      } else {
        if (prevVisState) {
          setVisFromMap(prevVisState);   
          focusTeam = prevFocusTeam;   
        } else {
          teams.forEach(t => visState.set(t.team, true));
          focusTeam = null;
        }

        syncLegend();
        applyVisibility(120);
        updateShowAllCheckbox();

        prevVisState = null;
        prevFocusTeam = null;
      }

        const curSeason = (typeof seasonFromProgress === 'function')
          ? seasonFromProgress(progress)
          : d3.select("#paceMapSeason").property("value");
        if (curSeason && typeof drawMapForSeason === 'function') {
          drawMapForSeason(curSeason);
        }
    });

    const playPauseBtn = d3.select("#playPauseBtn");
    const replayBtn = d3.select("#replayAnimBtn");

    const pathInfo = new Map();

    function stopLoop() {
      isPlaying = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    playPauseBtn.on("click", () => {
      if (isPlaying) {
        stopLoop();
        playPauseBtn.text("Play");
      } else {
        play();
        playPauseBtn.text("Pause");
      }
    });

    replayBtn.on("click", () => {
      stopLoop();
      progress = 0;
      applyProgress(progress, true);
      syncMapToProgress();
      playPauseBtn.style("display", null);
      play();
      playPauseBtn.text("Pause");
    });

    let firstRender = true;

    function lengthAtX(pathNode, targetX, totalLen) {
      let lo = 0, hi = totalLen, it = 0;
      while (lo <= hi && it++ < 30) {
        const mid = (lo + hi) / 2;
        const p = pathNode.getPointAtLength(mid);
        if (Math.abs(p.x - targetX) < 0.5) return mid;
        if (p.x < targetX) lo = mid + 0.5; else hi = mid - 0.5;
      }
      return Math.max(0, Math.min(totalLen, lo));
    }

    function draw() {
      svg.selectAll("*").remove();
      const { width, height } = svg.node().getBoundingClientRect();
      const w = Math.max(360, width) - MARGIN.left - MARGIN.right;
      const h = Math.max(MIN_CHART_HEIGHT, height) - MARGIN.top - MARGIN.bottom;

      const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

      const x = d3.scaleBand().domain(seasons).range([0, w]).paddingInner(0.2);
      const xCenter = s => x(s) + x.bandwidth() / 2;
      const yExtent = d3.extent(raw, d => d[Y_COL]);
      const span    = (yExtent[1] - yExtent[0]) || 1;
      const yPad    = Math.max(1, span * 0.22);               
      const y = d3.scaleLinear()
        .domain([yExtent[0] - yPad, yExtent[1] + yPad])
        .nice()
        .range([h, 0]);

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
        .attr("transform", "rotate(-90)")
        .attr("x", -h / 2)
        .attr("y", -46)
        .attr("fill", "#ccc")
        .attr("text-anchor", "middle")
        .text("Pace");

      g.append("g")
        .attr("class", "y-grid")
        .call(d3.axisLeft(y).ticks(7).tickSize(-w).tickFormat(() => ""))
        .selectAll("line")
        .attr("stroke", "#2a2a2a");

      const line = d3.line()
        .defined(d => d[Y_COL] != null && !isNaN(d[Y_COL]))
        .x(d => xCenter(String(d[X_COL])))
        .y(d => y(d[Y_COL]));
      
      series = g.append("g").attr("class", "series")
        .selectAll(".series-line")
        .data(teams, d => d.team)
        .join("g")
        .attr("class", d => `series-line team-${cssSafe(d.team)}`);
  
      

      series.append("path")
        .attr("class", "line")
        .attr("stroke", d => colorFn(d.team))
        .attr("d", d => line(d.values))
        .each(function (d) {
          const total = this.getTotalLength?.() || 0;
          pathInfo.set(d.team, { node: this, total });
          if (!firstRender) return;         
          d3.select(this)
            .attr("stroke-dasharray", `${total} ${total}`)
            .attr("stroke-dashoffset", total);
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
        .on("mouseleave", () => tooltip.style("opacity", 0));

      series.select("path.line").each(function(d){
        const total = this.getTotalLength?.() || 0;
        pathInfo.set(d.team, { node: this, total });
      });

      applyProgress(progress, true);
      syncLegendHeight();


    legendEl.selectAll("*").remove();
    const legendData = teams.map(t => ({ team: t.team }));

    const items = legendEl.selectAll(".legend-item")
      .data(legendData, d => d.team)
      .join("div")
      .attr("class", "legend-item")
      .attr("data-team", d => d.team)
      .classed("off", d => visState.has(d.team) ? !visState.get(d.team) : false);

    items.append("input")
      .attr("type", "checkbox")
      .attr("class", "legend-check")
      .attr("id", d => `chk-${cssSafe(d.team)}`)
      .property("checked", d => visState.get(d.team) !== false)
      .on("change", (ev, d) => {
        const on = ev.currentTarget.checked;
        visState.set(d.team, on);
        if (!on && focusTeam === d.team) focusTeam = null;
        updateShowAllCheckbox();
        applyVisibility(120);
        drawMapForSeason(seasonFromProgress(progress));
        syncLegend();
      });

    items.append("span")
      .attr("class", "legend-swatch")
      .style("background", d => colorFn(d.team));

    items.append("button")
      .attr("type", "button")
      .attr("class", "legend-pill")
      .attr("aria-pressed", d => (focusTeam === d.team ? "true" : "false"))
      .on("click", (_, d) => {
        focusTeam = (focusTeam === d.team) ? null : d.team;
        if (focusTeam) {
          visState.set(focusTeam, true);
          legendEl.select(`#chk-${cssSafe(focusTeam)}`).property("checked", true);
        }
        updateShowAllCheckbox();
        applyVisibility(160);
        drawMapForSeason(seasonFromProgress(progress));
        syncLegend();
      })
      .append("span")
      .attr("class", "legend-label")
      .text(d => d.team)
      .append("img")
      .attr("class", "legend-logo")
      .attr("alt", d => d.team)
      .attr("src", d => logoFor(d.team));

    syncLegendHeight();

      firstRender = false;

    }
    
    function applyProgress(p, immediate=false) {
      const t = immediate ? null : d3.transition().duration(0);

      series.select("path.line").each(function(d){
        const info = pathInfo.get(d.team);
        const total = info?.total || 0;
        const shown = Math.max(0, Math.min(1, p));
        const dashArray = `${total} ${total}`;
        const dashOffset = total * (1 - shown);

        const sel = d3.select(this)
          .attr("stroke-dasharray", dashArray)
          .attr("stroke-dashoffset", dashOffset);

        const vis = focusTeam ? (d.team === focusTeam) : visState.get(d.team);
        sel.style("opacity", () => {
          if (focusTeam) return d.team === focusTeam ? 0.98 : 0.08;
          return vis ? 0.95 : 0;
        })
        .style("stroke-width", (focusTeam && d.team === focusTeam) ? 3.5 : 2);
    });

    series.selectAll("circle.team-dot")
      .each(function(d){
        const info = pathInfo.get(d.team);
        if (!info) return;
    
        const cx = this.cx.baseVal.value;
        const partLen = lengthAtX(info.node, cx, info.total);
        const threshold = info.total ? (partLen / info.total) : 1;
        const passed = p >= threshold - 1e-4;

        const vis = focusTeam ? (d.team === focusTeam) : visState.get(d.team);
        d3.select(this)
          .attr("r", passed ? 2.5 : 0)
          .style("opacity", passed ? (vis ? 1 : 0) : 0);
      });
    }

    function play() {
      if (reduceMotion) { 
        progress = 1; 
        applyProgress(progress, true);
        syncMapToProgress();
        d3.select("#playPauseBtn").style("display", "none");
        return;
      }
      if (isPlaying) return;
      isPlaying = true;
      const start = progress;   
      const t0 = performance.now();
      function tick(tNow) {
        if (!isPlaying) return;
        const dt = tNow - t0;
        progress = Math.min(1, start + dt / ANIM_MS);
        applyProgress(progress, true);
        syncMapToProgress();
        if (progress < 1 && isPlaying) {
          rafId = requestAnimationFrame(tick);
        } else {
          isPlaying = false;
          playPauseBtn.text("Play");
          playPauseBtn.style("display", "none");
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    function applyVisibility(dur = 200) {
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      const D = reduceMotion ? 0 : dur;
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
      applyProgress(progress, true);
    }

    draw();
    applyProgress(progress, true);


  const TEAM_TO_STATE = new Map([
    ["Atlanta Hawks","GA"],
    ["Boston Celtics","MA"],
    ["Brooklyn Nets","NY"],
    ["New Jersey Nets","NJ"],
    ["Charlotte Hornets","NC"],
    ["Chicago Bulls","IL"],
    ["Cleveland Cavaliers","OH"],
    ["Dallas Mavericks","TX"],
    ["Denver Nuggets","CO"],
    ["Detroit Pistons","MI"],
    ["Golden State Warriors","CA"],
    ["Houston Rockets","TX"],
    ["Indiana Pacers","IN"],
    ["Los Angeles Clippers","CA"],
    ["Los Angeles Lakers","CA"],
    ["Memphis Grizzlies","TN"],
    ["Miami Heat","FL"],
    ["Milwaukee Bucks","WI"],
    ["Minnesota Timberwolves","MN"],
    ["New Orleans Pelicans","LA"],
    ["New Orleans Hornets","LA"],
    ["New Orleans/Oklahoma City Hornets","OK"],
    ["New York Knicks","NY"],
    ["Oklahoma City Thunder","OK"],
    ["Orlando Magic","FL"],
    ["Philadelphia 76ers","PA"],
    ["Phoenix Suns","AZ"],
    ["Portland Trail Blazers","OR"],
    ["Sacramento Kings","CA"],
    ["San Antonio Spurs","TX"],
    ["Toronto Raptors","ON"],
    ["Utah Jazz","UT"],
    ["Washington Wizards","DC"],
    ["Seattle SuperSonics","WA"],
    ["Charlotte Bobcats","NC"],
  ]);


  const FIPS_TO_USPS = {
    "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA",
    "15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA",
    "26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY",
    "37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX",
    "49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"
  };

  const usps = s => (s || "").toUpperCase();

  let mapWrap = d3.select("#paceMapWrap");
  if (mapWrap.empty()) {
    mapWrap = paceLeft.append("div")
      .attr("id", "paceMapWrap")
      .style("margin-top", "16px");

    mapWrap.append("div")
      .attr("class", "controls")
      .style("margin", "8px 0 8px")
      .html(`
        <label>Map season:
          <select id="paceMapSeason"></select>
        </label>
      `);

    mapWrap.append("div")
      .attr("class", "chart-wrap")
      .style("padding", "0")
      .style("overflow", "hidden")
      .append("svg")
        .attr("id", "usMap")
        .attr("viewBox", "0 0 960 600")
        .style("width", "100%")
        .style("height", "420px")
        .style("display", "block");
  }

  const mapSeasonSel = d3.select("#paceMapSeason");
  const seasonsForMap = Array.from(new Set(raw.map(d => d.Season)))
    .sort((a,b)=>+a.slice(0,4)-+b.slice(0,4));

  if (mapSeasonSel.selectAll("option").empty()) {
    mapSeasonSel.selectAll("option")
      .data(seasonsForMap)
      .join("option")
      .attr("value", d => d)
      .text(d => d);
    mapSeasonSel.property("value", seasonsForMap[seasonsForMap.length - 1]);
  }

  let statesTopo;
  let torontoGeo = null;
  let torontoLogoCenter = null;
  const mapSvg = d3.select("#usMap");
  const mapG   = mapSvg.selectAll("g.root").data([null]).join("g").attr("class","root");
  const fastestLegend = mapSvg.selectAll("g.fastest-legend")
    .data([null])
    .join("g")
    .attr("class", "fastest-legend")
    .attr("transform", "translate(760, 40)"); // tweak position if needed

  // Crown icon
  fastestLegend.selectAll("text.crown-icon")
    .data([null])
    .join("text")
    .attr("class", "crown-icon")
    .attr("x", 0)
    .attr("y", 0)
    .text("👑")
    .attr("text-anchor", "start")
    .attr("dominant-baseline", "middle")
    .style("font-size", "40px");

  // Explanation text
  fastestLegend.selectAll("text.crown-label")
    .data([null])
    .join("text")
    .attr("class", "crown-label")
    .attr("x", 50)   // little gap after emoji
    .attr("y", 0)
    .text("- Fastest pace this season")
    .attr("text-anchor", "start")
    .attr("dominant-baseline", "middle")
    .style("font-size", "17px")
    .style("fill", "#fff")
    .style("font-weight", "500")
    .style("paint-order", "stroke")
    .style("stroke", "#111")
    .style("stroke-width", "2px");

  const projection = d3.geoAlbersUsa().translate([480, 300]).scale(1200);
  const geoPath    = d3.geoPath(projection);

  async function ensureTopo() {
    if (statesTopo) return statesTopo;

    const localURL = "data/us-states-10m.json";
      const res = await fetch(localURL, { cache: "no-store" });
      const text = await res.text();
      statesTopo = JSON.parse(text);
      return statesTopo;
  }

  async function ensureToronto() {
    if (torontoGeo) return torontoGeo;
    const res = await fetch("data/toronto-boundary.json", { cache: "no-store" });
    torontoGeo = await res.json();
    return torontoGeo;
  }

  function teamColor(t) {
    return colorFn ? colorFn(t) : "#888";
  }

  function buildStateFills(rows, season, defs) {
    const byState = new Map();
    rows.forEach(d => {
      const st = TEAM_TO_STATE.get(d.Team);
      if (!st) return;
      if (!byState.has(st)) byState.set(st, []);
      byState.get(st).push(d);
    });

    const fastest = d3.maxIndex(rows, d => +d.Pace);
    const fastestTeam = fastest >= 0 ? rows[fastest].Team : null;
    const fastestState = fastestTeam ? TEAM_TO_STATE.get(fastestTeam) : null;

    const fills = new Map();

    for (const [st, teams] of byState.entries()) {
      const list = teams.slice().sort((a,b) => d3.ascending(a.Team, b.Team));

      if (list.length === 1) {
        fills.set(st, teamColor(list[0].Team));
        continue;
      }

      const gid = `grad-${st}-${season.replace(/[^0-9a-z]/gi, "")}`;
      const lg = defs.append("linearGradient")
        .attr("id", gid)
        .attr("x1", "0%").attr("y1", "0%")
        .attr("x2", "100%").attr("y2", "0%");

      const N = list.length;
      list.forEach((t, i) => {
        const c = teamColor(t.Team);
        const start = (i / N) * 100;
        const end   = ((i + 1) / N) * 100;

        lg.append("stop").attr("offset", `${start}%`).attr("stop-color", c);
        lg.append("stop").attr("offset", `${end}%`).attr("stop-color", c);
      });

      fills.set(st, `url(#${gid})`);
    }

    return { fills, fastestState, fastestTeam };
  }

  async function drawMapForSeason(season) {
    await ensureTopo();
    await ensureToronto();

    const us = statesTopo;
    const states = topojson.feature(us, us.objects.states);
    const mesh   = topojson.mesh(us, us.objects.states, (a,b)=>a!==b);

    let seasonRows = raw.filter(d => d.Season === season);

    const raptorsRows = seasonRows.filter(d => d.Team === "Toronto Raptors");
    const hasRaptors = raptorsRows.length > 0;

    const teamsByState = d3.groups(seasonRows, d => TEAM_TO_STATE.get(d.Team))
      .filter(([st]) => st);

    function gridOffsets(n, step=18, gap = 4) {
      const s = step + gap;
      const layouts = {
        1: [[0,0]],
        2: [[-step/1.2,0],[ step/1.2,0]],
        3: [[-step,0],[0,0],[ step,0]],
        4: [[-step,-step],[ step,-step],[-step, step],[ step, step]]
      };
      return (layouts[n] || layouts[4]).slice(0,n);
    }

    const act = activeTeams();
    if (act && act.size >= 0) {
      seasonRows = seasonRows.filter(r => act.has(r.Team));
    }
    const defs = mapSvg.selectAll("defs#mapGradients").data([null]).join("defs").attr("id","mapGradients");

    const { fills, fastestState, fastestTeam } = buildStateFills(seasonRows, season, defs);

    const statePaths = mapG.selectAll("path.state")
      .data(states.features, d => d.id);

    statePaths.join(
      enter => enter.append("path")
        .attr("class","state")
        .attr("d", geoPath)
        .attr("fill", d => {
          const st = FIPS_TO_USPS[String(d.id).padStart(2,"0")];
          const paint = fills.get(usps(st));
          return paint || "#1b1b1b";
        })
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.75)
        .append("title")
        .text(d => {
          const st = FIPS_TO_USPS[String(d.id).padStart(2,"0")];
          return st || "";
        }),
      update => update
        .attr("fill", d => {
          const st = FIPS_TO_USPS[String(d.id).padStart(2,"0")];
          const paint = fills.get(usps(st));
          return paint || "#1b1b1b";
        })
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.75),
      exit => exit.remove()
    );

    mapG.selectAll("path.borders")
      .data([mesh])
      .join("path")
      .attr("class","borders")
      .attr("fill","none")
      .attr("stroke","#fff")
      .attr("stroke-width",0.8)
      .attr("d", geoPath);

    const stateLogos = mapG.selectAll("g.state-logos")
      .data(teamsByState, d => d[0])
      .join(
        enter => enter.append("g").attr("class","state-logos"),
        update => update,
        exit => exit.remove()
      );

    mapG.selectAll("path.toronto-boundary").remove();

    const torFeature = torontoGeo.type === "FeatureCollection"
      ? torontoGeo.features[0]
      : torontoGeo;

    if (torFeature && torFeature.geometry) {
      const geom = torFeature.geometry;
      let rings;

      if (geom.type === "Polygon") {
        rings = [geom.coordinates[0]];          // outer ring
      } else if (geom.type === "MultiPolygon") {
        rings = [geom.coordinates[0][0]];       // first polygon's outer ring
      }

      if (rings && rings[0]) {
        const rawCoords = rings[0]; // array of [lon, lat]

        // Project lat/lon into map space; filter out any nulls
        const projected = rawCoords
          .map(([lon, lat]) => projection([lon, lat]))
          .filter(p => p && isFinite(p[0]) && isFinite(p[1]));

        if (projected.length > 2) {
          // Choose where Toronto should sit on the US map
          const rx = 740;   // tweak X if needed
          const ry = 150;   // tweak Y if needed

          const minX = d3.min(projected, d => d[0]);
          const maxX = d3.max(projected, d => d[0]);
          const minY = d3.min(projected, d => d[1]);
          const maxY = d3.max(projected, d => d[1]);

          const srcW = maxX - minX;
          const srcH = maxY - minY;
          const targetSize = 60; // visual size of Toronto
          const tx = 740;
          const ty = 150;
          const s = targetSize / Math.max(srcW || 1, srcH || 1);

          const torPoints = projected.map(([x, y]) => ([
            rx + (x - (minX + srcW / 2)) * s,
            ry + (y - (minY + srcH / 2)) * s
          ]));

          torontoLogoCenter = [tx, ty];

          const torPath = d3.line()
            .curve(d3.curveLinearClosed)(torPoints);

          const torRows = seasonRows.filter(d => d.Team === "Toronto Raptors");
          const paceVal = torRows.length ? +torRows[0].Pace : null;

          const torG = mapG.append("path")
            .attr("class", "toronto-boundary")
            .attr("d", torPath)
            .attr("fill", teamColor("Toronto Raptors"))
            .attr("fill-opacity", 0.9)
            .attr("stroke", "#111")
            .attr("stroke-width", 1.5);

          // Tooltip on hover
          torG
            .on("mousemove", (ev) => {
              const tt = d3.select(sel.tooltip);
              tt.style("opacity", 1)
                .style("left", `${ev.pageX + 12}px`)
                .style("top",  `${ev.pageY + 12}px`)
                .html(`
                  <b>Toronto Raptors</b><br>
                  Pace${paceVal != null ? `: ${d3.format(".1f")(paceVal)}` : ""}
                `);
            })
            .on("mouseleave", () => {
              d3.select(sel.tooltip).style("opacity", 0);
            });
        }
      }
    }

    stateLogos.each(function([st, teamRows]) {
      const gState = d3.select(this);

      let cx, cy;

      if (st === "ON" && torontoLogoCenter) {
        // Use our custom Toronto inset center
        [cx, cy] = torontoLogoCenter;
      } else {
        const feat = topojson.feature(statesTopo, statesTopo.objects.states)
          .features.find(f => FIPS_TO_USPS[String(f.id).padStart(2,'0')] === st);
        if (!feat) { gState.selectAll("*").remove(); return; }

        [cx, cy] = geoPath.centroid(feat);
      }

      const offsets = gridOffsets(teamRows.length);

      const imgs = gState.selectAll("image.team-logo")
        .data(teamRows, d => d.Team);

      imgs.join(
        enter => enter.append("image")
          .attr("class","team-logo")
          .attr("xlink:href", d => logoFor(d.Team))
          .attr("width", 45).attr("height", 45)
          .attr("opacity", 0.95)
          .attr("x", cx).attr("y", cy)
          .attr("pointer-events","none")
          .each(function(d, i) {
            const [dx, dy] = offsets[i] || [0,0];
            d3.select(this)
              .transition().duration(350)
              .attr("x", cx + dx - 8)
              .attr("y", cy + dy - 8);
          }),
        update => update.each(function(d, i) {
          const [dx, dy] = offsets[i] || [0,0];
          d3.select(this)
            .attr("xlink:href", logoFor(d.Team))
            .transition().duration(250)
            .attr("x", cx + dx - 8)
            .attr("y", cy + dy - 8);
        }),
        exit => exit.remove()
      );
    });

    mapG.selectAll("g.state-logos").raise();

    const torontoTeams = seasonRows.filter(r => r.Team === "Toronto Raptors");
    const torontoGroup = mapG.selectAll("g.toronto-raptors")
      .data(torontoTeams.length > 0 ? [torontoTeams[0]] : [])
      .join(
        enter => {
          const g = enter.append("g").attr("class", "toronto-raptors");
          const torontoX = 740;
          const torontoY = 150;
          
          g.append("circle")
            .attr("cx", torontoX)
            .attr("cy", torontoY)
            .attr("r", 25)
            .attr("fill", "#CE1141")
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5)
            .attr("opacity", 0.85);
          
          g.append("image")
            .attr("class", "toronto-logo")
            .attr("xlink:href", logoFor("Toronto Raptors"))
            .attr("x", torontoX - 20)
            .attr("y", torontoY - 20)
            .attr("width", 40)
            .attr("height", 40)
            .attr("opacity", 0.95)
            .attr("pointer-events", "none");
          
          g.append("circle")
            .attr("class", "toronto-hitbox")
            .attr("cx", torontoX)
            .attr("cy", torontoY)
            .attr("r", 25)
            .attr("fill", "transparent")
            .attr("cursor", "pointer")
            .on("mousemove", (ev, d) => {
              d3.select(sel.tooltip)
                .style("opacity", 1)
                .style("left", `${ev.pageX}px`)
                .style("top", `${ev.pageY + 12}px`)
                .html(`<b>ON (Canada)</b><br><div>${d.Team}: ${d3.format(".1f")(d.Pace)}</div>`);
            })
            .on("mouseleave", () => d3.select(sel.tooltip).style("opacity", 0));
          
          return g;
        },
        update => update,
        exit => exit.remove()
      );

    mapG.selectAll("path.fastest")
      .data(fastestState ? states.features.filter(f => FIPS_TO_USPS[String(f.id).padStart(2,"0")] === fastestState) : [])
      .join("path")
        .attr("class","fastest")
        .attr("d", geoPath)
        .attr("fill","none")
        .attr("pointer-events","none")
        .attr("stroke","#FFD700")
        .attr("stroke-width",3)
        .attr("stroke-linejoin","round")
        .attr("stroke-opacity",0.95);

    mapG.selectAll("path.state")
      .on("mousemove", (ev, d) => {
        const st = FIPS_TO_USPS[String(d.id).padStart(2,"0")];
        const teamsHere = seasonRows.filter(r => TEAM_TO_STATE.get(r.Team) === st)
          .sort((a,b)=>d3.descending(+a.Pace, +b.Pace));
        const rows = teamsHere.map(t => `<div>${t.Team}: ${d3.format(".1f")(t.Pace)}</div>`).join("");
        d3.select(sel.tooltip)
          .style("opacity", 1)
          .style("left", `${ev.pageX + 12}px`)
          .style("top",  `${ev.pageY + 12}px`)
          .html(`<b>${st}</b>${rows ? `<br>${rows}` : "<br><i>No team</i>"}${(st===fastestState)? `<div style="margin-top:4px;color:#FFD700;">★ Fastest: ${fastestTeam}</div>`:""}`);
      })
      .on("mouseleave", () => d3.select(sel.tooltip).style("opacity", 0));

    mapG.selectAll('.fastest-crown').remove();

    if (fastestState) {
      const statesFeature = topojson.feature(statesTopo, statesTopo.objects.states);
      const f = statesFeature.features.find(feat => {
        const code = FIPS_TO_USPS[String(feat.id).padStart(2,"0")];
        return code === fastestState;
      });
      if (f) {
        const [cx, cy] = geoPath.centroid(f);
        const b = geoPath.bounds(f);
        const w = b[1][0] - b[0][0], h = b[1][1] - b[0][1];
        const size = Math.max(14, Math.min(36, Math.min(w, h) * 0.6));
        const yOffset = Math.min(h * 0.15, 18);

        mapG.append('text')
          .attr('class','fastest-crown')
          .attr('x', cx)
          .attr('y', cy - yOffset)
          .attr('text-anchor', 'middle')
          .attr('font-size', size)
          .attr('pointer-events','none')
          .text('👑');
      }
    }

    syncLegendHeight();

  }

  drawMapForSeason(mapSeasonSel.property("value"));
  mapSeasonSel.on("change", () => drawMapForSeason(mapSeasonSel.property("value")));


    if (!reduceMotion && progress === 0 && !didAutoStart) {
    didAutoStart = true;
    d3.select("#playPauseBtn").text("Pause");
    play();
  }

  let footerEl = d3.select("#paceFooter");
  if (footerEl.empty()) {
    footerEl = d3.select("#paceLeft")
      .append("div")
      .attr("id", "paceFooter")
      .style("margin-top", "16px")
      .style("padding", "6px 0")
      .style("text-align", "center")
      .style("font-size", "0.85em")
      .style("color", "#ccc")
      .style("background", "#1b1b1b")
      .style("border-top", "1px solid #333")
      .html(`
        source: basketball-reference.com
      `);  
    }
})

}
