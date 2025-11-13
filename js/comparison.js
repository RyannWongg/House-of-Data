export function renderComparison(sel) {    
  // Load and compare best players from 2000 vs 2025 seasons
  const teamSelectEl       = document.querySelector(sel.teamSelect);
  const player2000El       = document.querySelector(sel.player2000);
  const player2025El       = document.querySelector(sel.player2025);
  const comparisonSection  = document.querySelector(sel.section);
  const comparisonTitle    = document.querySelector(sel.title);
  const chartSvg           = d3.select(sel.chart);

  if (comparisonSection) comparisonSection.hidden = true;
  if (comparisonTitle)   comparisonTitle.hidden   = true;

  let currentComparisonTeam = null;

  // Map team value to display name
  const teamDisplayNames = {
    'celtics': 'Boston Celtics',
    'lakers': 'Los Angeles Lakers',
    'knicks': 'New York Knicks',
    'hawks': 'Atlanta Hawks',
    'nets': 'Brooklyn Nets',
    'hornets': 'Charlotte Hornets',
    'bulls': 'Chicago Bulls',
    'cavaliers': 'Cleveland Cavaliers',
    'mavericks': 'Dallas Mavericks',
    'nuggets': 'Denver Nuggets',
    'pistons': 'Detroit Pistons',
    'warriors': 'Golden State Warriors',
    'rockets': 'Houston Rockets',
    'pacers': 'Indiana Pacers',
    'clippers': 'LA Clippers',
    'heat': 'Miami Heat',
    'bucks': 'Milwaukee Bucks',
    'timberwolves': 'Minnesota Timberwolves',
    'pelicans': 'New Orleans Pelicans',
    'thunder': 'Oklahoma City Thunder',
    'magic': 'Orlando Magic',
    'sixers': 'Philadelphia 76ers',
    'suns': 'Phoenix Suns',
    'blazers': 'Portland Trail Blazers',
    'kings': 'Sacramento Kings',
    'spurs': 'San Antonio Spurs',
    'raptors': 'Toronto Raptors',
    'jazz': 'Utah Jazz',
    'wizards': 'Washington Wizards'
  };

  // Select change handler
  if (teamSelectEl) {
    teamSelectEl.addEventListener('change', (e) => {
      currentComparisonTeam = e.target.value;

      if (currentComparisonTeam) {
        if (comparisonSection) comparisonSection.hidden = false;
        if (comparisonTitle) {
          comparisonTitle.hidden = false;
          const display = teamDisplayNames[currentComparisonTeam] || currentComparisonTeam;
          comparisonTitle.textContent = `Total statistical comparison — ${display}`;
        }
        loadComparison(currentComparisonTeam);
      } else {
        if (comparisonSection) comparisonSection.hidden = true;
        if (comparisonTitle) {
          comparisonTitle.hidden = true;
          comparisonTitle.textContent = '';
        }
        if (player2000El) player2000El.innerHTML = '<p class="placeholder">Select a team to view stats</p>';
        if (player2025El) player2025El.innerHTML = '<p class="placeholder">Select a team to view stats</p>';
        if (chartSvg.node()) chartSvg.selectAll('*').remove();
      }
    });
  }

  async function loadComparison(team) {
    try {
      const data2000 = await d3.csv(`data/2000_season/${team}_2000.csv`);
      const data2025 = await d3.csv(`data/2025_season/${team}_2025.csv`);

      const bestPlayer2000 = findBestPlayer(data2000);
      const bestPlayer2025 = findBestPlayer(data2025);

      // --- Pelicans special case (use 2002 + note) ---
      const year0Label = (team === 'pelicans') ? '2002' : '2000';
      const year0Note  = (team === 'pelicans') ? 'Pelicans were founded in 2002' : '';

      displayPlayerCard(bestPlayer2000, player2000El, year0Label, year0Note);
      displayPlayerCard(bestPlayer2025, player2025El, '2025');

      createComparisonChart(chartSvg, data2000, data2025, year0Label, '2025');

    } catch (error) {
      console.error('Error loading data:', error);
      if (player2000El) player2000El.innerHTML = '<p class="error">Data not available</p>';
      if (player2025El) player2025El.innerHTML = '<p class="error">Data not available</p>';
      if (chartSvg.node()) chartSvg.selectAll('*').remove();
    }
  }

  // ---------- helpers for best-player selection ----------
  function _nameOf(r) {
    return (r.Player ?? r.PLAYER ?? r.Name ?? r.NAME ?? "").toString().trim();
  }
  function _num(v) {
    const x = parseFloat((v ?? "").toString().replace(/,/g, ""));
    return Number.isFinite(x) ? x : 0;
  }
  function _isTotalsRow(r) {
    const name = _nameOf(r).toLowerCase();
    if (!name) return true;
    if (/(^|\s)(team\s+totals?|totals?)($|\s)/.test(name)) return true;
    // keep players even if missing extra ids/pos
    return false;
  }
  function _ppg(r) {
    const explicit = _num(r.PPG ?? r["PTS/G"] ?? r["PTS per game"]);
    if (explicit > 0) return explicit;
    const pts = _num(r.PTS ?? r.Points);
    const g   = _num(r.G ?? r.GP ?? r.Games);
    return g > 0 ? pts / g : pts;
  }

  function findBestPlayer(rows) {
    let players = rows.filter(r => !_isTotalsRow(r));
    players = players.filter(r => {
      const g  = _num(r.G ?? r.GP ?? r.Games);
      const mp = _num(r.MP ?? r.MIN ?? r.Minutes);
      return g >= 10 || mp >= 200;
    });
    if (!players.length) return rows[0] ?? null;

    players.sort((a, b) => {
      const d1 = _ppg(b) - _ppg(a);
      if (d1) return d1;
      const d2 = _num(b.PER) - _num(a.PER);
      if (d2) return d2;
      const d3 = _num(b.WS ?? b["Win Shares"]) - _num(a.WS ?? a["Win Shares"]);
      if (d3) return d3;
      return _num(b.PTS ?? b.Points) - _num(a.PTS ?? a.Points);
    });

    return players[0];
  }

  // ---------- player card ----------
  function displayPlayerCard(player, element, yearLabel, note='') {
    if (!element || !player) return;

    const name = (_nameOf(player) || 'N/A');
    const pts  = Number.parseFloat(player.PPG ?? player["PTS/G"] ?? player.PTS ?? 0);
    const reb  = Number.parseFloat(player.RPG ?? player["TRB/G"] ?? player.TRB ?? 0);
    const ast  = Number.parseFloat(player.APG ?? player["AST/G"] ?? player.AST ?? 0);

    // FG% → xx.x%
    let fg = Number.parseFloat(player['FG%'] ?? player.FG_PCT ?? player.FGP ?? NaN);
    if (Number.isFinite(fg)) {
      if (fg <= 1) fg *= 100;         // normalize 0.458 → 45.8
      fg = parseFloat(fg.toFixed(1)); // round to one decimal cleanly
    }
    const fgStr = Number.isFinite(fg) ? `${fg.toFixed(1)}%` : '—';

    element.innerHTML = `
      <div class="player-info">
        <div class="card-top">
          <span class="season">${yearLabel} Season</span>
          ${note ? `<span class="note">(${note})</span>` : ''}
        </div>
        <h4>${name}</h4>
        <div class="stat-grid">
          <div class="stat-item">
            <span class="stat-label">Points</span>
            <span class="stat-value">${(pts || 0).toFixed(1)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Rebounds</span>
            <span class="stat-value">${(reb || 0).toFixed(1)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Assists</span>
            <span class="stat-value">${(ast || 0).toFixed(1)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">FG%</span>
            <span class="stat-value">${fgStr}</span>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- comparison chart ----------
  function createComparisonChart(svg, data2000, data2025, label0='2000', label1='2025') {
    if (!svg || !svg.node) return;
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    const width = 800, height = 400;
    const margin = { top: 40, right: 60, bottom: 60, left: 80 };
    svg.attr('width', width).attr('height', height);

    const nameOf = r => (r.Player ?? r.PLAYER ?? r.Name ?? r.NAME ?? '').toString().trim();
    const num    = v => {
      const x = parseFloat((v ?? '').toString().replace(/,/g, ''));
      return Number.isFinite(x) ? x : 0;
    };
    const isTotalsRow = r => {
      const n = nameOf(r).toLowerCase();
      return /(team\s+totals?|^totals?$)/.test(n);
    };

    const seasonSum = rows => {
      const players = rows.filter(r => !isTotalsRow(r));
      let pts=0, reb=0, ast=0;
      for (const r of players) {
        const g   = num(r.G ?? r.GP ?? r.Games);

        const ppg = num(r.PPG ?? r['PTS/G']);
        let PTS   = num(r.PTS ?? r.Points);
        if (ppg || (PTS > 0 && PTS <= 60)) PTS = (ppg || PTS) * (g || 1);

        const rpg = num(r.RPG ?? r['TRB/G']);
        const apg = num(r.APG ?? r['AST/G']);
        const TRB = num(r.TRB);
        const AST = num(r.AST);
        const totREB = (rpg || (TRB && TRB <= 25 ? TRB : 0)) ? (rpg || TRB) * (g || 1) : TRB;
        const totAST = (apg || (AST && AST <= 20 ? AST : 0)) ? (apg || AST) * (g || 1) : AST;

        pts += PTS; reb += totREB; ast += totAST;
      }
      return { pts, reb, ast };
    };

    const s00 = seasonSum(data2000);
    const s25 = seasonSum(data2025);

    const data = [
      { stat: 'Points',   year2000: s00.pts, year2025: s25.pts },
      { stat: 'Rebounds', year2000: s00.reb, year2025: s25.reb },
      { stat: 'Assists',  year2000: s00.ast, year2025: s25.ast },
    ];

    const x0 = d3.scaleBand()
      .domain(data.map(d => d.stat))
      .rangeRound([margin.left, width - margin.right])
      .paddingInner(0.1);

    const x1 = d3.scaleBand()
      .domain(['year2000', 'year2025'])
      .rangeRound([0, x0.bandwidth()])
      .padding(0.05);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => Math.max(d.year2000, d.year2025)) * 1.1])
      .nice()
      .rangeRound([height - margin.bottom, margin.top]);

    const color = d3.scaleOrdinal()
      .domain(['year2000', 'year2025'])
      .range(['#ff6b6b', '#4ecdc4']);

    svg.append('g')
      .selectAll('g')
      .data(data)
      .join('g')
        .attr('transform', d => `translate(${x0(d.stat)},0)`)
      .selectAll('rect')
      .data(d => ['year2000', 'year2025'].map(key => ({ key, value: d[key] })))
      .join('rect')
        .attr('x', d => x1(d.key))
        .attr('y', d => y(d.value))
        .attr('width', x1.bandwidth())
        .attr('height', d => y(0) - y(d.value))
        .attr('fill', d => color(d.key));

    svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x0))
      .selectAll('text')
      .style('fill', '#fff');

    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y))
      .selectAll('text')
      .style('fill', '#fff');

    const legend = svg.append('g')
      .attr('transform', `translate(${width - margin.right - 100}, ${margin.top})`);

    legend.selectAll('rect')
      .data(['year2000', 'year2025'])
      .join('rect')
      .attr('x', 0)
      .attr('y', (d, i) => i * 25)
      .attr('width', 20)
      .attr('height', 20)
      .attr('fill', d => color(d));

    legend.selectAll('text')
      .data([label0, label1])
      .join('text')
      .attr('x', 30)
      .attr('y', (d, i) => i * 25 + 15)
      .text(d => d)
      .style('font-size', '14px')
      .style('fill', '#fff');

    svg.append('text')
      .attr('x', width - margin.right)
      .attr('y', height - 5)
      .attr('text-anchor', 'end')
      .attr('fill', '#aaa')
      .style('font-size', '10px')
      .style('font-style', 'italic')
      .text('source: basketball-reference.com');
  }
}
