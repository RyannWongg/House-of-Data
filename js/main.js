import { renderPace } from './pace.js';
import { renderComparison } from './comparison.js';

const rendered = new Set();

// Collect the tab order from buttons (left-to-right)
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

  pauseAllMedia();

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

  // auto-play video when landing on intro
  if (name === 'intro') {
    const v = document.getElementById('introVideo');
    if (v) {
      v.loop = false;                           // make sure it can end
      // try to play (muted autoplay should work on mobile)
      v.play?.().catch(() => {/* ignore autoplay block */});

      v.volume = 0.5;

      // Autoplay needs muted to be reliable
      v.muted = true;            // keep autoplay happy
      v.play?.().catch(()=>{});  // try to autoplay silently

      // After the FIRST user gesture, enable sound at 50%
      const enableSound = () => {
        try {
          v.muted = false;       // unmute after gesture
          v.volume = 0.5;        // ensure 50% (some browsers ignore pre-gesture set)
          v.play?.();            // resume in case it paused
        } catch {}
        window.removeEventListener('click', enableSound);
        window.removeEventListener('keydown', enableSound);
        v.removeEventListener('play', enableSound);
      };

      // Any of these count as a user gesture
      window.addEventListener('click', enableSound, { once: true });
      window.addEventListener('keydown', enableSound, { once: true });

      // If the user hits the native Play control, that’s also a gesture
      v.addEventListener('play', enableSound, { once: true });

      // Optional: remember the user's volume for next time
      const saved = +localStorage.getItem('introVol');
      if (!Number.isNaN(saved)) v.volume = Math.max(0, Math.min(1, saved));
      v.addEventListener('volumechange', () => {
        localStorage.setItem('introVol', v.volume.toFixed(2));
      });

      // go to next page once finished (only once)
      const onEnded = () => {
        // ensure we’re still on the intro tab to avoid race conditions
        if (tabOrder[currentIndex] === 'intro') {
          goNext();
        }
      };
      v.addEventListener('ended', onEnded, { once: true });
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
navPrev?.addEventListener('click', goPrev);
navNext?.addEventListener('click', goNext);

// Optional: keyboard arrows for the same behavior
window.addEventListener('keydown', (e) => {
  if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
  if (e.key === 'ArrowLeft')  goPrev();
  if (e.key === 'ArrowRight') goNext();
});

// Initial tab
showTab(tabOrder[0]);
updateNavButtons(); 
