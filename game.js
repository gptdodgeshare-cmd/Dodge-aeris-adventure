import * as T from './vendor/three.module.min.js';
import {createNavigation} from './navigation.js';

// Keep the original character geometry and the original joint-based walk animation.
const camera = new T.PerspectiveCamera(55, innerWidth / innerHeight, .1, 180);
const mobile = matchMedia('(max-width: 600px)').matches;
const renderer = new T.WebGLRenderer({antialias: !mobile, powerPreference: 'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.querySelector('#game').append(renderer.domElement);
function mesh(geometry, color, parent, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(geometry, new T.MeshStandardMaterial({color, roughness: .78}));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
const player = new T.Group();
player.name = 'Original Dodge Aeris avatar';
const playerBody = mesh(new T.BoxGeometry(.9, 1, .55), 0x397dc7, player, 0, 1.25, 0);
const playerHead = mesh(new T.SphereGeometry(.65, 16, 12), 0xffd0a8, player, 0, 2.28, 0);
mesh(new T.SphereGeometry(.65, 16, 12, 0, Math.PI * 2, 0, Math.PI * .35), 0x4c3228, player, 0, 2.32, 0);
const arms = [], legs = [];
for (const x of [-.6, .6]) {
  const p = new T.Group(); p.position.set(x, 1.65, 0); player.add(p);
  mesh(new T.BoxGeometry(.27, .75, .3), 0x397dc7, p, 0, -.37, 0); arms.push(p);
}
for (const x of [-.23, .23]) {
  const p = new T.Group(); p.position.set(x, .72, 0); player.add(p);
  mesh(new T.BoxGeometry(.3, .72, .4), 0x364d79, p, 0, -.35, 0); legs.push(p);
}
const equipmentSlots = {head: new T.Group(), body: new T.Group(), rightHand: new T.Group(), leftHand: new T.Group()};
equipmentSlots.head.position.set(0, 2.28, 0); equipmentSlots.body.position.set(0, 1.25, 0);
equipmentSlots.rightHand.position.set(0, -.7, 0); equipmentSlots.leftHand.position.set(0, -.7, 0);
player.add(equipmentSlots.head, equipmentSlots.body); arms[1].add(equipmentSlots.rightHand); arms[0].add(equipmentSlots.leftHand);

const SAVE_KEY = 'dodge-adventure-save-v1';
function readSave() {
  const empty = {credits: 200, profession: 'Adventurer', inventory: []};
  try {
    const save = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!save || !Number.isFinite(save.credits) || save.credits < 0) return empty;
    return {credits: Math.floor(Math.min(save.credits, 1000000)), profession: ['Cyborg', 'Inventor'].includes(save.profession) ? save.profession : 'Adventurer', inventory: Array.isArray(save.inventory) ? [...new Set(save.inventory.filter(v => ['weapon', 'armor', 'item'].includes(v)))] : []};
  } catch { return empty; }
}
const gameState = readSave();
function saveGame() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(gameState)); } catch { /* Playable when storage is disabled. */ } }
function readCameraMode() { try { return localStorage.getItem('dodge-camera'); } catch { return null; } }
const mode = document.querySelector('#mode');
mode.value = ['free', 'fixed', 'follow'].includes(readCameraMode()) ? readCameraMode() : 'free';
mode.onchange = () => { try { localStorage.setItem('dodge-camera', mode.value); } catch {} };
let yaw = .7, pitch = .55, dist = 18;
document.querySelector('#reset').onclick = () => { yaw = .7; pitch = .55; dist = 18; };
document.querySelector('#help-toggle').onclick = () => {
  const help = document.querySelector('#help'); help.hidden = !help.hidden;
  document.querySelector('#help-toggle').setAttribute('aria-expanded', String(!help.hidden));
};
const status = document.querySelector('#status');
let statusUntil = 0;
function notify(text, seconds = 4) { status.textContent = text; statusUntil = performance.now() + seconds * 1000; }
function updateEquipment() {
  for (const slot of Object.values(equipmentSlots)) {
    slot.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); slot.clear();
  }
  if (gameState.inventory.includes('weapon')) {
    const blade = mesh(new T.BoxGeometry(.14, 1.1, .25), 0x91e9e2, equipmentSlots.rightHand, 0, -.1, -.12);
    blade.material.emissive.setHex(0x1e6569);
    mesh(new T.BoxGeometry(.5, .09, .24), 0xe6b765, equipmentSlots.rightHand, 0, .36, -.12);
  }
  if (gameState.inventory.includes('armor')) {
    mesh(new T.BoxGeometry(1.02, .65, .15), 0xd6ae6c, equipmentSlots.body, 0, .02, -.32);
    mesh(new T.SphereGeometry(.15, 8, 6), 0x5df1d9, equipmentSlots.body, 0, .05, -.44);
  }
  document.querySelector('#profession').textContent = gameState.profession;
  document.querySelector('#credits').textContent = gameState.credits;
}
updateEquipment();

