export function renderPace(sel) {
  const CSV_PATH = "data/cleaned_pace.csv";
  const X_COL = "Season", Y_COL = "Pace", CAT_COL = "Team";
  const MARGIN = { top: 24, right: 24, bottom: 45, left: 60 };

  let series;                 
  let legendItems;            
  const visState = new Map(); 
  let focusTeam = null;
  let prevVisState = null;
  let prevFocusTeam = null;
  let isPlaying = false;
  let progress = 0;             
  let rafId = null;

  let didAutoStart = false;
  const ANIM_MS = 7000;
  const EASE =  t => t;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

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

  function activeTeams() {
  const els = Array.from(document.querySelectorAll('#legend .legend-item'));
  if (!els.length) return null;           // no legend -> no filter
  const active = els
    .filter(el => !el.classList.contains('off'))
    .map(el => el.getAttribute('data-team'))
    .filter(Boolean);
  return new Set(active);                 // could be size 0 (show nothing)
}

  function setVisFromMap(srcMap) {
    visState.clear();
    for (const [k, v] of srcMap.entries()) visState.set(k, v);
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

  function lightenHex(hex, { lAdd = 0.22, sMul = 0.92 } = {}) {
    const c = d3.hsl(hex);
    c.l = Math.min(1, c.l + lAdd);   // lift lightness
    c.s = Math.max(0, c.s * sMul);   // soften saturation a touch
    return c.formatHex();
  }

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

    // Map progress [0..1] -> season label (uses the same easing)
    function seasonFromProgress(p) {
      const t = EASE(Math.max(0, Math.min(1, p)));
      const idx = Math.min(seasons.length - 1, Math.max(0, Math.floor(t * (seasons.length - 1) + 1e-6)));
      return seasons[idx];
    }

    // Keep map in lockstep with the line animation & update dropdown
    function syncMapToProgress() {
      const s = seasonFromProgress(progress);
      const mapSeasonSelEl = d3.select("#paceMapSeason");
      if (!mapSeasonSelEl.empty()) mapSeasonSelEl.property("value", s);
      if (typeof drawMapForSeason === "function") drawMapForSeason(s);
    }

    // init visibility state (all on)
    teams.forEach(t => visState.set(t.team, true));

    // Build fallback palette now that we know teams
    const teamNames = teams.map(t => t.team);
    const rainbow = d3.quantize(d3.interpolateSinebow, teamNames.length);
    const perm = Array.from({length: teamNames.length}, (_, i) => (i * 137) % teamNames.length);
    const fallbackRange = perm.map(i => d3.hsl(rainbow[i]).brighter(0.15).formatHex());
    const fallback = d3.scaleOrdinal(teamNames, fallbackRange);
    colorFn = (team) => {
      const base = aliasToColor.get(normTeamNameTitle(team)) ?? fallback(team);
      return lightenHex(base, { lAdd: 0.22, sMul: 0.92 });
    };

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

    const playPauseBtn = d3.select("#playPauseBtn");
    const replayBtn    = d3.select("#replayAnimBtn");

    // cache per-team SVG path + total length for progress timing
    const pathInfo = new Map(); // team -> { node, total }

    // util: stop the loop safely
    function stopLoop() {
      isPlaying = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    playPauseBtn.on("click", () => {
      if (isPlaying) {
        // PAUSE: keep current partial drawing
        stopLoop();
        playPauseBtn.text("Play");
      } else {
        // PLAY (resume from current progress)
        play();
        playPauseBtn.text("Pause");
      }
    });

    replayBtn.on("click", () => {
      stopLoop();
      progress = 0;
      applyProgress(progress, /*immediate=*/true);
      syncMapToProgress();
      play();
      playPauseBtn.text("Pause");
    });

    let firstRender = true;
    let animRunning = false;

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
      const TOTAL = 5000; 
      const DOT_POP = 140; 
      const DOT_LAG = 10; 

      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

      const seasonIdx = s => seasons.indexOf(String(s));
      
      series = g.append("g").attr("class", "series")
        .selectAll(".series-line")
        .data(teams, d => d.team)
        .join("g")
        .attr("class", d => `series-line team-${cssSafe(d.team)}`);
  
      animRunning = firstRender; 

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

      applyProgress(progress, /*immediate=*/true);


      // legend
      legendEl.selectAll("*").remove();
      const legendData = teams.map(t => ({ team: t.team }));
      legendItems = legendEl.selectAll(".legend-item")
        .data(legendData, d => d.team)
        .join("div")
        .attr("class", "legend-item")
        .attr("data-team", d => d.team)
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
        // honor the animation's current season
      drawMapForSeason(seasonFromProgress(progress));
      }
      
      if (firstRender) {
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        const TOTAL = 7000;
        setTimeout(() => { animRunning = false; }, reduceMotion ? 0 : TOTAL + 100);
      }
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
        applyProgress(progress, /*immediate=*/true);
        syncMapToProgress();
        if (progress < 1 && isPlaying) {
          rafId = requestAnimationFrame(tick);
        } else {
          isPlaying = false;
          playPauseBtn.text("Play");
        }
      }
      rafId = requestAnimationFrame(tick);
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
      applyProgress(progress, /*immediate=*/true);
    }
    window.addEventListener("resize", debounce(() => {
      draw();
      applyProgress(progress, true);
      applyVisibility(0);
    }, 150));
    draw();
    applyProgress(progress, true);

    // === BELOW THE LINE-CHART SETUP, add a US-map under the chart ===

  // -------------- helpers & static maps --------------
  const TEAM_TO_STATE = new Map([
    // ALPHABETICAL by franchise – keys should match your CSV's Team strings
    ["Atlanta Hawks","GA"],
    ["Boston Celtics","MA"],
    ["Brooklyn Nets","NY"],         // also covers New Jersey Nets historically → NJ (see extra alias below)
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
    ["New Orleans/Oklahoma City Hornets","OK"], // Katrina years (OK)
    ["New York Knicks","NY"],
    ["Oklahoma City Thunder","OK"],
    ["Orlando Magic","FL"],
    ["Philadelphia 76ers","PA"],
    ["Phoenix Suns","AZ"],
    ["Portland Trail Blazers","OR"],
    ["Sacramento Kings","CA"],
    ["San Antonio Spurs","TX"],
    ["Toronto Raptors","ON"], // non-US; will be skipped in the US map
    ["Utah Jazz","UT"],
    ["Washington Wizards","DC"],
    // historical:
    ["Seattle SuperSonics","WA"],
    ["Charlotte Bobcats","NC"],
  ]);

  // FIPS→USPS state code (for your topojson). If your topo uses USPS codes in properties,
  // you won’t need this — adapt as needed.
  const FIPS_TO_USPS = {
    "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA",
    "15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA",
    "26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY",
    "37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX",
    "49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"
  };

  // utility
  const usps = s => (s || "").toUpperCase();

  // -------------- DOM: wrap + controls + svg --------------
  let mapWrap = d3.select("#paceMapWrap");
  if (mapWrap.empty()) {
    // put it right after the legend area
    mapWrap = d3.select(sel.legend).node()
      ? d3.select(sel.legend).append("div")
          .attr("id","paceMapWrap")
          .style("margin-top","16px")
      : d3.select(sel.svg).append("div")
          .attr("id","paceMapWrap")
          .style("margin-top","16px");

    mapWrap.append("div")
      .attr("class","controls")
      .style("margin","8px 0 8px")
      .html(`
        <label>Map season:
          <select id="paceMapSeason"></select>
        </label>
      `);

    mapWrap.append("div")
      .attr("class","chart-wrap")
      .style("padding","0")
      .style("overflow","hidden")
      .append("svg")
        .attr("id","usMap")
        .attr("viewBox","0 0 960 600")
        .style("width","100%")
        .style("height","420px")
        .style("display","block");
  }

  const mapSeasonSel = d3.select("#paceMapSeason");
  // re-use the seasons you already computed for the line chart:
  const seasonsForMap = Array.from(new Set(raw.map(d => d.Season)))
    .sort((a,b)=>+a.slice(0,4)-+b.slice(0,4));

  if (mapSeasonSel.selectAll("option").empty()) {
    mapSeasonSel.selectAll("option")
      .data(seasonsForMap)
      .join("option")
      .attr("value", d => d)
      .text(d => d);
    // default to the last (latest) season
    mapSeasonSel.property("value", seasonsForMap[seasonsForMap.length - 1]);
  }

  // -------------- draw/update --------------
  let statesTopo; // cache
  const mapSvg = d3.select("#usMap");
  const mapG   = mapSvg.selectAll("g.root").data([null]).join("g").attr("class","root");

  const projection = d3.geoAlbersUsa().translate([480, 300]).scale(1200);
  const geoPath    = d3.geoPath(projection);

  async function ensureTopo() {
    if (statesTopo) return statesTopo;

    // Try local file first
    const localURL = "data/us-states-10m.json";
    try {
      const res = await fetch(localURL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${localURL}`);
      const text = await res.text();

      // Quick sanity check: TopoJSON should start with {"type":"Topology"
      if (!/^\s*\{\s*"type"\s*:\s*"Topology"/.test(text)) {
        throw new Error(`Not TopoJSON: first 60 chars → ${text.slice(0, 60)}`);
      }
      statesTopo = JSON.parse(text);
      return statesTopo;
    } catch (err) {
      console.warn("[ensureTopo] Local load failed:", err?.message || err);

      // Fallback to CDN (us-atlas)
      const cdnURL = "https://unpkg.com/us-atlas@3/states-10m.json";
      try {
        const res2 = await fetch(cdnURL, { cache: "no-store" });
        if (!res2.ok) throw new Error(`HTTP ${res2.status} for ${cdnURL}`);
        statesTopo = await res2.json();
        console.info("[ensureTopo] Loaded from CDN fallback.");
        return statesTopo;
      } catch (err2) {
        console.error("[ensureTopo] CDN fallback failed:", err2?.message || err2);
        throw err2;
      }
    }
  }

  function teamColor(t) {
    // use the same color function you built earlier for the line chart
    return colorFn ? colorFn(t) : "#888";
  }

  function buildStateFills(rows, season, defs) {
    // rows = raw CSV filtered to season (Team, Pace, Season)
    // 1) pick per-state team list
    const byState = new Map();
    rows.forEach(d => {
      const st = TEAM_TO_STATE.get(d.Team);
      if (!st) return;              // skip CAN/unknown
      if (!byState.has(st)) byState.set(st, []);
      byState.get(st).push(d);
    });

    // 2) fastest team of the entire league this season (for gold overlay)
    const fastest = d3.maxIndex(rows, d => +d.Pace);
    const fastestTeam = fastest >= 0 ? rows[fastest].Team : null;
    const fastestState = fastestTeam ? TEAM_TO_STATE.get(fastestTeam) : null;

    // 3) per-state fill paint (color or gradient id)
    const fills = new Map();

    for (const [st, teams] of byState.entries()) {
      // Sort teams by pace just for deterministic order (optional)
      const list = teams.slice().sort((a,b) => d3.ascending(a.Team, b.Team));

      if (list.length === 1) {
        // Single team → solid color
        fills.set(st, teamColor(list[0].Team));
        continue;
      }

       // N teams (N >= 2) → build an even-split gradient across the state
      const gid = `grad-${st}-${season.replace(/[^0-9a-z]/gi, "")}`;
      const lg = defs.append("linearGradient")
        .attr("id", gid)
        .attr("x1", "0%").attr("y1", "0%")
        .attr("x2", "100%").attr("y2", "0%");

      const N = list.length;
      // offsets: 0, 1/N, 2/N, … , 1; duplicate stops at boundaries for sharp splits
      list.forEach((t, i) => {
        const c = teamColor(t.Team);
        const start = (i / N) * 100;
        const end   = ((i + 1) / N) * 100;

        // left edge of this band
        lg.append("stop").attr("offset", `${start}%`).attr("stop-color", c);
        // right edge of this band (duplicate to keep a crisp boundary)
        lg.append("stop").attr("offset", `${end}%`).attr("stop-color", c);
      });

      fills.set(st, `url(#${gid})`);
    }

    return { fills, fastestState, fastestTeam };
  }

  async function drawMapForSeason(season) {
    await ensureTopo();

    const us = statesTopo;
    const states = topojson.feature(us, us.objects.states);
    const mesh   = topojson.mesh(us, us.objects.states, (a,b)=>a!==b);

    // data for this season
    let seasonRows = raw.filter(d => d.Season === season);

    // Only include teams that are currently "on" in the legend
    const act = activeTeams();
    if (act && act.size >= 0) {
      seasonRows = seasonRows.filter(r => act.has(r.Team));
    }
    // keep one <defs> for all seasons
    const defs = mapSvg.selectAll("defs#mapGradients").data([null]).join("defs").attr("id","mapGradients");
    const { fills, fastestState, fastestTeam } = buildStateFills(seasonRows, season, defs);

    // join states
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

    // borders on top
    mapG.selectAll("path.borders")
      .data([mesh])
      .join("path")
      .attr("class","borders")
      .attr("fill","none")
      .attr("stroke","#fff")
      .attr("stroke-width",0.8)
      .attr("d", geoPath);

    // gold overlay for fastest state
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

    // tooltip on state hover (simple)
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

    // Crown on fastest state (emoji)
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

  }

  // initial draw + interaction
  drawMapForSeason(mapSeasonSel.property("value"));
  mapSeasonSel.on("change", () => drawMapForSeason(mapSeasonSel.property("value")));


    if (!reduceMotion && progress === 0 && !didAutoStart) {
    didAutoStart = true;
    d3.select("#playPauseBtn").text("Pause");
    play();
  }
})
}
