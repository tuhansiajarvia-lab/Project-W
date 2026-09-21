Write-Host "=== Initializing the Project-W environment ===" -ForegroundColor Green

# 1. Создаем venv, если его нет
if (-not (Test-Path "venv")) {
    Write-Host "Creating a virtual environment (venv)..." -ForegroundColor Yellow
    py -m venv venv
} else {
    Write-Host "The venv virtual environment already exists." -ForegroundColor Cyan
}

# 2. Активируем venv
Write-Host "Activation venv..." -ForegroundColor Yellow
.\venv\Scripts\Activate.ps1

# 3. Обновляем pip и устанавливаем зависимости
Write-Host "Installing Playwright..." -ForegroundColor Yellow
pip install --upgrade pip
pip install playwright

# 4. Загружаем браузер Chromium
Write-Host "Loading browser Chromium..." -ForegroundColor Yellow
playwright install chromium

Write-Host "=== Setup completed successfully! ===" -ForegroundColor Green