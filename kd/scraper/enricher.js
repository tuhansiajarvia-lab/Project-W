import Database from 'better-sqlite3';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY не найден в .env!');
}

const db = new Database('products.db');
const ai = new GoogleGenAI({ apiKey });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function upgradeDbSchema() {
  const columns = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);

  const newColumns = [
    'name_fi', 'name_en', 'name_ru',
    'category_fi', 'category_en', 'category_ru'
  ];

  for (const col of newColumns) {
    if (!columns.includes(col)) {
      db.prepare(`ALTER TABLE products ADD COLUMN ${col} TEXT`).run();
    }
  }
}

async function processBatchWithGemini(productsBatch, maxRetries = 5) {
  const prompt = `
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
  ${JSON.stringify(productsBatch)}

  Верни JSON-массив объектов со следующими точными полями:
  - id: ID товара из входных данных
  - name_fi: оригинальное название на финском
  - name_en: перевод названия на английский
  - name_ru: перевод названия на русский
  - category_fi: название категории на финском
  - category_en: название категории на английском
  - category_ru: название категории на русском

  Отвечай СТРОГО в формате валидного JSON.
  `;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const cleanJsonStr = response.text.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanJsonStr);

    } catch (err) {
      const errStr = err.toString();

      if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
        const match = errStr.match(/retry in (\d+(\.\d+)?)s/);
        const waitSec = match ? Math.ceil(parseFloat(match[1])) + 2 : 60;
        console.log(` Лимит запросов (429). Ждём ${waitSec} с... (Попытка ${attempt}/${maxRetries})`);
        await sleep(waitSec * 1000);
      } else if (errStr.includes('503') || errStr.includes('UNAVAILABLE')) {
        console.log(` Сервер перегружен (503). Ждём 5 с... (Попытка ${attempt}/${maxRetries})`);
        await sleep(5000);
      } else {
        console.error(` Ошибка при обработке батча:`, err.message);
        return [];
      }
    }
  }

  return [];
}

async function processEnrichment() {
  upgradeDbSchema();

  const rows = db.prepare("SELECT id, product_name, price, unit FROM products WHERE name_ru IS NULL").all();

  if (rows.length === 0) {
    console.log('Все товары уже переведены и категоризированы!');
    return;
  }

  console.log(`Найдено ${rows.length} товаров для обработки...`);

  const batchSize = 15;
  const updateStmt = db.prepare(`
    UPDATE products 
    SET name_fi = ?, name_en = ?, name_ru = ?, 
        category_fi = ?, category_en = ?, category_ru = ?
    WHERE id = ?
  `);

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize).map(r => ({
      id: r.id,
      product_name: r.product_name,
      price: r.price,
      unit: r.unit
    }));

    console.log(`Обработка товаров ${i + 1} - ${Math.min(i + batchSize, rows.length)}...`);
    const results = await processBatchWithGemini(batch);

    if (results && results.length > 0) {
      const updateMany = db.transaction((items) => {
        for (const item of items) {
          if (!item.id) continue;
          updateStmt.run(
            item.name_fi || null,
            item.name_en || null,
            item.name_ru || null,
            item.category_fi || null,
            item.category_en || null,
            item.category_ru || null,
            item.id
          );
        }
      });

      updateMany(results);
    }

    // Пауза 20 секунд между запросами для соблюдения лимитов
    await sleep(20000);
  }

  console.log(' Перевод и категоризация успешно завершены!');
}

processEnrichment().catch(console.error);