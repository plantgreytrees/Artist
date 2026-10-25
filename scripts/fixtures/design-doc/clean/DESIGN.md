---
format: 2
---

# Design system

## Primitives

| name | value |
| --- | --- |
| blue.600 | #2563eb |
| ink.900 | oklch(0.2 0.02 260) |
| bogus | not-a-colour |

## Semantic tokens

| name | variable | primitive | use |
| --- | --- | --- | --- |
| color.brand | --color-brand | blue.600 | brand surfaces |
| color.text | --color-text | ink.900 | body text |

## Themes

### acme

| token | light | dark |
| --- | --- | --- |
| color.brand | #2563eb | var(--color-brand-dark) |

## Type scale

| name | size | line | use |
| --- | --- | --- | --- |
| body | 1rem | 1.5 | body copy |

## Spacing

| name | value |
| --- | --- |
| space.4 | 16px |

## Motion

| name | value |
| --- | --- |
| ease.out | cubic-bezier(0.2, 0, 0, 1) |
| dur.fast | 150ms |

## Component tokens

| component | variable | semantic | use |
| --- | --- | --- | --- |
| Button | --button-bg | color.brand | background |

## Decisions

| id | decision | why | date | supersedes |
| --- | --- | --- | --- | --- |
| D1 | Use blue brand | Matches logo | 2026-01-01 | |
| D2 | Use deeper blue brand | Contrast | 2026-02-01 | D1 |

## Platform notes

- dev url: http://localhost:3000
