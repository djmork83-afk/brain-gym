#!/usr/bin/env bash
# Локальный запуск BrainGym: ./run.sh [порт]
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8765}"
echo "BrainGym → http://localhost:${PORT}"
echo "Ctrl+C — остановить"
exec python3 -m http.server "$PORT"
