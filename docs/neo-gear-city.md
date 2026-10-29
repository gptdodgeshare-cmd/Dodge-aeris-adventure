# Neo Gear City

Playable original fantasy-technology city, built on the existing Dodge Aeris
Adventure prototype. No external game assets, new project, backend or paid API.

## Included locations

- Central gathering plaza, player spawn and animated energy fountain.
- Aether Spire energy tower with rotating gears and exposed reactor.
- Clockwork Works factory, conveyor and animated worker robot.
- Cybernetic Institute and accessible open-front laboratory with experiment pods.
- Weapon, equipment and item markets with three separate merchants.
- Enterable energy portal linking Neo Gear City and an original **Elim arrival
  quarter**, with a return portal. This is a small playable counterpart, not a
  recreation of a full commercial-game Elim map.
- Southern gate into the Gearwaste, a ruined factory, mechanical desert and
  wandering clockwork monsters. Monsters currently provide ambient movement;
  combat and enemy damage are not implemented.

## Character and controls preserved

The original torso, head, hair, arms, legs, proportions and limb-pivot animation
remain unchanged. The original prototype has Group-based limb joints rather than
an imported skinned skeleton; that working rig is preserved. Separate head, body,
left-hand and right-hand equipment attachment groups support independently worn
items. Purchased sword and armor attach to those groups without replacing the
avatar. WASD, free/fixed/follow cameras, drag orbit and wheel zoom remain.

Touch taps issue a ground-plane destination on release. Drag gestures and
multi-touch cannot issue walk commands. Two-finger movement orbits and pinching
zooms. Losing focus or cancelling a pointer clears held input.

## Navigation and maps

`navigation.js` expands static obstacles by a 0.9-unit avatar radius (covering the original shoulders and swinging arms), constrains the avatar
to map bounds, and uses swept collision for keyboard motion. Tap movement uses
A* paths with collision-safe smoothing and exact destinations. Buildings, fountain,
walls, gate towers, counters, trees and NPC footprints have collision boxes.
Unreachable, obstructed and out-of-bounds targets are rejected.

`maps/neo-gear.js` and `maps/elim.js` build separate Three.js scenes. The relevant
module is imported when requested; only the active map's geometry, labels,
materials, textures and shadow maps remain rendered. Map switching moves the
same avatar to the new scene, disposes the old map resources, clears input/path
state and uses a short portal cooldown to avoid accidental immediate return.
`maps/world-kit.js` builds the original procedural assets and batches static
primitives using instancing. No map/character assets are fetched from a CDN.

A small minimap shows buildings, NPCs, portals, the target and player position.

## NPCs and local progression

No dialogue or shop system existed in the previous prototype. The new shared
interaction panel supports guide, class, weapon, equipment, item and warp NPCs.
Walk within range, use the interaction button or press E. Change to Cyborg or
Inventor without a fee. Purchases spend **in-game credits only**; no real payment.
The avatar starts with 200 credits. Profession, inventory and credits persist in
this browser using `dodge-adventure-save-v1`. These are single-player local saves,
not a server-backed account or multiplayer economy. Clearing site data resets them.

## Performance and verification

Mobile view caps pixel ratio at 1, uses a 512px shadow map and disables MSAA;
desktop caps pixel ratio at 1.5 with a 1024px shadow map. Only one directional
shadow light is used. Shared primitives and instancing reduce draw calls.

Run from the checkout:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
node tests/navigation.cjs
node tests/browser.cjs
node tests/city.cjs
```

The server must stay running in a separate session. Tests use the installed
Playwright and `/usr/bin/chromium`. For deployed checks, set `GAME_URL` to the
GitHub Pages URL; remote browser and test requests use the configured HTTPS proxy.
Test-only response instrumentation inspects actual runtime movement; production
exposes no debug globals. Screenshots and the detailed city test report are saved
under `/tmp/neo-gear-*`. Software-rendered test FPS is recorded separately from
render workload; it is not a physical mobile GPU measurement.

