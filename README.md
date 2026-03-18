# Quiplash

A real-time multiplayer party game where players compete by writing funny answers to prompts and voting on each other's responses.

![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.x-3776AB?logo=python&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socket.io&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.x-000000?logo=flask&logoColor=white)
![Playwright](https://img.shields.io/badge/Tested%20with-Playwright-45ba4b?logo=playwright&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Overview

Players join a room using a 5-character code, write responses to shared prompts, and then vote on everyone's answers. Points are awarded based on votes received. Multiple rooms run independently with full real-time state via Socket.IO.

**Key features:**
- Room-based sessions with unique join codes
- Real-time multiplayer via Socket.IO (prompts, answers, votes, scores)
- Spectator/display mode for projecting the game on a screen
- In-game chat with lightweight moderation
- Player registration, login, and persistent leaderboard
- Reconnect handling for short-lived disconnects

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│         Vue.js + Socket.IO client (game.js)             │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP + WebSocket
┌──────────────────────▼──────────────────────────────────┐
│               Frontend (Node.js / Express)              │
│   Socket.IO server, EJS templates, room state manager   │
│              Runs on port 8080 (default)                │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP (REST)
┌──────────────────────▼──────────────────────────────────┐
│                Backend (Python / Flask)                 │
│   Auth, prompts, leaderboard, TinyDB (local JSON DB)    │
│              Runs on port 8181 (default)                │
└─────────────────────────────────────────────────────────┘
```

| Tier | Stack | Deployment target |
|------|-------|-------------------|
| Frontend | Node.js, Express, Socket.IO, EJS, Vue.js | Google Cloud App Engine / Render |
| Backend | Python, Flask, TinyDB | Azure Functions-compatible / Render |

## Repo Structure

```
Quiplash/
├── frontend/
│   ├── app.js              # Express + Socket.IO server, room and game logic
│   ├── views/              # EJS templates (login, lobby, prompts, votes, scores)
│   ├── public/             # Client-side JS (game.js, display.js) and CSS
│   ├── tests/
│   │   ├── integration/    # Socket.IO-driven multiplayer tests
│   │   └── e2e/            # Playwright end-to-end tests
│   ├── package.json
│   └── app.yaml            # Google Cloud App Engine config
├── backend/
│   ├── server.py           # Flask local server
│   ├── shared_code/        # Player and Prompt models
│   ├── tests/              # Python unittest suite
│   └── requirements.txt
└── start.sh                # One-command local startup
```

## Getting Started

### Prerequisites

- Node.js 20.x (use `nvm use` if you have nvm installed)
- Python 3.x
- pip

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

The backend runs on `http://localhost:8181` by default.

### Frontend

```bash
cd frontend
npm install
BACKEND=http://localhost:8181 npm start
```

The frontend runs on `http://localhost:8080` by default.

### One-command startup

```bash
./start.sh
```

Starts both services, waits for the backend to be ready, and prints the host and join URLs.

## Environment Variables

### Frontend

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND` | `http://localhost:8181` | Backend service URL |
| `JOIN_URL` | `http://localhost:8080` | Public URL shown to players for joining |
| `AUTO_SHUTDOWN_IF_IDLE` | `0` | Shut down after 10 min idle if set to `1` |

### Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8181` | Port the Flask server listens on |

## Game Flow

1. Register or log in.
2. Create a new room or join with an existing room code.
3. The host starts the game once players are in the lobby.
4. Players submit their own prompts.
5. Players receive and answer two assigned prompts.
6. Everyone votes on the answers (blind voting, no self-voting).
7. Scores update live; the player with the most votes wins each round.
8. The host can return the room to the lobby for another round.

## Display Mode

The `/display` route renders a room-aware spectator view, suitable for projecting on a shared screen during a session. Target a specific room with `/display?room=CODE`.

## Testing

### Backend unit tests

```bash
cd backend
./.venv/bin/python -m unittest tests.test_local_server_endpoints tests.test_local_server_config
```

### Frontend integration tests

```bash
cd frontend
npm run test:integration
```

These tests drive Socket.IO clients directly and cover room isolation, reconnect handling, disconnect/admin scenarios, and full gameplay flow.

### Frontend end-to-end tests

```bash
cd frontend
npm run test:e2e          # headless
npm run test:e2e:headed   # with visible browser
```

Playwright traces and screenshots are written to `frontend/test-results/`.

## Deployment

- **Frontend**: `gcloud app deploy` using `frontend/app.yaml` (Google Cloud App Engine), or deploy via Render using the `Procfile`
- **Backend**: Deploy via Azure Functions CLI, Azure Portal, or Render
- Set the `BACKEND` environment variable on the frontend service to point to your deployed backend URL

## Known Limitations

- Room and game state are held in server memory per process. Multiple instances of the frontend are not yet synced.
- Reconnect handling targets demo reliability, not hardened production session recovery.
- The moderation filter is a lightweight word blocklist, not a full content moderation system.

## License

MIT. See [LICENSE](LICENSE).
