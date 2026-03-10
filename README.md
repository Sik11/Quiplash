# Quiplash

A cloud-hosted multiplayer party game built for COMP3207.

## Architecture

| Tier | Stack | Cloud |
|------|-------|-------|
| **Frontend** | Node.js · Express · Socket.IO · Vue.js · EJS | Google Cloud App Engine |
| **Backend** | Python · Azure Functions (serverless) · Cosmos DB | Azure |

## Structure

```
Quiplash/
├── frontend/    # Express server, Socket.IO, EJS templates, Vue.js client logic
├── backend/     # Azure Functions HTTP endpoints + shared models + tests
└── archive/     # Previous coursework submissions (CW1-1, CW1-2)
```

## Running Locally

### Frontend

```bash
cd frontend
npm install
npm start
```

### Backend

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
python server.py        # Flask local dev server
# OR
func start              # Azure Functions host
```

### Backend Tests

```bash
cd backend
python -m pytest tests/
```

## Deployment

- **Frontend**: `gcloud app deploy` (see `frontend/app.yaml`)
- **Backend**: Deploy via Azure Functions CLI or Azure Portal
