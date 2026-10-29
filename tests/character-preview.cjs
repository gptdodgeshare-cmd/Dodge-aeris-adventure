// Inspect actual loaded GLBs; instrumentation is appended to the test response only.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const baseURL = process.env.CHARACTER_PREVIEW_URL || process.env.PREVIEW_URL || new URL('character-preview.html', process.env.GAME_URL || 'http://127.0.0.1:8000/').href;
const remote = !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname);
const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const requiredBones = ['Root','Pelvis','Spine','Chest','Neck','Head','UpperArm_L','UpperArm_R','Forearm_L','Forearm_R','Hand_L','Hand_R','Thigh_L','Thigh_R','Shin_L','Shin_R','Foot_L','Foot_R','MainWeapon_RightHand','Offhand_LeftHand'];
const requiredClips = ['Idle','Walk','Run','Attack','Hit','Death'];
const expectedParents = {Pelvis:'Root',Spine:'Pelvis',Chest:'Spine',Neck:'Chest',Head:'Neck',Forearm_L:'UpperArm_L',Forearm_R:'UpperArm_R',Hand_L:'Forearm_L',Hand_R:'Forearm_R',Shin_L:'Thigh_L',Shin_R:'Thigh_R',Foot_L:'Shin_L',Foot_R:'Shin_R',MainWeapon_RightHand:'Hand_R',Offhand_LeftHand:'Hand_L'};

