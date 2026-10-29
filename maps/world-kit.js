import * as T from '../vendor/three.module.min.js';

// Original procedural art. All geometry, labels and animation belong to one map.
export function createWorld({sky=0xb9e2ed, fog=sky, ground=0x8caaa3}={}) {
  const scene = new T.Scene();
  scene.background = new T.Color(sky);
  scene.fog = new T.Fog(fog, 42, 125);
  scene.add(new T.HemisphereLight(0xeafaff, 0x766451, 2.6));
  const sun = new T.DirectionalLight(0xfff0cf, 3.2);
  sun.position.set(-24, 42, 20); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {left:-52,right:52,top:56,bottom:-56,near:1,far:110});
  sun.shadow.bias = -.0006; sun.shadow.normalBias=.06;
  scene.add(sun);
  const geometryCache = new Map(), materialCache = new Map();
  function geometry(kind) {
    if (!geometryCache.has(kind)) {
      const make={box:()=>new T.BoxGeometry(1,1,1),cylinder:()=>new T.CylinderGeometry(1,1,1,12),sphere:()=>new T.SphereGeometry(1,12,8),cone:()=>new T.ConeGeometry(1,1,4),torus:()=>new T.TorusGeometry(1,.12,6,24),disc:()=>new T.CircleGeometry(1,24)};
      geometryCache.set(kind,make[kind]());
    }
    return geometryCache.get(kind);
  }
  function material(color,options={}) {
    const key=JSON.stringify([color,options.emissive||0,options.opacity??1,options.metalness??.15,options.side??T.FrontSide]);
    if(!materialCache.has(key)) materialCache.set(key,new T.MeshStandardMaterial({color,roughness:.72,metalness:options.metalness??.15,emissive:options.emissive||0,emissiveIntensity:options.emissive?1.2:0,transparent:options.opacity!==undefined,opacity:options.opacity??1,side:options.side??T.FrontSide}));
    return materialCache.get(key);
  }
  function shape(kind,parent,x,y,z,sx,sy,sz,color,options={}) {
    const object = new T.Mesh(geometry(kind), material(color,options));
    object.position.set(x,y,z); object.scale.set(sx,sy,sz);
    object.castShadow=!!options.shadow; object.receiveShadow=true;
    object.userData.batchable=options.batch!==false;
    object.userData.cameraBlocker=options.blocker ?? (!!options.shadow && sy>=3);
    parent.add(object); return object;
  }
  const box=(parent,x,y,z,w,h,d,color,options)=>shape('box',parent,x,y,z,w,h,d,color,options);
  const cylinder=(parent,x,y,z,r,h,color,options)=>shape('cylinder',parent,x,y,z,r,h,r,color,options);
  const sphere=(parent,x,y,z,r,color,options)=>shape('sphere',parent,x,y,z,r,r,r,color,options);
  const cone=(parent,x,y,z,r,h,color,options)=>shape('cone',parent,x,y,z,r,h,r,color,options);
  const torus=(parent,x,y,z,r,color,options)=>shape('torus',parent,x,y,z,r,r,r,color,options);
  function group(parent,x=0,y=0,z=0,dynamic=false) {const g=new T.Group();g.position.set(x,y,z);g.userData.dynamic=dynamic;parent.add(g);return g;}
  function label(text,x,y,z,{width=5,color='#243e46',background='#fff2d2',fontSize=30}={}) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=112;
    const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.beginPath();ctx.roundRect(4,4,504,104,20);ctx.fill();ctx.strokeStyle='rgba(103,75,42,.5)';ctx.lineWidth=4;ctx.stroke();
    ctx.fillStyle=color;ctx.font=`bold ${fontSize}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,58,480);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:true}));sprite.position.set(x,y,z);sprite.scale.set(width,width*112/512,1);scene.add(sprite);return sprite;
  }
  function lamp(x,z) {
    cylinder(scene,x,1.9,z,.09,3.8,0x485a60);cylinder(scene,x,3.85,z,.28,.16,0xd8ab5f);
    sphere(scene,x,4.12,z,.29,0x8cf4e1,{emissive:0x1b756c});
    cone(scene,x,4.47,z,.46,.35,0xcba35e).rotation.y=Math.PI/4;
  }
  function gear(parent,x,y,z,r,color=0xd0a35d,dynamic=true) {
    const g=group(parent,x,y,z,dynamic);torus(g,0,0,0,r,color);
    cylinder(g,0,0,0,r*.27,.28,color).rotation.x=Math.PI/2;
    for(let i=0;i<8;i++){const a=i*Math.PI/4;const tooth=box(g,Math.cos(a)*r,Math.sin(a)*r,0,r*.3,r*.35,.25,color);tooth.rotation.z=a;}
    return g;
  }
  function npc({id,name,role,x,z,color=0x5c93a7}) {
    const g=group(scene,x,0,z);
    cylinder(g,0,.75,0,.42,1.05,color,{shadow:true});sphere(g,0,1.9,0,.64,0xffd5b3,{shadow:true});
    box(g,-.19,.17,0,.3,.35,.42,0x43526b);box(g,.19,.17,0,.3,.35,.42,0x43526b);
    box(g,-.56,.85,0,.22,.72,.26,color);box(g,.56,.85,0,.22,.72,.26,color);
    if(role==='class'){cylinder(g,0,2.39,0,.65,.13,0xe8e9df);box(g,.17,1.88,.56,.45,.2,.1,0x8cebd9,{emissive:0x2b6f67});}
    else if(role==='weapons'){box(g,.82,1.25,0,.12,1.5,.18,0xc6d9dc);box(g,.82,.65,0,.55,.12,.22,0xcaa15f);}
    else if(role==='armor'){box(g,0,.95,.4,.62,.72,.15,0xd6b36a);}
    else if(role==='warp'){cone(g,0,2.62,0,.68,.8,0x8e7cba).rotation.y=Math.PI/4;}
    else {sphere(g,0,2.28,0,.64,role==='items'?0xd6a0b4:0x746454);}
    if(role!=='class')for(const eyeX of [-.2,.2])sphere(g,eyeX,1.98,.57,.065,0x30444f);
    label(name,x,3.1,z,{width:4.4,fontSize:30});return {id,name,role,x,z,color,object:g};
  }
  function portal(x,z,labelText) {
    const g=group(scene,x,0,z,true);
    const ring=torus(g,0,2.4,0,2.25,0xc3aa6e);ring.scale.z=.75;
    const inner=torus(g,0,2.4,.02,1.94,0x7affdf,{emissive:0x29bba8});
    const disc=shape('disc',g,0,2.4,0,1.84,1.84,1,0x79cbd7,{opacity:.26,emissive:0x1e809a,side:T.DoubleSide});
    box(g,-2.5,1.1,0,.6,2.2,.9,0x567780,{shadow:true});box(g,2.5,1.1,0,.6,2.2,.9,0x567780,{shadow:true});
    cylinder(g,0,.06,0,2.7,.1,0xc3ab77);label(labelText,x,5.8,z,{width:5.6});
    return {group:g,inner,disc};
  }
  function batch() {
    scene.updateMatrixWorld(true);const buckets=new Map(),remove=[];
    scene.traverse(o=>{
      if(!o.isMesh||!o.userData.batchable)return;
      for(let p=o.parent;p;p=p.parent)if(p.userData.dynamic)return;
      const key=[o.geometry.uuid,o.material.uuid,o.castShadow,o.receiveShadow,o.userData.cameraBlocker].join(':');
      if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(o);remove.push(o);
    });
    for(const objects of buckets.values()){
      const first=objects[0],mesh=new T.InstancedMesh(first.geometry,first.material,objects.length);
      for(let i=0;i<objects.length;i++)mesh.setMatrixAt(i,objects[i].matrixWorld);
      mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.userData.cameraBlocker=first.userData.cameraBlocker;mesh.computeBoundingSphere();scene.add(mesh);
    }
    for(const object of remove)object.removeFromParent();
  }
  function dispose() {
    const geometries=new Set(geometryCache.values()),materials=new Set(materialCache.values()),textures=new Set();
    scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}if(o.isInstancedMesh)o.dispose();if(o.shadow)o.shadow.dispose();});
    for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();}
    for(const t of textures)t.dispose();for(const g of geometries)g.dispose();
    geometryCache.clear();materialCache.clear();scene.clear();
  }
  box(scene,0,-.18,2,94,.3,110,ground);
  return {scene,box,cylinder,sphere,cone,torus,shape,group,label,lamp,gear,npc,portal,batch,dispose};
}
