# Asset Format

## Runtime contract

Runtime building assets live under `public/assets/buildings/<building-id>/`.

Each building keeps one atlas and six face textures:

```text
<building-id>/
├─ atlas.webp
├─ back.webp
├─ bottom.webp
├─ front.webp
├─ left.webp
├─ manifest.json
├─ right.webp
└─ roof.webp
```

The editor resolves textures by building ID, so a selected building never falls back to `building-001` assets. Source PNGs remain under `art-source/buildings/<building-id>/`; `scripts/build-building-assets.mjs` converts the source set into runtime WebP assets.

## Mapping preset

| Face | Physical side | Default texture | UV rotation |
| --- | --- | --- | ---: |
| `F-01` | front | `front.webp` | 0° |
| `B-02` | back | `back.webp` | 0° |
| `R-03` | right | `right.webp` | 0° |
| `L-04` | left | `left.webp` | -90° |
| `T-05` | roof | `roof.webp` | 0° |
| `D-06` | bottom | `bottom.webp` | 0° |

Projects are saved separately as `*.project.json`, following the schema in `src/domain/projectSchema.ts`. GLB exports are generated in the browser through Babylon.js serializers and contain the building shell plus the six textured mapping panels.

## External GLB persistence

When a user imports an external `.glb`, the binary file is stored in the browser's IndexedDB asset store. The project JSON keeps only the persistent asset key and original file name, so a browser refresh can restore the model without embedding a Blob URL in the project document. The browser storage must remain available for this restore path to work.

## Babylon.js Editor package metadata

The `PACKAGE` action creates `*.babylon-editor-package.json`. It records the target Babylon.js Editor, meter/Y-axis conventions, project file identity, exported GLB file name, and the mapper project settings. The metadata is intentionally separate from the GLB binary; a single ZIP/asset bundle is not part of the current runtime export contract.