let scene = new T.Scene(), activeMap = null, navigation = null;
let transitioning = false, portalCooldown = 0;
let currentPath = [], walkingToPoint = false;
const destination = new T.Vector3();
const marker = new T.Mesh(new T.RingGeometry(.24, .36, 32), new T.MeshBasicMaterial({color: 0x75ffdb, side: T.DoubleSide}));
marker.rotation.x = -Math.PI / 2; marker.visible = false;
const keys = new Set();
const pointers = new Map();
let gesture = null;
function stopWalking() { currentPath = []; walkingToPoint = false; marker.visible = false; }
function clearInput() { keys.clear(); pointers.clear(); gesture = null; }
async function changeMap(id, arrival) {
  if (transitioning) return false;
  transitioning = true; stopWalking(); clearInput(); closeDialog();
  const loading = document.querySelector('#loading'); loading.hidden = false;
  loading.querySelector('strong').textContent = id === 'elim' ? 'กำลังเดินทางไป Elim…' : 'กำลังเข้า Neo Gear City…';
  try {
    // Explicit imports keep Pages paths relative and load only the requested map module.
    const module = id === 'elim' ? await import('./maps/elim.js') : await import('./maps/neo-gear.js');
    const next = module.createMap();
    const nextNavigation = createNavigation(next.bounds, next.colliders, .9);
    const spawn = arrival || next.spawn;
    if (!nextNavigation.isWalkable(spawn.x, spawn.z)) { next.dispose(); throw new Error('Map spawn is obstructed'); }
    const previous = activeMap;
    player.removeFromParent(); marker.removeFromParent();
    activeMap = next; scene = next.scene; navigation = nextNavigation;
    scene.add(player, marker); player.position.set(spawn.x, 0, spawn.z); destination.copy(player.position);
    scene.traverse(o => { if (o.isDirectionalLight && o.castShadow) { o.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024); } });
    if (previous) previous.dispose();
    camera.position.set(player.position.x + Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist + 1.2, player.position.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(player.position.clone().add(new T.Vector3(0, 1.2, 0))); camera.updateMatrixWorld();
    portalCooldown = 1.2;
    document.querySelector('#map-name').textContent = next.name;
    document.querySelector('#map-subtitle').textContent = id === 'elim' ? 'ลานต้อนรับ · เส้นทางกลับ Neo Gear City' : 'เมืองแห่งพลังงานและนักประดิษฐ์';
    notify(id === 'elim' ? 'ถึง Elim แล้ว · เดินเข้าประตูเพื่อกลับ Neo Gear City' : 'ยินดีต้อนรับสู่ Neo Gear City · พบไกด์ที่ลานกลาง');
    return true;
  } catch (error) {
    console.error('Map transition failed:', error);
    notify('โหลดแผนที่ไม่สำเร็จ กรุณาลองใหม่');
    if (!activeMap) { loading.querySelector('strong').textContent = 'โหลดเมืองไม่สำเร็จ กรุณารีเฟรช'; throw error; }
    return false;
  } finally { transitioning = false; if (activeMap) loading.hidden = true; }
}
function navigateTo(point) {
  if (!navigation || transitioning || !document.querySelector('#dialog-panel').hidden) return false;
  const path = navigation.findPath({x: player.position.x, z: player.position.z}, {x: point.x, z: point.z});
  if (!path.length) { notify('จุดนี้เดินเข้าไม่ได้ · ลองแตะพื้นทางเดิน'); return false; }
  destination.set(point.x, 0, point.z); currentPath = path; walkingToPoint = true;
  marker.position.set(point.x, .055, point.z); marker.visible = true; return true;
}

