# Category Cover Images

These are the 4 top-level category "cover" images — used on:
- the homepage category grid (4 cards), and
- the category page hero banner (e.g. /products/fiber-optics)

Drop one image per category into this folder with the exact filename below.
If a file is missing, that category falls back to the existing icon/gradient
artwork automatically — nothing breaks.

| Filename                              | Category                     |
|-----------------------------------------|-------------------------------|
| fiber-optics.jpg                        | Fiber Optics                  |
| network-tm.jpg                          | Network / T&M                 |
| data-centre-infrastructure.jpg          | Data Centre Infrastructure    |
| enterprise-solutions.jpg                | Enterprise Solutions          |

## Tips
- Use `.jpg` to match the paths above (or edit the `image:` path in
  `src/data/products.js` for `.png` / `.webp`).
- These render both as a small card thumbnail (4:3-ish) and a larger square
  hero image, so a photo with a fairly centered subject works best.
- Recommended: at least 1200×1200px, under ~300KB.
- Filenames must match exactly (all lowercase, hyphens, no spaces).
