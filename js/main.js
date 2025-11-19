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

// ─────────────────────────────────────────────
// Guided Tour (Spotlight Onboarding)
// ─────────────────────────────────────────────

// Steps per tab: each step highlights one element
// and explains what it does / how to read the chart.
const TAB_TOURS = {
  pace: [
    {
      selector: '#tab-pace',
      fullTab: true,
      title: 'Pace view',
      text: 'This page shows how fast every NBA team plays over time, measured as possessions per 48 minutes.'
    },
    {
      selector: '#chart',
      title: 'Pace by team over seasons',
      text: 'Each line is a team. The x-axis is season, the y-axis is pace. Hover to see exact values for a team-season.'
    },
    {
      selector: '#showAll',
      title: 'Show all teams',
      text: 'Uncheck this to reduce visual clutter and focus on a single team’s pace trajectory.'
    },
    {
      selector: '.anim-controls',
      title: 'Animation controls',
      text: 'Use Play to animate how pace evolves by season, and Replay to restart the animation.'
    }
  ],

  comparison: [
    {
      selector: '#tab-comparison',
      fullTab: true,
      title: 'Top scorer comparison',
      text: 'Here we compare each team’s top scorer from the 1999–2000 season and the 2024–25 season.'
    },
    {
      selector: '#comparisonTeamSelect',
      title: 'Choose a team',
      text: 'Select an NBA team to load the 2000 and 2025 top scorers and their stats.'
    },
    {
      selector: '.player-card.year-2000',
      title: '2000 season scorer',
      text: 'This card shows the highest-scoring player for that team in the 1999–2000 season.'
    },
    {
      selector: '.player-card.year-2025',
      title: '2025 season scorer',
      text: 'This card shows the 2024–25 highest scorer for the same team, so you can compare eras.'
    },
    {
      selector: '#comparisonChart',
      title: 'Stat comparison chart',
      text: 'Bars show key stats (points, assists, rebounds, etc.) side by side for 2000 vs 2025.'
    }
  ],

  three_point: [
    {
      selector: '#tab-three_point',
      fullTab: true,
      title: 'Three-point era',
      text: 'This view focuses on how the NBA’s relationship with the three-point shot has evolved.'
    },
    {
      selector: '#threePtChart',
      title: 'League 3PA by season',
      text: 'The chart shows how many three-pointers are attempted per game by the league in each season. Hover to inspect specific years.'
    }
  ],

  defense: [
    {
      selector: '#tab-defense',
      fullTab: true,
      title: 'Defense view',
      text: 'This page summarizes how per-game defensive stats changed between seasons, position by position.'
    },
    {
      selector: '#defense-grid',
      title: 'Defensive radar grid',
      text: 'Each card/radar compares combined steals, blocks, and defensive rebounds for a position across seasons. Hover the cards for details.'
    }
  ],

  lebron: [
    {
      selector: '#shotChartTitle',
      title: 'G.O.A.T. shot chart',
      text: 'This page compares shot locations for LeBron James and Michael Jordan across seasons.'
    },
    {
      selector: '#lbChart',
      title: 'Shot locations',
      text: 'Dots on the court show where shots were taken. Color encodes the player and depth encodes distance from the viewer in 3D mode.'
    },
    {
      selector: '#lbPlayerSelect',
      title: 'Player filter',
      text: 'Use this menu to view both players together or isolate LeBron or MJ.'
    },
    {
      selector: '#lbSeasonSelect',
      title: 'Season selector',
      text: 'Switch between seasons or view all seasons combined to see how shot profiles change.'
    },
    {
      selector: '#lbMadeSelect',
      title: 'Make / miss filter',
      text: 'Filter the visualization to all shots, only makes, or only misses.'
    },
    {
      selector: '#tiltToggle',
      title: '3D toggle',
      text: 'Turn 3D on or off. In 3D mode, shots are projected in perspective; in 2D, you get a flat court view.'
    },
    {
      selector: '.tilt-controls',
      title: 'Camera controls',
      text: 'Adjust perspective, angle, and scale to customize how you view the 3D court.'
    }
  ]
};

let tourState = null;

function ensureTourElements() {
  let overlay = document.getElementById('tour-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'tour-overlay';
    overlay.className = 'tour-overlay';
    // clicking the dark background exits the tour
    overlay.addEventListener('click', endTour);
    document.body.appendChild(overlay);
  }

  let tooltip = document.getElementById('tour-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'tour-tooltip';
    tooltip.className = 'tour-tooltip';
    document.body.appendChild(tooltip);
  }

  return { overlay, tooltip };
}

