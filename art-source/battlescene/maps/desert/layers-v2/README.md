# Desert v2 transparent layers

Generated 2026-08-24 with built-in ImageGen for the fixed side-view 2.5D battle pipeline.

Layers are independent alpha PNG originals, then `npm run generate:battle:biomes` resizes them to 2048×724 alpha WebP runtime files.

- `desert-far-v2.png`: mountains and far research skyline
- `desert-middle-v2.png`: refinery and solar research structures
- `desert-near-v2.png`: close bastion framing
- `desert-ground-v2.png`: sun-baked combat deck

No layer contains UI, characters, vehicles, or the mothership. Sky, cloud, and atmosphere remain separate existing layers.
