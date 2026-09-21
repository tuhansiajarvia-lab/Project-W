# 1. Check and create venv if it doesn't exist
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment (venv)..." -ForegroundColor Green
    py -m venv venv
} else {
    Write-Host "Virtual environment (venv) already exists." -ForegroundColor Yellow
}

# 2. Activate venv in the current session
Write-Host "Activating venv..." -ForegroundColor Green
.\venv\Scripts\Activate.ps1

# 3. Upgrade pip and install ALL required packages
Write-Host "Installing all project dependencies..." -ForegroundColor Green
python -m pip install --upgrade pip
pip install playwright google-genai python-dotenv pillow

# 4. Install Chromium browser for Playwright
Write-Host "Installing Chromium browser for Playwright..." -ForegroundColor Green
playwright install chromium

Write-Host "`n Setup complete! Environment and dependencies are ready to use." -ForegroundColor Cyan