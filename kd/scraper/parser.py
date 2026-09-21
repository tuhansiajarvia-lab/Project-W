import glob
import json
import os
import re
import sqlite3
import time
from dotenv import load_dotenv
from google import genai
from google.genai import types
from PIL import Image

# Загружаем переменные окружения из файла .env
load_dotenv()

# Получаем ключ из файла .env
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise ValueError(
        "API-ключ не найден! Создай файл .env и добавь строчку: GEMINI_API_KEY=твой_ключ"
    )

# 1. Инициализация базы данных SQLite
DB_NAME = "products.db"


def init_db():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            catalog_name TEXT,
            product_name TEXT,
            price REAL,
            unit TEXT,
            discount_percent TEXT,
            original_price REAL
        )
    """
    )
    conn.commit()
    conn.close()


# 2. Инициализация клиента Gemini API
client = genai.Client(api_key=api_key)


def process_page_image(image_path, max_retries=5):
    print(f"Обработка: {image_path}...")
    img = Image.open(image_path)

    prompt = """
    Проанализируй страницу каталога скидок.

    КРИТИЧЕСКОЕ УСЛОВИЕ ФИЛЬТРАЦИИ:
    Если на этой странице НЕ содержатся пищевые продукты (еда, напитки, свежие овощи/фрукты, бакалея, мясо, молочные продукты, полуфабрикаты, сладости),
    а изображены только непродовольственные товары (одежда, инструменты, электроника, посуда, бытовая химия, товары для сада, текстиль) — 
    верни ПУСТОЙ массив: []

    ЕСЛИ НА СТРАНИЦЕ ЕСТЬ ПИЩЕВЫЕ ПРОДУКТЫ:
    Извлеки ТОЛЬКО пищевые товары (игнорируя бытовую химию или одежду, если они находятся на той же странице) и верни JSON-массив объектов со следующими полями:
    - product_name: название товара на финском
    - price: текущая цена со скидкой (число, например 1.39)
    - unit: единица измерения/вес (например "500 g", "1 kg", "4 kpl")
    - discount_percent: процент скидки, если указан (например "-30%"), иначе null
    - original_price: старая цена без скидки, если указана, иначе null

    Отвечай СТРОГО в формате валидного JSON без какого-либо дополнительного текста или разметки markdown.
    """

    attempt = 1
    while attempt <= max_retries:
        try:
            response = client.models.generate_content(
                model="gemini-3.6-flash",
                contents=[img, prompt],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    automatic_function_calling=types.AutomaticFunctionCallingConfig(
                        disable=True
                    ),
                ),
            )
            return json.loads(response.text)

        except Exception as e:
            err_str = str(e)

            # Обработка превышения лимитов (429)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                match = re.search(r"retry in (\d+(\.\d+)?)s", err_str)
                wait_time = int(float(match.group(1))) + 2 if match else 60

                print(
                    f" Лимит запросов (429). Ждем {wait_time} секунд перед повтором (попытка {attempt}/{max_retries})..."
                )
                time.sleep(wait_time)
                attempt += 1

            # Обработка перегрузки сервера (503)
            elif "503" in err_str or "UNAVAILABLE" in err_str:
                print(
                    f" Сервер перегружен (503). Ждем 5 секунд (попытка {attempt}/{max_retries})..."
                )
                time.sleep(5)
                attempt += 1

            else:
                print(f" Критическая ошибка при обработке {image_path}: {e}")
                return []

    print(
        f" Не удалось обработать {image_path} после {max_retries} попыток из-за лимитов."
    )
    return []


def save_to_db(catalog_name, products):
    if not products:
        return

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    for item in products:
        cursor.execute(
            """
            INSERT INTO products (catalog_name, product_name, price, unit, discount_percent, original_price)
            VALUES (?, ?, ?, ?, ?, ?)
        """,
            (
                catalog_name,
                item.get("product_name"),
                item.get("price"),
                item.get("unit"),
                item.get("discount_percent"),
                item.get("original_price"),
            ),
        )

    conn.commit()
    conn.close()


def main():
    init_db()

    catalog_folders = sorted(glob.glob("catalog_*"))

    if not catalog_folders:
        print("Каталоги не найдены! Сначала запусти скрипт скачивания downloader.py.")
        return

    for folder in catalog_folders:
        print(f"\n=== Обработка {folder} ===")
        images = sorted(
            glob.glob(os.path.join(folder, "*.png")),
            key=lambda x: int(
                os.path.basename(x).split("_")[-1].replace(".png", "")
            ),
        )

        for img_path in images:
            extracted_items = process_page_image(img_path)
            if extracted_items:
                print(f"  Найдено пищевых товаров: {len(extracted_items)}")
                save_to_db(folder, extracted_items)
            else:
                print("  Пропущено (нет пищевых товаров).")

            # Пауза 13 секунд между запросами
            time.sleep(13)

    print(f"\nВсе доступные данные успешно обработаны и сохранены в {DB_NAME}!")


if __name__ == "__main__":
    main()