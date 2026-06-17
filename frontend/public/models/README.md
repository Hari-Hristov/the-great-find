# 3D Model Assets

Drop GLB files here to replace the procedural placeholder geometry.

The app checks for these paths at runtime — if a file is missing it falls back to the
built-in low-poly geometry automatically. No code changes needed.

## Expected files

| File | Device | Source |
|---|---|---|
| `3ds.glb` | Nintendo 3DS / DS Lite | https://sketchfab.com/3d-models/nintendo-ds-lite-ca529eb7208746e89b7a28fd2246659d |
| `switch.glb` | Nintendo Switch (handheld) | https://sketchfab.com/3d-models/nintendo-switch-b8e8670918944c6398174e90c129b926 |
| `steam-deck.glb` | Steam Deck | https://sketchfab.com/3d-models/steam-deck-console-46e0c05675a7442dbe73f261436e6819 |

All three are CC-BY 4.0 — free for commercial use with attribution.

## Attribution (required by CC-BY 4.0)

- Nintendo DS Lite — Cianon on Sketchfab
- Nintendo Switch — Bjarne Stokhof (stokhuis) on Sketchfab
- Steam Deck console — wallmasterr on Sketchfab

## Notes

- Sketchfab requires a free account to download. Export as GLB when downloading.
- The Steam Deck model is ~47k tris. If it's too heavy, look for a lower-poly alternative.
- Scale is currently 1.0 — adjust the `scale` prop in `Consoles.tsx` per-model if proportions are off.
