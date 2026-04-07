#!/usr/bin/env bash
# Dev launcher: starts backend + frontend in parallel

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== POUI v2 Dev Mode ==="
echo ""

# Backend
echo "[backend] Installing dependencies..."
cd "$SCRIPT_DIR/backend" && npm install --silent

echo "[backend] Starting API server on :3001..."
PORT=3001 RESULTS_DIR="$SCRIPT_DIR/results" node src/server.js &
BACKEND_PID=$!

sleep 2

# Frontend
echo "[frontend] Installing dependencies..."
cd "$SCRIPT_DIR/frontend" && npm install --silent

echo "[frontend] Starting dev server on :5173..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Running!"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:3001/api/data"
echo ""
echo "Press Ctrl+C to stop both."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
