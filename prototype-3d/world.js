import * as THREE from 'three';

const canvas = document.querySelector('#world');
const labelsLayer = document.querySelector('.world-labels');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const darkMedia = matchMedia('(prefers-color-scheme: dark)');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  document.body.classList.add('no-webgl');
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = innerWidth > 900;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .1, 900);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(9, 9);
const clock = new THREE.Clock();
const interactive = [];
const updaters = [];
const shots = [];
const labels = [];
let currentIndex = 0;
let hovered = null;
let desiredPosition = new THREE.Vector3();
let desiredTarget = new THREE.Vector3();
let cameraTarget = new THREE.Vector3();

const C = {
  paper: 0xf2ecdf, night: 0x0d1117, ink: 0x263229, cream: 0xf3eee3,
  sage: 0x8da58e, darkSage: 0x38594b, rust: 0xd4a72c, sand: 0xcda879,
  clay: 0x9a6048, grass: 0x657d5b, water: 0x5f8ea0, purple: 0x4e2a84,
  stone: 0xbba98c, wood: 0x79573d, black: 0x1b221e, white: 0xf5f0e5
};

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: .82, metalness: .04, flatShading: true, ...opts });
const paperMat = mat(C.cream);
const inkMat = mat(C.ink);
const goldMat = mat(C.rust, { emissive: C.rust, emissiveIntensity: .08, metalness: .32 });
const stoneMat = mat(C.stone);
const woodMat = mat(C.wood);
const purpleMat = mat(C.purple);
const waterMat = mat(C.water, { transparent: true, opacity: .8, roughness: .28 });

const hemi = new THREE.HemisphereLight(C.cream, C.darkSage, 2.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe4bd, 3.1);
sun.position.set(-35, 70, 45);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -70;
sun.shadow.camera.right = sun.shadow.camera.top = 70;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 180;
scene.add(sun, sun.target);

function setTheme() {
  const night = darkMedia.matches;
  scene.background = new THREE.Color(night ? C.night : C.paper);
  scene.fog = new THREE.Fog(night ? C.night : C.paper, 85, night ? 255 : 300);
  hemi.color.set(night ? 0x91aac8 : C.cream);
  hemi.groundColor.set(night ? 0x101720 : C.darkSage);
  hemi.intensity = night ? 1.2 : 2.25;
  sun.color.set(night ? 0xcbdcff : 0xffe4bd);
  sun.intensity = night ? 1.65 : 3.1;
}
setTheme();
darkMedia.addEventListener('change', setTheme);

function seeded(seed = 1729) {
  let x = seed >>> 0;
  return () => ((x = Math.imul(1664525, x) + 1013904223 >>> 0) / 4294967296);
}
const rand = seeded();
const smooth = x => x * x * (3 - 2 * x);

function terrainY(x, z) {
  const rolling = Math.sin(x * .055) * .55 + Math.cos(z * .045) * .42 + Math.sin((x + z) * .085) * .25;
  const desert = 1 - smooth(THREE.MathUtils.clamp((x - 15) / 75, 0, 1));
  return rolling * (.35 + desert * .7) - 1.8;
}

// One continuous low-poly ground plane, sand becoming green toward Evanston.
const groundGeo = new THREE.PlaneGeometry(320, 170, 100, 52);
groundGeo.rotateX(-Math.PI / 2);
groundGeo.translate(60, 0, -16);
const gp = groundGeo.attributes.position;
const colors = [];
for (let i = 0; i < gp.count; i++) {
  const x = gp.getX(i), z = gp.getZ(i), y = terrainY(x, z);
  gp.setY(i, y);
  const t = smooth(THREE.MathUtils.clamp((x - 5) / 115, 0, 1));
  const col = new THREE.Color(C.sand).lerp(new THREE.Color(C.grass), t);
  if (Math.sin(x * .12) + Math.cos(z * .1) > 1.15) col.offsetHSL(0, -.03, .035);
  colors.push(col.r, col.g, col.b);
}
groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
groundGeo.computeVertexNormals();
const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, flatShading: true }));
ground.receiveShadow = true;
scene.add(ground);

