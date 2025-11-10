import { renderPace } from './pace.js';
import { renderComparison } from './comparison.js';
import { renderShotChart } from './shot_chart.js';
import { render3ptTimeline } from './threepoint.js';
import { renderDefense } from './defense.js';

const rendered = new Set();

// Collect the tab order from buttons
const tabButtons = Array.from(document.querySelectorAll('.tab'));
const tabOrder = tabButtons.map(b => b.dataset.tab);

// Keep current index in sync
let currentIndex = Math.max(0, tabOrder.indexOf('intro')); // default first tab

const navPrev = document.getElementById('navPrev');
const navNext = document.getElementById('navNext');

function pauseAllMedia() {
  document.querySelectorAll('video, audio').forEach(m => {
    // pause if playing
    try { m.pause(); } catch {}
  });
}

function updateNavButtons() {
  const atFirst = currentIndex === 0;
  const atLast  = currentIndex === tabOrder.length - 1;

  navPrev?.classList.toggle('hidden', atFirst);
  navNext?.classList.toggle('hidden', atLast);

  if (navPrev) navPrev.disabled = atFirst;
  if (navNext) navNext.disabled = atLast;
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${name}`);
  });

  pauseAllMedia();

  // update current index
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

  // auto-play video when landing on intro
  if (name === 'intro') {
    const v = document.getElementById('introVideo');
    if (v) {
      v.loop = false;                          
      v.play?.().catch(() => {/* ignore autoplay block */});

      v.volume = 0.5;

      v.muted = true;          
      v.play?.().catch(()=>{}); 

      const enableSound = () => {
        try {
          v.muted = false;      
          v.volume = 0.5;       
          v.play?.();         
        } catch {}
        window.removeEventListener('click', enableSound);
        window.removeEventListener('keydown', enableSound);
        v.removeEventListener('play', enableSound);
      };

      window.addEventListener('click', enableSound, { once: true });
      window.addEventListener('keydown', enableSound, { once: true });

      v.addEventListener('play', enableSound, { once: true });

      const saved = +localStorage.getItem('introVol');
      if (!Number.isNaN(saved)) v.volume = Math.max(0, Math.min(1, saved));
      v.addEventListener('volumechange', () => {
        localStorage.setItem('introVol', v.volume.toFixed(2));
      });

      const onEnded = () => {
        if (tabOrder[currentIndex] === 'intro') {
          goNext();
        }
      };
      v.addEventListener('ended', onEnded, { once: true });
    }
  }
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

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

navPrev?.addEventListener('click', goPrev);
navNext?.addEventListener('click', goNext);

window.addEventListener('keydown', (e) => {
  if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
  if (e.key === 'ArrowLeft')  goPrev();
  if (e.key === 'ArrowRight') goNext();
});

// Initial tab
showTab(tabOrder[0]);
updateNavButtons(); 
