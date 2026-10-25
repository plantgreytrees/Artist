# Rubric

Eight fixed dimensions, each scored 1 to 5 as a whole number. Score only what the screenshots and `report.json` show. A 1 or 3 sits between the anchors below.

## Hierarchy
- 2: Several elements compete for attention; the primary action or heading is not obvious.
- 4: One clear focal point per view; size, weight and position rank the content correctly.
- 5: The eye path is effortless at every width; secondary and tertiary content step back deliberately.

## Typography
- 2: Default or mismatched fonts, uneven sizes, line length or leading hard to read.
- 4: Type follows the DESIGN.md scale, comfortable line length and leading, clear weight contrast.
- 5: Type carries the personality; pairing, scale and rhythm are refined and consistent everywhere.

## Spacing & rhythm
- 2: Arbitrary gaps, cramped or sprawling groups, misaligned edges.
- 4: Spacing follows the DESIGN.md scale; related items group clearly and edges align.
- 5: A visible vertical and horizontal rhythm; whitespace is used deliberately to pace the page.

## Colour & contrast
- 2: Off-palette colours, weak text contrast, colour as the only signal.
- 4: Colours come from DESIGN.md tokens, text contrast is sound, accents are used sparingly.
- 5: A cohesive palette with purposeful accent use; contrast is strong in light and dark, and state is never colour alone.

## Distinctiveness
- 2: Generic template look; interchangeable with any default kit.
- 4: A recognisable point of view in at least layout, type or colour, within the design system.
- 5: Memorable and specific to the product; details feel authored, not assembled.

## Responsiveness
- 2: Overflow, clipped content or broken layout at one or more widths.
- 4: Layout adapts cleanly at every captured width; touch targets and reading widths hold.
- 5: Each width feels designed for itself, not merely reflowed.

## Accessibility
- 2: Visible focus missing, poor semantics or labels, axe serious or critical issues in the report.
- 4: Axe serious and critical are 0, focus is visible, semantics and labels are sound.
- 5: As 4, plus considerate details: logical reading order, reduced-motion respect, clear error and state messaging.

## Motion
- 2: Motion is absent where feedback is needed, or distracting and gratuitous.
- 4: Transitions are purposeful, follow the DESIGN.md Motion section, and are short.
- 5: Motion clarifies state and adds character, with a reduced-motion alternative. If screenshots cannot show motion, judge from the DESIGN.md Motion section and the code described in it, and say so in the reason.

**Output format**

Reply with exactly 8 lines, in this order, and nothing else:

```
Hierarchy: <1-5> — <one-line reason>
Typography: <1-5> — <one-line reason>
Spacing & rhythm: <1-5> — <one-line reason>
Colour & contrast: <1-5> — <one-line reason>
Distinctiveness: <1-5> — <one-line reason>
Responsiveness: <1-5> — <one-line reason>
Accessibility: <1-5> — <one-line reason>
Motion: <1-5> — <one-line reason>
```

Never state a measurement (contrast ratio, pixel size, LCP) that is not in `report.json`.
