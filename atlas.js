const root = document.documentElement;
const chapters = [...document.querySelectorAll('.chapter')];
const places = [...document.querySelectorAll('.place')];
const routes = [...document.querySelectorAll('.route')];
const number = document.querySelector('#active-number');
const region = document.querySelector('#active-region');
const status = document.querySelector('#route-status');

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
