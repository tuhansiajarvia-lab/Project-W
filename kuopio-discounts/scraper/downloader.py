import os # подключает встроенную библиотеку Python для работы с операционной системой и файловой структурой. Создает наши папки каталогов.
import re # одключает модуль для работы с регулярными выражениями, чтобы искать и разбирать текстовые шаблоны. С его помощью скрипт находит цифры в счетчике страниц, чтобы вовремя остановить скачивание.
from playwright.sync_api import sync_playwright

catalog_main_url = "https://www.lidl.fi/tarjouslehdet"

print("Käynnistetään virtuaaliselain...")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()
    page.set_viewport_size({"width": 1920, "height": 1080})

    print("Avataan Lidlin tarjouslehdet -pääsivu...")
    page.goto(catalog_main_url, wait_until="networkidle", timeout=60000)

    # 1. Cookie
    try:
        page.click("#onetrust-accept-btn-handler", timeout=4000)
    except:
        pass

    page.wait_for_timeout(1000)

    # 2. Закрываем боковое окно
    close_selectors = ["button[aria-label='SULJE']", "button[aria-label='Close']", "dialog button"]
    for selector in close_selectors:
        try:
            page.click(selector, timeout=300)
            break
        except:
            continue
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)

    # 3. Собираем ссылки на продуктовые каталоги
    flyer_links = []
    cards = page.locator("article, a").filter(has_text="Koko Suomen tarjoukset").all()

    for card in cards:
        href = card.get_attribute("href")
        if href and href not in flyer_links:
            flyer_links.append(href)

    print(f"Löytyi {len(flyer_links)} ruokatarjouslehteä.")

    # 4. Выгружаем каталоги
    for index, flyer_link in enumerate(flyer_links, start=1):
        folder_name = f"catalog_{index}"
        os.makedirs(folder_name, exist_ok=True)
        print(f"\n--- Prosessoidaan lehti {index}/{len(flyer_links)} -> Kansio: {folder_name} ---")

        full_url = flyer_link if flyer_link.startswith("http") else f"https://www.lidl.fi{flyer_link}"
        
        page.goto(full_url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(3000)

        page_num = 1
        while True:
            # Считываем счетчик страниц из верстки (например, "20-21 / 21" или "14 / 14")
            is_last_page = False
            try:
                counter_element = page.locator("header, div, span").filter(has_text=re.compile(r"\d+.*\/.*\d+")).first
                if counter_element.is_visible():
                    counter_text = counter_element.inner_text().strip()
                    
                    # Разбираем синтаксис вида "20-21 / 21"
                    if "/" in counter_text:
                        parts = counter_text.split("/")
                        left_part = parts[0].strip() # "20-21"
                        right_part = parts[1].strip() # "21"
                        
                        # Достаем последнее число из левой части (21) и общее число справа (21)
                        current_max_page = int(re.findall(r"\d+", left_part)[-1])
                        total_pages = int(re.findall(r"\d+", right_part)[0])
                        
                        # Если текущая страница дошла до финала
                        if current_max_page >= total_pages:
                            is_last_page = True
            except Exception as e:
                pass

            print(f"  Tallennetaan sivu {page_num}...")
            file_path = os.path.join(folder_name, f"lidl_page_{page_num}.png")
            page.screenshot(path=file_path, full_page=True)

            # Если счетчик показал конец каталога — прерываем цикл и переходим к следующему
            if is_last_page:
                print("  Viimeinen sivu saavutettu (sivulaskuri)! Siirrytään seuraavaan lehteen.")
                break

            # Перелистываем дальше
            page.keyboard.press("ArrowRight")
            page.wait_for_timeout(1500)
            page_num += 1

            # Защита от зависания
            if page_num > 30:
                break

    print("\nKaikki ruokatarjouslehdet ladattu onnistuneesti!")
    browser.close()