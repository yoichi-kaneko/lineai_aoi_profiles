---
name: record-start
description: Start a daily record flow and return normalized parameters.
---

# Record Start Skill

## Overview
`record-start` is a minimal Gallery-compatible skill scaffold.
It receives parameters from the model and returns a normalized payload.

## Instructions
Call the `run_js` tool with the following parameters:

- script name: `index.html`
- data: A JSON string with optional fields:
  - `date`: string (`YYYY-MM-DD`)
  - `source`: string (for example: `manual`, `calendar`, `voice`)

## Expected behavior
- Parse incoming JSON safely.
- Return a stringified JSON object:
  - On success: `{ "result": "..." }`
  - On error: `{ "error": "..." }`