function mesh(geometry, material, position, rotation) {
  const m = new THREE.Mesh(geometry, material);
  if (position) m.position.set(...position);
  if (rotation) m.rotation.set(...rotation);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Fountain Hills lake, fountain, mesas and saguaros.
const pondY = terrainY(-48, -7) + .18;
scene.add(mesh(new THREE.CylinderGeometry(12, 12.5, .35, 36), stoneMat, [-48, pondY - .17, -7]));
scene.add(mesh(new THREE.CylinderGeometry(10.8, 11, .19, 36), waterMat, [-48, pondY + .02, -7]));
const jet = mesh(new THREE.ConeGeometry(.75, 22, 12, 1, true), mat(0xcbe9ef, { transparent: true, opacity: .52, emissive: 0xaad9e3, emissiveIntensity: .25 }), [-48, pondY + 11, -7]);
scene.add(jet);
const droplets = [];
const dropGeo = new THREE.BufferGeometry();
const dropPositions = new Float32Array(210 * 3);
for (let i = 0; i < 210; i++) droplets.push({ phase: rand(), a: rand() * Math.PI * 2, spread: .2 + rand() * 4 });
dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPositions, 3));
const spray = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: 0xe6fbff, size: .2, transparent: true, opacity: .78, depthWrite: false }));
spray.position.set(-48, pondY, -7);
scene.add(spray);
updaters.push(t => {
  for (let i = 0; i < droplets.length; i++) {
    const d = droplets[i], p = reduced ? d.phase : (d.phase + t * .18) % 1;
    const h = Math.sin(p * Math.PI) * (15 + d.spread * 1.1);
    const r = p * p * d.spread;
    dropPositions[i * 3] = Math.cos(d.a) * r;
    dropPositions[i * 3 + 1] = h;
    dropPositions[i * 3 + 2] = Math.sin(d.a) * r;
  }
  dropGeo.attributes.position.needsUpdate = true;
});

for (let i = 0; i < 12; i++) {
  const x = -100 + rand() * 75, z = -70 + rand() * 45;
  const h = 9 + rand() * 17;
  const mesa = mesh(new THREE.CylinderGeometry(2 + rand() * 3, 8 + rand() * 7, h, 6), mat(i % 2 ? C.clay : 0xa87455), [x, terrainY(x, z) + h / 2, z]);
  scene.add(mesa);
}
function cactus(x, z, s = 1) {
  const g = new THREE.Group(), green = mat(0x3f7155);
  g.add(mesh(new THREE.CylinderGeometry(.32 * s, .42 * s, 5 * s, 7), green, [0, 2.5 * s, 0]));
  const arm = mesh(new THREE.CylinderGeometry(.18 * s, .23 * s, 2.1 * s, 7), green, [.75 * s, 2.4 * s, 0], [0, 0, Math.PI / 2]);
  const up = mesh(new THREE.CylinderGeometry(.18 * s, .2 * s, 1.8 * s, 7), green, [1.75 * s, 3.05 * s, 0]);
  g.add(arm, up); g.position.set(x, terrainY(x, z), z); return g;
}
for (let i = 0; i < 44; i++) {
  const x = -95 + rand() * 84, z = -56 + rand() * 108;
  if (Math.hypot(x + 48, z + 7) > 16) scene.add(cactus(x, z, .55 + rand() * .62));
}

// Lake Michigan and stylized campus.
const lake = mesh(new THREE.PlaneGeometry(118, 190, 1, 1), waterMat, [154, -1.15, -17], [-Math.PI / 2, 0, 0]);
lake.receiveShadow = true; scene.add(lake);
function building(x, z, w, d, h, purple = false) {
  const y = terrainY(x, z);
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w, h, d), stoneMat, [0, h / 2, 0]));
  g.add(mesh(new THREE.ConeGeometry(Math.max(w, d) * .72, h * .48, 4), purple ? purpleMat : inkMat, [0, h * 1.13, 0], [0, Math.PI / 4, 0]));
  for (let i = -1; i <= 1; i++) g.add(mesh(new THREE.BoxGeometry(.5, 1.5, .15), inkMat, [i * w * .22, h * .52, d / 2 + .08]));
  g.position.set(x, y, z); scene.add(g); return g;
}
building(93, -19, 12, 8, 9, true);
building(108, -30, 15, 7, 7);
building(83, -34, 10, 6, 6);
const tower = building(101, -17, 5.5, 5, 15, true);
tower.add(mesh(new THREE.ConeGeometry(4, 7, 4), purpleMat, [0, 18.5, 0], [0, Math.PI / 4, 0]));
function tree(x, z, color) {
  const y = terrainY(x, z), g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(.18, .25, 2.8, 6), woodMat, [0, 1.4, 0]));
  g.add(mesh(new THREE.IcosahedronGeometry(1.45 + rand() * .65, 0), mat(color), [0, 3.5, 0]));
  g.position.set(x, y, z); scene.add(g);
}
for (let i = 0; i < 80; i++) {
  const x = 55 + rand() * 72, z = -65 + rand() * 112;
  if (x < 130 && Math.hypot(x - 98, z + 22) > 20) tree(x, z, [0x5c7850, 0x7e8e55, 0xa1794d][i % 3]);
}
// Lighthouse at the shoreline.
const lightY = terrainY(128, 12);
const lighthouse = new THREE.Group();
lighthouse.add(mesh(new THREE.CylinderGeometry(1.4, 2.2, 12, 12), paperMat, [0, 6, 0]));
lighthouse.add(mesh(new THREE.CylinderGeometry(2, 2, .5, 12), inkMat, [0, 12, 0]));
lighthouse.add(mesh(new THREE.CylinderGeometry(1.2, 1.2, 2, 12), mat(C.rust, { emissive: C.rust, emissiveIntensity: .5 }), [0, 13.1, 0]));
lighthouse.add(mesh(new THREE.ConeGeometry(1.8, 2.4, 12), inkMat, [0, 15.2, 0]));
lighthouse.position.set(128, lightY, 12); scene.add(lighthouse);

