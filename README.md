# Quiplash

A multiplayer party game built for COMP3207 with live room-based sessions, real-time chat, prompt writing, answer voting, and shared scoreboards.

## Architecture

| Tier | Stack | Cloud |
|------|-------|-------|
| **Frontend** | Node.js, Express, Socket.IO, Vue.js, EJS | Google Cloud App Engine / local Node server |
| **Backend** | Python, Azure Functions-compatible HTTP endpoints, Flask local server, TinyDB for local dev | Azure / local Python server |

The frontend serves the player UI, room-aware display UI, and the Socket.IO room state. The backend handles registration, login, prompt storage, and leaderboard data.

## Structure

```text
Quiplash/
├── frontend/    # Express server, Socket.IO, EJS templates, Vue.js client logic
├── backend/     # Azure Functions HTTP endpoints + local Flask server + tests
├── test_observations/  # QA summaries and exploratory test outputs
└── archive/     # Previous coursework submissions
```

## Running Locally

The frontend is now pinned to Node `20.x`. If you use `nvm`, run `nvm use` from the repo root or from `frontend/`.

The simplest local workflow is to start the backend first, then the frontend.

### Backend

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

The local backend runs on `http://localhost:8181` by default.

### Frontend

```bash
cd frontend
npm install
BACKEND=http://localhost:8181 npm start
```

If `BACKEND` is not set locally, the frontend defaults to `http://localhost:8181`.

### One-Command Local Startup

```bash
./start.sh
```

This starts both services, waits for the backend to respond, and prints host/join URLs for the room-based flow.

## Testing

### Frontend Integration Tests

```bash
cd frontend
npm run test:integration
```

These tests drive Socket.IO clients directly for multiplayer state checks such as room isolation, reconnect handling, and moderation.

### Frontend End-To-End Tests

```bash
cd frontend
npm run test:e2e
```

Playwright writes traces and screenshots to `frontend/test-results/` and the HTML report to `frontend/playwright-report/`.

### Backend Tests

```bash
cd backend
./.venv/bin/python -m unittest tests.test_local_server_endpoints tests.test_local_server_config
```

The backend directory still contains some legacy Azure-era tests, but the local-first automated coverage is the `test_local_server_endpoints` and `test_local_server_config` pair above.

## Environment Variables

### Frontend

```bash
BACKEND=http://localhost:8181
JOIN_URL=http://localhost:8080
AUTO_SHUTDOWN_IF_IDLE=0
```

In production, `BACKEND` should point to the deployed backend URL rather than `localhost`.

### Backend

```bash
PORT=8181
```

## Game Flow

1. A player logs in or registers.
2. They start a new room or join an existing room code.
3. The room host starts the game once enough players are present.
4. Players submit prompts, answer assigned prompts, and vote on responses.
5. Scores update live for the room and its display view.
6. At game over, the host can return the room to the lobby.

## Room Support

- Each session is tied to a unique room code.
- Multiple rooms can run independently at the same time.
- `/display` is room-aware and can target a specific room with `/display?room=CODE`.
- If a player disconnects briefly, the server keeps their slot for a short reconnect grace period and attempts to restore them to the same room.

## Deployment

- **Frontend**: `gcloud app deploy` (see `frontend/app.yaml`)
- **Backend**: Deploy via Azure Functions CLI or Azure Portal
- **Production note**: set `BACKEND` on the frontend service to the deployed backend URL.

## Known Limitations

- Room and game state are held in server memory per process. This is suitable for demos, but it is not yet designed for multi-instance sync or full production scaling.
- Reconnect handling is improved for short-lived disconnects, but it is still aimed at demo reliability rather than hardened production-grade session recovery.
- Prompt and chat validation includes basic length checks and a lightweight moderation filter, but it is not a full moderation system.
- Cold starts on deployed infrastructure may still affect responsiveness depending on hosting behavior.
