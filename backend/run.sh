
#!/bin/bash

set -e

echo "========================================"
echo "       SSFMS Backend Setup"
echo "========================================"

# Activate virtual environment
echo "[2/5] Activating virtual environment..."
source sfvenv/Scripts/activate

# Upgrade pip
echo "[3/5] Upgrading pip..."
python -m pip install --upgrade pip

# Install dependencies
echo "[4/5] Installing dependencies..."
pip install -r requirements.txt

echo ""
echo "========================================"
echo "       Starting FastAPI"
echo "========================================"

uvicorn app.main:app --reload --port 8000

