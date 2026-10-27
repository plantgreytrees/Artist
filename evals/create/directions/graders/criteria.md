---
type: llm
---
PASS if the reply reads docs/design/DESIGN.md (or runs the design-system init first when it is missing) and follows skills/create/references/directions.md.
PASS if the reply names the current design concept as one of the ten schools, cites DESIGN.md rows or code file:line as evidence, and presents it as a judgement, not a score.
PASS if directions.json holds Current plus 3 to 5 directions with distinct schools from the fixed ten, none equal to the current school, and at least one ambitious school (glassmorphism, retro-futurist or aurora).
PASS if the ambitious direction's brief covers contrast scrims, reduced-motion and reduced-transparency fallbacks, and the LCP budget.
PASS if the reply runs scripts/directions.mjs --directions <json> --project <dir> and gives the user the directions.html path.
PASS if the reply asks the user to paste the artist-pick v1 line and, once given, runs directions.mjs --resolve with that line unchanged.
PASS if the reply hands pick.json tokenDiff to the design-system skill's init step 8 to apply once to the current theme after the user accepts.
FAIL if the reply dispatches an Agent or Task to write directions, or sends a direction to the design critic for scoring.
FAIL if the reply edits docs/design/DESIGN.md or token files other than through the design-system skill.
FAIL if the reply reports a contrast ratio or any other number that did not come from directions.mjs or verify.mjs output.
