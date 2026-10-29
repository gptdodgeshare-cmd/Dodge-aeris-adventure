import * as T from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';

// This standalone atelier never imports or mutates Neo Gear City's runtime.
const stage = document.querySelector('#preview-stage');
const scene = new T.Scene();
scene.background = new T.Color(0xebe8df);
scene.fog = new T.Fog(0xebe8df, 16, 36);
const camera = new T.PerspectiveCamera(32, 1, .05, 70);
const mobile = matchMedia('(max-width: 760px)').matches;
const renderer = new T.WebGLRenderer({antialias: true, alpha: false, powerPreference: 'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1 : 1.5));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label', 'โมเดลตัวละครสามมิติ ลากเพื่อหมุนและจีบนิ้วเพื่อซูม');
renderer.domElement.tabIndex = 0;
stage.prepend(renderer.domElement);

const previewState = {
  models: {}, mixers: [], gender: 'both', view: 'front', activeAnimation: 'Idle',
  paused: false, speed: 1, equipment: {MainWeapon: false, Offhand: false, Armor: false},
  ready: false, error: null, manifest: null, wireframe: false, showRig: false,
};
const desiredClips = ['Idle', 'Walk', 'Run', 'Attack', 'Hit', 'Death'];
const offsets = {male: -1.28, female: 1.28};
const viewAngles = {front: 0, left: -Math.PI / 2, back: Math.PI, right: Math.PI / 2};
let azimuth = 0, elevation = .07, zoom = 1;
const target = new T.Vector3(0, 1.65, 0);
const guideRoot = new T.Group();
scene.add(guideRoot);
scene.add(new T.HemisphereLight(0xfffbef, 0x8f9481, 2.4));
const keyLight = new T.DirectionalLight(0xffedda, 2.3);
keyLight.position.set(-3.7, 7, 5.5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
Object.assign(keyLight.shadow.camera, {left: -4.5, right: 4.5, top: 5, bottom: -4, near: .5, far: 16});
keyLight.shadow.bias = -.00025;
keyLight.shadow.normalBias = .012;
keyLight.shadow.radius = 3;
scene.add(keyLight);
const fillLight = new T.DirectionalLight(0xdbe9f4, 1.3);
fillLight.position.set(4, 4.5, -3);
scene.add(fillLight);
const floor = new T.Mesh(new T.PlaneGeometry(150, 150), new T.MeshStandardMaterial({color: 0xe8e6dc, roughness: 1, metalness: 0}));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -.024;
floor.receiveShadow = true;
scene.add(floor);
const grid = new T.GridHelper(12, 24, 0xd4d6c6, 0xdedfd1);
grid.position.y = -.022;
grid.material.opacity = .38;
grid.material.transparent = true;
guideRoot.add(grid);
const pedestalMaterial = new T.MeshStandardMaterial({color: 0xf2f0e6, roughness: .97});
const pedestals = {};
for (const [gender, x] of Object.entries(offsets)) {
  const pedestal = new T.Mesh(new T.CylinderGeometry(.94, .97, .025, 64), pedestalMaterial);
  pedestal.position.set(x, -.013, 0); pedestal.receiveShadow = true; scene.add(pedestal); pedestals[gender] = pedestal;
  const geometry = new T.BufferGeometry().setFromPoints([
    new T.Vector3(x - .97, 0, -.12), new T.Vector3(x - .97, 3, -.12),
    new T.Vector3(x - 1.05, 0, -.12), new T.Vector3(x - .89, 0, -.12),
    new T.Vector3(x - 1.05, 3, -.12), new T.Vector3(x - .89, 3, -.12),
  ]);
  const line = new T.LineSegments(geometry, new T.LineBasicMaterial({color: 0xaeb89b, transparent: true, opacity: .7}));
  line.name = `${gender}_height_guide`; guideRoot.add(line);
}

function resize() {
  const {width, height} = stage.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  updateCamera();
}
function updateCamera() {
  const verticalFov = T.MathUtils.degToRad(camera.fov);
  const neededHeight = 4.2;
  const neededWidth = previewState.gender === 'both' ? 5.2 : 2.7;
  const fit = Math.max(neededHeight / (2 * Math.tan(verticalFov / 2)), neededWidth / (2 * Math.tan(verticalFov / 2) * camera.aspect));
  const nearDepth = previewState.gender === 'both' ? 1.28 * Math.abs(Math.sin(azimuth)) : 0;
  const distance = (fit + nearDepth) * zoom;
  camera.position.set(
    Math.sin(azimuth) * Math.cos(elevation) * distance,
    target.y + Math.sin(elevation) * distance,
    Math.cos(azimuth) * Math.cos(elevation) * distance,
  );
  camera.lookAt(target);
  camera.updateMatrixWorld();
}
function setView(value) {
  if (!(value in viewAngles)) return false;
  previewState.view = value; azimuth = 0; elevation = .07;
  // Standard views turn each figure in place so neither gender hides behind the other.
  const rotation = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -viewAngles[value]);
  for (const record of Object.values(previewState.models)) record.root.quaternion.copy(rotation).multiply(record.baseQuaternion);
  document.querySelector('#view-label').textContent = value.toUpperCase();
  for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === value));
  updateCamera(); return true;
}
function markOrbit() {
  previewState.view = 'orbit'; document.querySelector('#view-label').textContent = 'ORBIT';
  for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', 'false');
}
function setGender(value) {
  if (!['both', 'male', 'female'].includes(value)) return false;
  previewState.gender = value; document.querySelector('#gender-select').value = value;
  document.querySelector('.floor-caption').dataset.gender = value;
  for (const [gender, record] of Object.entries(previewState.models)) {
    record.root.visible = value === 'both' || value === gender;
    record.root.position.x = value === 'both' ? offsets[gender] : 0;
    record.root.updateMatrixWorld(true);
    if (record.skeletonHelper) record.skeletonHelper.visible = record.root.visible && previewState.showRig;
    pedestals[gender].visible = record.root.visible;
    pedestals[gender].position.x = record.root.position.x;
  }
  // Width guides are meaningful only in the aligned side-by-side comparison.
  for (const child of guideRoot.children) if (child.isLineSegments) child.visible = value === 'both';
  updateCamera(); return true;
}
function setAnimation(name) {
  if (!desiredClips.includes(name)) return false;
  previewState.activeAnimation = name;
  document.querySelector('#animation-select').value = name;
  for (const record of Object.values(previewState.models)) {
    const next = record.actions.get(name);
    if (!next) continue;
    const previous = record.currentAction;
    next.reset();
    next.setEffectiveTimeScale(1); next.setEffectiveWeight(1);
    const oneShot = ['Attack', 'Hit', 'Death'].includes(name);
    next.setLoop(oneShot ? T.LoopOnce : T.LoopRepeat, oneShot ? 1 : Infinity);
    next.clampWhenFinished = oneShot;
    next.play();
    if (previous && previous !== next) { previous.fadeOut(.18); next.fadeIn(.18); }
    record.currentAction = next;
  }
  return true;
}
function setPaused(paused) {
  previewState.paused = Boolean(paused);
  const button = document.querySelector('#play-pause');
  button.textContent = paused ? '▶' : 'Ⅱ';
  button.setAttribute('aria-pressed', String(paused));
  button.setAttribute('aria-label', paused ? 'เล่นแอนิเมชันต่อ' : 'หยุดแอนิเมชันชั่วคราว');
}

