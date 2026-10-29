import {createWorld} from './world-kit.js';

// An original playable arrival quarter for the round-trip warp; not copied game assets.
export function createMap() {
  const w=createWorld({sky:0xc2e9f2,ground:0x89b783});
  const {scene,box,cylinder,sphere,cone,torus,label,lamp}=w;
  const colliders=[];
  const block=(id,x,z,width,depth)=>colliders.push({id,minX:x-width/2,maxX:x+width/2,minZ:z-depth/2,maxZ:z+depth/2});
  box(scene,0,-.01,0,8,.04,47,0xe1d3aa);box(scene,0,-.005,4,42,.04,7,0xe1d3aa);
  cylinder(scene,0,.015,4,7,.05,0xf1e4bf);
  for(let z=-20;z<22;z+=5)for(let x of [-3,3])box(scene,x,.025,z,.5,.02,.5,0xbfb68c);
  function cottage(id,x,z,roofColor) {
    block(id,x,z,8,9);
    box(scene,x,.22,z,8.6,.45,9.6,0x839b8e,{shadow:true});box(scene,x,2.6,z,8,4.8,9,0xf5dfb5,{shadow:true});
    const roof=cone(scene,x,6.5,z,6.6,3.4,roofColor,{shadow:true});roof.rotation.y=Math.PI/4;roof.scale.z*=.8;
    for(let dx of [-3.5,3.5])box(scene,x+dx,2.6,z,.35,4.8,9.1,0x9c7d5b,{shadow:true});
    for(let dx of [-2,2]){box(scene,x+dx,2.7,z+4.54,1.1,1.5,.14,0x8dc8d2);box(scene,x+dx,2.7,z+4.67,1.3,.12,.12,0xf9edc9);}
    box(scene,x,1.6,z+4.56,1.6,2.7,.14,0x85674f);
    cylinder(scene,x+2.7,7.2,z-1,.45,3,0xc6b396,{shadow:true});
  }
  cottage('elim-west-house',-13,-9,0xb97068);cottage('elim-east-house',13,-9,0x6a9f96);
  cottage('elim-inn',-13,14,0xa2819c);
  label('ELIM · ARRIVAL QUARTER',0,7.8,1,{width:11});
  label('Hearth Inn',-13,5.4,19,{width:6});
  // Distant leafy silhouettes, low fences and planted beds frame the walkable square.
  for(let i=0;i<10;i++){
    const x=i<5?-22:22,z=-20+(i%5)*10;
    cylinder(scene,x,1.6,z,.28,3.2,0x98744f);sphere(scene,x,4,z,1.6,0x6ba579,{shadow:true});sphere(scene,x+.6,4.9,z,1.1,0x91bf7d,{shadow:true});
    block('tree-'+i,x,z,1.4,1.4);
  }
  for(const [x,z] of [[-5,8],[5,8],[-5,-14],[5,-14],[-19,20],[19,20]])lamp(x,z);
  block('elim-garden',13,14,9,7);
  cylinder(scene,13,.38,14,4.6,.6,0xb7bea0);
  cylinder(scene,13,.75,14,3.9,.2,0x8ab68f);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;sphere(scene,13+Math.cos(a)*2.8,1,14+Math.sin(a)*2.8,.34,i%2?0xe7bb7f:0xc8a1c7);}
  for(const z of [-23.2,23.2]){
    box(scene,0,.7,z,46,.9,.45,0x9d9778);block('elim-fence-'+z,0,z,46,.45);
    for(let x=-22;x<=22;x+=4)box(scene,x,.8,z,.24,1.6,.5,0x8b8568);
  }
  const portal=w.portal(0,-8,'TO NEO GEAR CITY');
  block('elim-portal-left',-2.5,-8,.8,1.2);block('elim-portal-right',2.5,-8,.8,1.2);
  const npcs=[
    w.npc({id:'elim-guide',name:'Faye · Elim Guide',role:'guide',x:5,z:3,color:0xa3b97d}),
    w.npc({id:'elim-keeper',name:'Iris · Warp Keeper',role:'warp',x:-5,z:-8,color:0x9482b1})
  ];
  for(const n of npcs)block('npc-'+n.id,n.x,n.z,1.1,1.1);
  w.batch();
  const occluders=[];scene.traverse(o=>{if(o.isMesh&&o.userData.cameraBlocker)occluders.push(o);});
  return {
    id:'elim',name:'Elim',scene,occluders,bounds:{minX:-24,maxX:24,minZ:-24,maxZ:24},spawn:{x:0,z:4},colliders,npcs,
    portals:[{id:'to-neo-gear',x:0,z:-8,radius:1.5,target:'neo-gear',arrival:{x:37,z:14},label:'Neo Gear City'}],
    landmarks:[{name:'Arrival Square',x:0,z:4,color:'#e9d29d'},{name:'Warp · Neo Gear',x:0,z:-8,color:'#baa2e1'},{name:'Hearth Inn',x:-13,z:14,color:'#c997ba'},{name:'Garden',x:13,z:14,color:'#9abd8c'}],
    update(dt,elapsed){portal.inner.rotation.z=elapsed*.3;portal.disc.material.opacity=.22+Math.sin(elapsed*1.5)*.05;},
    dispose(){npcs.length=0;w.dispose();}
  };
}
