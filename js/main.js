import { renderPace } from './pace.js';
import { renderComparison } from './comparison.js';

const rendered = new Set();

// Collect the tab order from buttons (left-to-right)
const tabButtons = Array.from(document.querySelectorAll('.tab'));
const tabOrder = tabButtons.map(b => b.dataset.tab);

// Keep current index in sync
let currentIndex = 0; // default first tab

const navPrev = document.getElementById('navPrev');
const navNext = document.getElementById('navNext');

function updateNavButtons() {
  const atFirst = currentIndex === 0;
  const atLast  = currentIndex === tabOrder.length - 1;

  // Hide at edges (or use disabled if you prefer)
  navPrev?.classList.toggle('hidden', atFirst);
  navNext?.classList.toggle('hidden', atLast);

  // Optional: also disable for accessibility
  if (navPrev) navPrev.disabled = atFirst;
  if (navNext) navNext.disabled = atLast;
}

function showTab(name) {
  // toggle buttons
  document.querySelectorAll('.tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  // toggle panels
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${name}`);
  });

  // update current index
  const idx = tabOrder.indexOf(name);
  if (idx !== -1) currentIndex = idx;

  // Lazy render: only draw once per tab
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
    } else if (name === 'future1') { 
        /* renderFuture1(...) */ 
    } else if (name === 'future2') { 
        /* renderFuture2(...) */ 
    }
  }

  // (Optional) hide any tooltips when switching pages
  document.querySelectorAll('.tooltip').forEach(t => (t.style.opacity = 0));

  updateNavButtons();
}

function goPrev() {
  if (currentIndex > 0) {
    currentIndex -= 1;
    showTab(tabOrder[currentIndex]);
  }
}
function goNext() {
  if (currentIndex < tabOrder.length - 1) {
    currentIndex += 1;
    showTab(tabOrder[currentIndex]);
  }
}

// Wire tab buttons (clicking the tabs still works)
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

// Side buttons: no wrap-around, just guard the edges
navPrev?.addEventListener('click', () => {
  if (currentIndex > 0) {
    currentIndex -= 1;
    showTab(tabOrder[currentIndex]);
  }
});

navNext?.addEventListener('click', () => {
  if (currentIndex < tabOrder.length - 1) {
    currentIndex += 1;
    showTab(tabOrder[currentIndex]);
  }
});

// Optional: keyboard arrows for the same behavior
window.addEventListener('keydown', (e) => {
  if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
  if (e.key === 'ArrowLeft')  goPrev();
  if (e.key === 'ArrowRight') goNext();
});

// Initial tab
showTab(tabOrder[0]);
