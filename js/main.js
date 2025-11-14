import { renderPace } from './pace.js';
import { renderComparison } from './comparison.js';
import { renderShotChart } from './shot_chart.js';
import { render3ptTimeline } from './threepoint.js';
import { renderDefense } from './defense.js';

const rendered = new Set();

const tabButtons = Array.from(document.querySelectorAll('.tab'));
const tabOrder = tabButtons.map(b => b.dataset.tab);

let currentIndex = Math.max(0, tabOrder.indexOf('intro'));

function showTab(name) {
  document.querySelectorAll('.tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${name}`);
  });


  const idx = tabOrder.indexOf(name);
  if (idx !== -1) currentIndex = idx;

  if (!rendered.has(name)) {
    rendered.add(name);
    if (name === 'pace') {
      renderPace({
        svg: '#chart',
        legend: '#legend',
        tooltip: '#tooltip',
        teamSelect: '#teamSelect',
        showAll: '#showAll',
        clearBtn: '#clearBtn'
      });
    } else if (name === 'comparison') {
      renderComparison({
        teamSelect: '#comparisonTeamSelect',
        player2000: '#player2000',
        player2025: '#player2025',
        chart: '#comparisonChart',
        section: '#comparisonSection',
        title: '#comparisonTitle'
      });
    } else if (name === 'lebron') { 
        renderShotChart({
          svg: '#lbChart',
          tooltip: '#lbTooltip',
          playerSelect: '#lbPlayerSelect',
          seasonSelect: '#lbSeasonSelect',
          madeSelect: '#lbMadeSelect',
          title: '#shotChartTitle'
        });
    } else if (name === 'three_point') {
        render3ptTimeline({
          svg: '#threePtChart',
          tooltip: '#threePtTooltip'
        });
    } else if (name === 'defense') { 
        renderDefense({ root: '#tab-defense', svg: '#defenseChart' });
    }
  }
}

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

showTab(tabOrder[0]);
