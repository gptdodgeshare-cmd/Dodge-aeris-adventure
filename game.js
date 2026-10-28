import * as T from './vendor/three.module.min.js';
const scene=new T.Scene();scene.background=new T.Color('#b9e5fc');const camera=new T.PerspectiveCamera(55,innerWidth/innerHeight,.1,100);const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
scene.add(new T.HemisphereLight(0xffffff,0x69866a,3));const light=new T.DirectionalLight(0xffffff,2);light.position.set(4,8,5);scene.add(light);
function mesh(geometry,color,parent,x=0,y=0,z=0){let m=new T.Mesh(geometry,new T.MeshStandardMaterial({color}));m.position.set(x,y,z);parent.add(m);return m}
mesh(new T.BoxGeometry(70,.1,70),0x80bc78,scene,0,-.1,0);mesh(new T.BoxGeometry(5,.02,60),0xd8c9a0,scene,0,0,0);mesh(new T.BoxGeometry(60,.02,5),0xd8c9a0,scene,0,0,0);
const player=new T.Group();scene.add(player);mesh(new T.BoxGeometry(.9,1,.55),0x397dc7,player,0,1.25,0);mesh(new T.SphereGeometry(.65,16,12),0xffd0a8,player,0,2.28,0);mesh(new T.SphereGeometry(.65,16,12,0,Math.PI*2,0,Math.PI*.35),0x4c3228,player,0,2.32,0);
const arms=[],legs=[];for(let x of [-.6,.6]){let p=new T.Group();p.position.set(x,1.65,0);player.add(p);mesh(new T.BoxGeometry(.27,.75,.3),0x397dc7,p,0,-.37,0);arms.push(p)}for(let x of [-.23,.23]){let p=new T.Group();p.position.set(x,.72,0);player.add(p);mesh(new T.BoxGeometry(.3,.72,.4),0x364d79,p,0,-.35,0);legs.push(p)}
const mode=document.querySelector('#mode');mode.value=localStorage.getItem('dodge-camera')||'free';mode.onchange=()=>localStorage.setItem('dodge-camera',mode.value);let yaw=.7,pitch=.8,dist=9;document.querySelector('#reset').onclick=()=>{yaw=.7;pitch=.8;dist=9};const keys=new Set();addEventListener('keydown',e=>keys.add(e.key.toLowerCase()));addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>keys.clear());
// Resolve taps in world space only after a gesture ends. Dragging never sets a destination.
const destination = new T.Vector3();
let walkingToPoint = false;
const raycaster = new T.Raycaster();
const groundPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
const marker = new T.Mesh(new T.RingGeometry(.22, .32, 32), new T.MeshBasicMaterial({color: 0xffffff, side: T.DoubleSide}));
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);
const c = renderer.domElement;
const pointers = new Set();
let gesture = null;
const dragThreshold = 10;
c.onpointerdown = e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  pointers.add(e.pointerId);
  if (pointers.size > 1) { if (gesture) gesture.cancelled = true; return; }
  gesture = {id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, dragged: false, cancelled: false};
  c.setPointerCapture(e.pointerId);
};
c.onpointermove = e => {
  if (!gesture || gesture.id !== e.pointerId || gesture.cancelled) return;
  if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > dragThreshold) gesture.dragged = true;
  if (gesture.dragged && mode.value !== 'fixed') {
    yaw -= (e.clientX - gesture.lastX) * .006;
    pitch = T.MathUtils.clamp(pitch + (e.clientY - gesture.lastY) * .004, .25, 1.3);
  }
  gesture.lastX = e.clientX; gesture.lastY = e.clientY;
};
function endPointer(e, cancelled = false) {
  pointers.delete(e.pointerId);
  if (!gesture || gesture.id !== e.pointerId) return;
  const tap = !cancelled && !gesture.cancelled && !gesture.dragged && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) <= dragThreshold;
  gesture = null;
  if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
  if (!tap) return;
  const rect = c.getBoundingClientRect();
  raycaster.setFromCamera(new T.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), camera);
  const point = raycaster.ray.intersectPlane(groundPlane, new T.Vector3());
  if (!point || Math.abs(point.x) > 35 || Math.abs(point.z) > 35) return;
  destination.copy(point);
  walkingToPoint = true;
  marker.position.set(point.x, .04, point.z); marker.visible = true;
}
c.onpointerup = e => endPointer(e);
c.onpointercancel = e => endPointer(e, true);
c.onlostpointercapture = e => { if (gesture?.id === e.pointerId) { pointers.delete(e.pointerId); gesture = null; } };
addEventListener('blur', () => { gesture = null; pointers.clear(); });
c.onwheel = e => { e.preventDefault(); dist = T.MathUtils.clamp(dist + Math.sign(e.deltaY), 4, 18); };
c.oncontextmenu = e => e.preventDefault();
const clock=new T.Clock();let step=0;function frame(){requestAnimationFrame(frame);let dt=Math.min(clock.getDelta(),.05),x=Number(keys.has('d'))-Number(keys.has('a')),z=Number(keys.has('s'))-Number(keys.has('w'));
let dx=0,dz=0,moving=false;
if(x||z){walkingToPoint=false;marker.visible=false;const len=Math.hypot(x,z);x/=len;z/=len;dx=x*Math.cos(yaw)+z*Math.sin(yaw);dz=-x*Math.sin(yaw)+z*Math.cos(yaw);moving=true}
else if(walkingToPoint){const offset=destination.clone().sub(player.position);const remaining=Math.hypot(offset.x,offset.z);if(remaining<=4*dt){player.position.copy(destination);walkingToPoint=false;marker.visible=false}else{dx=offset.x/remaining;dz=offset.z/remaining;moving=true}}
if(moving){player.position.x=T.MathUtils.clamp(player.position.x+dx*dt*4,-35,35);player.position.z=T.MathUtils.clamp(player.position.z+dz*dt*4,-35,35);const angle=Math.atan2(-dx,-dz);player.rotation.y+=Math.atan2(Math.sin(angle-player.rotation.y),Math.cos(angle-player.rotation.y))*Math.min(1,dt*12);step+=dt*11}
let swing=moving?Math.sin(step)*.5:0;legs[0].rotation.x=swing;legs[1].rotation.x=-swing;arms[0].rotation.x=-swing;arms[1].rotation.x=swing;if(mode.value==='fixed')yaw=.7;if(mode.value==='follow'&&moving&&!gesture?.dragged){let diff=Math.atan2(Math.sin(player.rotation.y-yaw),Math.cos(player.rotation.y-yaw));yaw+=diff*Math.min(1,dt*3)}let target=player.position.clone().add(new T.Vector3(0,1.2,0));camera.position.lerp(target.clone().add(new T.Vector3(Math.sin(yaw)*Math.cos(pitch)*dist,Math.sin(pitch)*dist,Math.cos(yaw)*Math.cos(pitch)*dist)),Math.min(1,dt*10));camera.lookAt(target);renderer.render(scene,camera)}frame();onresize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)};