let dialogNpc = null, nearestNpc = null;
const dialog = document.querySelector('#dialog-panel');
function closeDialog() { dialog.hidden = true; dialogNpc = null; }
document.querySelector('#dialog-close').onclick = () => { closeDialog(); renderer.domElement.focus(); };
function action(label, id, callback, disabled = false) {
  const button = document.createElement('button'); button.textContent = label; button.dataset.action = id; button.disabled = disabled;
  button.onclick = callback; document.querySelector('#dialog-actions').append(button);
}
function interactWith(npc) {
  if (!npc || transitioning || Math.hypot(player.position.x - npc.x, player.position.z - npc.z) > 3.2) return false;
  stopWalking(); keys.clear(); dialogNpc = npc; dialog.hidden = false;
  document.querySelector('#dialog-title').textContent = npc.name;
  document.querySelector('#dialog-role').textContent = activeMap.name;
  const text = document.querySelector('#dialog-text');
  document.querySelector('#dialog-actions').replaceChildren();
  if (npc.role === 'guide') {
    text.textContent = activeMap.id === 'elim' ? 'ยินดีต้อนรับสู่ลานต้อนรับ Elim! ที่นี่เป็นจุดพักระหว่างการเดินทาง เดินไปยังประตูพลังงานทางเหนือเพื่อกลับ Neo Gear City' : 'ยินดีต้อนรับ! น้ำพุพลังงานอยู่กลางเมือง หอพลังงานอยู่ทางเหนือ โรงงานอยู่ตะวันตก และศูนย์วิจัยอยู่ตะวันออก เลือกอาชีพ Cyborg หรือ Inventor ได้ที่นักวิทยาศาสตร์ ร้านค้าอยู่ทางใต้ และประตูวาร์ปไป Elim อยู่ตะวันออก เดินผ่านประตูใต้สู่ทะเลทรายจักรกลได้ด้วย';
  } else if (npc.role === 'class') {
    text.textContent = `ศูนย์วิจัยพร้อมต้อนรับคุณ เลือกอาชีพได้โดยไม่เสียเหรียญ อาชีพปัจจุบัน: ${gameState.profession}`;
    for (const profession of ['Cyborg', 'Inventor']) action(profession, `class-${profession.toLowerCase()}`, () => {
      gameState.profession = profession; saveGame(); updateEquipment(); interactWith(npc); notify(`เลือกอาชีพ ${profession} แล้ว`);
    }, gameState.profession === profession);
  } else if (['weapons', 'armor', 'items'].includes(npc.role)) {
    const type = {weapons: 'weapon', armor: 'armor', items: 'item'}[npc.role];
    const title = {weapon: 'ดาบเฟืองพลังงาน', armor: 'เกราะทองเหลือง', item: 'ชุดซ่อมแซม'}[type];
    const price = {weapon: 40, armor: 50, item: 15}[type];
    const owned = gameState.inventory.includes(type);
    text.textContent = `${title} ราคา ${price} เหรียญ${owned ? ' · คุณมีชิ้นนี้แล้ว' : ''} — ใช้เหรียญในเกมเท่านั้น`;
    action(owned ? 'มีในกระเป๋าแล้ว' : `ซื้อ ${title} · ${price} ◈`, `buy-${type}`, () => {
      if (gameState.inventory.includes(type) || gameState.credits < price) return;
      gameState.credits -= price; gameState.inventory.push(type); saveGame(); updateEquipment(); interactWith(npc); notify(`ได้รับ${title}แล้ว`);
    }, owned || gameState.credits < price);
  } else if (npc.role === 'warp') {
    text.textContent = activeMap.id === 'neo-gear' ? 'วงพลังงานด้านหลังคือประตูไป Elim เดินผ่านใจกลางวงเพื่อเดินทาง เมื่อถึงปลายทางจะมีประตูกลับเมืองนี้' : 'ที่นี่คือลานต้อนรับ Elim เดินเข้าประตูพลังงานเพื่อกลับ Neo Gear City';
  }
  document.querySelector('#inventory-summary').textContent = `อาชีพ ${gameState.profession} · ${gameState.credits} เหรียญ · กระเป๋า ${gameState.inventory.length} ชิ้น`;
  document.querySelector('#dialog-close').focus(); return true;
}
document.querySelector('#interact').onclick = () => interactWith(nearestNpc);
addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeDialog(); return; }
  if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
  const key = e.key.toLowerCase();
  if (key === 'e' && !e.repeat && dialog.hidden) interactWith(nearestNpc);
  if ('wasd'.includes(key) && key.length === 1 && dialog.hidden) { keys.add(key); e.preventDefault(); }
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });
dialog.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const buttons = [...dialog.querySelectorAll('button:not(:disabled)')];
  const first = buttons[0], last = buttons.at(-1);
  if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
  else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
});