// Route between places.
const routePoints = [
  new THREE.Vector3(-48, pondY + .38, -7), new THREE.Vector3(-20, 1, 13),
  new THREE.Vector3(18, .2, -12), new THREE.Vector3(54, .4, 8),
  new THREE.Vector3(82, terrainY(82, -3) + .4, -3), new THREE.Vector3(101, terrainY(101, -17) + .4, -17)
];
const route = new THREE.CatmullRomCurve3(routePoints, false, 'catmullrom', .4);
scene.add(new THREE.Mesh(new THREE.TubeGeometry(route, 130, .16, 6, false), mat(C.rust, { emissive: C.rust, emissiveIntensity: .18, transparent: true, opacity: .78 })));
const traveler = mesh(new THREE.SphereGeometry(.62, 12, 8), goldMat);
scene.add(traveler);

function pedestalBase() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(2.45, 2.8, .55, 16), stoneMat, [0, .28, 0]));
  const ringMat = mat(C.rust, { emissive: C.rust, emissiveIntensity: .2, transparent: true, opacity: .42 });
  const ring = mesh(new THREE.TorusGeometry(2.42, .09, 6, 32), ringMat, [0, .62, 0], [Math.PI / 2, 0, 0]);
  g.add(ring); g.userData.ring = ring; return g;
}
function iconFor(index, college) {
  const g = new THREE.Group();
  if (index === 0 && !college) {
    g.add(mesh(new THREE.IcosahedronGeometry(1.5, 0), goldMat));
    g.add(mesh(new THREE.TorusKnotGeometry(.8, .2, 48, 7), mat(C.sage), [0, 1.7, 0]));
  } else if (index === 1 && !college) {
    g.add(mesh(new THREE.BoxGeometry(3, 1.9, .35), inkMat, [0, .5, 0]));
    g.add(mesh(new THREE.BoxGeometry(2.55, 1.45, .12), mat(0x6ea08a, { emissive: 0x355c50, emissiveIntensity: .35 }), [0, .55, .24]));
    g.add(mesh(new THREE.BoxGeometry(3.8, .22, 1.4), woodMat, [0, -.55, 0]));
  } else if (index === 2 || (college && index === 6)) {
    g.add(mesh(new THREE.BoxGeometry(3.6, 2.25, .18), mat(0x315b49), [0, .45, 0]));
    g.add(mesh(new THREE.BoxGeometry(4, .18, .25), woodMat, [0, 1.62, 0]));
    g.add(mesh(new THREE.BoxGeometry(4, .18, .25), woodMat, [0, -.72, 0]));
  } else if (index === 3 && !college) {
    g.add(mesh(new THREE.CylinderGeometry(.45, .7, 1.8, 10), mat(0xbddae2, { transparent: true, opacity: .65 }), [0, .3, 0]));
    g.add(mesh(new THREE.SphereGeometry(.75, 10, 7), mat(0x7fc4d2, { transparent: true, opacity: .7 }), [0, -.45, 0]));
  } else if (index === 4 && !college) {
    g.add(mesh(new THREE.BoxGeometry(3.8, 2.6, 1), inkMat, [0, .15, 0]));
    for (let i = 0; i < 10; i++) g.add(mesh(new THREE.BoxGeometry(.3, .11, .7), i % 3 ? paperMat : goldMat, [-1.45 + i * .32, -.45, .72]));
  } else if (index === 5 && !college) {
    const board = new THREE.Group();
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) board.add(mesh(new THREE.BoxGeometry(.43, .11, .43), (a + b) % 2 ? inkMat : paperMat, [(a - 3.5) * .43, 0, (b - 3.5) * .43]));
    g.add(board); g.add(mesh(new THREE.CylinderGeometry(.35, .48, 1.5, 10), goldMat, [0, .82, 0]));
  } else if (index === 6 && !college) {
    g.add(mesh(new THREE.CylinderGeometry(.08, .1, 4, 8), inkMat, [0, 1.4, 0]));
    const flag = mesh(new THREE.PlaneGeometry(2.5, 1.4, 10, 3), goldMat, [1.25, 2.75, 0]);
    g.add(flag);
  } else if (index === 7 && !college) {
    g.add(mesh(new THREE.BoxGeometry(4, .32, 2), stoneMat, [0, -.25, 0]));
    g.add(mesh(new THREE.BoxGeometry(3.7, .12, 1.7), waterMat, [0, -.02, 0]));
    for (let i = -1; i <= 1; i++) g.add(mesh(new THREE.BoxGeometry(.05, .05, 1.72), paperMat, [i * 1.1, .08, 0]));
  } else if (college && index === 0) {
    g.add(mesh(new THREE.BoxGeometry(3, .22, 3), purpleMat, [0, .6, 0], [0, Math.PI / 4, 0]));
    g.add(mesh(new THREE.CylinderGeometry(.55, .65, 1.2, 12), inkMat, [0, 0, 0]));
    g.add(mesh(new THREE.CylinderGeometry(.08, .08, 2.1, 8), goldMat, [1.25, -.2, 0], [0, 0, .25]));
  } else if (college && index === 1) {
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2;
      g.add(mesh(new THREE.ConeGeometry(.3, .85, 3), [goldMat, purpleMat, mat(C.sage)][i % 3], [Math.cos(a) * 1.7, Math.sin(i) * .2, Math.sin(a) * 1.7], [Math.PI / 2, 0, -a]));
    }
  } else if (college && index === 2) {
    g.add(mesh(new THREE.CylinderGeometry(.48, .62, 3.2, 12), paperMat, [0, .55, 0]));
    g.add(mesh(new THREE.ConeGeometry(.62, 1.3, 12), goldMat, [0, 2.8, 0]));
    g.add(mesh(new THREE.ConeGeometry(.5, 1.3, 4), purpleMat, [-.55, -.65, 0], [0, 0, -.3]));
  } else if (college && index === 3) {
    g.add(mesh(new THREE.BoxGeometry(2.7, 2.8, 1.25), purpleMat, [0, .45, 0]));
    g.add(mesh(new THREE.BoxGeometry(2, 1.25, .12), mat(0x6ea08a, { emissive: 0x6ea08a, emissiveIntensity: .35 }), [0, .85, .7]));
    g.add(mesh(new THREE.CylinderGeometry(.18, .18, .2, 12), goldMat, [.7, -.05, .75], [Math.PI / 2, 0, 0]));
  } else if (college && index === 4) {
    g.add(mesh(new THREE.BoxGeometry(2.8, 1.4, 1.8), inkMat, [0, .2, 0]));
    g.add(mesh(new THREE.BoxGeometry(1.8, 1.3, 1.25), mat(C.sage), [0, 1.55, 0]));
    for (const x of [-.5, .5]) g.add(mesh(new THREE.SphereGeometry(.13, 10, 6), goldMat, [x, 1.7, .66]));
    for (const x of [-1.1, 1.1]) g.add(mesh(new THREE.CylinderGeometry(.55, .55, .4, 12), inkMat, [x, -.45, 0], [0, 0, Math.PI / 2]));
  } else {
    g.add(mesh(new THREE.CylinderGeometry(.7, 1.05, 1.2, 16), inkMat, [0, -.2, 0]));
    g.add(mesh(new THREE.SphereGeometry(1.35, 16, 9, 0, Math.PI * 2, 0, Math.PI / 2), goldMat, [0, 1, 0]));
    g.add(mesh(new THREE.TorusGeometry(1.28, .18, 8, 24, Math.PI), goldMat, [-1.15, 1, 0], [0, Math.PI / 2, 0]));
  }
  return g;
}

