const root = document.documentElement;
const chapters = [...document.querySelectorAll('.chapter')];
const places = [...document.querySelectorAll('.places .place')];
const routes = [...document.querySelectorAll('.route-lines .route')];
const number = document.querySelector('#active-number');
const region = document.querySelector('#active-region');
const status = document.querySelector('#route-status');
const themeButtons = [...document.querySelectorAll('.theme-button')];
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)');
const themeColors = { atlas: '#f2ecdf', dark: '#0d1117' };

function resolvedTheme(theme) {
  return theme === 'system' ? (systemDarkMode.matches ? 'dark' : 'atlas') : theme;
}

function setTheme(theme) {
  const appearance = resolvedTheme(theme);
  document.body.dataset.theme = appearance === 'atlas' ? '' : appearance;
  if (themeColorMeta) themeColorMeta.setAttribute('content', themeColors[appearance] || themeColors.atlas);
  themeButtons.forEach((button) => {
    const selected = button.dataset.theme === theme;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  try { localStorage.setItem('atlas-theme', theme); } catch (error) { /* storage is optional */ }
}

themeButtons.forEach((button) => {
  button.addEventListener('click', () => setTheme(button.dataset.theme));
});

systemDarkMode.addEventListener('change', () => {
  const selected = document.querySelector('.theme-button.active')?.dataset.theme;
  if (selected === 'system') setTheme('system');
});

const linkedTheme = new URLSearchParams(window.location.search).get('theme');
let savedTheme = linkedTheme || 'system';
try { savedTheme = linkedTheme || localStorage.getItem('atlas-theme') || 'system'; } catch (error) { /* storage is optional */ }
if (savedTheme === 'nocturne') savedTheme = 'dark';
setTheme(['system', 'atlas', 'dark'].includes(savedTheme) ? savedTheme : 'system');

window.addEventListener('pointermove', (event) => {
  root.style.setProperty('--mouse-x', `${event.clientX}px`);
  root.style.setProperty('--mouse-y', `${event.clientY}px`);
}, { passive: true });

function activateChapter(chapter) {
  const index = Number(chapter.dataset.index);
  chapters.forEach((item) => item.classList.toggle('active', item === chapter));
  places.forEach((place, placeIndex) => {
    const step = placeIndex + 1;
    place.classList.toggle('active', step === index);
    place.classList.toggle('visited', step < index);
  });
  routes.forEach((route, routeIndex) => {
    route.classList.toggle('drawn', routeIndex < index - 1);
  });
  number.textContent = String(index).padStart(2, '0');
  region.textContent = chapter.dataset.region;
  status.textContent = chapter.dataset.status;
}

const observer = new IntersectionObserver((entries) => {
  const visible = entries
    .filter((entry) => entry.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (visible) activateChapter(visible.target);
}, {
  rootMargin: '-32% 0px -32% 0px',
  threshold: [0, .2, .5, .8]
});

chapters.forEach((chapter) => observer.observe(chapter));
activateChapter(chapters[0]);

/* ---- Icon constellation: shared detail tray per chapter ---- */
// Mark enhanced so CSS can hide the in-tile fallback detail and show the tray.
document.body.setAttribute('data-enhanced', '');

document.querySelectorAll('.constellation-block').forEach((block) => {
  const stars = [...block.querySelectorAll('.star')];
  const tray = block.querySelector('.tray-detail');
  if (!stars.length || !tray) return;

  let selected = stars.find((s) => s.classList.contains('is-selected')) || stars[0];

  const showDetail = (star) => { tray.textContent = star.dataset.detail || ''; };

  const select = (star) => {
    selected = star;
    stars.forEach((s) => {
      const on = s === star;
      s.classList.toggle('is-selected', on);
      s.setAttribute('aria-pressed', String(on));
      s.setAttribute('aria-selected', String(on));
    });
    showDetail(star);
  };

  // Initialize tray to the default-selected highlight.
  showDetail(selected);

  stars.forEach((star, i) => {
    // Pointer hover previews without committing the selection.
    star.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') showDetail(star);
    });
    star.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') showDetail(selected);
    });
    // Focus previews too, so keyboard users see details while arrowing.
    star.addEventListener('focus', () => showDetail(star));
    star.addEventListener('blur', () => showDetail(selected));
    // Click / tap / Enter / Space commit the selection (buttons fire click on both).
    star.addEventListener('click', () => select(star));
    // Roving arrow-key navigation within the constellation.
    star.addEventListener('keydown', (event) => {
      const cols = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 };
      if (event.key in cols) {
        event.preventDefault();
        const next = stars[(i + cols[event.key] + stars.length) % stars.length];
        next.focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        stars[0].focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        stars[stars.length - 1].focus();
      }
    });
  });
});
