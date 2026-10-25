---
max_turns: 12
allowed_tools: [Read, Write, Glob, Grep, Skill, Bash]
---
Set up a design system doc for this project from its Tailwind v4 theme.

src/styles/tokens.css:

```css
@import "tailwindcss";
@theme {
  --color-brand: #4f46e5;
  --color-surface: #ffffff;
  --radius-card: 12px;
}
```

src/components/Button.jsx:

```jsx
export function Button({ children }) {
  return <button className="rounded-card bg-brand px-4 py-2 text-white">{children}</button>;
}
```

package.json dependencies: react 18.3.1, chart.js 4.4.0, lucide-react 0.400.0.

Run `init`, then `audit`.
