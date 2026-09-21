import json
import os
import sqlite3
import time
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise ValueError("API-ключ не найден в .env!")

DB_NAME = "products.db"
client = genai.Client(api_key=api_key)


def upgrade_db_schema():
    """Добавляем новые колонки для языков и категорий в базу данных."""
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    cursor.execute("PRAGMA table_info(products)")
    columns = [col[1] for col in cursor.fetchall()]

    new_columns = {
        "name_fi": "TEXT",
        "name_en": "TEXT",
        "name_ru": "TEXT",
        "category_fi": "TEXT",
        "category_en": "TEXT",
        "category_ru": "TEXT",
    }

    for col_name, col_type in new_columns.items():
        if col_name not in columns:
            cursor.execute(
                f"ALTER TABLE products ADD COLUMN {col_name} {col_type}"
            )

    conn.commit()
    conn.close()


def process_batch_with_gemini(products_batch):
    """Переводит названия и определяет категории на 3 языках за 1 запрос."""
    prompt = f"""
    Проанализируй список финских продуктов питания.
    Для каждого товара выполни две задачи:
    1. Переведи название с финского на английский и русский языки.
    2. Определи категорию товара и укажи её на 3 языках (FI, EN, RU).

    Доступные категории:
    - FI: Vihannekset ja hedelmät / EN: Vegetables & Fruits / RU: Овощи и фрукты
    - FI: Liha ja siipikarja / EN: Meat & Poultry / RU: Мясо и птица
    - FI: Kala ja merenelävät / EN: Fish & Seafood / RU: Рыба и морепродукты
    - FI: Maitotuotteet ja juustot / EN: Dairy & Cheese / RU: Молочные продукты и сыры
    - FI: Leipä ja leivonnaiset / EN: Bread & Bakery / RU: Хлеб и выпечка
    - FI: Kuivatuotteet ja säilykkeet / EN: Groceries / RU: Бакалея и консервы
    - FI: Juomat / EN: Beverages / RU: Напитки
    - FI: Makeiset ja naposteltavat / EN: Sweets & Snacks / RU: Сладости и снеки
    - FI: Pakasteet / EN: Frozen Food / RU: Замороженные продукты
    - FI: Muut / EN: Other / RU: Другое

    Входные данные:
    {json.dumps(products_batch, ensure_ascii=False)}

    Верни JSON-массив объектов со следующими точными полями:
    - id: ID товара из входных данных
    - name_fi: оригинальное название на финском
    - name_en: перевод названия на английский
    - name_ru: перевод названия на русский
    - category_fi: название категории на финском
    - category_en: название категории на английском
    - category_ru: название категории на русском

    Отвечай СТРОГО в формате валидного JSON.
    """

    try:
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                automatic_function_calling=types.AutomaticFunctionCallingConfig(
                    disable=True
                ),
            ),
        )
        return json.loads(response.text)
    except Exception as e:
        print(f" Ошибка при переводе и категоризации: {e}")
        return []


def process_enrichment():
    upgrade_db_schema()

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    # Выбираем товары, у которых еще нет перевода
    cursor.execute(
        "SELECT id, product_name, price, unit FROM products WHERE name_ru IS NULL"
    )
    rows = cursor.fetchall()

    if not rows:
        print("Все товары уже переведены и категоризированы!")
        conn.close()
        return

    print(f"Найдено {len(rows)} товаров для обработки...")

    # Пачки по 15 товаров для оптимальной скорости
    batch_size = 15
    for i in range(0, len(rows), batch_size):
        batch = [
            {"id": r[0], "product_name": r[1], "price": r[2], "unit": r[3]}
            for r in rows[i : i + batch_size]
        ]

        print(
            f"Обработка товаров {i + 1} - {min(i + batch_size, len(rows))}..."
        )
        results = process_batch_with_gemini(batch)

        for item in results:
            product_id = item.get("id")
            if not product_id:
                continue

            cursor.execute(
                """
                UPDATE products 
                SET name_fi = ?, name_en = ?, name_ru = ?, 
                    category_fi = ?, category_en = ?, category_ru = ?
                WHERE id = ?
            """,
                (
                    item.get("name_fi"),
                    item.get("name_en"),
                    item.get("name_ru"),
                    item.get("category_fi"),
                    item.get("category_en"),
                    item.get("category_ru"),
                    product_id,
                ),
            )

        conn.commit()
        time.sleep(2)

    conn.close()
    print(" Перевод и категоризация успешно завершены!")


if __name__ == "__main__":
    process_enrichment()