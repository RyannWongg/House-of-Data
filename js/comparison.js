// Load and compare best players from 2000 vs 2025 seasons

const comparisonTeamSelect = document.getElementById('comparisonTeamSelect');
const player2000El = document.getElementById('player2000');
const player2025El = document.getElementById('player2025');
const comparisonSection = document.getElementById('comparisonSection');
const comparisonTitle = document.getElementById('comparisonTitle');

if (comparisonSection) comparisonSection.hidden = true;
if (comparisonTitle) comparisonTitle.hidden = true;

let currentComparisonTeam = null;

// Map team value to display name
const teamDisplayNames = {
    'celtics': 'Boston Celtics',
    'lakers': 'Los Angeles Lakers',
    'knicks': 'New York Knicks'
};

if (comparisonTeamSelect) {
    comparisonTeamSelect.addEventListener('change', (e) => {
        currentComparisonTeam = e.target.value;
        if (currentComparisonTeam) {
            // show section and title
            if (comparisonSection) comparisonSection.hidden = false;
            if (comparisonTitle) {
                comparisonTitle.hidden = false;
                const display = teamDisplayNames[currentComparisonTeam] || currentComparisonTeam;
                comparisonTitle.textContent = `Total statistical comparison — ${display}`;
            }
            loadComparison(currentComparisonTeam);
        } else {
            // hide and clear when no team selected
            if (comparisonSection) comparisonSection.hidden = true;
            if (comparisonTitle) {
                comparisonTitle.hidden = true;
                comparisonTitle.textContent = '';
            }
            if (player2000El) player2000El.innerHTML = '<p class="placeholder">Select a team to view stats</p>';
            if (player2025El) player2025El.innerHTML = '<p class="placeholder">Select a team to view stats</p>';
            const svg = d3.select('#comparisonChart');
            if (svg.node()) svg.selectAll('*').remove();
        }
    });
}

async function loadComparison(team) {
    try {

        const data2000 = await d3.csv(`data/2000_season/${team}_2000.csv`);
        const data2025 = await d3.csv(`data/2025_season/${team}_2025.csv`);

        const bestPlayer2000 = findBestPlayer(data2000);
        const bestPlayer2025 = findBestPlayer(data2025);

        displayPlayerCard(bestPlayer2000, player2000El, '2000');
        displayPlayerCard(bestPlayer2025, player2025El, '2025');


        createComparisonChart(data2000, data2025);

    } catch (error) {
        console.error('Error loading data:', error);
        if (player2000El) player2000El.innerHTML = '<p class="error">Data not available</p>';
        if (player2025El) player2025El.innerHTML = '<p class="error">Data not available</p>';
    }
}

function findBestPlayer(data) {
    return data.reduce((best, player) => {
        const pts = parseFloat(player.PTS || player.Points || 0);
        const bestPts = parseFloat(best.PTS || best.Points || 0);
        return pts > bestPts ? player : best;
    }, data[0]);
}

function displayPlayerCard(player, element, year) {
    if (!element) return;
    
    const name = player.Player;;
    const pts = parseFloat(player.PTS).toFixed(1);
    const reb = parseFloat(player.TRB).toFixed(1);
    const ast = parseFloat(player.AST).toFixed(1);
    const fg = (parseFloat(player['FG%']) * 100).toFixed(1);

    element.innerHTML = `
        <div class="player-info">
            <h4>${name}</h4>
            <div class="stat-grid">
                <div class="stat-item">
                    <span class="stat-label">Points</span>
                    <span class="stat-value">${pts}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Rebounds</span>
                    <span class="stat-value">${reb}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Assists</span>
                    <span class="stat-value">${ast}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">FG%</span>
                    <span class="stat-value">${fg}%</span>
                </div>
            </div>
        </div>
    `;
}

// Comparison function 
function createComparisonChart(data2000, data2025) {
    console.log("data: ", data2000, data2025);
    const svg = d3.select('#comparisonChart');
    if (!svg.node()) return;
    
    svg.selectAll('*').remove();

    const width = 800;
    const height = 400;
    const margin = { top: 40, right: 60, bottom: 60, left: 80 };

    svg.attr('width', width).attr('height', height);

    // Initialize totals
    let totalPoints2000 = 0;
    let totalPoints2025 = 0;
    let totalRebounds2000 = 0;
    let totalRebounds2025 = 0;
    let totalAssists2000 = 0;
    let totalAssists2025 = 0;
    let totalMakes2000 = 0;
    let totalFGA2000 = 0;
    let totalMakes2025 = 0;
    let totalFGA2025 = 0;
    
    for (let player of data2000) {
        const games = parseFloat(player.G || 0);
        totalPoints2000 += parseFloat(player.PTS || 0) * games;
        totalRebounds2000 += parseFloat(player.TRB || 0) * games;
        totalAssists2000 += parseFloat(player.AST || 0) * games;
        totalMakes2000 += parseFloat(player.FG || 0);
        totalFGA2000 += parseFloat(player.FGA || 0);
    }

    for (let player of data2025) {
        const games = parseFloat(player.G || 0);
        totalPoints2025 += parseFloat(player.PTS || 0) * games;
        totalRebounds2025 += parseFloat(player.TRB || 0) * games;
        totalAssists2025 += parseFloat(player.AST || 0) * games;
        totalMakes2025 += parseFloat(player.FG || 0);
        totalFGA2025 += parseFloat(player.FGA || 0);
    }

    const data = [
        { stat: 'Points', year2000: totalPoints2000, year2025: totalPoints2025 },
        { stat: 'Rebounds', year2000: totalRebounds2000, year2025: totalRebounds2025 },
        { stat: 'Assists', year2000: totalAssists2000, year2025: totalAssists2025 },
    ];

    console.log("Chart data: ", data);

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

    // Bars
    svg.append('g')
        .selectAll('g')
        .data(data)
        .join('g')
        .attr('transform', d => `translate(${x0(d.stat)},0)`)
        .selectAll('rect')
        .data(d => ['year2000', 'year2025'].map(key => ({ key, value: d[key], stat: d.stat })))
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
        .data(['2000', '2025'])
        .join('text')
        .attr('x', 30)
        .attr('y', (d, i) => i * 25 + 15)
        .text(d => d)
        .style('font-size', '14px')
        .style('fill', '#fff');
}