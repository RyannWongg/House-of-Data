export function renderComparison(sel) {    
  const teamSelectEl       = document.querySelector(sel.teamSelect);
  const player2000El       = document.querySelector(sel.player2000);
  const player2025El       = document.querySelector(sel.player2025);
  const comparisonSection  = document.querySelector(sel.section);
  const comparisonTitle    = document.querySelector(sel.title);
  const chartSvg           = d3.select(sel.chart);

  if (comparisonSection) comparisonSection.hidden = true;
  if (comparisonTitle)   comparisonTitle.hidden   = true;

  let currentComparisonTeam = null;

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

      const year0Label = (team === 'pelicans') ? '2002' : '2000';
      const year0Note  = (team === 'pelicans') ? 'Pelicans were founded in 2002' : '';

      displayPlayerCard(bestPlayer2000, player2000El, year0Label, year0Note);
      displayPlayerCard(bestPlayer2025, player2025El, '2025');

      createComparisonRows(chartSvg, bestPlayer2000, bestPlayer2025, year0Label, '2025');

    } catch (error) {
      console.error('Error loading data:', error);
      if (player2000El) player2000El.innerHTML = '<p class="error">Data not available</p>';
      if (player2025El) player2025El.innerHTML = '<p class="error">Data not available</p>';
      if (chartSvg.node()) chartSvg.selectAll('*').remove();
    }
  }

    // --- helpers (keep these near your other helpers) ---
    function _num(v) {
    const x = parseFloat((v ?? "").toString().replace(/,/g, ""));
    return Number.isFinite(x) ? x : 0;
    }
    function _nameOf(r) {
    return (r.Player ?? r.PLAYER ?? r.Name ?? r.NAME ?? "").toString().trim();
    }
    function _isTotalsRow(r) {
    const name = _nameOf(r).toLowerCase();
    if (!name) return true;
    return /(team\s+totals?|^totals?$)/.test(name);
    }
    function _ppgStrict(r) {
    // Prefer explicit per-game fields
    const explicit = _num(r.PPG ?? r["PTS/G"] ?? r["PTS per game"]);
    if (explicit > 0) return explicit;

    // Else infer: if PTS looks like a per-game (<= 60), treat as PPG
    const pts = _num(r.PTS ?? r.Points);
    const g   = _num(r.G ?? r.GP ?? r.Games);
    if (pts > 0 && pts <= 60) return pts;       // likely per-game already
    return g > 0 ? pts / g : 0;                  // fall back to totals / games
    }

    // --- drop-in replacement ---
    function findBestPlayer(rows) {
    if (!rows || !rows.length) return null;

    // 1) remove team totals rows
    let players = rows.filter(r => !_isTotalsRow(r));

    // 2) remove “TOT” (league-wide aggregate for traded players), keep team stint rows
    players = players.filter(r => {
        const tm = (r.Tm ?? r.Team ?? r.TeamAbbr ?? "").toString().trim().toUpperCase();
        return tm !== "TOT"; // if column exists
    });

    if (!players.length) players = rows.slice(); // fallback if columns absent

    // 3) compute ppg and keep it on the row for sorting/debug
    players.forEach(r => { r.__PPG = _ppgStrict(r); r.__G = _num(r.G ?? r.GP ?? r.Games); r.__MP = _num(r.MP ?? r.MIN); });

    // 4) sort strictly by PPG, tie-break by games, then minutes
    players.sort((a, b) => {
        const d1 = b.__PPG - a.__PPG; if (d1) return d1;
        const d2 = b.__G   - a.__G;   if (d2) return d2;
        return b.__MP - a.__MP;
    });

    // Optional: quick sanity log of top 5
    // console.table(players.slice(0,5).map(p => ({ Player: _nameOf(p), PPG: p.__PPG, G: p.__G })));

    return players[0] ?? null;
    }

  const COLOR_HIGH = '#4ecdc4'; // green
  const COLOR_LOW  = '#ff6b6b'; // red

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

  function createComparisonRows(svg, p2000, p2025, labelLeft='2000', labelRight='2025') {
    if (!svg || !svg.node || !svg.node()) return;
    svg.selectAll('*').remove();

    // ---- helpers ----
    const num = v => {
        const x = parseFloat((v ?? '').toString().replace(/,/g, ''));
        return Number.isFinite(x) ? x : 0;
    };
    const pctTo100 = raw => {
        let x = num(raw);
        if (!Number.isFinite(x)) return NaN;
        return x <= 1 ? x * 100 : x;
    };
    const fmt1 = x => Number.isFinite(x) ? x.toFixed(1) : '—';

    // per-game preferred, FG% normalized to 0–100
    const stats = [
        {
        key: 'Points',
        left:  num(p2000.PPG ?? p2000['PTS/G'] ?? p2000.PTS),
        right: num(p2025.PPG ?? p2025['PTS/G'] ?? p2025.PTS),
        domain: null // auto
        },
        {
        key: 'Rebounds',
        left:  num(p2000.RPG ?? p2000['TRB/G'] ?? p2000.TRB),
        right: num(p2025.RPG ?? p2025['TRB/G'] ?? p2025.TRB),
        domain: null
        },
        {
        key: 'Assists',
        left:  num(p2000.APG ?? p2000['AST/G'] ?? p2000.AST),
        right: num(p2025.APG ?? p2025['AST/G'] ?? p2025.AST),
        domain: null
        },
        {
        key: 'FG%',
        left:  pctTo100(p2000['FG%'] ?? p2000.FG_PCT ?? p2000.FGP),
        right: pctTo100(p2025['FG%'] ?? p2025.FG_PCT ?? p2025.FGP),
        domain: [0, 100]
        }
    ];

    // ---- layout ----
    const width = 860, height = 360;
    const margin = { top: 36, right: 160, bottom: 40, left: 160 };
    svg.attr('width', width).attr('height', height);

    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const xCenter = innerW / 2;

    // side titles
    g.append('text')
        .attr('x', xCenter - 120).attr('y', -12)
        .attr('text-anchor', 'middle').attr('fill', '#fff')
        .style('font-weight', 700).text(labelLeft);

    g.append('text')
        .attr('x', xCenter + 120).attr('y', -12)
        .attr('text-anchor', 'middle').attr('fill', '#fff')
        .style('font-weight', 700).text(labelRight);

    // rows
    const rowsG = g.append('g').attr('class', 'rows');

    const rowH = innerH / 4;
    const barH = 18;
    const labelPad = 10;

    // build a scale per row so each stat uses full half-width
    const halfW = xCenter - 80; // leave room for stat labels
    const rowScales = stats.map(s => {
        if (s.domain) {
        return d3.scaleLinear().domain(s.domain).range([0, halfW]).nice();
        }
        const maxVal = Math.max(s.left || 0, s.right || 0, 1);
        return d3.scaleLinear().domain([0, maxVal]).range([0, halfW]).nice();
    });

    // group per row
    const groups = rowsG.selectAll('g.row')
        .data(stats.map((s,i) => ({...s, i})))
        .join('g')
        .attr('class', d => `row row-${d.key.toLowerCase().replace('%','pct')}`)
        .attr('transform', d => {
            const y = d.i * rowH + rowH/2;
            return `translate(0, ${y})`;
        });

    // stat labels (centered above the bars)
    groups.append('text')
    .attr('class', 'stat-label')
    .attr('x', xCenter)
    .attr('y', -barH / 2 - 10)          // a bit above the bars
    .attr('text-anchor', 'middle')
    .attr('fill', '#fff')
    .style('font-weight', 700)
    .style('font-size', '13px')
    .text(d => d.key);

    // bars (start collapsed at center)
    groups.each(function(d) {
        const grp = d3.select(this);
        const scale = rowScales[d.i];

        const leftVal  = d.left  || 0;
        const rightVal = d.right || 0;
        const leftIsHigher = leftVal >= rightVal;

        const leftFill  = leftIsHigher ? COLOR_HIGH : COLOR_LOW;
        const rightFill = leftIsHigher ? COLOR_LOW  : COLOR_HIGH;

        // left bar
        grp.append('rect')
        .attr('class', 'bar bar-left')
        .attr('x', xCenter)
        .attr('y', -barH/2)
        .attr('width', 0)
        .attr('height', barH)
        .attr('fill', leftFill)
        .attr('fill-opacity', 0.9);

        // right bar
        grp.append('rect')
        .attr('class', 'bar bar-right')
        .attr('x', xCenter)
        .attr('y', -barH/2)
        .attr('width', 0)
        .attr('height', barH)
        .attr('fill', rightFill)
        .attr('fill-opacity', 0.9);

        // value labels (appear after animation)
        grp.append('text')
        .attr('class', 'val-in val-left')
        .attr('x', xCenter)
        .attr('y', -barH/2 + barH/2 + 1) // vertically centered
        .attr('text-anchor', 'start')    // will update if we keep label inside
        .attr('fill', '#fff')
        .attr('stroke', 'rgba(0,0,0,0.35)')
        .attr('stroke-width', 1)
        .attr('paint-order', 'stroke')
        .style('font-size', '12px')
        .style('font-weight', '700')
        .text(() => d.key === 'FG%' ? `${fmt1(leftVal)}%` : fmt1(leftVal));

        grp.append('text')
        .attr('class', 'val-in val-right')
        .attr('x', xCenter)
        .attr('y', -barH/2 + barH/2 + 1)
        .attr('text-anchor', 'end')
        .attr('fill', '#fff')
        .attr('stroke', 'rgba(0,0,0,0.35)')
        .attr('stroke-width', 1)
        .attr('paint-order', 'stroke')
        .style('font-size', '12px')
        .style('font-weight', '700')
        .text(() => d.key === 'FG%' ? `${fmt1(rightVal)}%` : fmt1(rightVal));

        // --- difference labels (start at center, hidden) ---
        const diff = (d.right ?? 0) - (d.left ?? 0); // right - left
        const isPct = d.key === 'FG%';

        // values for each side (left shows -diff, right shows +diff)
        const leftdiffVal  = -diff;
        const rightdiffVal =  diff;

        const fmtDiff = v => {
        const s = Number.isFinite(v) ? v.toFixed(2) : '0.00';
        return (v >= 0 ? `+${s}` : `${s}`) + (isPct ? '%' : '');
        };

        const COLOR_POS = '#27ae60'; // green for +
        const COLOR_NEG = '#e74c3c'; // red for -

        const leftColor  = leftdiffVal  >= 0 ? COLOR_POS : COLOR_NEG;
        const rightColor = rightdiffVal >= 0 ? COLOR_POS : COLOR_NEG;

        // left-end diff (negative if right>left)
        grp.append('text')
        .attr('class', 'diff diff-left')
        .attr('x', xCenter)
        .attr('y', -barH/2 + 13)
        .attr('text-anchor', 'end')
        .attr('fill', leftColor)
        .style('opacity', 0)
        .style('font-size', '11px')
        .style('font-weight', '700')
        .attr('stroke', 'rgba(0,0,0,0.35)')
        .attr('stroke-width', 1)
        .attr('paint-order', 'stroke')
        .text(fmtDiff(leftdiffVal));

        // right-end diff (positive if right>left)
        grp.append('text')
        .attr('class', 'diff diff-right')
        .attr('x', xCenter)
        .attr('y', -barH/2 + 13)
        .attr('text-anchor', 'start')
        .attr('fill', rightColor)
        .style('opacity', 0)
        .style('font-size', '11px')
        .style('font-weight', '700')
        .attr('stroke', 'rgba(0,0,0,0.35)')
        .attr('stroke-width', 1)
        .attr('paint-order', 'stroke')
        .text(fmtDiff(rightdiffVal));
    });

    // legend
    const legend = svg.append('g')
    .attr('transform', `translate(${width - 130}, ${margin.top})`);

    [
    { label: 'Higher value', color: COLOR_HIGH },
    { label: 'Lower value',  color: COLOR_LOW  }
    ].forEach((item, i) => {
    legend.append('rect')
        .attr('x', 0).attr('y', i*22)
        .attr('width', 16).attr('height', 16)
        .attr('rx', 3).attr('ry', 3)
        .attr('fill', item.color);
    legend.append('text')
        .attr('x', 24).attr('y', i*22 + 12)
        .attr('fill', '#fff')
        .style('font-weight', 700)
        .style('font-size', '14px')
        .attr('dominant-baseline', 'middle')
        .text(item.label);
    });

    // source
    svg.append('text')
        .attr('x', width - 8)
        .attr('y', height - 6)
        .attr('text-anchor', 'end')
        .attr('fill', '#aaa')
        .style('font-size', '10px')
        .style('font-style', 'italic')
        .text('source: basketball-reference.com');

    // ---- animate all rows at once (bars + inside values + diff labels) ----
    const D_BAR = 600;
    const PAD_IN = 8;        // padding for inside value labels
    const PAD_OUT = 10;      // padding when a bar too small for inside label
    const MIN_INSIDE = 32;   // px

    groups.each(function(d) {
    const grp = d3.select(this);
    const scale = rowScales[d.i];

    const leftW  = scale(d.left  || 0);
    const rightW = scale(d.right || 0);

    // grow LEFT bar (to the left)
    grp.select('.bar-left')
        .transition()
        .duration(D_BAR)
        .attr('x', xCenter - leftW)
        .attr('width', leftW);

    // grow RIGHT bar (to the right)
    grp.select('.bar-right')
        .transition()
        .duration(D_BAR)
        .attr('width', rightW);

    // move inside value labels with bars
    const leftVal  = grp.select('.val-left');
    const rightVal = grp.select('.val-right');

    leftVal
        .attr('text-anchor', leftW >= MIN_INSIDE ? 'start' : 'end')
        .transition()
        .duration(D_BAR)
        .tween('val-left-pos', function() {
        const iW = d3.interpolate(0, leftW);
        return t => {
            const w = iW(t);
            leftVal.attr('x', leftW >= MIN_INSIDE ? (xCenter - w + PAD_IN) : (xCenter - w - PAD_OUT));
        };
        });

    rightVal
        .attr('text-anchor', rightW >= MIN_INSIDE ? 'end' : 'start')
        .transition()
        .duration(D_BAR)
        .tween('val-right-pos', function() {
        const iW = d3.interpolate(0, rightW);
        return t => {
            const w = iW(t);
            rightVal.attr('x', rightW >= MIN_INSIDE ? (xCenter + w - PAD_IN) : (xCenter + w + PAD_OUT));
        };
        });

    // move & reveal diff labels to *bar ends* (outside)
    const diffLeft  = grp.select('.diff-left');
    const diffRight = grp.select('.diff-right');

    diffLeft
        .transition()
        .duration(D_BAR)
        .style('opacity', 1)
        .tween('diff-left-pos', function() {
        const iW = d3.interpolate(0, leftW);
        return t => {
            const w = iW(t);
            diffLeft
            .attr('text-anchor', 'end')
            .attr('x', xCenter - w - PAD_OUT);
        };
        });

    diffRight
        .transition()
        .duration(D_BAR)
        .style('opacity', 1)
        .tween('diff-right-pos', function() {
        const iW = d3.interpolate(0, rightW);
        return t => {
            const w = iW(t);
            diffRight
            .attr('text-anchor', 'start')
            .attr('x', xCenter + w + PAD_OUT);
        };
        });
    });

  }
}