function endTour() {
  const overlay = document.getElementById('tour-overlay');
  const tooltip = document.getElementById('tour-tooltip');

  if (overlay) overlay.remove();
  if (tooltip) tooltip.remove();

  document.querySelectorAll('.tour-highlight').forEach(el => {
    el.classList.remove('tour-highlight');
    el.style.zIndex = '';
  });

  tourState = null;
}

function goToTourStep(stepIndex) {
  if (!tourState) return;

  const { tabName, steps } = tourState;

  if (stepIndex < 0 || stepIndex >= steps.length) {
    endTour();
    return;
  }

  tourState.index = stepIndex;
  const step = steps[stepIndex];

  // Make sure we are on the right tab
  showTab(tabName);

  const { tooltip } = ensureTourElements();

  const target = document.querySelector(step.selector);
  if (!target) {
    console.warn('Tour target not found:', step.selector);
    // skip if element not found
    goToTourStep(stepIndex + 1);
    return;
  }

  // Highlight this element
  document.querySelectorAll('.tour-highlight').forEach(el => {
    el.classList.remove('tour-highlight');
  });
  target.classList.add('tour-highlight');

  // Tooltip content
  const title = step.title || '';
  const text = step.text || '';

  tooltip.innerHTML = `
    <div class="tour-tooltip-inner">
      <div class="tour-tooltip-text">
        <h3>${title}</h3>
        <p>${text}</p>
        <div class="tour-tooltip-controls">
          <button type="button" data-tour-action="skip">Skip</button>
          <button type="button" data-tour-action="prev" ${stepIndex === 0 ? 'disabled' : ''}>Back</button>
          <button type="button" data-tour-action="next" class="primary">
            ${stepIndex === steps.length - 1 ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
      <div class="tour-tooltip-avatar">
        <img src="images/assistant.png" alt="Guide assistant">
      </div>
    </div>
  `;

  // Position tooltip near the target
  const rect = target.getBoundingClientRect();
  const ttRect = tooltip.getBoundingClientRect();

  const isFullTabStep = !!step.fullTab;  // 👈 use the flag we just added

  let top, left;

  if (isFullTabStep) {
    // park tooltip in the TOP-RIGHT corner of the tab
    top = rect.top + 16;
    left = rect.right - ttRect.width - 16;
  } else {
    // default: near the highlighted element
    top = rect.bottom + 12;
    if (top + ttRect.height > window.innerHeight - 16) {
      top = Math.max(16, rect.top - ttRect.height - 12);
    }

    left = rect.left + rect.width / 2 - ttRect.width / 2;
  }

  // clamp to viewport so it never goes off-screen
  top = Math.max(16, Math.min(top, window.innerHeight - ttRect.height - 16));
  left = Math.max(16, Math.min(left, window.innerWidth - ttRect.width - 16));

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;

  // Hook up button actions
  tooltip.querySelectorAll('[data-tour-action]').forEach(btn => {
    btn.onclick = ev => {
      ev.stopPropagation();
      const action = btn.getAttribute('data-tour-action');
      if (action === 'skip') {
        endTour();
      } else if (action === 'prev') {
        goToTourStep(stepIndex - 1);
      } else if (action === 'next') {
        if (stepIndex === steps.length - 1) {
          endTour();
        } else {
          goToTourStep(stepIndex + 1);
        }
      }
    };
  });
}

function startTour(tabName) {
  const steps = TAB_TOURS[tabName];
  if (!steps || !steps.length) return;

  if (tourState) endTour();

  tourState = { tabName, steps, index: 0 };
  showTab(tabName);

  // slight delay so elements are rendered
  setTimeout(() => goToTourStep(0), 60);
}

// Expose for console debugging if you want
window.startHouseOfDataTour = startTour;

// Wire the "Guide" button
const tourTrigger = document.getElementById('tourTrigger');
if (tourTrigger) {
  tourTrigger.addEventListener('click', () => {
    const activeTab = document.querySelector('.tab.active');
    const tabName = activeTab?.dataset.tab || 'pace';

    if (TAB_TOURS[tabName]) {
      startTour(tabName);
    } else {
      // default fallback
      startTour('pace');
    }
  });
}

