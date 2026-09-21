import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY не найден в .env!');
}

const db = new Database('products.db');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      catalog_name TEXT,
      product_name TEXT,
      price REAL,
      unit TEXT,
      discount_percent TEXT,
      original_price REAL
    )
  `);
}

const ai = new GoogleGenAI({ apiKey });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function processPageImage(imagePath, maxRetries = 5) {
  console.log(`Обработка: ${imagePath}...`);
  
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const prompt = `
  Проанализируй страницу каталога скидок.

  КРИТИЧЕСКОЕ УСЛОВИЕ ФИЛЬТРАЦИИ:
  Если на этой странице НЕ содержатся пищевые продукты (еда, напитки, свежие овощи/фрукты, бакалея, мясо, молочные продукты, полуфабрикаты, сладости),
  а изображены только непродовольственные товары (одежда, инструменты, электроника, посуда, бытовая химия, товары для сада, текстиль) — 
  верни ПУСТОЙ массив: []

  ЕСЛИ НА СТРАНИЦЕ ЕСТЬ ПИЩЕВЫЕ ПРОДУКТЫ:
  Извлеки ТОЛЬКО пищевые товары и верни JSON-массив объектов со следующими полями:
  - product_name: название товара на финском
  - price: текущая цена со скидкой (число, например 1.39)
  - unit: единица измерения/вес (например "500 g", "1 kg", "4 kpl")
  - discount_percent: процент скидки, если указан (например "-30%"), иначе null
  - original_price: старая цена без скидки, если указана, иначе null

  Отвечай СТРОГО в формате валидного JSON без разметки markdown.
  `;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image,
            },
          },
          prompt,
        ],
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
        console.error(` Критическая ошибка при обработке ${imagePath}:`, err.message);
        return [];
      }
    }
  }

  return [];
}

function saveToDb(catalogName, products) {
  if (!products || products.length === 0) return;

  const insertStmt = db.prepare(`
    INSERT INTO products (catalog_name, product_name, price, unit, discount_percent, original_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertStmt.run(
        catalogName,
        item.product_name || null,
        item.price || null,
        item.unit || null,
        item.discount_percent || null,
        item.original_price || null
      );
    }
  });

  insertMany(products);
}

async function main() {
  initDb();

  const files = fs.readdirSync('.');
  const catalogFolders = files.filter(f => f.startsWith('catalog_') && fs.statSync(f).isDirectory()).sort();

  if (catalogFolders.length === 0) {
    console.log('Каталоги не найдены! Сначала запусти node dloader.js');
    return;
  }

  for (const folder of catalogFolders) {
    console.log(`\n=== Обработка ${folder} ===`);
    const images = fs.readdirSync(folder)
      .filter(f => f.endsWith('.png'))
      .sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numA - numB;
      });

    for (const imgName of images) {
      const imgPath = path.join(folder, imgName);
      const items = await processPageImage(imgPath);

      if (items && items.length > 0) {
        console.log(`  Найдено пищевых товаров: ${items.length}`);
        saveToDb(folder, items);
      } else {
        console.log('  Пропущено (нет пищевых товаров).');
      }

      await sleep(13000);
    }
  }

  console.log('\nВсе доступные данные успешно обработаны и сохранены в products.db!');
}

main().catch(console.error);