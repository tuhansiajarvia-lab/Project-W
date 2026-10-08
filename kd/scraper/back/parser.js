import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const dbDir = path.join(process.cwd(), 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(path.join(dbDir, 'products.db'));

// Пересоздаём таблицу
db.exec(`
  DROP TABLE IF EXISTS products;

  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store TEXT,
    catalog_folder TEXT,
    page TEXT,
    product_name TEXT,
    price REAL,
    original_price REAL,
    discount_percent TEXT,
    raw_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Список мусорных/служебных финских слов
const STOP_WORDS = new Set([
  'parasta', 'sesongin', 'aina', 'halvat', 'hinnat', 'kannattaa', 
  'tarjoukset', 'sulje', 'valikko', 'plus', 'lidl', 'erä', 'alkaen'
]);

function parsePrice(str) {
  if (!str) return null;
  
  let cleaned = str.replace(',', '.').replace(/[^0-9.]/g, '');
  
  // Если строка вида "150", превращаем в "1.50"
  if (/^\d{3,4}$/.test(cleaned)) {
    cleaned = (parseFloat(cleaned) / 100).toFixed(2);
  }
  
  const val = parseFloat(cleaned);
  
  // Фильтруем аномальные цены (от 0.10€ до 150.00€)
  if (isNaN(val) || val <= 0.10 || val > 150.00) {
    return null;
  }
  
  return val;
}

function isValidTitle(text) {
  if (!text || text.length < 3) return false;
  
  const clean = text.trim().toLowerCase();
  
  // Игнорируем стоп-слова, проценты и сплошные цифры
  if (STOP_WORDS.has(clean)) return false;
  if (/%|\d{3,}/.test(clean)) return false;
  if (/^[^a-zäöåA-ZÄÖÅ]+$/.test(clean)) return false; 

  return true;
}

function extractProductsFromPage(textBlocks, pageName, catalogFolder) {
  const products = [];
  const discountRegex = /(-\d{2}%|\d+\s*kpl|Ota\s*\d+)/i;
  const priceRegex = /(\d+[.,]\d{2}|\b\d{3,4}\b)/;

  for (let i = 0; i < textBlocks.length; i++) {
    const block = textBlocks[i];

    if (discountRegex.test(block)) {
      const discount = block.match(discountRegex)[0];
      const contextSlice = textBlocks.slice(Math.max(0, i - 3), Math.min(textBlocks.length, i + 6));

      let title = '';
      let price = null;
      let originalPrice = null;

      for (const item of contextSlice) {
        // Проверяем цену
        if (priceRegex.test(item)) {
          const parsed = parsePrice(item);
          if (parsed && !price) {
            price = parsed;
          } else if (parsed && price && !originalPrice && parsed !== price) {
            originalPrice = parsed;
          }
        } 
        // Проверяем валидность названия товара
        else if (isValidTitle(item) && !title) {
          title = item;
        }
      }

      // Сохраняем только если цена находится в адекватном диапазоне
      if (price) {
        products.push({
          store: 'lidl',
          catalog_folder: catalogFolder,
          page: pageName,
          product_name: title || 'Неизвестный товар',
          price: price,
          original_price: originalPrice || 0,
          discount_percent: discount,
          raw_text: contextSlice.join(' | ')
        });
      }
    }
  }

  return products;
}

function parseAllResults() {
  const lidlDir = path.join(process.cwd(), 'catalogs', 'lidl');

  if (!fs.existsSync(lidlDir)) {
    console.log('Папка catalogs/lidl не найдена!');
    return;
  }

  const catalogFolders = fs.readdirSync(lidlDir).filter(f => f.startsWith('catalog_'));
  const insertStmt = db.prepare(`
    INSERT INTO products (store, catalog_folder, page, product_name, price, original_price, discount_percent, raw_text)
    VALUES (@store, @catalog_folder, @page, @product_name, @price, @original_price, @discount_percent, @raw_text)
  `);

  let totalInserted = 0;

  for (const folder of catalogFolders) {
    const jsonPath = path.join(lidlDir, folder, 'ocr_results.json');
    if (!fs.existsSync(jsonPath)) continue;

    const pageResults = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

    for (const pageData of pageResults) {
      const products = extractProductsFromPage(pageData.text_blocks, pageData.page, folder);
      for (const prod of products) {
        insertStmt.run(prod);
        totalInserted++;
      }
    }
  }

  console.log(`\nПарсинг завершен! Записано очищенных товаров в БД: ${totalInserted}`);
}

parseAllResults();