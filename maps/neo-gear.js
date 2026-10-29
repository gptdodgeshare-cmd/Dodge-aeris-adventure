import * as T from '../vendor/three.module.min.js';
import {createWorld} from './world-kit.js';

export function createMap() {
  const w=createWorld({sky:0xc3e8ed,ground:0x98b5b0});
  const {scene,box,cylinder,sphere,cone,torus,group,label,lamp,gear}=w;
  const colliders=[],animations=[];
  const block=(id,x,z,width,depth)=>colliders.push({id,minX:x-width/2,maxX:x+width/2,minZ:z-depth/2,maxZ:z+depth/2});
  const brass=0xc5a365,stone=0xf0e1bd,steel=0x526d7c,teal=0x51bfb5,roof=0xb56c66;
  // Broad avenues and inlaid energy channels keep the central spawn open.
  box(scene,0,-.012,-10,13,.04,78,0xdad8bd);box(scene,0,-.008,0,84,.045,11,0xdad8bd);
  box(scene,0,-.005,-12,78,.045,7,0xc7cec0);box(scene,0,-.005,15,76,.045,7,0xc7cec0);
  cylinder(scene,0,-.005,-4,12,.04,0xe6dfc2);
  for(let x of [-5.8,5.8])box(scene,x,.018,-7,.12,.035,68,0x78cabc,{emissive:0x123e39});
  // Geometric pavement tile inlays are batched into shared primitive instances.
  for(let z=-43;z<29;z+=5)for(let x of [-4,4])box(scene,x,.025,z,.7,.025,.7,0xb2b9a6);
  for(const [x,z] of [[-10,5],[10,5],[-11,-13],[11,-13],[-36,1],[35,-3],[-11,25],[11,25],[-38,-34],[38,-34]])lamp(x,z);
  // Energy fountain: its basin is a real obstacle; spawn remains south of it.
  block('energy-fountain',0,-9,6,6);
  cylinder(scene,0,.22,-9,3,.45,steel,{shadow:true});cylinder(scene,0,.51,-9,2.65,.15,brass);
  cylinder(scene,0,.65,-9,2.35,.16,0x5acbcd,{emissive:0x14585a});
  cylinder(scene,0,1.45,-9,.5,1.5,stone,{shadow:true});torus(scene,0,2.08,-9,1.1,brass).rotation.x=Math.PI/2;
  const crystal=group(scene,0,3,-9,true);const shard=cone(crystal,0,0,0,.6,1.8,0x9bfff0,{emissive:0x207d70});shard.rotation.z=Math.PI;
  animations.push((dt,time)=>{crystal.rotation.y=time*.65;crystal.position.y=3+Math.sin(time*1.4)*.16;});
  // Central turbine tower, with copper buttresses, an exposed reactor and gears.
  block('energy-tower',0,-29.5,11,12);
  box(scene,0,.5,-29.5,12,1,13,steel,{shadow:true});box(scene,0,5,-29.5,9,9,10,stone,{shadow:true});
  box(scene,0,2.5,-24.42,3,4,.15,0x3c6570);box(scene,0,3,-24.3,1.8,2.6,.16,0x65d0d2,{emissive:0x184f59});
  for(let x of [-4.5,4.5])for(let z of [-34,-25]){cylinder(scene,x,5,z,.6,10,brass,{shadow:true});sphere(scene,x,10.2,z,.74,teal);}
  cylinder(scene,0,10.3,-29.5,4.5,1.2,brass,{shadow:true});cylinder(scene,0,14,-29.5,2.1,7,steel,{shadow:true});
  cylinder(scene,0,14,-29.5,1.55,7.2,0x83f2e0,{emissive:0x246f67});
  for(let y of [11,13.5,16,18])torus(scene,0,y,-29.5,2.6,brass).rotation.x=Math.PI/2;
  cone(scene,0,19.5,-29.5,3.6,3,teal,{shadow:true}).rotation.y=Math.PI/4;
  sphere(scene,0,21.6,-29.5,.6,0xaffff5,{emissive:0x347d78});
  const towerGear=gear(scene,0,8.8,-23.9,1.8);animations.push((dt,t)=>towerGear.rotation.z=t*.32);
  label('AETHER SPIRE',0,10.5,-23,{width:7.5});
  // Building helper: original window bays, plinths, copper trims and roof ridges.
  function building(id,x,z,width,depth,height,{body=stone,roofColor=roof,sign,signWidth=8}={}) {
    block(id,x,z,width,depth);
    box(scene,x,.35,z,width+.7,.7,depth+.7,steel,{shadow:true});box(scene,x,height/2+.5,z,width,height,depth,body,{shadow:true});
    box(scene,x,height+1,z,width+1,1,depth+1,roofColor,{shadow:true});box(scene,x,height+1.65,z,width+.5,.25,depth+.5,brass);
    for(let side of [-1,1])box(scene,x+side*(width/2-.45),height/2+.5,z,.6,height,depth+.15,brass,{shadow:true});
    for(let offset=-width/2+2;offset<width/2-1;offset+=3){box(scene,x+offset,3,z+depth/2+.08,1.4,2,.16,0x77c9cc,{emissive:0x103d48});box(scene,x+offset,3,z+depth/2+.18,1.6,.12,.12,brass);}
    if(sign)label(sign,x,height+.7,z+depth/2+.45,{width:signWidth});
  }
  building('factory',-25.5,-22,21,14,8,{body:0xcfbea0,roofColor:0xa8665d,sign:'CLOCKWORK WORKS',signWidth:11});
  for(let x of [-32,-27]){cylinder(scene,x,12,-24,.95,8,steel,{shadow:true});torus(scene,x,15.7,-24,1.1,brass).rotation.x=Math.PI/2;}
  box(scene,-25.5,2.6,-14.85,4.5,5,.2,0x405962);
  const factoryGear=gear(scene,-19,6,-14.75,1.4);animations.push((dt,t)=>factoryGear.rotation.z=-t*.5);
  // Exterior conveyor and a little work robot animate entirely on the active map.
  block('factory-conveyor',-34,-9,7,3);box(scene,-34,.8,-9,7,1.2,3,steel,{shadow:true});box(scene,-34,1.46,-9,6.7,.12,2.7,0x968776);
  for(let x=-36;x<=-31;x+=1)box(scene,x,1.58,-9,.13,.1,2.5,brass);
  const worker=group(scene,-30,0,-9,true);box(worker,0,1,0,.9,1.1,.7,0x9baab1,{shadow:true});sphere(worker,0,1.9,0,.6,brass);box(worker,0,1.95,.55,.7,.2,.12,0x6efce0,{emissive:0x216b60});
  const workerArm=group(worker,.65,1.4,0,true);box(workerArm,0,-.3,0,.25,.8,.3,brass);box(worker,-.3,.22,0,.28,.45,.5,steel);box(worker,.3,.22,0,.28,.45,.5,steel);
  animations.push((dt,t)=>{workerArm.rotation.x=Math.sin(t*2)*.7;worker.rotation.y=Math.sin(t*.6)*.3;});
  building('research',24.5,-22,19,14,8,{body:0xd9eadf,roofColor:0x5caeaf,sign:'CYBERNETIC INSTITUTE',signWidth:11});
  const dome=sphere(scene,24.5,9.5,-22,4.5,0x85dbd7,{opacity:.75});dome.scale.y*=.65;
  for(let x of [19,30]){cylinder(scene,x,11,-25,.65,6,steel,{shadow:true});sphere(scene,x,14,-25,.8,0xc0fff0,{emissive:0x3b8c80});}
  box(scene,24.5,2.4,-14.8,3.7,4.5,.3,0x486b78);box(scene,24.5,2.4,-14.6,2.4,3.2,.12,0x92eee3,{emissive:0x225f63});
  // A walk-in, open-front laboratory bay: visible experiments and a clear central aisle.
  box(scene,29,.045,-8,9,.09,8,0xdce9dc);
  box(scene,29,1.2,-12,9,2.4,.3,0xb7d1ca,{shadow:true,blocker:true});block('lab-bay-back',29,-12,9,.3);
  for(const x of [24.5,33.5]){box(scene,x,1.2,-8,.3,2.4,8,0xb7d1ca,{shadow:true,blocker:true});block('lab-bay-side-'+x,x,-8,.3,8);}
  for(const x of [26,32]){
    box(scene,x,1,-8,1.5,1.8,4,steel,{shadow:true});box(scene,x,1.95,-8,1.8,.16,4.3,brass);
    block('lab-bench-'+x,x,-8,1.8,4.3);
    for(const z of [-9.2,-6.9]){cylinder(scene,x,2.5,z,.38,1,0x8eddd5,{opacity:.7,emissive:0x246a64});cylinder(scene,x,2.02,z,.5,.12,steel);sphere(scene,x,2.56,z,.2,0xb1ffdb,{emissive:0x256e53});}
  }
  label('OPEN LAB · AETHER EXPERIMENTS',29,3.5,-11.8,{width:8});
  // Three clearly distinguished stores around the southern avenue.
  function shop(id,x,z,title,color) {
    building(id,x,z,10,8,4.5,{roofColor:color,sign:title,signWidth:7});
    for(let i=0;i<5;i++)box(scene,x-4+i*2,3.7,z+5,2,.25,3,i%2?0xf8e5b0:color);
    for(let dx of [-4.6,4.6])cylinder(scene,x+dx,1.8,z+5.9,.09,3.5,brass);
    box(scene,x,1,z+4.6,7,.9,1,0xa77957,{shadow:true});
    block(id+'-counter',x,z+4.6,7,1);
    for(let dx of [-4.6,4.6])block(id+'-awning-'+dx,x+dx,z+5.9,.35,.35);
    if(id==='weapon-shop')for(let dx of [-1,1]){box(scene,x+dx,2,z+5,.12,1.2,.2,0xcbe4df);box(scene,x+dx,1.6,z+5,.6,.12,.2,brass);}
    if(id==='armor-shop')for(let dx of [-1.5,1.5]){box(scene,x+dx,2,z+5,.7,.9,.3,0x9bb5c8);}
    if(id==='item-shop')for(let dx of [-2,0,2]){cylinder(scene,x+dx,1.8,z+5,.24,.6,0xb4efda,{emissive:0x16463f});sphere(scene,x+dx,2.1,z+5,.26,0xe6b0d9);}
    // The counter/awning area is walkable except for the shop footprint; merchants stand beside it.
  }
  shop('weapon-shop',-24,7,'BRASS & BLADE',0xc47c62);
  shop('armor-shop',-24,22,'AEGIS ARMORY',0x718cb3);
  shop('item-shop',23,19,'SPARK SUPPLIES',0x9a85b0);
  const npcs=[
    w.npc({id:'guide',role:'guide',name:'Mira · City Guide',x:-4,z:4,color:0x549da9}),
    w.npc({id:'class-master',role:'class',name:'Dr. Volt · Careers',x:22,z:-10,color:0xe8eee2}),
    w.npc({id:'weapon-merchant',role:'weapons',name:'Rook · Weapons',x:-17,z:9,color:0xbc785c}),
    w.npc({id:'armor-merchant',role:'armor',name:'Aegis · Equipment',x:-17,z:22,color:0x7892b8}),
    w.npc({id:'item-merchant',role:'items',name:'Pip · Items',x:16,z:20,color:0xa486b6}),
    w.npc({id:'warp-keeper',role:'warp',name:'Luma · Warp Keeper',x:32,z:10,color:0x8e7cba})
  ];
  for(const n of npcs)block('npc-'+n.id,n.x,n.z,1.1,1.1);
  // The portal itself remains enterable. Its flanking pylons have collisions.
  const portal=w.portal(37,10,'TO ELIM');
  block('portal-pylon-left',34.5,10,.8,1.2);block('portal-pylon-right',39.5,10,.8,1.2);
  animations.push((dt,t)=>{portal.inner.rotation.z=t*.3;portal.disc.material.opacity=.22+Math.sin(t*1.8)*.05;});
  // Boundary walls include a real southern opening into the mechanical desert.
  function wall(id,x,z,width,depth) {block(id,x,z,width,depth);box(scene,x,1.5,z,width,3,depth,steel,{shadow:true});box(scene,x,3.1,z,width+.15,.25,depth+.15,brass);}
  wall('west-wall',-45, -9,1.2,80);wall('east-wall',45,-9,1.2,80);wall('north-wall',0,-49,91,1.2);
  wall('south-wall-west',-25.5,30,39,1.4);wall('south-wall-east',25.5,30,39,1.4);
  for(let x of [-6,6]){box(scene,x,3.2,30,2,6.4,3,stone,{shadow:true});block('gate-tower-'+x,x,30,2,3);cone(scene,x,7,30,1.8,1.7,teal).rotation.y=Math.PI/4;}
  label('GEARWASTE GATE',0,6.2,30,{width:8});
  box(scene,0,-.008,44,89,.05,27,0xd7be92);box(scene,0,.025,43,7,.05,24,0xbca88b);
  building('ruined-factory',-24,44,16,10,4.2,{body:0xb0a18b,roofColor:0x817a6a,sign:'OLD FOUNDRY',signWidth:9});
  const rubble=box(scene,-17,5.6,42,4,.9,5,0x7e8179);rubble.rotation.z=.23;
  for(let [x,z] of [[-37,39],[-34,52],[34,47],[39,37]]){cylinder(scene,x,.7,z,.5,1.4,brass);box(scene,x,.12,z,2,.24,1,steel);}
  // Harmless clockwork wanderers mark the future monster area; no combat system is invented here.
  const monsters=[];
  for(let i=0;i<3;i++){
    const g=group(scene,16+i*7,0,43+i%2*5,true);sphere(g,0,.8,0,.9,0xa48b68,{shadow:true});box(g,0,.9,.79,.7,.2,.12,0xffc269,{emissive:0x7b3e1c});
    for(let x of [-.5,.5])box(g,x,.2,0,.28,.45,.5,steel);
    cylinder(g,0,1.7,0,.1,.6,brass);sphere(g,0,2.05,0,.18,0x7af3de,{emissive:0x21695f});monsters.push(g);
    animations.push((dt,t)=>{g.position.x=16+i*7+Math.sin(t*.4+i)*1.4;g.rotation.y=Math.sin(t*.4+i)*.7;g.position.y=Math.sin(t*2+i)*.05;});
  }
  label('GEARWASTE · CLOCKWORK WILDS',20,4,49,{width:13});
  // Roof vents and copper service conduits add detail without individual draw calls.
  for(const x of [-40,40])for(let z=-40;z<20;z+=12){cylinder(scene,x,1,z,.35,2,brass);sphere(scene,x,2.1,z,.45,steel);}
  w.batch();
  const occluders=[];scene.traverse(o=>{if(o.isMesh&&o.userData.cameraBlocker)occluders.push(o);});
  return {
    id:'neo-gear',name:'Neo Gear City',scene,occluders,bounds:{minX:-46,maxX:46,minZ:-50,maxZ:55},spawn:{x:0,z:0},colliders,npcs,
    portals:[{id:'to-elim',x:37,z:10,radius:1.5,target:'elim',arrival:{x:0,z:4},label:'Elim'}],
    landmarks:[{name:'Energy Fountain',x:0,z:-9,color:'#5ae1d0'},{name:'Aether Spire',x:0,z:-29,color:'#69d8cb'},{name:'Factory',x:-25,z:-22,color:'#d49d7b'},{name:'Research',x:24,z:-22,color:'#9bdae1'},{name:'Market',x:-24,z:15,color:'#e2c98f'},{name:'Warp · Elim',x:37,z:10,color:'#b9a1f0'},{name:'Gearwaste',x:0,z:44,color:'#d2ad72'}],
    monsters,
    update(dt,elapsed){for(const animate of animations)animate(dt,elapsed);},
    dispose(){animations.length=0;monsters.length=0;npcs.length=0;w.dispose();}
  };
}
