# River v2 transparent layers

Generated 2026-08-24 with built-in ImageGen for the fixed side-view 2.5D battle pipeline.

Layers are independent alpha PNG originals, then `npm run generate:battle:biomes` resizes them to 2048×724 alpha WebP runtime files.

- `river-far-v2.png`: distant skyline and horizon
- `river-middle-v2.png`: suspension bridge and midground towers
- `river-near-v2.png`: close floodwall framing
- `river-ground-v2.png`: wet combat deck

No layer contains UI, characters, vehicles, or the mothership. Sky, cloud, and atmosphere remain separate existing layers.
