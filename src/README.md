# Source layout rules

## Pages

Every page lives in its own folder named after the feature, and the route entry file is
`<Feature>Page.tsx`:

```text
src/pages/Cars/
├── CarsPage.tsx          <- route entry, exported as `CarsPage`
└── components/           <- pieces only this page renders
    └── VehicleFilterBar.tsx
```

Rules:

- No loose page files. `src/pages/CarsPage.tsx` is wrong; `src/pages/Cars/CarsPage.tsx` is right.
- The entry file name and the exported component name match the route: `Home/HomePage.tsx`
  exports `HomePage`, `Cars/CarsPage.tsx` exports `CarsPage`.
- Only add `components/` when the page actually has page-specific pieces. A page with no
  local pieces is a single file inside its folder.
- A page folder never holds a second copy of a page. If an older version exists, delete it —
  the router in `src/app/App.tsx` is the single source of truth for what is reachable.
- Shared chrome has exactly one implementation. The footer lives only in
  `src/components/common/Footer/Footer.tsx` and the site header only in
  `src/app/components/Navbar/Navbar.tsx`; pages import them instead of keeping a private copy.

## Where the rest goes

| Code | Location |
| --- | --- |
| Route table | `src/app/App.tsx` (the only router) |
| Public page chrome | `src/app/layouts/SiteLayout.tsx` (header + outlet + footer) |
| Admin console chrome | `src/app/layouts/AdminLayout.tsx` (admin guard + chat provider) |
| Not-found page | `src/pages/NotFound/NotFoundPage.tsx`, rendered by `path="*"` |
| Page-specific components | `src/pages/<Feature>/components/` |
| Reusable domain code (hooks, services, components, types) | `src/features/<feature>/` |
| Design-system primitives (button, input, card, dialog…) | `src/components/ui/` |
| Shared chrome (navbar, footer) | `src/components/common/` (single implementation) |
| Page chrome used by one page only | `src/app/components/<Name>/` |
| Layouts and app-level providers | `src/app/layouts/`, `src/app/providers/` |
| Global styles and design tokens | `src/styles/` |
| Component styles | colocated `<Component>.css` next to the component |

`src/main.tsx` imports `src/styles/index.css`, which imports `fonts.css`, `tailwind.css` and
`theme.css`. Nothing else in `src/styles/` is loaded globally.
