/* Live response instrumentation is test-only; production exposes no debug globals. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const baseURL = process.env.GAME_URL || 'http://127.0.0.1:8000/';
const remote = !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname);
const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const probeSource = `
window.cityProbe = {
 snapshot: () => ({map:activeMap.id,position:player.position.toArray(),destination:destination.toArray(),walking:walkingToPoint,path:currentPath.map(p=>({x:p.x,z:p.z})),yaw,pitch,dist,state:JSON.parse(JSON.stringify(gameState)),render:{...renderer.info.render},memory:{...renderer.info.memory},pixelRatio:renderer.getPixelRatio(),npcCount:activeMap.npcs.length,landmarks:activeMap.landmarks,meshCount:(()=>{let n=0;scene.traverse(o=>{if(o.isMesh)n++});return n})(),animating:arms.some(a=>Math.abs(a.rotation.x)>.01)&&legs.some(l=>Math.abs(l.rotation.x)>.01),avatar:{body:playerBody.geometry.parameters,head:playerHead.geometry.parameters,arms:arms.length,legs:legs.length},equipment:Object.fromEntries(Object.entries(equipmentSlots).map(([k,v])=>[k,v.children.length]))}),
 project:(x,z)=>{const v=new T.Vector3(x,0,z).project(camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2}},
 place:(x,z)=>{if(!navigation.isWalkable(x,z))throw Error('Test setup is not walkable '+x+','+z);walkingToPoint=false;currentPath=[];destination.set(x,0,z);player.position.set(x,0,z);},
 yaw:value=>{yaw=value},
 navigate:(x,z)=>navigateTo(new T.Vector3(x,0,z)),
 valid:()=>navigation.isWalkable(player.position.x,player.position.z),
 maps:()=>({id:activeMap.id,bounds:activeMap.bounds,colliders:activeMap.colliders,npcs:activeMap.npcs.map(({id,name,role,x,z})=>({id,name,role,x,z})),portals:activeMap.portals}),
 edgeSetup:()=>{const b=activeMap.bounds;for(let x=b.minX+2;x<b.maxX-2;x+=2)if(navigation.isWalkable(x,b.maxZ-1)){cityProbe.place(x,b.maxZ-1);cityProbe.yaw(0);return {x,z:b.maxZ-1}}throw Error('No walkable map edge')},
 load:(id,arrival)=>changeMap(id,arrival),
 nearNPC:role=>{const npc=activeMap.npcs.find(n=>n.role===role);if(!npc)throw Error('Missing NPC '+role);for(const [dx,dz] of [[0,1.8],[1.8,0],[-1.8,0],[0,-1.8],[1.3,1.3],[-1.3,1.3]]){if(navigation.isWalkable(npc.x+dx,npc.z+dz)){cityProbe.place(npc.x+dx,npc.z+dz);return {id:npc.id,name:npc.name,role:npc.role,x:npc.x,z:npc.z}}}throw Error('NPC unreachable '+role)},
 collisionCase:()=>{for(const box of activeMap.colliders){if(box.maxX-box.minX>15||box.maxZ-box.minZ>15)continue;const z=(box.minZ+box.maxZ)/2,start={x:box.minX-1.5,z},goal={x:box.maxX+1.5,z};if(!navigation.isWalkable(start.x,z)||!navigation.isWalkable(goal.x,z))continue;const path=navigation.findPath(start,goal);if(path.length>1&&path.length<30){const front={x:(box.minX+box.maxX)/2,z:box.maxZ+1.5};if(navigation.isWalkable(front.x,front.z))return {box,start,goal,front,path}}}throw Error('No suitable real collider found')},
 beginAudit:()=>{window.cityAudit={frames:0,invalid:0};let remaining=1500;const tick=()=>{if(!window.cityAudit||remaining--<=0)return;cityAudit.frames++;if(!navigation.isWalkable(player.position.x,player.position.z))cityAudit.invalid++;requestAnimationFrame(tick)};requestAnimationFrame(tick)},
 endAudit:()=>{const result=window.cityAudit;window.cityAudit=null;return result},
 pixel:()=>{renderer.render(scene,camera);const gl=renderer.getContext(),pixel=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel]}
};`;

(async () => {
 const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,...(remote&&proxyServer?{proxy:{server:proxyServer,bypass:'localhost,127.0.0.1'}}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const results=[], errors=[], failedRequests=[];
 async function check(name, run) {
  try {const detail=await run();results.push({name,status:'passed',...(detail?{detail}:{})});console.log('PASS '+name+(detail?' '+JSON.stringify(detail):''));}
  catch(error){results.push({name,status:'failed',error:error.message});console.error('FAIL '+name+' '+error.stack);}
 }
 async function open(mobile) {
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?3:1});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failedRequests.push({url:r.url(),error:r.failure().errorText}));
  await page.route('**/game.js',async route=>{try{const response=await route.fetch();assert.equal(response.status(),200);await route.fulfill({response,body:await response.text()+probeSource});}catch(error){errors.push('instrumentation: '+error.message);await route.abort();}});
  const response=await page.goto(baseURL);assert.equal(response.status(),200);await page.waitForFunction(()=>window.cityProbe);await page.waitForTimeout(450);return {context,page};
 }
 async function snapshot(page){return page.evaluate(()=>cityProbe.snapshot());}
 async function arrived(page,target,timeout=18000){await page.waitForFunction(t=>{const s=cityProbe.snapshot();return !s.walking&&Math.hypot(s.position[0]-t.x,s.position[2]-t.z)<.16},target,{timeout});}
 async function tapWorld(page,x,z){await page.waitForTimeout(500);const p=await page.evaluate(t=>cityProbe.project(t.x,t.z),{x,z});assert(p.x>15&&p.x<375&&p.y>170&&p.y<740,'Expected target on playable screen '+JSON.stringify(p));await page.touchscreen.tap(p.x,p.y);}
 try {
  const mobile=await open(true), page=mobile.page;
  const cdp=await mobile.context.newCDPSession(page);
  const touch=(type,points=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({x:p.x,y:p.y,id:i+1}))});
  const drag=async()=>{await touch('touchStart',[{x:340,y:470}]);await touch('touchMove',[{x:65,y:470}]);await touch('touchEnd');};
  await check('1–3: game opens in Neo Gear City, WebGL and unchanged player proportions',async()=>{
   const s=await snapshot(page);assert.equal(s.map,'neo-gear');await page.locator('#map-name').waitFor();assert.match(await page.locator('#map-name').innerText(),/Neo Gear/i);assert.equal(await page.locator('canvas').count()>=1,true);assert((await page.evaluate(()=>cityProbe.pixel())).some((x,i)=>i<3&&x>0));assert.equal(s.avatar.body.width,.9);assert.equal(s.avatar.body.height,1);assert.equal(s.avatar.body.depth,.55);assert.equal(s.avatar.head.radius,.65);assert.equal(s.avatar.arms,2);assert.equal(s.avatar.legs,2);assert(s.landmarks.length>=6);assert(s.npcCount>=6);return {map:s.map,landmarks:s.landmarks.length,npcs:s.npcCount};
  });
  await check('5: mobile tap reaches its ground position',async()=>{await page.evaluate(()=>cityProbe.place(0,0));await tapWorld(page,2,1);await arrived(page,{x:2,z:1});});
  await check('6 and regression: touch orbit exceeds 360° without walking',async()=>{
   const before=await snapshot(page);for(let i=0;i<5;i++)await drag();await page.waitForTimeout(100);const after=await snapshot(page);assert(Math.abs(after.yaw-before.yaw)>Math.PI*2);assert(!after.walking);assert.deepEqual(after.position,before.position);
  });
  await check('5–6: tapping after orbit and rotating during walking preserve destination',async()=>{
   await page.evaluate(()=>cityProbe.place(0,0));await page.locator('#reset').click();await tapWorld(page,2,1);const before=await snapshot(page);assert(before.walking);await drag();assert.deepEqual((await snapshot(page)).destination,before.destination);await arrived(page,{x:2,z:1});await page.waitForTimeout(500);
   const target=await page.evaluate(()=>{const s=cityProbe.snapshot();for(const [dx,dz] of [[1,1],[-1,1],[1,-1],[-1,-1]]){const t={x:s.position[0]+dx,z:s.position[2]+dz},p=cityProbe.project(t.x,t.z);if(p.x>50&&p.x<340&&p.y>190&&p.y<700)return t}throw Error('No visible nearby point')});await tapWorld(page,target.x,target.z);await arrived(page,target);
  });
  await check('6: multi-touch pinch zoom produces no accidental walk',async()=>{
   const before=await snapshot(page);await touch('touchStart',[{x:145,y:510},{x:245,y:510}]);await touch('touchMove',[{x:100,y:510},{x:290,y:510}]);await touch('touchEnd');await page.waitForTimeout(120);const after=await snapshot(page);assert(!after.walking);assert.deepEqual(after.position,before.position);assert.notEqual(after.dist,before.dist);
  });
  await check('7: tap navigation routes around an actual city collider',async()=>{
   const test=await page.evaluate(()=>cityProbe.collisionCase());await page.evaluate(t=>{cityProbe.place(t.start.x,t.start.z);cityProbe.beginAudit();cityProbe.navigate(t.goal.x,t.goal.z)},test);await arrived(page,test.goal);const audit=await page.evaluate(()=>cityProbe.endAudit());assert(audit.frames>0);assert.equal(audit.invalid,0);return {collider:test.box.id,routeNodes:test.path.length,frames:audit.frames};
  });
  await check('2 and 7: walk into laboratory and exit through southern desert gate',async()=>{
   await page.evaluate(()=>cityProbe.place(29,-3));await page.evaluate(()=>cityProbe.navigate(29,-8));await arrived(page,{x:29,z:-8});assert(await page.evaluate(()=>cityProbe.valid()));
   await page.evaluate(()=>cityProbe.place(0,23));await page.evaluate(()=>cityProbe.navigate(0,48));await arrived(page,{x:0,z:48});assert.equal((await snapshot(page)).map,'neo-gear');assert(await page.evaluate(()=>cityProbe.valid()));
  });
  await check('8: town NPCs, profession change and three working shops',async()=>{
   const roles=['guide','class','weapons','armor','items','warp'];const actions={class:'class-cyborg',weapons:'buy-weapon',armor:'buy-armor',items:'buy-item'};const purchases=[];
   for(const role of roles){const npc=await page.evaluate(role=>cityProbe.nearNPC(role),role);await page.waitForTimeout(100);await page.locator('#interact').click();await page.locator('#dialog-panel').waitFor({state:'visible'});assert((await page.locator('#dialog-title').innerText()).includes(npc.name));assert((await page.locator('#dialog-text').innerText()).length>5);if(actions[role]){const before=(await snapshot(page)).state;await page.locator('[data-action="'+actions[role]+'"]').click();const after=(await snapshot(page)).state;if(role==='class')assert.equal(after.profession,'Cyborg');else{assert(after.credits<before.credits);purchases.push(role)}}await page.locator('#dialog-close').click();}
   const s=await snapshot(page);assert(Object.values(s.equipment).some(n=>n>0),'Purchased equipment should attach to original avatar');return {roles,purchases,profession:s.state.profession};
  });
  await check('9: walking through portal enters Elim and returns to Neo Gear City',async()=>{
   await page.evaluate(()=>cityProbe.place(37,14));await page.evaluate(()=>cityProbe.navigate(37,10));await page.waitForFunction(()=>cityProbe.snapshot().map==='elim',null,{timeout:12000});await page.waitForTimeout(1400);await page.evaluate(()=>cityProbe.navigate(0,-8));await page.waitForFunction(()=>cityProbe.snapshot().map==='neo-gear',null,{timeout:15000});assert(await page.evaluate(()=>cityProbe.valid()));
  });
  await check('9 and 12: repeated scene changes release old map resources',async()=>{
   const samples=[];for(let i=0;i<3;i++){await page.evaluate(()=>cityProbe.load('elim'));await page.waitForTimeout(150);await page.evaluate(()=>cityProbe.load('neo-gear'));await page.waitForTimeout(150);samples.push((await snapshot(page)).memory)}assert(samples.at(-1).geometries<=samples[0].geometries+3);assert(samples.at(-1).textures<=samples[0].textures+3);return samples;
  });
  await check('12: mobile render workload and measured software-renderer timing',async()=>{
   await page.evaluate(()=>cityProbe.place(0,0));await page.locator('#reset').click();await page.waitForTimeout(400);const s=await snapshot(page);const timing=await page.evaluate(()=>new Promise(resolve=>{let n=0,start=performance.now();function frame(){if(++n===45)resolve({frames:n,elapsedMs:performance.now()-start});else requestAnimationFrame(frame)}requestAnimationFrame(frame)}));assert(s.pixelRatio<=1.5);assert(s.render.calls<=500,'Mobile rendering draw call budget exceeded');assert(s.render.triangles<200000,'Mobile rendering triangle budget exceeded');await page.screenshot({path:'/tmp/neo-gear-mobile.png'});return {calls:s.render.calls,triangles:s.render.triangles,pixelRatio:s.pixelRatio,softwareRendererFPS:Math.round(timing.frames*1000/timing.elapsedMs),hardwareMobileDeviceTested:false};
  });
  await mobile.context.close();
  const desktop=await open(false), d=desktop.page;
  await check('4 and 11: desktop W/A/S/D preserve camera-relative movement and walking animation',async()=>{
   for(const key of ['w','a','s','d']){await d.evaluate(()=>{cityProbe.place(0,0);cityProbe.yaw(0)});const before=await snapshot(d);await d.keyboard.down(key);await d.waitForFunction(p=>{const s=cityProbe.snapshot();return Math.hypot(s.position[0]-p[0],s.position[2]-p[2])>.65},before.position,{timeout:8000});await d.keyboard.up(key);const after=await snapshot(d);const dx=after.position[0]-before.position[0],dz=after.position[2]-before.position[2],length=Math.hypot(dx,dz);assert(length>.5&&length<3);const ex=Number(key==='d')-Number(key==='a'),ez=Number(key==='s')-Number(key==='w');assert((dx*ex+dz*ez)/length>.99)}
   await d.keyboard.down('w');await d.waitForFunction(()=>cityProbe.snapshot().animating,null,{timeout:8000});await d.keyboard.up('w');
  });
  await check('7: keyboard movement blocks at walls, and map bounds prevent falling',async()=>{
   const test=await d.evaluate(()=>cityProbe.collisionCase());await d.evaluate(t=>{cityProbe.place(t.front.x,t.front.z);cityProbe.yaw(0)},test);await d.keyboard.down('w');await d.waitForFunction(z=>cityProbe.snapshot().position[2]<z+1.05,test.box.maxZ,{timeout:8000});await d.waitForTimeout(350);await d.keyboard.up('w');const after=await snapshot(d);assert(after.position[2]>test.box.maxZ+.85);assert(after.position[2]<test.box.maxZ+1.05);assert(await d.evaluate(()=>cityProbe.valid()));
   const bounds=(await d.evaluate(()=>cityProbe.maps())).bounds;let edge=await d.evaluate(()=>cityProbe.edgeSetup());await d.keyboard.down('s');await d.waitForTimeout(650);await d.keyboard.up('s');assert((await snapshot(d)).position[2]<bounds.maxZ);assert(await d.evaluate(()=>cityProbe.valid()));return {collider:test.box.id,edge};
  });
  await check('6 and 11: desktop mouse orbit, scroll, fixed/free/follow and persistence',async()=>{
   await d.evaluate(()=>cityProbe.place(0,0));let before=await snapshot(d);await d.mouse.move(500,420);await d.mouse.down();await d.mouse.move(800,420,{steps:8});await d.mouse.up();assert(Math.abs((await snapshot(d)).yaw-before.yaw)>1);before=await snapshot(d);await d.mouse.wheel(0,150);await d.waitForTimeout(100);assert.notEqual((await snapshot(d)).dist,before.dist);
   await d.locator('#mode').selectOption('fixed');await d.waitForFunction(()=>Math.abs(cityProbe.snapshot().yaw-.7)<.001);before=await snapshot(d);await d.mouse.move(500,420);await d.mouse.down();await d.mouse.move(800,420,{steps:4});await d.mouse.up();assert(Math.abs((await snapshot(d)).yaw-before.yaw)<.01);await d.locator('#mode').selectOption('follow');await d.reload();await d.waitForFunction(()=>window.cityProbe);assert.equal(await d.locator('#mode').inputValue(),'follow');before=await snapshot(d);await d.keyboard.down('d');await d.waitForFunction(y=>Math.abs(cityProbe.snapshot().yaw-y)>.05,before.yaw,{timeout:8000});await d.keyboard.up('d');assert(Math.abs((await snapshot(d)).yaw-before.yaw)>.01,'Follow camera should respond to movement');await d.locator('#mode').selectOption('free');await d.evaluate(()=>cityProbe.place(0,0));await d.locator('#reset').click();await d.waitForTimeout(250);await d.screenshot({path:'/tmp/neo-gear-desktop.png'});
  });
  await desktop.context.close();
  await check('10: no critical JavaScript errors or failed required requests',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(failedRequests.filter(r=>!r.url.endsWith('favicon.ico')),[])});
 } finally {
  await browser.close();
  fs.writeFileSync('/tmp/neo-gear-test-results.json',JSON.stringify({baseURL,ranAt:new Date().toISOString(),results,errors,failedRequests},null,2));
 }
 assert(results.length>=12);assert.equal(results.filter(r=>r.status==='failed').length,0,'Some city checks failed; inspect /tmp/neo-gear-test-results.json');
})().catch(error=>{console.error(error);process.exitCode=1});
