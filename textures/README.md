# Textures

PBR texture sets from [Poly Haven](https://polyhaven.com), released under
**CC0** (public domain, no attribution required — credited here anyway).
Each set has `diff` (colour), `nor` (OpenGL normal) and `arm` (ambient
occlusion / roughness / metalness) maps, re-encoded as JPEG at two sizes:
`1k` for desktops and `512` for phones.

| Folder | Poly Haven asset | Real-world size | Authors |
|---|---|---|---|
| `marble/` | [marble_01](https://polyhaven.com/a/marble_01) | 1.5 m | Rob Tuytel |
| `plaster/` | [beige_wall_001](https://polyhaven.com/a/beige_wall_001) | 3 m | Dimitrios Savva, Rico Cilliers |
| `wood/` | [lacquered_cherry_wood](https://polyhaven.com/a/lacquered_cherry_wood) | 1 m | Jenelle van Heerden, Rico Cilliers |

The real-world size is used in `js/scene.js` to tile each texture at true scale.
The brushed-bronze grain is generated in code, not loaded.
