# Character reference-review drafts

These are **actual skinned 3D models for visual review**, generated in Blender
4.3.2 from `scripts/build_character_models.py` and `scripts/character_rig.py`.
The sole art reference is the Male_Base_V1 / Female_Base_V1 sheet supplied by the
user in this task. No third-party game model, texture or alternate character
reference was used. Meshes, curves, materials and animation are original.

This is an approximation for review. It is not a claim of exact facial, hair or
anatomical likeness to the sheet, and it is not approval to replace the live Neo
avatar. Fine facial sculpt, hair strand flow and material painting remain visual
review items. The Neo player remains unchanged while this draft is reviewed.

- `Male_Base_V1.glb`: shirtless male, brown layered hair, blue shorts with white
  drawstring and hem, blue thong sandals.
- `Female_Base_V1.glb`: female, brown high ponytail, white fitted tank, matching
  shorts and sandals.
- `Character_Bases_Review.blend`: editable paired scene; male/female are offset
  only in this comparison file. Each GLB was exported individually at origin.
- `manifest.json`: generated technical measurements and relative asset filenames.

Both have a real Blender armature exported as glTF skin, named shared bones,
10 individually modeled fingers, separate visible body/clothing/hair parts and
six clips: Idle, Walk, Run, Attack, Hit, Death. Skin and clothing use smooth custom
lofted surfaces; hair uses curved tapered locks. These are not 2D character cards.
PBR base colors and roughness are embedded; no remote texture dependencies.

Coordinates: Blender Z-up, facing -Y; GLB Y-up facing +Z. Skull top is 3.0 units,
chin 2.0, sole bottom 0.0. Hair protrudes above 3.0 and must be excluded from the
body-height comparison. Required metadata: anatomical head has `role: skull`,
`part: Head`; hair has `role: hair`, `part: Hair`. Mesh nodes have Male_Mesh_ /
Female_Mesh_ prefixes so their names cannot collide with rig bones.

Rebuild from the repository root:

```sh
blender --background --python-exit-code 1 --threads 4 --python scripts/build_character_models.py
```

No Draco compression is required. Blender may print a missing optional Draco
library message, but uncompressed GLB export is used and must be validated by
loading the actual output. Files should be assessed in the Character Preview
and with the project's rig/height/animation tests before visual approval.
