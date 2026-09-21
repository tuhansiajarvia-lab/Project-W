import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import Database from 'better-sqlite3';

const db = new Database('products.db');

// Инициализируем или проверяем таблицу
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

// Функция отправки картинки в локальный Python OCR
async function runLocalOcr(imagePath) {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(imagePath));

  try {
    const response = await axios.post('http://127.0.0.1:8000/ocr', formData, {
      headers: formData.getHeaders(),
    });
    return response.data.text || '';
  } catch (err) {
    console.error(`Ошибка OCR для файла ${path.basename(imagePath)}:`, err.message);
    return '';
  }
}

async function parseCatalogPages() {
  const catalogDir = path.join(process.cwd(), 'catalog_pages');
  if (!fs.existsSync(catalogDir)) {
    console.log('Папка catalog_pages не найдена!');
    return;
  }

  const files = fs.readdirSync(catalogDir)
    .filter(f => f.endsWith('.png'))
    .sort();

  console.log(`Найдено ${files.length} страниц для обработки...`);

  const insertStmt = db.prepare(`
    INSERT INTO products (catalog_name, product_name, price, unit, discount_percent, original_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const file of files) {
    const filePath = path.join(catalogDir, file);
    console.log(`Сканирование через local OCR: ${file}...`);

    const extractedText = await runLocalOcr(filePath);

    if (extractedText) {
      // Сохраняем извлеченный финский текст в поле product_name для перевода и структурирования в enricher.js
      insertStmt.run(file, extractedText, 0, '', '', 0);
      console.log(`✓ Записан текст со страницы ${file}`);
    }
  }

  console.log('Все страницы успешно сканированы!');
}

parseCatalogPages();