function isHair(object) {
  let current = object;
  while (current) {
    if (/hair|brow|lash|ponytail/i.test(`${current.name} ${current.userData.part || ''} ${current.userData.role || ''}`)) return true;
    current = current.parent;
  }
  return false;
}
function measureModel(record) {
  // Inspect the actual rest-pose geometry, restoring every bone afterwards.
  const bones = [], skeletons = new Set();
  record.root.traverse(object => {
    if (object.isBone) bones.push({object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone()});
    if (object.isSkinnedMesh) skeletons.add(object.skeleton);
  });
  const bodyBounds = new T.Box3(), skullBounds = new T.Box3(), allBounds = new T.Box3();
  try {
    for (const skeleton of skeletons) skeleton.pose();
    record.root.updateMatrixWorld(true);
    for (const skeleton of skeletons) skeleton.update();
    const point = new T.Vector3();
    record.root.traverse(object => {
      if (!object.isMesh || !object.geometry?.attributes.position || object.userData.previewEquipment) return;
      let parent = object.parent;
      while (parent && parent !== record.root) { if (parent.userData.previewEquipment) return; parent = parent.parent; }
      const hair = isHair(object);
      const skull = object.userData.role === 'skull' || object.userData.part === 'Head' || /^(head|head_skin|skull|cranial)(?:\.\d+)?$/i.test(object.name);
      for (let i = 0; i < object.geometry.attributes.position.count; i++) {
        object.getVertexPosition(i, point); point.applyMatrix4(object.matrixWorld);
        allBounds.expandByPoint(point);
        if (!hair) bodyBounds.expandByPoint(point);
        if (skull && !hair) skullBounds.expandByPoint(point);
      }
    });
  } finally {
    for (const saved of bones) { saved.object.position.copy(saved.position); saved.object.quaternion.copy(saved.quaternion); saved.object.scale.copy(saved.scale); }
    record.root.updateMatrixWorld(true);
    for (const skeleton of skeletons) skeleton.update();
  }
  if (bodyBounds.isEmpty()) throw new Error('Cannot measure a model without body geometry');
  const skullTop = skullBounds.isEmpty() ? bodyBounds.max.y : skullBounds.max.y;
  return {
    height: skullTop - bodyBounds.min.y, skullTop, feetBottom: bodyBounds.min.y,
    headHeight: skullBounds.isEmpty() ? null : skullBounds.max.y - skullBounds.min.y,
    totalHeight: allBounds.max.y - bodyBounds.min.y,
    bodyBounds: {min: bodyBounds.min.toArray(), max: bodyBounds.max.toArray()},
  };
}
function updateMeasurements() {
  const male = previewState.models.male?.measurement;
  const female = previewState.models.female?.measurement;
  if (male) document.querySelector('#male-height').textContent = male.height.toFixed(3);
  if (female) document.querySelector('#female-height').textContent = female.height.toFixed(3);
  if (male && female) {
    const difference = Math.abs(male.height - female.height);
    const note = document.querySelector('#height-difference');
    note.textContent = difference < .005 ? `สูงเท่ากัน · คลาดเคลื่อน ${difference.toFixed(4)} หน่วย` : `ความสูงต่างกัน ${difference.toFixed(4)} หน่วย`;
    note.classList.toggle('warn', difference >= .005);
  }
}