// Preserve pointer tap/drag distinction; multi-touch can orbit and pinch, never walk.
const c = renderer.domElement; c.tabIndex = 0; c.setAttribute('aria-label', 'ฉากเกมสามมิติ แตะพื้นเพื่อเดิน ลากเพื่อหมุนกล้อง');
const raycaster = new T.Raycaster();
const groundPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
let pinch = null;
function pinchState() { const [a, b] = [...pointers.values()]; return {distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}; }
c.onpointerdown = e => {
  if (transitioning || !dialog.hidden || (e.pointerType === 'mouse' && e.button !== 0)) return;
  c.focus({preventScroll: true});
  pointers.set(e.pointerId, {x: e.clientX, y: e.clientY}); c.setPointerCapture(e.pointerId);
  if (pointers.size > 1) { if (gesture) gesture.cancelled = true; pinch = pinchState(); return; }
  gesture = {id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, dragged: false, cancelled: false};
};
c.onpointermove = e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (pointers.size > 1) {
    const next = pinchState();
    if (pinch) {
      if (mode.value !== 'fixed') { yaw -= (next.x - pinch.x) * .006; pitch = T.MathUtils.clamp(pitch + (next.y - pinch.y) * .004, .25, 1.3); }
      dist = T.MathUtils.clamp(dist + (pinch.distance - next.distance) * .035, 4, 24);
    }
    pinch = next; return;
  }
  if (!gesture || gesture.id !== e.pointerId || gesture.cancelled) return;
  if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 10) gesture.dragged = true;
  if (gesture.dragged && mode.value !== 'fixed') { yaw -= (e.clientX - gesture.lastX) * .006; pitch = T.MathUtils.clamp(pitch + (e.clientY - gesture.lastY) * .004, .25, 1.3); }
  gesture.lastX = e.clientX; gesture.lastY = e.clientY;
};
function endPointer(e, cancelled = false) {
  pointers.delete(e.pointerId); pinch = pointers.size > 1 ? pinchState() : null;
  const tap = gesture && gesture.id === e.pointerId && !cancelled && !gesture.cancelled && !gesture.dragged && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) <= 10;
  if (gesture?.id === e.pointerId) gesture = null;
  if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
  if (!tap || !dialog.hidden) return;
  const rect = c.getBoundingClientRect();
  raycaster.setFromCamera(new T.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), camera);
  const point = raycaster.ray.intersectPlane(groundPlane, new T.Vector3());
  if (point) navigateTo(point);
}
c.onpointerup = e => endPointer(e);
c.onpointercancel = e => endPointer(e, true);
c.onlostpointercapture = e => { pointers.delete(e.pointerId); if (gesture?.id === e.pointerId) gesture = null; if (pointers.size < 2) pinch = null; };
c.addEventListener('wheel', e => { e.preventDefault(); dist = T.MathUtils.clamp(dist + Math.sign(e.deltaY), 4, 24); }, {passive: false});
c.oncontextmenu = e => e.preventDefault();

