---
format: 1
---

# Design system

Written only by the `design-system` skill. `reuse-check.mjs` parses the tables below, so keep the headers exactly as shown.

## Tokens

Colour scheme (light and dark), radii and other named values. Dotted names.

| name | value | use |
| --- | --- | --- |
| color.brand.primary | #2563eb | primary actions, links (light) |
| color.brand.primary.dark | #60a5fa | primary actions, links (dark) |
| color.surface | #ffffff | page background (light) |
| color.surface.dark | #0b0f19 | page background (dark) |
| color.text | #111827 | body text (light) |
| color.text.dark | #f3f4f6 | body text (dark) |
| radius.card | 12px | cards and panels |

## Type scale

| name | value | use |
| --- | --- | --- |
| font.family.body | system-ui, sans-serif | body copy |
| font.size.base | 16px | body |
| font.size.h1 | 2.25rem | page title |

## Spacing

| name | value | use |
| --- | --- | --- |
| space.1 | 4px | tight gaps |
| space.2 | 8px | inline gaps |
| space.4 | 16px | default padding |
| space.8 | 32px | section gaps |

## Components

| name | path | use |
| --- | --- | --- |
| Button | src/components/Button.tsx | primary and secondary actions |

## Layouts

| name | path | use |
| --- | --- | --- |
| RootLayout | src/app/layout.tsx | page shell: header, main, footer |

## Packages

Every dependency from every package.json (all workspaces). Tag UI-relevant ones: charts, icons, ui-kit, animation, dates, forms, state. Leave the capability cell empty for the rest.

| package | version | capability |
| --- | --- | --- |
| react | 18.3.1 |  |
| chart.js | 4.4.3 | charts |

## Motion

| name | value | use |
| --- | --- | --- |
| motion.duration.fast | 150ms | hover and focus feedback |
| motion.easing.standard | cubic-bezier(0.2, 0, 0, 1) | default transitions |

Respect `prefers-reduced-motion`.

## Platform notes

- dev url: http://localhost:3000
- start: npm run dev
- platform: web
