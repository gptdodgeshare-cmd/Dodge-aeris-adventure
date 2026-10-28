const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Instrument only the test response; production has no testing globals.
 await page.route('**/game.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+`\nwindow.probe={snapshot:()=>({position:player.position.toArray(),destination:destination.toArray(),walking:walkingToPoint,yaw,pitch}),project:(x,z)=>{const v=new T.Vector3(x,0,z).project(camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2}},pixel:()=>{renderer.render(scene,camera);const gl=renderer.getContext(),p=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p]}};`});});
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:8000/');await page.waitForFunction(()=>window.probe);await page.waitForTimeout(500);
 assert.equal(await page.locator('canvas').count(),1);assert((await page.evaluate(()=>probe.pixel())).some((v,i)=>i<3&&v>0));console.log('PASS WebGL render and local Three.js');
 const snap=()=>page.evaluate(()=>probe.snapshot());
 let point=await page.evaluate(()=>probe.project(2,1));await page.touchscreen.tap(point.x,point.y);
 await page.waitForFunction(()=>!probe.snapshot().walking);let state=await snap();assert(Math.hypot(state.position[0]-2,state.position[2]-1)<.08);console.log('PASS touch raycast and arrival at exact ground destination');
 const cdp=await context.newCDPSession(page);
 const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
 const before=await snap();await touch('touchStart',350,500);for(let i=1;i<=8;i++)await touch('touchMove',350-i*38,500);await touch('touchEnd');await page.waitForTimeout(200);state=await snap();assert(!state.walking);assert.deepEqual(state.position,before.position);assert(Math.abs(state.yaw-before.yaw)>1);console.log('PASS real touch drag rotates without walking');
 // Repeated touch drags exceed one full revolution.
 for(let n=0;n<4;n++){await touch('touchStart',350,500);await touch('touchMove',40,500);await touch('touchEnd');}assert(Math.abs((await snap()).yaw-before.yaw)>Math.PI*2);console.log('PASS 360-degree rotation');
 await page.locator('#reset').click();await page.waitForTimeout(500);
 point=await page.evaluate(()=>probe.project(3,2));await page.touchscreen.tap(point.x+2,point.y+2);assert((await snap()).walking);await page.keyboard.down('w');await page.waitForTimeout(400);await page.keyboard.up('w');state=await snap();assert(!state.walking);assert(Math.hypot(state.position[0]-before.position[0],state.position[2]-before.position[2])>.5);console.log('PASS WASD movement overrides tap destination');
 for(const mode of ['fixed','follow','free'])await page.locator('#mode').selectOption(mode);
 await page.reload();await page.waitForFunction(()=>window.probe);assert.equal(await page.locator('#mode').inputValue(),'free');
 await touch('touchStart',320,500);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert(!(await snap()).walking);console.log('PASS camera modes, persistence and touch cancellation');
 assert.deepEqual(errors,[]);console.log('PASS no JavaScript errors');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