const minimap = document.querySelector('#minimap'), minimapContext = minimap.getContext('2d');
function drawMinimap() {
  if (!activeMap) return;
  const ctx = minimapContext, b = activeMap.bounds, w = minimap.width, h = minimap.height;
  const point = (x, z) => [(x - b.minX) / (b.maxX - b.minX) * w, (z - b.minZ) / (b.maxZ - b.minZ) * h];
  ctx.fillStyle = activeMap.id === 'elim' ? '#345d53' : '#294950'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c0c3a44d'; ctx.lineWidth = 5;
  const [cx, cz] = point(0, 0); ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.moveTo(0, cz); ctx.lineTo(w, cz); ctx.stroke();
  ctx.fillStyle = '#a1c1b180';
  for (const box of activeMap.colliders) { const [x, z] = point(box.minX, box.minZ), [x2, z2] = point(box.maxX, box.maxZ); ctx.fillRect(x, z, x2 - x, z2 - z); }
  for (const npc of activeMap.npcs) { const [x, z] = point(npc.x, npc.z); ctx.fillStyle = '#c1ddc0'; ctx.beginPath(); ctx.arc(x, z, 2, 0, Math.PI * 2); ctx.fill(); }
  for (const portal of activeMap.portals) { const [x, z] = point(portal.x, portal.z); ctx.fillStyle = '#f7d99a'; ctx.save(); ctx.translate(x, z); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore(); }
  if (walkingToPoint) { const [x, z] = point(destination.x, destination.z); ctx.strokeStyle = '#74ffda'; ctx.beginPath(); ctx.arc(x, z, 3, 0, Math.PI * 2); ctx.stroke(); }
  const [x, z] = point(player.position.x, player.position.z); ctx.fillStyle = '#90ffe1'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, z, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  document.querySelector('#map-coordinates').textContent = `${Math.round(player.position.x)}, ${Math.round(player.position.z)}`;
}
const cameraRay = new T.Raycaster();
const clock = new T.Clock();
let step = 0, elapsed = 0, lastUi = 0;
function frame() {
  requestAnimationFrame(frame);
  if (!activeMap || document.hidden) { clock.getDelta(); return; }
  const dt = Math.min(clock.getDelta(), .05); elapsed += dt; portalCooldown = Math.max(0, portalCooldown - dt);
  let moving = false, dx = 0, dz = 0;
  const x = Number(keys.has('d')) - Number(keys.has('a')), z = Number(keys.has('s')) - Number(keys.has('w'));
  if (!transitioning && dialog.hidden && (x || z)) {
    stopWalking(); const len = Math.hypot(x, z); dx = (x * Math.cos(yaw) + z * Math.sin(yaw)) / len; dz = (-x * Math.sin(yaw) + z * Math.cos(yaw)) / len;
    const next = navigation.move({x: player.position.x, z: player.position.z}, dx * dt * 4, dz * dt * 4);
    moving = Math.hypot(next.x - player.position.x, next.z - player.position.z) > .00001;
    player.position.set(next.x, 0, next.z);
  } else if (!transitioning && dialog.hidden && walkingToPoint) {
    let budget = 4 * dt;
    while (currentPath.length && budget > 0) {
      const target = currentPath[0], vx = target.x - player.position.x, vz = target.z - player.position.z, remaining = Math.hypot(vx, vz);
      if (remaining < .001) { currentPath.shift(); continue; }
      dx = vx / remaining; dz = vz / remaining;
      const distance = Math.min(budget, remaining), next = navigation.move({x: player.position.x, z: player.position.z}, dx * distance, dz * distance);
      const travelled = Math.hypot(next.x - player.position.x, next.z - player.position.z);
      if (travelled < .00001) { stopWalking(); break; }
      player.position.set(next.x, 0, next.z); moving = true; budget -= distance;
      if (distance === remaining) currentPath.shift();
    }
    if (!currentPath.length) stopWalking();
  }
  if (moving) { const target = Math.atan2(-dx, -dz); player.rotation.y += Math.atan2(Math.sin(target - player.rotation.y), Math.cos(target - player.rotation.y)) * Math.min(1, dt * 12); step += dt * 11; }
  const swing = moving ? Math.sin(step) * .5 : 0;
  legs[0].rotation.x = swing; legs[1].rotation.x = -swing; arms[0].rotation.x = -swing; arms[1].rotation.x = swing;
  if (mode.value === 'fixed') yaw = .7;
  if (mode.value === 'follow' && moving && !gesture?.dragged && pointers.size < 2) { const diff = Math.atan2(Math.sin(player.rotation.y - yaw), Math.cos(player.rotation.y - yaw)); yaw += diff * Math.min(1, dt * 3); }
  const focus = player.position.clone().add(new T.Vector3(0, 1.2, 0));
  const offset = new T.Vector3(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
  cameraRay.set(focus, offset.clone().normalize()); cameraRay.far = offset.length();
  const blockers = activeMap.occluders || [];
  const obstruction = cameraRay.intersectObjects(blockers, false)[0];
  if (obstruction) offset.setLength(Math.max(1.2, obstruction.distance - .4));
  camera.position.lerp(focus.clone().add(offset), Math.min(1, dt * 10)); camera.lookAt(focus);
  activeMap.update?.(dt, elapsed);
  if (!transitioning && dialog.hidden && portalCooldown === 0) {
    const portal = activeMap.portals.find(p => Math.hypot(player.position.x - p.x, player.position.z - p.z) < p.radius);
    if (portal) void changeMap(portal.target, portal.arrival);
  }
  if (elapsed - lastUi > .1) {
    lastUi = elapsed; drawMinimap();
    nearestNpc = activeMap.npcs.reduce((near, npc) => Math.hypot(player.position.x - npc.x, player.position.z - npc.z) < 2.8 && (!near || Math.hypot(player.position.x - npc.x, player.position.z - npc.z) < Math.hypot(player.position.x - near.x, player.position.z - near.z)) ? npc : near, null);
    const button = document.querySelector('#interact'); button.hidden = !nearestNpc || !dialog.hidden || transitioning;
    if (nearestNpc) button.firstChild.textContent = `สนทนา ${nearestNpc.name} `;
    if (performance.now() > statusUntil) status.textContent = activeMap.id === 'neo-gear' && player.position.z > 31 ? 'เขตนอกเมือง · ทะเลทรายจักรกล' : 'แตะพื้นเพื่อเดิน · ลากเพื่อมองรอบตัว';
  }
  renderer.render(scene, camera);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
await changeMap('neo-gear');
frame();
