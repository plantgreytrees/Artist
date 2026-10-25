---
format: 2
---
# Design

## Primitives
| name | value |
|---|---|
| green.700 | #1d6b4f |
| white | #ffffff |
| ink.900 | #111111 |
| space.1 | 4px |
| space.2 | 8px |
| space.4 | 16px |
| space.8 | 32px |

## Semantic tokens
| name | variable | primitive | use |
|---|---|---|---|
| color.action.primary | --color-action-primary | green.700 | primary actions |
| color.surface | --color-surface | white | page background |

## Themes
### Brand (default)
| token | light | dark |
|---|---|---|
| color.action.primary | #1d6b4f | #4fb98f |
| color.surface | #ffffff | #111111 |

## Type scale
| name | value | use |
|---|---|---|
| body | 16px | text |

## Spacing
| name | value | use |
|---|---|---|
| space.1 | 4px | tight |
| space.2 | 8px | gaps |
| space.4 | 16px | blocks |
| space.8 | 32px | sections |

## Motion
| name | value | use |
|---|---|---|
| motion.fast | 150ms | hover |
| motion.base | 300ms | entrances |
| motion.ease | cubic-bezier(0.2, 0, 0, 1) | default easing |

<!-- artist:inventory:start -->

## Components
| name | path | use |
|---|---|---|
| Button | src/components/Button.tsx | actions |

## Layouts
| name | path | use |
|---|---|---|
| RootShell | src/app/layout.tsx | parent shell of the pricing layout |

## Schemas
| name | path | kind | fields |
|---|---|---|---|

## Packages
| package | version | capability |
|---|---|---|
| chart.js | 4.4.0 | charts |
| lucide-react | 0.400.0 | icons |

<!-- artist:inventory:end -->

## Platform notes
- dev url: http://localhost:3000
- start: npm run dev
- token files: src/styles/tokens.css