const probeSource = `
window.characterProbe = (() => {
  const records = () => Object.entries(previewState.models).filter(([,record]) => record);
  const meshes = record => {const list=[];record.root.traverse(o=>{if(o.isMesh)list.push(o)});return list};
  const bones = record => {const set=new Map();record.root.traverse(o=>{if(o.isBone)set.set(o.name,o)});return set};
  function dimensions(record) {
    const modelMeshes=meshes(record), saved=[];
    for(const bone of bones(record).values())saved.push([bone,bone.position.clone(),bone.quaternion.clone(),bone.scale.clone()]);
    const skeletons=new Set(modelMeshes.filter(o=>o.isSkinnedMesh).map(o=>o.skeleton));
    for(const skeleton of skeletons)skeleton.pose();
    record.root.updateMatrixWorld(true);for(const skeleton of skeletons)skeleton.update();
    const inverse=new T.Matrix4().copy(record.root.matrixWorld).invert();
    const body=new T.Box3(),skull=new T.Box3();
    let skullVertices=0, fingers=[];
    for(const object of modelMeshes){
      if(/finger|thumb|pinky/i.test(object.name))fingers.push(object.name);
      const hair=object.userData.part==='Hair'||object.userData.role==='hair'||/^Hair/i.test(object.name);
      const head=object.userData.role==='skull'||object.userData.part==='Head'||/^Head(?:_Skin|_Mesh)?$/.test(object.name);
      const positions=object.geometry.getAttribute('position');
      for(let i=0;i<positions.count;i++){
        const v=new T.Vector3().fromBufferAttribute(positions,i);
        if(object.isSkinnedMesh)object.applyBoneTransform(i,v);
        v.applyMatrix4(object.matrixWorld).applyMatrix4(inverse);
        if(!hair)body.expandByPoint(v);
        if(head){skull.expandByPoint(v);skullVertices++;}
      }
    }
    const joints=Object.fromEntries([...bones(record)].map(([name,bone])=>[name,new T.Vector3().setFromMatrixPosition(bone.matrixWorld).applyMatrix4(inverse).toArray()]));
    for(const [bone,position,quaternion,scale] of saved){bone.position.copy(position);bone.quaternion.copy(quaternion);bone.scale.copy(scale)}
    record.root.updateMatrixWorld(true);for(const skeleton of skeletons)skeleton.update();
    return {height:skull.max.y-body.min.y,skullTop:skull.max.y,feetBottom:body.min.y,headHeight:skull.max.y-skull.min.y,skullSize:skull.getSize(new T.Vector3()).toArray(),skullVertices,fingers,joints};
  }
  function modelSnapshot(record){
    const list=meshes(record),modelBones=bones(record),materials=new Set();let triangles=0,vertices=0,weightedVertices=0,unweightedVertices=0;
    for(const object of list){
      for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);
      const positions=object.geometry.getAttribute('position');vertices+=positions.count;triangles+=(object.geometry.index?.count||positions.count)/3;
      if(object.isSkinnedMesh){const weights=object.geometry.getAttribute('skinWeight');if(!weights){unweightedVertices+=positions.count;continue;}for(let i=0;i<weights.count;i++){const sum=weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i);if(sum>.999&&sum<1.001)weightedVertices++;else unweightedVertices++;}}
    }
    const actions=Object.fromEntries([...record.actions].map(([name,action])=>[name,{time:action.time,weight:action.getEffectiveWeight(),running:action.isRunning(),enabled:action.enabled,loop:action.loop}]));
    const equipment=Object.fromEntries([...record.equipment].map(([slot,item])=>{const ancestors=[];for(let parent=item.parent;parent&&parent!==record.root;parent=parent.parent)ancestors.push(parent.name);return [slot,{name:item.name,parent:item.parent?.name,ancestors,uuid:item.uuid}]}));
    return {meshCount:list.length,skinnedMeshCount:list.filter(o=>o.isSkinnedMesh).length,vertices,weightedVertices,unweightedVertices,triangles,materialCount:materials.size,pbrMaterials:[...materials].every(m=>m.isMeshStandardMaterial||m.isMeshPhysicalMaterial),bones:[...modelBones].map(([name,bone])=>({name,parent:bone.parent?.name})),clips:record.clips.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length})),mixerTime:record.mixer.time,actions,equipment,baseSignature:list.filter(o=>o.isSkinnedMesh).map(o=>({name:o.name,geometry:o.geometry.uuid,visible:o.visible})).sort((a,b)=>a.name.localeCompare(b.name)),pose:[...modelBones].flatMap(([name,bone])=>[name,...bone.position.toArray(),...bone.quaternion.toArray()]),rootPosition:record.root.position.toArray(),rootQuaternion:record.root.quaternion.toArray(),visible:record.root.visible};
  }
  return {
    snapshot:()=>({ready:previewState.ready,error:previewState.error,gender:previewState.gender,view:previewState.view,animation:previewState.activeAnimation,paused:previewState.paused,camera:camera.position.toArray(),equipment:{...previewState.equipment},models:Object.fromEntries(records().map(([gender,record])=>[gender,modelSnapshot(record)])),render:{...renderer.info.render},memory:{...renderer.info.memory},pixelRatio:renderer.getPixelRatio(),helpers:(()=>{let n=0;scene.traverse(o=>{if(o.type==='SkeletonHelper')n++});return n})()}),
    dimensions:()=>Object.fromEntries(records().map(([gender,record])=>[gender,dimensions(record)])),
    boxBounds:()=>Object.fromEntries(records().map(([gender,record])=>{record.root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(record.root,true),points=[],rect=renderer.domElement.getBoundingClientRect();for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const v=new T.Vector3(x,y,z).project(camera);points.push({x:rect.x+(v.x+1)*rect.width/2,y:rect.y+(1-v.y)*rect.height/2,z:v.z})}return [gender,points]})),
    bounds:()=>Object.fromEntries(records().map(([gender,record])=>{record.root.updateMatrixWorld(true);const rect=renderer.domElement.getBoundingClientRect(),extremes={};record.root.traverse(object=>{if(!object.isMesh)return;if(object.isSkinnedMesh)object.skeleton.update();const positions=object.geometry.getAttribute('position');for(let i=0;i<positions.count;i++){const v=new T.Vector3();object.getVertexPosition(i,v);v.applyMatrix4(object.matrixWorld).project(camera);const point={x:rect.x+(v.x+1)*rect.width/2,y:rect.y+(1-v.y)*rect.height/2,z:v.z};for(const axis of ['x','y','z']){if(!extremes[axis+'Min']||point[axis]<extremes[axis+'Min'][axis])extremes[axis+'Min']=point;if(!extremes[axis+'Max']||point[axis]>extremes[axis+'Max'][axis])extremes[axis+'Max']=point;}}});return [gender,Object.values(extremes)]})),
    wireframeCount:()=>records().reduce((sum,[,record])=>sum+meshes(record).filter(o=>(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.wireframe)).length,0),
    settle:()=>new Promise((resolve,reject)=>{let previous=camera.position.clone(),stable=0,frames=0;const timer=setTimeout(()=>reject(Error('Preview camera did not settle')),10000);function step(){const d=camera.position.distanceTo(previous);previous.copy(camera.position);stable=d<.0001?stable+1:0;if(stable>=3){clearTimeout(timer);resolve()}else if(++frames>300){clearTimeout(timer);reject(Error('Preview camera did not settle in 300 frames'))}else requestAnimationFrame(step)}requestAnimationFrame(step)}),
    frames:n=>new Promise(resolve=>{function step(){if(--n<=0)resolve();else requestAnimationFrame(step)}requestAnimationFrame(step)}),
    blend:name=>new Promise(resolve=>{setAnimation(name);const samples=[];let remaining=12;function step(){samples.push(Object.fromEntries(records().map(([gender,record])=>[gender,Object.fromEntries([...record.actions].map(([key,action])=>[key,action.getEffectiveWeight()]))])));if(--remaining<=0)resolve(samples);else requestAnimationFrame(step)}requestAnimationFrame(step)}),
    finite:()=>records().every(([,record])=>meshes(record).every(object=>object.matrixWorld.elements.every(Number.isFinite)))
  };
})();`;

