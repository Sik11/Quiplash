# Frontend Test Suite

This directory replaces the old single `test_observations/qa_harness.js` flow with smaller tests that map to the P1 checklist.

## Test Layers

- `integration/`: socket-level multiplayer checks that are easier to drive directly than through the browser
- `e2e/`: Playwright browser tests with traces, screenshots, and video recordings

## Commands

Use Node `20.x`. The repo includes `.nvmrc` files at the root and in `frontend/`.

Run from [`frontend/`](/Users/orasikiwellington/Library/Mobile%20Documents/com~apple~CloudDocs/University/3rd%20Year/Semester%201/COMP3207%20-%20Cloud%20Application%20Development/Coursework/Quiplash/frontend):

```bash
npm run test:integration
npm run test:e2e
```

For a headed local browser run:

```bash
npm run test:e2e:headed
```

## Visual Artifacts

Playwright writes artifacts to:

- `playwright-report/`: HTML report
- `test-results/`: traces, screenshots, and per-test attachments

To inspect a trace:

```bash
npx playwright show-trace test-results/<test-folder>/trace.zip
```

## Checklist Mapping

- `integration/checklist-room-flow.test.js`
  Covers room creation, room join, and room isolation
- `integration/checklist-reconnect-moderation.test.js`
  Covers reconnect grace-period recovery and moderation failures
- `integration/checklist-disconnect-admin.test.js`
  Covers admin reassignment and early-disconnect recovery back to the lobby
- `integration/checklist-gameplay-flow.test.js`
  Covers the three-round gameplay flow, scoring, game over, and return to lobby
- `integration/checklist-static-project.test.js`
  Covers static checklist items such as docs, `.gitignore`, production guards, and Procfiles
- `e2e/checklist-auth-room.spec.js`
  Covers auth-first flow, room creation, and invite-link targeting
- `e2e/checklist-display.spec.js`
  Covers room-aware `/display`
- `e2e/checklist-lobby-errors.spec.js`
  Covers copy-link flow, lobby live updates, audience joins, and invalid room/display errors
- `e2e/checklist-responsive.spec.js`
  Covers mobile auth and room-entry usability

## Notes

- The integration tests need access to the live frontend Socket.IO server.
- The browser tests use Playwright with the locally installed Chrome channel by default.
- Playwright is configured to keep traces for all tests, including passing ones.
- Playwright runs with `workers: 1` because the local backend uses TinyDB and concurrent browser workers can corrupt the shared local database during repeated auth flows.
- Some checklist items still require manual validation in a real deployment, such as Render cold starts and cross-device touch ergonomics.