const chapterEls = [...document.querySelectorAll('.chapter')];
const chapterStars = chapterEls.map(ch => [...ch.querySelectorAll('.star')]);
const stationGroups = [];
function makeStation(el, pos, index, college) {
  const root = pedestalBase();
  const icon = iconFor(index, college); icon.position.y = 2.45; root.add(icon);
  root.position.copy(pos); root.position.y = terrainY(pos.x, pos.z);
  root.userData = { ...root.userData, element: el, label: el.querySelector('.star-label')?.textContent.trim() || '', icon, phase: rand() * 6 };
  root.traverse(o => { if (o.isMesh) { o.userData.station = root; interactive.push(o); } });
  scene.add(root); stationGroups.push(root);
  const label = document.createElement('button'); label.type = 'button'; label.className = 'world-label'; label.textContent = root.userData.label; label.tabIndex = -1;
  label.addEventListener('click', () => focusElement(el)); labelsLayer.append(label); labels.push({ node: label, object: root });
  el.addEventListener('mouseenter', () => setHover(root)); el.addEventListener('mouseleave', () => setHover(null));
  return root;
}

const fhCenter = new THREE.Vector3(-48, 0, -7), evCenter = new THREE.Vector3(101, 0, -18);
chapterStars[0].forEach((el, i) => {
  const a = THREE.MathUtils.degToRad(-142 + i * 38);
  makeStation(el, new THREE.Vector3(fhCenter.x + Math.cos(a) * 23, 0, fhCenter.z + Math.sin(a) * 23), i, false);
});
chapterStars[1].forEach((el, i) => {
  const a = THREE.MathUtils.degToRad(-144 + i * 48);
  makeStation(el, new THREE.Vector3(evCenter.x + Math.cos(a) * 22, 0, evCenter.z + Math.sin(a) * 22), i, true);
});

