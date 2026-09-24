import Database from 'better-sqlite3';

const db = new Database('products.db');

// Добавляем нужные колонки в БД, если их еще нет
function upgradeDbSchema() {
  const columns = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);
  const newColumns = [
    'name_fi', 'name_en', 'name_ru',
    'category_fi', 'category_en', 'category_ru',
    'price', 'unit'
  ];

  for (const col of newColumns) {
    if (!columns.includes(col)) {
      db.prepare(`ALTER TABLE products ADD COLUMN ${col} TEXT`).run();
    }
  }
}

upgradeDbSchema();

/**
 * Локальный парсер текста OCR без использования внешних API
 */
function parseOcrTextLocally(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const products = [];

  // Находим цены (например: 1,99 или 2.49 €)
  const priceRegex = /(\d+[\.,]\d{2})\s*€?/;

  let currentProduct = null;

  for (const line of lines) {
    const match = line.match(priceRegex);

    if (match) {
      // Найдена цена — заносим продукт
      const priceVal = match[1].replace(',', '.');
      if (currentProduct) {
        currentProduct.price = priceVal;
        products.push(currentProduct);
        currentProduct = null;
      }
    } else {
      // Накапливаем название
      if (!currentProduct) {
        currentProduct = {
          name_fi: line,
          name_en: line, // Локальная заглушка или словарь
          name_ru: line,
          category_fi: 'Yleinen',
          category_en: 'General',
          category_ru: 'Общее',
          price: '0.00',
          unit: 'kpl'
        };
      } else {
        currentProduct.name_fi += ' ' + line;
      }
    }
  }

  return products;
}

function processUnprocessedProducts() {
  const rows = db.prepare('SELECT id, raw_ocr_text FROM products WHERE processed = 0 OR processed IS NULL').all();

  if (rows.length === 0) {
    console.log('Нет необработанных записей.');
    return;
  }

  console.log(`Обработка ${rows.length} записей локально...`);

  const updateStmt = db.prepare(`
    UPDATE products 
    SET name_fi = ?, name_en = ?, name_ru = ?, 
        category_fi = ?, category_en = ?, category_ru = ?, 
        price = ?, unit = ?, processed = 1 
    WHERE id = ?
  `);

  for (const row of rows) {
    if (!row.raw_ocr_text) continue;

    const parsedItems = parseOcrTextLocally(row.raw_ocr_text);

    for (const item of parsedItems) {
      updateStmt.run(
        item.name_fi, item.name_en, item.name_ru,
        item.category_fi, item.category_en, item.category_ru,
        item.price, item.unit, row.id
      );
    }

    console.log(`✓ Запись ID ${row.id} успешно структурирована локально!`);
  }
}

processUnprocessedProducts();