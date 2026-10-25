---
type: llm
---
PASS if the reply reads docs/design/DESIGN.md first, or runs the design-system init first when that file is missing.
PASS if the reply searches the Components, Layouts and Packages inventories and colour tokens before writing new UI, and prefers reuse over new components, colours or dependencies.
PASS if any new component, colour or dependency comes with a one-line justification.
PASS if, when http://localhost:3000 does not respond, the reply gives the start command and stops instead of starting the dev server.
FAIL if the reply starts the dev server itself.
FAIL if the reply edits docs/design/DESIGN.md other than through the design-system skill.
FAIL if any measured score is reported that did not come from verify.mjs output.
