# Reference-guided character review prototypes

These are actual original 3D drafts authored from the single user-supplied
Male_Base_V1 / Female_Base_V1 Character Reference Sheet. They are not a claim of
exact likeness, approved production art, or a replacement for the Neo avatar.

Open `character-preview.html` on the same static server as the game. The preview
imports no game runtime and changes no save data, map, control, collider or portal.
Its link back to the game opens the existing Neo Gear City character.

## Included assets

- `generated/Male_Base_V1.glb`: male base, bare torso, blue tied shorts and blue
  flip-flops, brown layered hair and brown eyes.
- `generated/Female_Base_V1.glb`: female base, white fitted tank, blue tied shorts
  and flip-flops, brown high ponytail and brown eyes.
- `generated/Character_Bases_Review.blend`: editable paired source scene.
- `generated/manifest.json`: draft identity and source geometry statistics.
- `generated/asset-audit.json`: checks measured from actual GLB buffers, bind-pose
  transforms, vertex weights, materials and animation channels.

Both assets use the same 20-bone hierarchy and bind joint positions. Each mesh is
skinned, including the separate finger meshes and rigidly weighted hair/face
parts. The mesh and bone names remain distinct for reliable animation binding.
The skull-top height is 3.0 game units with the soles at 0; protruding hair is
excluded. The head itself measures about one third of that height.

Six real skeletal clips are included: Idle, Walk, Run, Attack, Hit and Death.
Walk/Run have no horizontal actor-root travel. The preview blends clips and
supports pose inspection, pause, speed, wireframe and skeleton display. It uses
front/left/back/right turntable views for each figure so paired profiles stay
side-by-side. Drag orbit and pinch/wheel zoom are also available.

The base preview starts without weapon, armor, hat or accessories. Its optional
right-hand sword, left-hand shield and chest-armor demonstrations use separate
mesh instances attached to the named bones. Clearing them restores the same
base body. These demonstrations do not yet implement the full in-game modular
inventory/clothing system.

## Known review limitations

Facial likeness, eye styling, hair detail and anatomy are approximations requiring
user review against the master sheet. The authoring/render review corrected the
first draft's protruding eyes, shoulder gaps, separated chest surfaces and shorts
coverage; that does not establish approval of likeness. No alternate reference
images or commercial game files were used.

The two full-detail drafts contain approximately 49k and 58k triangles with 15 PBR
materials each. They use smooth normals and no external image/service requests.
Texture atlasing and additional LODs are future optimization work after the art
shape is approved. Software-rendered browser timing is not a phone-GPU benchmark.

The new models have **not** been mounted in Neo, and the production avatar is
unchanged. Integration into Neo, the complete 12-slot equipment system and
physical-phone validation remain later gates after visual review.

## Rebuild and test

Use the installed Blender 4.3.2 from the repository root:

```sh
blender --background --threads 3 --python scripts/build_character_models.py
python3 tests/character_asset_audit.py
```

The generator imports the shared real rig from `scripts/character_rig.py`, exports
the GLBs and writes the editable source. No new runtime dependencies are needed.
The standalone viewer uses the existing pinned Three.js 0.170.0 and vendored
matching GLTFLoader/BufferGeometryUtils under the included Three.js MIT license.
The official npm archive was verified against its published SHA-512 integrity.

With the static server running in another session:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
node tests/character-preview.cjs
node tests/browser.cjs
node tests/city.cjs
```

The preview tests inspect actual loaded geometry, skinning and bone movement.
They also project actual skinned mesh vertices to validate view framing; box
corners alone can falsely report cropping of empty space. Set `GAME_URL` to the
published site's base URL for the deployed tests. Reports and screenshots go to
`/tmp/character-preview-*`; test-only globals are never part of the shipped page.
