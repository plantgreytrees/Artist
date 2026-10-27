---
format: 2
---

# Design system

## Primitives

| name | value |
| --- | --- |
| white | #ffffff |
| ink.900 | #111827 |

## Semantic tokens

| name | variable | primitive | use |
| --- | --- | --- | --- |
| color.background | --color-background | white | page background |
| color.surface | --color-surface | white | cards |
| color.text | --color-text | ink.900 | body text |
| color.text-muted | --color-text-muted | ink.900 | secondary text |
| color.link | --color-link | ink.900 | links |
| color.accent | --color-accent | ink.900 | accent and accent text |

## Themes

### default

| token | light | dark |
| --- | --- | --- |
| color.background | #ffffff | #0b0f19 |
| color.surface | #f3f4f6 | #161b26 |
| color.text | #111827 | #f9fafb |
| color.text-muted | #4b5563 | #c3c8d2 |
| color.link | #1d4ed8 | #93b4ff |
| color.accent | #1d4ed8 | #93b4ff |

## Type scale

| name | size | line | use |
| --- | --- | --- | --- |
| body | 1rem | 1.5 | body copy |
| heading | 1.5rem | 1.25 | headings |

## Spacing

| name | value |
| --- | --- |
| space.2 | 8px |
| space.4 | 16px |
| radius.md | 8px |

## Motion

| name | value |
| --- | --- |
| dur.fast | 150ms |
| ease.out | cubic-bezier(0.2, 0, 0, 1) |

## Component tokens

| component | variable | semantic | use |
| --- | --- | --- | --- |
| Button | --button-bg | color.accent | background |
| Card | --card-padding | space.4 | padding |

## Platform notes

- token files: `src/tokens.css`