function focusElement(el) {
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  el.classList.add('is-flash'); setTimeout(() => el.classList.remove('is-flash'), 950);
}
function setHover(station) {
  hovered = station;
  canvas.classList.toggle('is-pointing', !!station);
  for (const { node, object } of labels) node.classList.toggle('is-hover', object === station);
}

function stationShot(station) {
  const c = station.position;
  const center = c.x < 20 ? fhCenter : evCenter;
  const outward = new THREE.Vector3(c.x - center.x, 0, c.z - center.z).normalize();
  return {
    position: c.clone().add(outward.multiplyScalar(19)).add(new THREE.Vector3(0, 11, 0)),
    target: c.clone().add(new THREE.Vector3(0, 2.2, 0))
  };
}
function addShot(element, position, target, station = null, kind = 'static') {
  shots.push({ element, position: position.clone(), target: target.clone(), station, kind, y: 0 });
}
addShot(document.querySelector('[data-key="hero"]'), new THREE.Vector3(-83, 47, 61), new THREE.Vector3(-35, 2, -10));
addShot(chapterEls[0].querySelector('.chapter-head'), new THREE.Vector3(-73, 18, 31), new THREE.Vector3(-48, 6, -7));
for (const st of stationGroups.slice(0, 8)) { const sh = stationShot(st); addShot(st.userData.element, sh.position, sh.target, st); }
addShot(document.querySelector('[data-key="travel-start"]'), new THREE.Vector3(-30, 58, 68), new THREE.Vector3(-15, 0, -5), null, 'travel');
addShot(document.querySelector('[data-key="travel"]'), new THREE.Vector3(25, 88, 92), new THREE.Vector3(30, 0, -8), null, 'travel');
addShot(document.querySelector('[data-key="travel-end"]'), new THREE.Vector3(74, 58, 65), new THREE.Vector3(82, 1, -12), null, 'travel');
addShot(chapterEls[1].querySelector('.chapter-head'), new THREE.Vector3(72, 20, 26), new THREE.Vector3(100, 6, -20));
for (const st of stationGroups.slice(8)) { const sh = stationShot(st); addShot(st.userData.element, sh.position, sh.target, st); }
addShot(document.querySelector('[data-key="outro"]'), new THREE.Vector3(151, 35, 45), new THREE.Vector3(108, 4, -17));

