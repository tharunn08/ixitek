# Product Images

Drop one image per product family into this folder using the exact filenames
below (the code in `src/data/products.js` already points to these paths).

If a file is missing, that product automatically falls back to the existing
icon/gradient artwork — nothing will break, it just won't show a photo yet.

| Filename                                  | Product family              |
|--------------------------------------------|------------------------------|
| transceivers-aoc-dac.jpg                    | Transceivers & AOC/DAC       |
| patch-cords.jpg                             | Fiber Optic Patch Cords      |
| connectors.jpg                              | Connectors                   |
| adapters.jpg                                | Fiber Optic Adapters         |
| cables.jpg                                  | Cables                       |
| pigtails.jpg                                | Pigtails                     |
| attenuators.jpg                             | Attenuators                  |
| traffic-generators.jpg                      | Traffic Generators           |
| network-components-cables.jpg               | Network Components & Cables  |
| optical-switches.jpg                        | Optical Switches             |
| data-center-build-solutions.jpg             | Data Center Build Solutions  |
| racks.jpg                                   | Racks                        |
| pdus.jpg                                    | PDUs                         |
| it-staff-augmentation.jpg                   | IT Staff Augmentation        |

## Tips
- Use `.jpg` to match the paths above, or update the `image:` path in
  `src/data/products.js` if you prefer `.png` / `.webp`.
- Recommended: roughly 4:3 aspect ratio (e.g. 1200×900px), under ~300KB each,
  so the product cards and gallery crop nicely without needing extra code changes.
- Filenames must match exactly (all lowercase, hyphens, no spaces).
