const root = document.documentElement;
const chapters = [...document.querySelectorAll('.chapter')];
const places = [...document.querySelectorAll('.places .place')];
const routes = [...document.querySelectorAll('.route-lines .route')];
const progressRoutes = [...document.querySelectorAll('.route-progress-lines .route-progress')];
const traveler = document.querySelector('.route-traveler');
const atlasStage = document.querySelector('.atlas-stage');
const journey = document.querySelector('.journey');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
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
  number.textContent = String(index).padStart(2, '0');
  region.textContent = chapter.dataset.region;
  status.textContent = chapter.dataset.status;
}

let navigationLockUntil = 0;
let navigationTimer = 0;
let navigationScrollTimer = 0;
activateChapter(chapters[0]);

function chapterWaypoints() {
  const journeyTop = journey.getBoundingClientRect().top + window.scrollY;
  const mobile = window.innerWidth <= 800;
  const headingOffset = mobile
    ? (atlasStage?.offsetHeight || 0) + 16
    : window.innerHeight * .18;

  return chapters.map((chapter, index) => {
    if (index === 0) return Math.round(journeyTop);
    return Math.round(chapter.getBoundingClientRect().top + window.scrollY - headingOffset);
  });
}

function setRouteToChapter(index, isJump = false) {
  if (!traveler || !routes.length || progressRoutes.length !== routes.length) return;
  const segment = Math.max(0, Math.min(routes.length - 1, index - 2));
  const fraction = index === 1 ? 0 : 1;

  progressRoutes.forEach((route, routeIndex) => {
    route.style.strokeDashoffset = String(routeIndex < index - 1 ? 0 : 1);
  });

  const route = routes[segment];
  const point = route.getPointAtLength(route.getTotalLength() * fraction);
  traveler.classList.toggle('jumping', isJump && !reducedMotion.matches);
  traveler.style.transform = `translate(${point.x}px, ${point.y}px)`;
}

function scrollToChapter(index) {
  const chapter = chapters[index - 1];
  if (!chapter) return;
  const top = chapterWaypoints()[index - 1];
  const travelDelay = reducedMotion.matches ? 0 : 800;
  navigationLockUntil = Date.now() + 3000;
  window.clearTimeout(navigationTimer);
  window.clearTimeout(navigationScrollTimer);
  activateChapter(chapter);
  setRouteToChapter(index, true);
  navigationScrollTimer = window.setTimeout(() => {
    window.scrollTo({
      top,
      behavior: reducedMotion.matches ? 'auto' : 'smooth'
    });
  }, travelDelay);
  navigationTimer = window.setTimeout(() => {
    traveler?.classList.remove('jumping');
    activateChapter(chapter);
    setRouteToChapter(index);
  }, 3000);
}

function cancelMapNavigation() {
  navigationLockUntil = 0;
  window.clearTimeout(navigationTimer);
  window.clearTimeout(navigationScrollTimer);
  traveler?.classList.remove('jumping');
}
window.addEventListener('wheel', cancelMapNavigation, { passive: true });
window.addEventListener('touchstart', cancelMapNavigation, { passive: true });

places.forEach((place) => {
  const index = Number(place.dataset.index);
  place.addEventListener('click', () => scrollToChapter(index));
  place.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    scrollToChapter(index);
  });
});

function updateRouteProgress() {
  if (!traveler || !routes.length || progressRoutes.length !== routes.length) return;
  if (Date.now() < navigationLockUntil) return;

  const focusLine = window.scrollY;
  const anchors = chapterWaypoints();
  let segment = 0;
  let fraction = 0;
  let activeIndex = 0;

  if (focusLine >= anchors[anchors.length - 1]) {
    segment = routes.length - 1;
    fraction = 1;
    activeIndex = chapters.length - 1;
  } else if (focusLine > anchors[0]) {
    for (let index = 0; index < anchors.length - 1; index += 1) {
      if (focusLine < anchors[index + 1]) {
        segment = index;
        fraction = (focusLine - anchors[index]) / (anchors[index + 1] - anchors[index]);
        activeIndex = index;
        break;
      }
    }
  }

  activateChapter(chapters[activeIndex]);

  progressRoutes.forEach((route, index) => {
    const progress = index < segment ? 1 : index === segment ? fraction : 0;
    route.style.strokeDashoffset = String(1 - progress);
  });

  const route = routes[segment];
  const point = route.getPointAtLength(route.getTotalLength() * fraction);
  traveler.style.transform = `translate(${point.x}px, ${point.y}px)`;
}

let routeFrame = 0;
function requestRouteUpdate() {
  if (routeFrame) return;
  routeFrame = window.requestAnimationFrame(() => {
    routeFrame = 0;
    updateRouteProgress();
  });
}

window.addEventListener('scroll', requestRouteUpdate, { passive: true });
window.addEventListener('resize', requestRouteUpdate);
updateRouteProgress();
