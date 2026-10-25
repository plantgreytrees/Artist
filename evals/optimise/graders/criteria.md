---
type: llm
---
PASS if the reply names verify.mjs (report.json) as the source of baseline and final scores.
PASS if the reply reads docs/design/DESIGN.md before changing code and does not edit it, proposing token or inventory changes instead.
PASS if fixes reuse existing components, colour tokens or installed packages before adding anything new.
PASS if, when the URL does not respond, the reply gives the start command and stops.
FAIL if the reply starts the dev server.
FAIL if scores come from MCP tools or an estimate rather than verify.mjs.
