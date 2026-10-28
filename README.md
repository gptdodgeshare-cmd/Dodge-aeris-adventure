# Dodge Aeris — 3D Camera Prototype

เกมต้นแบบ Three.js รองรับ GitHub Pages โดยไม่ต้อง build หรือใช้ CDN

- แตะ/คลิกพื้นเพื่อเดินไปยังจุดนั้น จุดสีขาวแสดงเป้าหมาย
- ลากนิ้ว/เมาส์เพื่อหมุนกล้องรอบตัวละครในโหมด Free; การลากไม่สั่งเดิน
- WASD เดินบนคอมพิวเตอร์ และยกเลิกเป้าหมายจากการแตะ
- Free หมุนกล้องอิสระ, Fixed ล็อกมุมกล้อง, Follow ติดตามทิศตัวละคร
- Scroll ซูม และ Reset คืนมุมกล้อง
- ยกเลิกท่าทางหรือใช้หลายนิ้วจะไม่สั่งเดิน

## Run locally

From this directory: `python3 -m http.server 8000 --bind 127.0.0.1`.
Open the served page in a WebGL-capable browser. No backend or credentials required.

## GitHub Pages

Repository Settings → Pages → Build and deployment → Deploy from a branch →
`main` / `/ (root)` → Save. All runtime assets use relative paths, including
`vendor/three.module.min.js` (Three.js 0.170.0, MIT; license included).
The vendored module came from the official npm archive with its npm SHA-512
integrity verified. No third-party network requests are needed to play.
The ZIP is an older prototype archive; the root HTML and game.js are the current game.

## Browser regression checks

With Playwright installed and Chromium at `/usr/bin/chromium`, start the local
server and run `node tests/browser.cjs`. Set `GAME_URL` to test another deployment.
The test uses real Chromium touch events and WebGL software rendering, checks
world-space arrival, drag without movement, full rotation, WASD override,
mode persistence, cancellation and JavaScript errors. Test instrumentation is
injected into the browser response only and is not part of the production game.
