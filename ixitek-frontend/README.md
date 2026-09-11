# Ixitek Solutions — Frontend

A premium, professional B2B frontend reimagining [ixitek.in](https://ixitek.in/), built from scratch
with a modern white + blue design system. This is a **frontend-only** project: there is no backend,
database, authentication, or payment integration. All product/company data is static (see `src/data/`)
and all forms are mocked (they validate and show a success state, but do not call an API).

## Stack

- **React 19** + **Vite** — app shell and build tooling
- **Tailwind CSS v4** — utility-first styling, configured via `@theme` in `src/index.css`
- **React Router v7** — client-side routing
- **Framer Motion** — scroll reveals, page transitions, micro-interactions
- **lucide-react** — icon set
- **@fontsource/inter** + **@fontsource/plus-jakarta-sans** — self-hosted variable fonts (no external font requests)

## Getting started

```bash
npm install
npm run dev       # start the dev server (http://localhost:5173)
npm run build     # production build -> dist/
npm run preview   # preview the production build locally
npm run lint      # oxlint
```

## Project structure

```
src/
  components/
    layout/     Header, mega menu, mobile nav, footer, breadcrumbs, page transitions
    ui/         Buttons, section headings, cards, form fields, counters, the ProductVisual panel
    sections/   Homepage sections (hero, partners strip, process, CTA, etc.)
    product/    Product-catalogue specific building blocks (cards, gallery, spec table, filters)
    forms/      The reusable enquiry/contact form
  data/         Static content: company info, navigation, partners, and the full product catalogue
  pages/        Route-level page components
  lib/icons.jsx Central icon lookup used by the <Icon name="..." /> helper
```

## Routes

| Path | Page |
| --- | --- |
| `/` | Home |
| `/company` | About / Company |
| `/partners` | Partners & clients |
| `/products` | Full catalogue with search & category filters |
| `/products/:categorySlug` | Category page (Fiber Optics, Network / T&M, Data Centre Infrastructure, Enterprise Solutions) |
| `/products/:categorySlug/:familySlug` | Product family detail page (specs, variants, gallery, enquiry) |
| `/contact` (alias `/enquiry`) | Contact & enquiry form |

## Content & imagery notes

Product copy, categories, and specifications were sourced from the public pages of ixitek.in and
rewritten for this new design. The build environment this project was created in does not have
general internet/image-fetching access, so instead of stock photography the catalogue uses a
custom-designed `ProductVisual` component (gradient panel + line art + Lucide icon) as a consistent,
premium stand-in for product photography across every card, gallery, and detail page.

**To swap in real product photography:** replace the `<ProductVisual icon="..." />` usage in
`src/components/product/FamilyCard.jsx`, `src/components/product/ProductGallery.jsx`, and
`src/components/sections/ProductCategoryGrid.jsx` with an `<img>` pointing at your asset, keeping the
same rounded-corner/overlay container classes. Likely source images (from the original site) are
referenced in code comments where relevant.

## Editing the catalogue

All products, categories, specs and variants live in `src/data/products.js` as plain JS objects —
no CMS or backend required. Add a new product family by adding an object to the `families` array with
a unique `slug` + matching `categorySlug`; it will automatically appear in the category page, the
products hub, search/filter results, and get a working detail route.
