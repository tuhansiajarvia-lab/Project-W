import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.resolve(__dirname, '..', 'db');
const LIDL_DIR = path.resolve(__dirname, '..', 'catalogs', 'lidl');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(path.join(DB_DIR, 'products.db'));

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

// Расширенный список стоп-слов для отсечения маркетингового мусора
const STOP_WORDS = new Set([
  'parasta', 'sesongin', 'aina', 'halvat', 'hinnat', 'kannattaa', 
  'tarjoukset', 'sulje', 'valikko', 'plus', 'lidl', 'erä', 'alkaen',
  'sovelluksella', 'apilla', 'etu', 'voimassa', 'vaan', 'kpl', 'ota', 'kplta',
  'se', 'klo', 'ja', 'from', 'to', 'aina halvat hinnat'
]);

function parsePrice(str) {
  if (!str) return null;
  let cleaned = str.replace(',', '.').replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    cleaned = parts[parts.length - 2] + '.' + parts[parts.length - 1];
  }
  if (/^\d{3,4}$/.test(cleaned)) {
    cleaned = (parseFloat(cleaned) / 100).toFixed(2);
  }
  const val = parseFloat(cleaned);
  if (isNaN(val) || val < 0.20 || val > 50.00) {
    return null;
  }
  return val;
}

function isValidTitle(text) {
  if (!text || text.length < 3) return false;
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // Отсекаем стоп-слова и рекламные слоганы целиком
  if (STOP_WORDS.has(lower)) return false;
  if (lower.includes('aina halvat') || lower.includes('lidl plus') || lower.includes('sovelluksella')) return false;
  if (/%|\d{3,}/.test(lower)) return false;

  // Название должно содержать минимум одно нормальное финское/латинское слово из 3+ букв
  if (!/[a-zäöåA-ZÄÖÅ]{3,}/.test(clean)) return false; 

  // Отсекаем мусор вроде случайных буквосочетаний без гласных (как hntksean или aooeahone)
  const vowels = (clean.match(/[aeiouyäöå]/gi) || []).length;
  if (vowels < 2) return false;

  // Отсекаем мерки и чистые цены
  if (/^\d+\s*(kpl|g|kg|ml|l|eur|€)$/i.test(clean)) return false;
  if (/^\d+[.,]\d{2}\s*€?$/.test(clean)) return false;

  return true;
}

function getCenter(bbox) {
  if (!Array.isArray(bbox) || bbox.length < 4) return [0, 0];
  try {
    const xCoords = bbox.map(p => Array.isArray(p) ? p[0] : 0);
    const yCoords = bbox.map(p => Array.isArray(p) ? p[1] : 0);
    return [(Math.min(...xCoords) + Math.max(...xCoords)) / 2, (Math.min(...yCoords) + Math.max(...yCoords)) / 2];
  } catch (e) {
    return [0, 0];
  }
}

function extractProductsSpatial(textBlocks, pageName, catalogFolder) {
  const products = [];
  const discountRegex = /(-\d{2}%|\d+\s*kpl|Ota\s*\d+)/i;
  const percentMatchRegex = /-(\d{2})%/i;
  const priceRegex = /(\d+[.,]\d{2})/;

  if (!Array.isArray(textBlocks)) return products;

  const normalizedBlocks = textBlocks.map(b => {
    if (typeof b === 'string') return { text: b, bbox: null };
    if (typeof b === 'object' && b !== null) return b;
    return { text: String(b || ''), bbox: null };
  });

  for (let i = 0; i < normalizedBlocks.length; i++) {
    const block = normalizedBlocks[i];
    const text = block.text || '';

    // Ищем цену или акцию как опорную точку карточки
    if (discountRegex.test(text) || priceRegex.test(text)) {
      const hasBbox = Array.isArray(block.bbox) && block.bbox.length >= 4;
      const center = hasBbox ? getCenter(block.bbox) : [0, 0];

      // Ищем блоки, которые находятся РЯДОМ и ЧУТЬ ВЫШЕ цены (где обычно пишется название товара)
      const candidates = normalizedBlocks
        .filter((_, idx) => idx !== i)
        .map(b => {
          const bCenter = (Array.isArray(b.bbox) && b.bbox.length >= 4) ? getCenter(b.bbox) : [0, 0];
          const dx = Math.abs(center[0] - bCenter[0]);
          const dy = center[1] - bCenter[1]; // Положительное dy означает, что блок находится ВЫШЕ цены
          return {
            ...b,
            dx,
            dy,
            // Приоритет блокам, которые находятся по горизонтали недалеко и чуть выше цены
            score: dx + (dy >= 0 && dy < 150 ? dy * 0.5 : 500)
          };
        })
        .sort((a, b) => a.score - b.score)
        .filter(b => b.dx < 180 && b.dy > -50 && b.dy < 200) // Жесткие рамки карточки товара
        .slice(0, 6);

      let title = '';
      const foundPrices = [];
      let discountPercent = null;
      let offerType = null;

      if (discountRegex.test(text)) {
        const matchVal = text.match(discountRegex)[0];
        if (percentMatchRegex.test(matchVal)) {
          discountPercent = parseInt(matchVal.match(percentMatchRegex)[1], 10);
        } else {
          offerType = matchVal;
        }
      }

      // Проверяем текущий блок и кандидатов на цены и название
      if (priceRegex.test(text)) {
        const p = parsePrice(text);
        if (p) foundPrices.push(p);
      }

      for (const item of candidates) {
        const itemText = item.text || '';

        if (!discountPercent && !offerType && discountRegex.test(itemText)) {
          const matchVal = itemText.match(discountRegex)[0];
          if (percentMatchRegex.test(matchVal)) {
            discountPercent = parseInt(matchVal.match(percentMatchRegex)[1], 10);
          } else {
            offerType = matchVal;
          }
        }

        if (priceRegex.test(itemText)) {
          const parsed = parsePrice(itemText);
          if (parsed && !foundPrices.includes(parsed)) {
            foundPrices.push(parsed);
          }
        } else if (!title && isValidTitle(itemText)) {
          title = itemText;
        }
      }

      let price = null;
      let originalPrice = null;

      if (foundPrices.length > 0) {
        foundPrices.sort((a, b) => a - b);
        if (foundPrices.length >= 2) {
          price = foundPrices[0];
          originalPrice = foundPrices[foundPrices.length - 1];
        } else {
          price = foundPrices[0];
        }
      }

      if (title) {
        title = title.trim().replace(/-$/, '').trim();
      }

      // Додаем товар только при наличии реального названия и цены
      if (price && title) {
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