// Inventory definitions are factories, never the instances attached to a body.
const equipmentDefinitions = {
  MainWeapon: {
    bone: 'MainWeapon_RightHand',
    make() {
      const group = new T.Group();
      const material = new T.MeshStandardMaterial({color: 0x9ac4cd, roughness: .28, metalness: .7});
      const blade = new T.Mesh(new T.LatheGeometry([new T.Vector2(0, .18), new T.Vector2(.045, .2), new T.Vector2(.045, .7), new T.Vector2(0, .86)], 10), material);
      group.add(blade);
      const handle = new T.Mesh(new T.CylinderGeometry(.037, .037, .2, 12), new T.MeshStandardMaterial({color: 0x785c42, roughness: .8}));
      handle.position.y = .05; group.add(handle);
      const guard = new T.Mesh(new T.CapsuleGeometry(.025, .19, 4, 8), new T.MeshStandardMaterial({color: 0xc5a56a, metalness: .65, roughness: .35}));
      guard.rotation.z = Math.PI / 2; guard.position.y = .17; group.add(guard);
      return group;
    },
  },
  Offhand: {
    bone: 'Offhand_LeftHand',
    make() {
      const group = new T.Group();
      const shield = new T.Mesh(new T.SphereGeometry(.22, 20, 12), new T.MeshStandardMaterial({color: 0x567a91, metalness: .35, roughness: .45}));
      shield.scale.set(1, .25, 1.16); shield.position.y = .08; group.add(shield);
      const rim = new T.Mesh(new T.TorusGeometry(.205, .017, 6, 28), new T.MeshStandardMaterial({color: 0xd6b477, metalness: .6, roughness: .4}));
      rim.rotation.x = Math.PI / 2; rim.position.y = .12; rim.scale.y = 1.16; group.add(rim);
      return group;
    },
  },
  Armor: {
    bone: 'Chest',
    make() {
      const group = new T.Group();
      const plate = new T.Mesh(new T.SphereGeometry(1, 20, 12), new T.MeshStandardMaterial({color: 0xa9b6bc, roughness: .4, metalness: .5}));
      plate.scale.set(.35, .24, .14); plate.position.set(0, -.02, -.16); group.add(plate);
      const crest = new T.Mesh(new T.SphereGeometry(.055, 12, 8), new T.MeshStandardMaterial({color: 0xc5a56a, roughness: .35, metalness: .6}));
      crest.position.set(0, 0, -.29); group.add(crest);
      return group;
    },
  },
};
function disposeEquipment(group) {
  if (!group) return;
  group.removeFromParent();
  const geometries = new Set(), materials = new Set();
  group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
function setEquipment(slot, enabled) {
  const definition = equipmentDefinitions[slot];
  if (!definition || !previewState.ready) return false;
  for (const record of Object.values(previewState.models)) {
    if (enabled && !record.attachments.get(definition.bone)) {
      showError(new Error(`Missing attachment ${definition.bone}`)); return false;
    }
  }
  previewState.equipment[slot] = Boolean(enabled);
  for (const record of Object.values(previewState.models)) {
    disposeEquipment(record.equipment.get(slot)); record.equipment.delete(slot);
    if (enabled) {
      const instance = definition.make(); instance.name = `PreviewEquipped_${slot}`; instance.userData.previewEquipment = true;
      instance.traverse(object => { if (object.isMesh) { object.castShadow = true; for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.wireframe = previewState.wireframe; } });
      record.attachments.get(definition.bone).add(instance); record.equipment.set(slot, instance);
    }
  }
  document.querySelector(`#equip-${slot.toLowerCase()}`).setAttribute('aria-pressed', String(enabled));
  return true;
}
function setWireframe(enabled) {
  previewState.wireframe = Boolean(enabled);
  for (const record of Object.values(previewState.models)) record.root.traverse(object => {
    if (object.isMesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) { material.wireframe = enabled; material.needsUpdate = true; }
  });
}
function showError(error) {
  previewState.error = error.message || String(error); previewState.ready = false;
  const overlay = document.querySelector('#load-overlay'); overlay.hidden = false; overlay.classList.add('error');
  document.querySelector('#load-status').textContent = 'ยังเปิดต้นแบบสามมิติไม่ได้';
  document.querySelector('#load-detail').textContent = `โหลดไม่สำเร็จ: ${previewState.error}`;
  document.querySelector('#retry-load').hidden = false;
  console.error('Character preview failed:', error);
}

async function loadModels() {
  const loader = new GLTFLoader();
  for (const [gender, file] of [['male', 'Male_Base_V1.glb'], ['female', 'Female_Base_V1.glb']]) {
    document.querySelector('#load-detail').textContent = `กำลังโหลด ${file}`;
    const gltf = await loader.loadAsync(`./characters/generated/${file}`);
    const root = gltf.scene;
    const attachments = new Map();
    root.traverse(object => {
      if (object.isBone || ['MainWeapon_RightHand', 'Offhand_LeftHand', 'Chest'].includes(object.name)) attachments.set(object.name, object);
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    const clips = gltf.animations;
    const mixer = new T.AnimationMixer(root), actions = new Map();
    for (const clip of clips) {
      const requested = desiredClips.find(name => clip.name.toLowerCase() === name.toLowerCase() || clip.name.toLowerCase().endsWith(`|${name.toLowerCase()}`));
      if (requested) actions.set(requested, mixer.clipAction(clip));
    }
    const missing = desiredClips.filter(name => !actions.has(name));
    if (missing.length) throw new Error(`${file} missing animation clips: ${missing.join(', ')}`);
    for (const name of ['Root', 'Pelvis', 'Spine', 'Chest', 'Neck', 'Head', 'MainWeapon_RightHand', 'Offhand_LeftHand']) {
      if (!attachments.has(name)) throw new Error(`${file} missing bone: ${name}`);
    }
    const record = {root, mixer, clips, actions, attachments, baseQuaternion: root.quaternion.clone(), equipment: new Map(), currentAction: null, skeletonHelper: null, measurement: null};
    record.measurement = measureModel(record);
    root.position.x = offsets[gender];
    scene.add(root);
    record.skeletonHelper = new T.SkeletonHelper(root); record.skeletonHelper.material.depthTest = false; record.skeletonHelper.visible = false;
    scene.add(record.skeletonHelper);
    previewState.models[gender] = record; previewState.mixers.push(mixer);
  }
  previewState.ready = true;
  setGender('both'); updateMeasurements(); setAnimation('Idle');
  document.querySelector('#load-status').textContent = 'โหลดโมเดลชายและหญิงแล้ว';
  document.querySelector('#load-overlay').hidden = true;
}

for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => setView(button.dataset.view);
document.querySelector('#view-reset').onclick = () => { zoom = 1; setView('front'); };
document.querySelector('#gender-select').onchange = e => setGender(e.target.value);
document.querySelector('#animation-select').onchange = e => setAnimation(e.target.value);
document.querySelector('#play-pause').onclick = () => setPaused(!previewState.paused);
document.querySelector('#animation-speed').oninput = e => { previewState.speed = Number(e.target.value); document.querySelector('#speed-value').value = `${previewState.speed}×`; };
document.querySelector('#show-guides').onchange = e => { guideRoot.visible = e.target.checked; };
document.querySelector('#show-wireframe').onchange = e => setWireframe(e.target.checked);
document.querySelector('#show-rig').onchange = e => {
  previewState.showRig = e.target.checked;
  for (const record of Object.values(previewState.models)) record.skeletonHelper.visible = e.target.checked && record.root.visible;
};
for (const slot of Object.keys(equipmentDefinitions)) document.querySelector(`#equip-${slot.toLowerCase()}`).onclick = () => setEquipment(slot, !previewState.equipment[slot]);
document.querySelector('#equip-clear').onclick = () => { for (const slot of Object.keys(equipmentDefinitions)) setEquipment(slot, false); };
document.querySelector('#retry-load').onclick = () => location.reload();

const pointers = new Map();
let pinchDistance = null;
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (pointers.size > 1) { const [a, b] = [...pointers.values()]; pinchDistance = Math.hypot(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener('pointermove', e => {
  const previous = pointers.get(e.pointerId); if (!previous) return;
  pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (pointers.size > 1) {
    const [a, b] = [...pointers.values()], next = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDistance && next > 1) zoom = T.MathUtils.clamp(zoom * pinchDistance / next, .48, 2);
    pinchDistance = next;
  } else {
    azimuth -= (e.clientX - previous.x) * .008;
    elevation = T.MathUtils.clamp(elevation + (e.clientY - previous.y) * .006, -.18, .8);
    markOrbit();
  }
  updateCamera();
});
function releasePointer(e) { pointers.delete(e.pointerId); pinchDistance = null; if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); }
canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('lostpointercapture', e => { pointers.delete(e.pointerId); pinchDistance = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = T.MathUtils.clamp(zoom + Math.sign(e.deltaY) * .08, .48, 2); updateCamera(); }, {passive: false});
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('blur', () => { pointers.clear(); pinchDistance = null; });
canvas.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); setPaused(!previewState.paused); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); azimuth -= .1; markOrbit(); updateCamera(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); azimuth += .1; markOrbit(); updateCamera(); }
});
new ResizeObserver(resize).observe(stage);
resize();
const clock = new T.Clock();
let lastStats = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .05);
  if (!document.hidden && previewState.ready && !previewState.paused) {
    // Advance both rigs together, including hidden figures, so comparison stays phase-aligned.
    for (const record of Object.values(previewState.models)) record.mixer.update(dt * previewState.speed);
  }
  renderer.render(scene, camera);
  if (performance.now() - lastStats > 1500 && previewState.ready) {
    lastStats = performance.now();
    document.querySelector('#render-detail').textContent = `REAL 3D · ${renderer.info.render.triangles.toLocaleString()} TRIANGLES`;
  }
}
frame();
try { await loadModels(); } catch (error) { showError(error); }
