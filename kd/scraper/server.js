import express from 'express';
import path from 'path';
import Database from 'better-sqlite3';

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database('products.db');

app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.json());

// 1. Эндпоинт для списка категорий
app.get('/api/categories', (req, res) => {
  const { lang = 'fi' } = req.query;
  const catCol = `category_${lang}`;

  try {
    // Получаем уникальные категории для выбранного языка
    const query = `
      SELECT DISTINCT COALESCE(${catCol}, category_fi, 'Yleinen') AS category
      FROM products
      WHERE category IS NOT NULL AND category != ''
    `;
    const rows = db.prepare(query).all();
    const categories = rows.map(r => r.category);

    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Эндпоинт для получения товаров
app.get('/api/products', (req, res) => {
  const { lang = 'fi', search = '', category = '' } = req.query;

  try {
    const nameCol = `name_${lang}`;
    const catCol = `category_${lang}`;

    let query = `
      SELECT 
        id, 
        COALESCE(${nameCol}, name_fi, raw_ocr_text) AS name, 
        COALESCE(${catCol}, category_fi, 'Yleinen') AS category, 
        CAST(price AS REAL) AS price, 
        unit,
        discount_percent,
        CAST(original_price AS REAL) AS original_price
      FROM products 
      WHERE 1=1
    `;
    const params = [];

    // Поиск по всем языковым полям или сырому OCR-тексту
    if (search) {
      query += ` AND (name_fi LIKE ? OR name_en LIKE ? OR name_ru LIKE ? OR raw_ocr_text LIKE ?)`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }

    // Фильтр по категории
    if (category && category !== 'all') {
      query += ` AND (${catCol} = ? OR category_fi = ?)`;
      params.push(category, category);
    }

    const stmt = db.prepare(query);
    const rawProducts = stmt.all(...params);

    // Приведение цен к числовому формату для правильного работы .toFixed() на клиенте
    const data = rawProducts.map(p => ({
      ...p,
      price: p.price ? Number(p.price) : null,
      original_price: p.original_price ? Number(p.original_price) : null
    }));

    // Возвращаем в формате data: [...], как ждет app.js
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});