Write-Host "=== Инициализация окружения Project-W ===" -ForegroundColor Green

# 1. Создаем venv, если его нет
if (-not (Test-Path "venv")) {
    Write-Host "Создание виртуального окружения (venv)..." -ForegroundColor Yellow
    py -m venv venv
} else {
    Write-Host "Виртуальное окружение venv уже существует." -ForegroundColor Cyan
}

# 2. Активируем venv
Write-Host "Активация venv..." -ForegroundColor Yellow
.\venv\Scripts\Activate.ps1

# 3. Обновляем pip и устанавливаем зависимости
Write-Host "Установка Playwright..." -ForegroundColor Yellow
pip install --upgrade pip
pip install playwright

# 4. Загружаем браузер Chromium
Write-Host "Загрузка браузера Chromium..." -ForegroundColor Yellow
playwright install chromium

Write-Host "=== Настройка успешно завершена! ===" -ForegroundColor Green