(async()=>{
  const report={baseURL,ranAt:new Date().toISOString(),results:[],errors:[],failedRequests:[],hardwareMobileDeviceTested:false,visualLikenessApproval:'Pending user review',scope:'Standalone reference-guided 3D draft; Neo avatar unchanged'};
  let browser;
  async function check(name,callback){
    try{const detail=await callback();report.results.push({name,status:'passed',...(detail?{detail}:{})});console.log('PASS '+name+(detail?' '+JSON.stringify(detail):''));}
    catch(error){report.results.push({name,status:'failed',error:error.message});console.error('FAIL '+name+' '+error.stack);}
  }
  async function open(mobile){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:960},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1});
    const page=await context.newPage();page.setDefaultTimeout(20000);
    page.on('pageerror',error=>report.errors.push(error.message));
    page.on('requestfailed',request=>report.failedRequests.push({url:request.url(),error:request.failure().errorText}));
    await page.route('**/character-preview.js',async route=>{try{const response=await route.fetch();assert.equal(response.status(),200);await route.fulfill({response,body:(await response.text())+probeSource});}catch(error){report.errors.push('Test instrumentation: '+error.message);await route.abort();}});
    const response=await page.goto(baseURL);assert.equal(response.status(),200);
    await page.waitForFunction(()=>window.characterProbe&&characterProbe.snapshot().ready,null,{timeout:45000});
    await page.evaluate(()=>characterProbe.settle());
    return {context,page};
  }
  const snapshot=page=>page.evaluate(()=>characterProbe.snapshot());
  async function playing(page){if((await snapshot(page)).paused)await page.locator('#play-pause').click();await page.waitForFunction(()=>!characterProbe.snapshot().paused);}
  async function animation(page,name){await playing(page);await page.locator('#animation-select').selectOption(name);await page.waitForFunction(name=>characterProbe.snapshot().animation===name,name);}
  async function frames(page,n=3){await page.evaluate(n=>characterProbe.frames(n),n);}
  async function contained(page){
    await page.evaluate(()=>characterProbe.settle());
    const stage=await page.locator('#preview-stage > canvas').boundingBox();
    const bounds=await page.evaluate(()=>characterProbe.bounds());
    for(const [gender,points] of Object.entries(bounds))for(const point of points){assert(point.z>-1&&point.z<1,gender+' should remain in camera depth');assert(point.x>=stage.x-6&&point.x<=stage.x+stage.width+6,gender+' should fit horizontally '+JSON.stringify({stage,point}));assert(point.y>=stage.y-6&&point.y<=stage.y+stage.height+6,gender+' should fit vertically '+JSON.stringify({stage,point}));}
  }
  try{
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,...(remote&&proxyServer?{proxy:{server:proxyServer,bypass:'localhost,127.0.0.1'}}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const desktop=await open(false),page=desktop.page;
    await check('Two actual smooth skinned 3D assets load, with PBR materials and separate fingers',async()=>{
      const state=await snapshot(page);assert.deepEqual(Object.keys(state.models).sort(),['female','male']);assert.equal(state.error,null);
      const dimensions=await page.evaluate(()=>characterProbe.dimensions());
      for(const [gender,model] of Object.entries(state.models)){assert(model.meshCount>=15,gender+' needs actual mesh parts');assert(model.skinnedMeshCount>=10,gender+' needs actual skeletal skinning');assert(model.weightedVertices>1000);assert.equal(model.unweightedVertices,0);assert(model.pbrMaterials);assert(model.triangles>3000&&model.triangles<90000);assert(dimensions[gender].fingers.length>=10,'Ten separate actual digit meshes required');assert(dimensions[gender].skullVertices>100);assert(dimensions[gender].skullSize.every(value=>value>.35),'Head must have actual volume on all axes');}
      return Object.fromEntries(Object.entries(state.models).map(([gender,m])=>[gender,{meshes:m.meshCount,skinnedMeshes:m.skinnedMeshCount,vertices:m.vertices,triangles:m.triangles,materials:m.materialCount}]));
    });
    await check('Shared rest-pose skull height, head proportion, grounded feet and joint locations',async()=>{
      const dimensions=await page.evaluate(()=>characterProbe.dimensions());
      for(const gender of ['male','female']){const d=dimensions[gender];assert(Math.abs(d.skullTop-3)<.005);assert(Math.abs(d.feetBottom)<.005);assert(Math.abs(d.height-3)<.006);const ratio=d.headHeight/d.height;assert(ratio>=.32&&ratio<=.36,gender+' head ratio '+ratio);}
      assert(Math.abs(dimensions.male.height-dimensions.female.height)<.002);
      for(const bone of requiredBones){assert(dimensions.male.joints[bone]&&dimensions.female.joints[bone],'Missing rest bone '+bone);assert(Math.hypot(...dimensions.male.joints[bone].map((n,i)=>n-dimensions.female.joints[bone][i]))<.002,'Shared joint differs: '+bone);}
      return {male:dimensions.male.height,female:dimensions.female.height,difference:Math.abs(dimensions.male.height-dimensions.female.height),feet:[dimensions.male.feetBottom,dimensions.female.feetBottom]};
    });
    await check('Complete bone hierarchy and all six nonempty animation clips',async()=>{
      const state=await snapshot(page);
      for(const [gender,model] of Object.entries(state.models)){
        const bones=new Map(model.bones.map(b=>[b.name,b.parent]));for(const bone of requiredBones)assert(bones.has(bone),gender+' missing '+bone);for(const [bone,parent]of Object.entries(expectedParents))assert.equal(bones.get(bone),parent);
        const clips=new Map(model.clips.map(c=>[c.name,c]));for(const name of requiredClips){assert(clips.has(name),gender+' missing '+name);assert(clips.get(name).duration>0);assert(clips.get(name).tracks>0);}
      }
    });
    await check('Front, left, back and right views show both actual models',async()=>{
      const orientations=[];
      await animation(page,'Idle');await page.locator('#play-pause').click();assert((await snapshot(page)).paused);
      for(const view of ['front','left','back','right']){await page.locator('#view-'+view).click();await page.waitForFunction(view=>characterProbe.snapshot().view===view,view);await contained(page);const state=await snapshot(page);orientations.push(state.models.male.rootQuaternion);await page.screenshot({path:'/tmp/character-preview-'+view+'.png'});}
      for(let i=0;i<orientations.length;i++)for(let j=i+1;j<orientations.length;j++)assert(Math.hypot(...orientations[i].map((x,k)=>x-orientations[j][k]))>.1,'Preset character views must differ');
      await page.locator('#view-front').click();await page.locator('#play-pause').click();assert(!(await snapshot(page)).paused);
    });
    await check('Idle, Walk and Run advance real bone animation and blend',async()=>{
      await animation(page,'Walk');const before=(await snapshot(page)).models;
      await page.waitForFunction(before=>{const models=characterProbe.snapshot().models;return ['male','female'].every(g=>models[g].mixerTime>before[g].mixerTime+.1&&JSON.stringify(models[g].pose)!==JSON.stringify(before[g].pose))},before,{timeout:12000});
      const samples=await page.evaluate(()=>characterProbe.blend('Run'));
      assert(samples.some(sample=>['male','female'].every(g=>sample[g].Walk>.01&&sample[g].Run>.01)),'Expected actual overlapping Walk/Run blend weights');
      await animation(page,'Idle');assert(await page.evaluate(()=>characterProbe.finite()));
    });
    await check('Attack, Hit and Death animate their bones without invalid transforms',async()=>{
      for(const name of ['Attack','Hit','Death']){await animation(page,name);const before=(await snapshot(page)).models;await page.waitForFunction(({name,before})=>{const models=characterProbe.snapshot().models;return ['male','female'].every(g=>models[g].actions[name]?.time>.08&&JSON.stringify(models[g].pose)!==JSON.stringify(before[g].pose))},{name,before},{timeout:12000});assert(await page.evaluate(()=>characterProbe.finite()));}
      await animation(page,'Idle');
    });
    await check('Pause freezes animation and resume advances the mixers',async()=>{
      await animation(page,'Walk');await page.locator('#play-pause').click();assert((await snapshot(page)).paused);await frames(page);const before=await snapshot(page);await frames(page,5);const after=await snapshot(page);for(const g of ['male','female'])assert.equal(after.models[g].mixerTime,before.models[g].mixerTime);await page.locator('#play-pause').click();await page.waitForFunction(before=>['male','female'].every(g=>characterProbe.snapshot().models[g].mixerTime>before.models[g].mixerTime+.05),before,{timeout:8000});await animation(page,'Idle');
    });
    await check('Right/left equipment follows its attachment bones and clear restores base bodies',async()=>{
      await page.locator('#equip-clear').click();const base=(await snapshot(page)).models;
      for(const [selector,slot,parent]of [['#equip-mainweapon','MainWeapon','MainWeapon_RightHand'],['#equip-offhand','Offhand','Offhand_LeftHand'],['#equip-armor','Armor','Chest']]){await page.locator(selector).click();const state=await snapshot(page);for(const [gender,model]of Object.entries(state.models)){assert(model.equipment[slot],gender+' missing equipped '+slot);assert(model.equipment[slot].ancestors.includes(parent),gender+' equipment attached to wrong bone');}}
      const equipped=await snapshot(page);assert.notEqual(equipped.models.male.equipment.MainWeapon.uuid,equipped.models.female.equipment.MainWeapon.uuid,'Equipped instances must be separate');await animation(page,'Walk');await frames(page,5);assert(await page.evaluate(()=>characterProbe.finite()));await page.locator('#equip-clear').click();await animation(page,'Idle');const clean=(await snapshot(page)).models;for(const gender of ['male','female']){assert.deepEqual(clean[gender].equipment,{});assert.deepEqual(clean[gender].baseSignature,base[gender].baseSignature,'Base meshes changed or disappeared after unequipping');}
    });
    await check('Gender selection, wireframe and skeleton tools leave the models intact',async()=>{
      for(const gender of ['male','female','both']){await page.locator('#gender-select').selectOption(gender);await page.waitForFunction(g=>characterProbe.snapshot().gender===g,gender);const models=(await snapshot(page)).models;assert.equal(models.male.visible,gender!=='female');assert.equal(models.female.visible,gender!=='male');}
      await page.locator('#show-wireframe').check();await page.waitForFunction(()=>characterProbe.wireframeCount()>0);await page.locator('#show-wireframe').uncheck();assert.equal(await page.evaluate(()=>characterProbe.wireframeCount()),0);await page.locator('#show-rig').check();await page.waitForFunction(()=>characterProbe.snapshot().helpers>=2);await page.locator('#show-rig').uncheck();await page.locator('#view-front').click();await contained(page);
    });
    await desktop.context.close();
    const mobile=await open(true),m=mobile.page;
    await check('Mobile portrait fits both characters in all four standard views',async()=>{await animation(m,'Idle');await m.locator('#play-pause').click();for(const view of ['front','left','back','right']){await m.locator('#view-'+view).click();await contained(m);await m.screenshot({path:'/tmp/character-preview-mobile-'+view+'.png'});}await m.locator('#view-front').click();await m.screenshot({path:'/tmp/character-preview-mobile.png'});await playing(m);});
    await check('Mobile drag and pinch control the actual 3D camera',async()=>{
      const stage=await m.locator('#preview-stage > canvas').boundingBox();const x=stage.x+stage.width*.65,y=stage.y+stage.height*.55;const cdp=await mobile.context.newCDPSession(m);const touch=(type,points=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({...p,id:i+1}))});
      const before=await snapshot(m);await touch('touchStart',[{x,y}]);await touch('touchMove',[{x:x-70,y:y+12}]);await touch('touchEnd');await m.evaluate(()=>characterProbe.settle());const rotated=await snapshot(m);assert(Math.hypot(...rotated.camera.map((v,i)=>v-before.camera[i]))>.5);
      const cx=stage.x+stage.width/2,cy=stage.y+stage.height*.55;await touch('touchStart',[{x:cx-40,y:cy},{x:cx+40,y:cy}]);await touch('touchMove',[{x:cx-46,y:cy},{x:cx+46,y:cy}]);await touch('touchEnd');await m.evaluate(()=>characterProbe.settle());const zoomed=await snapshot(m);assert(Math.hypot(...zoomed.camera.map((v,i)=>v-rotated.camera[i]))>.05);assert(await m.evaluate(()=>characterProbe.finite()));await m.locator('#view-reset').click();await contained(m);
    });
    await check('Mobile GPU workload and measured software-renderer timing',async()=>{
      await animation(m,'Walk');await frames(m,5);const state=await snapshot(m);assert(state.pixelRatio<=1.5);assert(state.render.calls>0&&state.render.calls<500);assert(state.render.triangles>5000&&state.render.triangles<300000);const timing=await m.evaluate(()=>new Promise(resolve=>{const start=performance.now();let count=0;function frame(){if(++count>=30)resolve({frames:count,elapsedMs:performance.now()-start});else requestAnimationFrame(frame)}requestAnimationFrame(frame)}));return {calls:state.render.calls,triangles:state.render.triangles,pixelRatio:state.pixelRatio,softwareRendererFPS:Math.round(timing.frames*1000/timing.elapsedMs),hardwareMobileDeviceTested:false};
    });
    await mobile.context.close();
    await check('No critical JavaScript errors or failed required requests',async()=>{assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests.filter(r=>!r.url.endsWith('/favicon.ico')),[])});
    assert(report.results.length>=12);assert.equal(report.results.filter(result=>result.status==='failed').length,0,'Inspect /tmp/character-preview-test-results.json for failed checks');
  }catch(error){if(!report.results.some(r=>r.status==='failed'))report.results.push({name:'Preview initialization or suite completion',status:'failed',error:error.message});throw error;}
  finally{if(browser)await browser.close();fs.writeFileSync('/tmp/character-preview-test-results.json',JSON.stringify(report,null,2));}
})().catch(error=>{console.error(error);process.exitCode=1});
