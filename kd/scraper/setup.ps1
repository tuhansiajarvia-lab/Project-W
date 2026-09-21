Write-Host "=== Setup Node.js & PyTorch CUDA OCR ===" -ForegroundColor Green

# 1. npm
npm install

# 2. OCR folder
$ocrDir = "ocr"
if (-not (Test-Path $ocrDir)) {
    New-Item -ItemType Directory -Path $ocrDir | Out-Null
}

Set-Location $ocrDir

# 3. venv
if (-not (Test-Path "venv")) {
    python -m venv venv
}

# 4. Install CUDA packages
$venvActivate = ".\venv\Scripts\Activate.ps1"
if (Test-Path $venvActivate) {
    & $venvActivate
    python -m pip install --upgrade pip
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
    pip install fastapi uvicorn easyocr pillow
}

Set-Location ..

Write-Host "=== Setup Finished ===" -ForegroundColor Green