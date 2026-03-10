#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PORT=8181
FRONTEND_PORT=8080

# Get local network IP so other devices can connect
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null \
  || ipconfig getifaddr en1 2>/dev/null \
  || echo "localhost")

echo ""
echo "=================================="
echo "         Starting Quiplash"
echo "=================================="
echo ""

mkdir -p "$SCRIPT_DIR/logs"

# ── Backend ────────────────────────────────────────────────────────────────
echo "[1/2] Starting backend on port $BACKEND_PORT..."
cd "$SCRIPT_DIR/backend"

if [ -f ".venv/bin/activate" ]; then
  source .venv/bin/activate
else
  echo "      Warning: no .venv found, using system Python"
fi

python server.py &> "$SCRIPT_DIR/logs/backend.log" &
BACKEND_PID=$!

# Wait for Flask to be ready
for i in {1..10}; do
  if curl -s "http://localhost:$BACKEND_PORT/leaderboard" > /dev/null 2>&1; then
    echo "      Backend ready."
    break
  fi
  sleep 0.5
done

# ── Frontend ───────────────────────────────────────────────────────────────
echo "[2/2] Starting frontend on port $FRONTEND_PORT..."
cd "$SCRIPT_DIR/frontend"

if [ ! -d "node_modules/express" ]; then
  echo "      Frontend dependencies missing. Installing..."
  if [ -f "package-lock.json" ]; then
    npm ci
  else
    npm install
  fi
fi

BACKEND="http://localhost:$BACKEND_PORT" node app.js &> "$SCRIPT_DIR/logs/frontend.log" &
FRONTEND_PID=$!

sleep 1

# ── Ready ──────────────────────────────────────────────────────────────────
echo ""
echo "=================================="
echo "       Quiplash is ready!"
echo "=================================="
echo ""
echo "  Host URL : http://localhost:$FRONTEND_PORT"
echo "  Join URL : http://$LOCAL_IP:$FRONTEND_PORT"
echo ""
echo "  Share the Join URL with players on the same Wi-Fi."
echo ""
echo "  Logs:"
echo "    Backend  -> logs/backend.log"
echo "    Frontend -> logs/frontend.log"
echo ""
echo "  Press Ctrl+C to stop everything."
echo "=================================="
echo ""

# ── Shutdown ───────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Stopping servers..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  echo "Done."
  exit 0
}

trap cleanup SIGINT SIGTERM

wait $BACKEND_PID $FRONTEND_PID