function updateShotAnchors() {
  const line = innerWidth <= 900 ? innerHeight * .62 : innerHeight * .5;
  for (const shot of shots) shot.y = scrollY + shot.element.getBoundingClientRect().top + shot.element.offsetHeight / 2 - line;
  shots.sort((a, b) => a.y - b.y);
}
function cameraState() {
  let a = shots[0], b = shots[0], f = 0;
  if (scrollY <= shots[0].y) return { a, b, f };
  for (let i = 0; i < shots.length - 1; i++) {
    if (scrollY <= shots[i + 1].y) {
      a = shots[i]; b = shots[i + 1]; f = THREE.MathUtils.clamp((scrollY - a.y) / Math.max(1, b.y - a.y), 0, 1); break;
    }
    a = b = shots[i + 1];
  }
  return { a, b, f: smooth(f) };
}

function resize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.clearViewOffset();
  if (innerWidth > 900) {
    const shift = Math.min(innerWidth * .055, 90);
    camera.setViewOffset(innerWidth, innerHeight, -shift, 0, innerWidth, innerHeight);
  }
  camera.updateProjectionMatrix(); updateShotAnchors();
}
addEventListener('resize', resize);
addEventListener('load', updateShotAnchors);
document.fonts?.ready.then(updateShotAnchors);
new ResizeObserver(updateShotAnchors).observe(document.querySelector('.proto-content'));

canvas.addEventListener('pointermove', e => {
  pointer.x = e.clientX / innerWidth * 2 - 1; pointer.y = -(e.clientY / innerHeight) * 2 + 1;
});
canvas.addEventListener('pointerleave', () => { pointer.set(9, 9); setHover(null); });
canvas.addEventListener('click', () => { if (hovered) focusElement(hovered.userData.element); });

resize();
const init = cameraState(); camera.position.copy(init.a.position); cameraTarget.copy(init.a.target); camera.lookAt(cameraTarget);
requestAnimationFrame(() => canvas.classList.add('is-ready'));

function animate() {
  const t = clock.getElapsedTime(), state = cameraState();
  desiredPosition.copy(state.a.position).lerp(state.b.position, state.f);
  desiredTarget.copy(state.a.target).lerp(state.b.target, state.f);
  if (state.a !== state.b) desiredPosition.y += Math.sin(state.f * Math.PI) * Math.min(10, state.a.position.distanceTo(state.b.position) * .08);
  const damping = reduced ? 1 : .075;
  camera.position.lerp(desiredPosition, damping); cameraTarget.lerp(desiredTarget, damping); camera.lookAt(cameraTarget);

  const nearest = state.f < .5 ? state.a : state.b;
  const idx = shots.indexOf(nearest);
  if (idx !== currentIndex) {
    currentIndex = idx;
    document.querySelectorAll('.star.is-current').forEach(x => x.classList.remove('is-current'));
    nearest.station?.userData.element.classList.add('is-current');
  }
  for (const st of stationGroups) {
    const current = st === nearest.station, hot = st === hovered;
    const s = current || hot ? 1.12 : 1;
    st.userData.icon.scale.lerp(new THREE.Vector3(s, s, s), .12);
    st.userData.icon.position.y = 2.45 + (reduced ? 0 : Math.sin(t * 1.3 + st.userData.phase) * .16);
    if (!reduced) st.userData.icon.rotation.y += .0025;
    st.userData.ring.material.opacity = current || hot ? .95 : .35;
    st.userData.ring.material.emissiveIntensity = current || hot ? .65 : .18;
  }
  updaters.forEach(fn => fn(t));

  const travelProgress = THREE.MathUtils.clamp((scrollY - shots.find(x => x.element.dataset.key === 'travel-start').y) /
    Math.max(1, shots.find(x => x.element.dataset.key === 'travel-end').y - shots.find(x => x.element.dataset.key === 'travel-start').y), 0, 1);
  traveler.position.copy(route.getPoint(travelProgress));
  traveler.position.y += .45 + (reduced ? 0 : Math.sin(t * 3) * .13);

  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(interactive, false)[0];
  setHover(hit?.object.userData.station || null);

  for (const { node, object } of labels) {
    const p = object.position.clone(); p.y += 6.2; p.project(camera);
    const visible = (object === nearest.station || object === hovered) && p.z < 1 && p.z > -1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
    node.style.opacity = visible ? (object === nearest.station ? '1' : '.55') : '0';
    node.style.transform = `translate3d(${(p.x * .5 + .5) * innerWidth}px, ${(-p.y * .5 + .5) * innerHeight}px, 0) translate(-50%, -50%)`;
    node.classList.toggle('is-current', object === nearest.station);
  }
  sun.position.copy(cameraTarget).add(new THREE.Vector3(-35, 62, 45)); sun.target.position.copy(cameraTarget); sun.target.updateMatrixWorld();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
