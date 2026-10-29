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

// Пересоздаём таблицу с раздельными полями для процентов и типов акций
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
    discount_percent INTEGER,
    offer_type TEXT,
    raw_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Расширенный список мусорных и промо-слов (исключаем из названий)
const STOP_WORDS = new Set([
  'parasta', 'sesongin', 'aina', 'halvat', 'hinnat', 'kannattaa', 
  'tarjoukset', 'sulje', 'valikko', 'plus', 'lidl', 'erä', 'alkaen',
  'sovelluksella', 'apilla', 'etu', 'voimassa', 'vaan', 'kpl', 'ota', 'kplta',
  'se', 'klo', 'vaan', 'ja', 'from', 'to'
]);

function parsePrice(str) {
  if (!str) return null;
  
  // Убираем всё, кроме цифр, запятых и точек
  let cleaned = str.replace(',', '.').replace(/[^0-9.]/g, '');
  
  // Если распарсилось несколько точек, оставляем последнюю или склеиваем правильно
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    cleaned = parts[parts.length - 2] + '.' + parts[parts.length - 1];
  }

  // Если строка вида "150" без точки, но похожа на цену
  if (/^\d{3,4}$/.test(cleaned)) {
    cleaned = (parseFloat(cleaned) / 100).toFixed(2);
  }
  
  const val = parseFloat(cleaned);
  
  // Фильтруем аномальные цены (от 0.20€ до 50.00€ для розницы в каталогах)
  if (isNaN(val) || val < 0.20 || val > 50.00) {
    return null;
  }
  
  return val;
}

function isValidTitle(text) {
  if (!text || text.length < 3) return false;
  
  const clean = text.trim();
  const lower = clean.toLowerCase();
  
  // Игнорируем стоп-слова и промо-фразы
  if (STOP_WORDS.has(lower)) return false;
  if (lower.includes('lidl plus') || lower.includes('sovelluksella') || lower.includes('app')) return false;
  
  // Отсекаем строки, содержащие проценты или состоящие сплошной цифрой
  if (/%|\d{3,}/.test(lower)) return false;
  
  // Строгая проверка: в названии обязательно должны быть нормальные буквы (включая финские ä, ö, å)
  if (!/[a-zäöåA-ZÄÖÅ]{3,}/.test(clean)) return false; 

  // Отсекаем строки, которые состоят только из мер или цен
  if (/^\d+\s*(kpl|g|kg|ml|l|eur|€)$/i.test(clean)) return false;
  if (/^\d+[.,]\d{2}\s*€?$/.test(clean)) return false;

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
  const percentMatchRegex = /-(\d{2})%/i;
  const priceRegex = /(\d+[.,]\d{2})/;

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

    // Ищем маркер акции/скидки или ценник как опорную точку
    if (discountRegex.test(text) || priceRegex.test(text)) {
      const hasBbox = Array.isArray(block.bbox) && block.bbox.length >= 4;
      const center = hasBbox ? getCenter(block.bbox) : null;

      let candidates = [];

      if (center) {
        // Собираем ближайших соседей по координатам (в радиусе карточки товара)
        candidates = normalizedBlocks
          .filter((_, idx) => idx !== i)
          .map(b => ({
            ...b,
            dist: (Array.isArray(b.bbox) && b.bbox.length >= 4) ? getDistance(center, getCenter(b.bbox)) : 99999
          }))
          .sort((a, b) => a.dist - b.dist)
          .filter(b => b.dist < 250) // Ограничиваем радиус поиска соседей в пикселях страницы
          .slice(0, 8); // Берём до 8 ближайших блоков
      } else {
        candidates = normalizedBlocks.slice(Math.max(0, i - 3), Math.min(normalizedBlocks.length, i + 4));
      }

      let title = '';
      const foundPrices = [];
      let discountPercent = null;
      let offerType = null;

      // Проверяем текущий блок на наличие скидки
      if (discountRegex.test(text)) {
        const rawDiscountText = text.match(discountRegex)[0];
        if (percentMatchRegex.test(rawDiscountText)) {
          const match = rawDiscountText.match(percentMatchRegex);
          discountPercent = parseInt(match[1], 10);
        } else {
          offerType = rawDiscountText;
        }
      }

      // Анализируем кандидатов вокруг опорной точки
      for (const item of candidates) {
        const itemText = item.text || '';

        // Проверяем на скидку в соседних блоках, если еще не нашли
        if (!discountPercent && !offerType && discountRegex.test(itemText)) {
          const rawDiscountText = itemText.match(discountRegex)[0];
          if (percentMatchRegex.test(rawDiscountText)) {
            const match = rawDiscountText.match(percentMatchRegex);
            discountPercent = parseInt(match[1], 10);
          } else {
            offerType = rawDiscountText;
          }
        }

        // Собираем цены
        if (priceRegex.test(itemText)) {
          const parsed = parsePrice(itemText);
          if (parsed && !foundPrices.includes(parsed)) {
            foundPrices.push(parsed);
          }
        } 
        // Ищем валидное название товара
        else if (!title && isValidTitle(itemText)) {
          title = itemText;
        }
      }

      let price = null;
      let originalPrice = null;

      // Умное распределение цен: меньшая цена — актуальная, большая — старая
      if (foundPrices.length > 0) {
        foundPrices.sort((a, b) => a - b);
        if (foundPrices.length >= 2) {
          price = foundPrices[0];
          originalPrice = foundPrices[foundPrices.length - 1];
        } else {
          price = foundPrices[0];
        }
      }

      // Чистим название от висящих дефисов
      if (title) {
        title = title.trim();
        if (title.endsWith('-')) {
          title = title.slice(0, -1).trim();
        }
      }

      // Добавляем товар в массив, только если у него есть адекватная цена и название
      if (price && title) {
        // Защита от дубликатов в рамках одной страницы
        const exists = products.some(p => p.product_name === title && p.price === price);
        if (!exists) {
          products.push({
            store: 'lidl',
            catalog_folder: catalogFolder,
            page: pageName,
            product_name: title,
            price: price,
            original_price: originalPrice || 0,
            discount_percent: discountPercent,
            offer_type: offerType,
            raw_text: candidates.map(c => c.text).join(' | ')
          });
        }
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
    INSERT INTO products (store, catalog_folder, page, product_name, price, original_price, discount_percent, offer_type, raw_text)
    VALUES (@store, @catalog_folder, @page, @product_name, @price, @original_price, @discount_percent, @offer_type, @raw_text)
  `);

  let totalInserted = 0;

  // Очищаем старые данные перед новой вставкой
  db.exec('DELETE FROM products;');

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