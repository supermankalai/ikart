# Starts the eKart backend (FastAPI :8000) and frontend (React :5173) in two windows.
# Usage (from the ekart folder):  powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; .\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "eKart is starting..."
Write-Host "  Store:     http://localhost:5173"
Write-Host "  Admin:     http://localhost:5173/admin"
Write-Host "  API docs:  http://localhost:8000/docs"
