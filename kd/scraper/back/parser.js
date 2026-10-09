import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

// Определение __dirname для ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Гарантированные пути к корню проекта scraper/
const DB_DIR = path.resolve(__dirname, '..', 'db');
const LIDL_DIR = path.resolve(__dirname, '..', 'catalogs', 'lidl');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(path.join(DB_DIR, 'products.db'));

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

// Безопасное вычисление центра Bounding Box [x_center, y_center]
function getCenter(bbox) {
  if (!Array.isArray(bbox) || bbox.length < 4) return [0, 0];
  try {
    const xCoords = bbox.map(p => Array.isArray(p) ? p[0] : 0);
    const yCoords = bbox.map(p => Array.isArray(p) ? p[1] : 0);
    const minX = Math.min(...xCoords), maxX = Math.max(...xCoords);
    const minY = Math.min(...yCoords), maxY = Math.max(...yCoords);
    return [(minX + maxX) / 2, (minY + maxY) / 2];
  } catch (e) {
    return [0, 0];
  }
}

// Расстояние между двумя центрами (Евклидово расстояние)
function getDistance(center1, center2) {
  return Math.sqrt(Math.pow(center1[0] - center2[0], 2) + Math.pow(center1[1] - center2[1], 2));
}

/**
 * Spatial (геометрический) парсинг блоков с Bounding Boxes
 */
function extractProductsSpatial(textBlocks, pageName, catalogFolder) {
  const products = [];
  const discountRegex = /(-\d{2}%|\d+\s*kpl|Ota\s*\d+)/i;
  const priceRegex = /(\d+[.,]\d{2}|\b\d{3,4}\b)/;

  if (!Array.isArray(textBlocks)) return products;

  // Нормализуем входящие блоки
  const normalizedBlocks = textBlocks.map(b => {
    if (typeof b === 'string') return { text: b, bbox: null };
    if (typeof b === 'object' && b !== null) return b;
    return { text: String(b || ''), bbox: null };
  });

  for (let i = 0; i < normalizedBlocks.length; i++) {
    const block = normalizedBlocks[i];
    const text = block.text || '';

    if (discountRegex.test(text)) {
      const discount = text.match(discountRegex)[0];
      const hasBbox = Array.isArray(block.bbox) && block.bbox.length >= 4;
      const discountCenter = hasBbox ? getCenter(block.bbox) : null;

      let candidates = [];

      if (discountCenter) {
        // Поиск ближайших блоков на основе евклидова расстояния
        candidates = normalizedBlocks
          .filter((_, idx) => idx !== i)
          .map(b => ({
            ...b,
            dist: (Array.isArray(b.bbox) && b.bbox.length >= 4) ? getDistance(discountCenter, getCenter(b.bbox)) : 99999
          }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 8); // Берём 8 ближайших соседей
      } else {
        // Запасной линейный поиск, если координат нет
        candidates = normalizedBlocks.slice(Math.max(0, i - 3), Math.min(normalizedBlocks.length, i + 6));
      }

      let title = '';
      let price = null;
      let originalPrice = null;

      for (const item of candidates) {
        const itemText = item.text || '';

        // Проверяем цену
        if (priceRegex.test(itemText)) {
          const parsed = parsePrice(itemText);
          if (parsed && !price) {
            price = parsed;
          } else if (parsed && price && !originalPrice && parsed !== price) {
            originalPrice = parsed;
          }
        } 
        // Проверяем название товара
        else if (isValidTitle(itemText) && !title) {
          title = itemText;
        }
      }

      if (price) {
        products.push({
          store: 'lidl',
          catalog_folder: catalogFolder,
          page: pageName,
          product_name: title || 'Неизвестный товар',
          price: price,
          original_price: originalPrice || 0,
          discount_percent: discount,
          raw_text: candidates.map(c => c.text).join(' | ')
        });
      }
    }
  }

  return products;
}

function parseAllResults() {
  if (!fs.existsSync(LIDL_DIR)) {
    console.log('Папка каталогов не найдена:', LIDL_DIR);
    return;
  }

  const catalogFolders = fs.readdirSync(LIDL_DIR).filter(f => f.startsWith('catalog_'));
  const insertStmt = db.prepare(`
    INSERT INTO products (store, catalog_folder, page, product_name, price, original_price, discount_percent, raw_text)
    VALUES (@store, @catalog_folder, @page, @product_name, @price, @original_price, @discount_percent, @raw_text)
  `);

  let totalInserted = 0;

  for (const folder of catalogFolders) {
    const jsonPath = path.join(LIDL_DIR, folder, 'ocr_results.json');
    if (!fs.existsSync(jsonPath)) continue;

    const pageResults = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

    for (const pageData of pageResults) {
      const products = extractProductsSpatial(pageData.text_blocks, pageData.page, folder);
      for (const prod of products) {
        insertStmt.run(prod);
        totalInserted++;
      }
    }
  }

  console.log(`\nПарсинг завершен! Записано очищенных товаров в БД: ${totalInserted}`);
}

parseAllResults();