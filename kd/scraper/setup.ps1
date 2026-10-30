# Mahdollistaa kaikkien riippuvuuksien asentamisen automaattisesti projektin siirtämiselle toiselle tietokoneelle.
# .\setup.ps1

Write-Host "=== Setup Node.js & Tesseract OCR ===" -ForegroundColor Green

# 1. Установка npm-зависимостей бэкенда
npm install

# 2. Создание папки ocr, если её нет
$ocrDir = "ocr"
if (-not (Test-Path $ocrDir)) {
    New-Item -ItemType Directory -Path $ocrDir | Out-Null
}

Set-Location $ocrDir

# 3. Создание виртуального окружения Python
if (-not (Test-Path "venv")) {
    python -m venv venv
}

# 4. Установка пакетов для Python (FastAPI, Uvicorn, Pillow, pytesseract)
$venvActivate = ".\venv\Scripts\Activate.ps1"
if (Test-Path $venvActivate) {
    & $venvActivate
    python -m pip install --upgrade pip
    pip install fastapi uvicorn pillow pytesseract
}

Set-Location ..

Write-Host "=== Setup Finished ===" -ForegroundColor Green