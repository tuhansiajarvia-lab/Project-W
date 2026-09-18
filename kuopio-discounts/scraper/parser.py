import glob
import json
import os
import sqlite3
from google import genai
from google.genai import types
from PIL import Image

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
client = genai.Client(
    api_key="AQ.Ab8RN6LklbBqghA9VsjjedL0XJxniW-S0PL2eMb8yH4xkYUHPQ"
)


def process_page_image(image_path):
    print(f"Обработка: {image_path}...")
    img = Image.open(image_path)

    prompt = """
    Проанализируй страницу каталога скидок и извлеки все товары.
    Для каждого товара верни JSON-массив объектов со следующими полями:
    - product_name: название товара на финском
    - price: текущая цена со скидкой (число, например 1.39)
    - unit: единица измерения/вес (например "500 g", "1 kg", "4 kpl")
    - discount_percent: процент скидки, если указан (например "-30%"), иначе null
    - original_price: старая цена без скидки, если указана, иначе null

    Отвечай СТРОГО в формате валидного JSON без какого-либо дополнительного текста или разметки markdown.
    """

    try:
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=[img, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            ),
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"Ошибка при обработке {image_path}: {e}")
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

    # Поиск всех созданных каталогов (catalog_1, catalog_2 и т.д.)
    catalog_folders = sorted(glob.glob("catalog_*"))

    if not catalog_folders:
        print(
            "Каталоги не найдены! Сначала запусти скрипт скачивания downloader.py."
        )
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
                print(f"  Найдено товаров: {len(extracted_items)}")
                save_to_db(folder, extracted_items)

    print(f"\nВсе данные успешно распознаны и сохранены в {DB_NAME}!")


if __name__ == "__main__":
    main()