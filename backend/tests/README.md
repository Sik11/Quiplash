# Backend Tests

These tests cover the Python HTTP endpoints and shared validation logic.

## Current State

- The legacy backend tests in this directory are `unittest`-based.
- Several older files were originally written against deployed Azure endpoints and Cosmos-backed settings.
- New local-first tests have been added for the Flask/TinyDB development server:
  - `test_local_server_endpoints.py`
  - `test_local_server_config.py`

## Run

From [`backend/`](/Users/orasikiwellington/Library/Mobile%20Documents/com~apple~CloudDocs/University/3rd%20Year/Semester%201/COMP3207%20-%20Cloud%20Application%20Development/Coursework/Quiplash/backend):

```bash
./.venv/bin/python -m unittest tests.test_local_server_endpoints tests.test_local_server_config
```

## Recommended Next Refactor

- Move endpoint URLs behind environment variables so local and deployed targets are both testable
- Replace live-cloud assumptions with local Flask-server fixtures where possible
- Split stateful API tests from pure validation tests so failures are easier to localize
