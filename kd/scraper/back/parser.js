import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

// 1. Инициализируем базу данных в папке db/
const dbDir = path.join(process.cwd(), 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(path.join(dbDir, 'products.db'));

// 2. Создаем таблицу товаров
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
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
  )
`);

// Вспомогательная функция очистки и парсинга цены
function parsePrice(str) {
  if (!str) return null;
  let cleaned = str.replace(',', '.').replace(/[^0-9.]/g, '');
  
  // Если OCR распознал "150" вместо "1.50"
  if (/^\d{3,4}$/.test(cleaned)) {
    cleaned = (parseFloat(cleaned) / 100).toFixed(2);
  }
  
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

// Извлечение товаров из массива текстовых блоков страницы
function extractProductsFromPage(textBlocks, pageName, catalogFolder) {
  const products = [];
  const discountRegex = /(-\d{2}%|\d+\s*kpl|Ota\s*\d+)/i;
  const priceRegex = /(\d+[.,]\d{2}|\b\d{3,4}\b)/;

  for (let i = 0; i < textBlocks.length; i++) {
    const block = textBlocks[i];

    if (discountRegex.test(block)) {
      const discount = block.match(discountRegex)[0];
      const contextSlice = textBlocks.slice(Math.max(0, i - 2), Math.min(textBlocks.length, i + 5));

      let title = '';
      let price = null;
      let originalPrice = null;

      for (const item of contextSlice) {
        if (priceRegex.test(item)) {
          const parsed = parsePrice(item);
          if (parsed && !price) {
            price = parsed;
          } else if (parsed && price && !originalPrice && parsed !== price) {
            originalPrice = parsed;
          }
        } else if (item.length > 3 && !discountRegex.test(item) && !title) {
          title = item;
        }
      }

      if (title || price) {
        products.push({
          store: 'lidl',
          catalog_folder: catalogFolder,
          page: pageName,
          product_name: title || 'Неизвестный товар',
          price: price || 0,
          original_price: originalPrice || 0,
          discount_percent: discount,
          raw_text: contextSlice.join(' | ')
        });
      }
    }
  }

  return products;
}

// 3. Основной процесс чтения ocr_results.json и сохранения в SQLite
function parseAllResults() {
  const lidlDir = path.join(process.cwd(), 'catalogs', 'lidl');

  if (!fs.existsSync(lidlDir)) {
    console.log('Папка с каталогами catalogs/lidl не найдена!');
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

  console.log(`\nПарсинг завершен! Записано товаров в БД: ${totalInserted}`);
}

parseAllResults();