from playwright.sync_api import sync_playwright

base_url = "https://www.lidl.fi/l/fi/tarjouslehdet/koko-suomen-tarjoukset-ma-7-9-ke-9-9/view/flyer/page/"

print("Käynnistetään virtuaaliselain...")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()

    # 1. Открываем первую страницу и закрываем cookie-баннер
    print("Avataan 1. sivu ja hyväksytään evästeet...")
    page.goto(f"{base_url}1", wait_until="domcontentloaded", timeout=60000)
    
    try:
        page.click("#onetrust-accept-btn-handler", timeout=3000)
        print("Evästeet hyväksytty!")
    except:
        pass

    page.wait_for_timeout(1000)

    # 2. Проходим по всем 14 страницам и сохраняем скриншот каждой
    for page_num in range(1, 15):
        current_url = f"{base_url}{page_num}"
        print(f"Ladataan ja tallennetaan sivu {page_num} / 14...")

        page.goto(current_url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(1500)  # Даем время на рендеринг товаров

        # Сохраняем отдельный файл для каждой страницы
        page.screenshot(path=f"lidl_page_{page_num}.png", full_page=True)

    print("Kaikki 14 sivua on tallennettu onnistuneesti!")
    browser.close()