---
type: llm
---
PASS if the reply uses scripts/verify.mjs for any score it reports, and reads report.json.
PASS if, when the URL does not respond, the reply tells the user the start command (the dev script or the start entry in DESIGN.md) and stops.
FAIL if the reply starts the dev server.
FAIL if the reply reports axe counts, LCP or CLS that did not come from verify.mjs output.
FAIL if the reply passes --allow-remote for a loopback URL.
