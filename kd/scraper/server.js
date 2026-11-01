import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database('products.db');

app.use(cors());
app.use(express.json());

// Отдача статических файлов (будущий фронтенд)
app.use(express.static(path.join(__dirname, 'public')));

/**
 * GET /api/products
 * Параметры запроса:
 *  - lang: 'fi' | 'en' | 'ru' (по умолчанию 'fi')
 *  - category: название категории (на выбранном языке) или 'all'
 *  - search: поисковый запрос по названию
 */
app.get('/api/products', (req, res) => {
  try {
    const lang = (req.query.lang || 'fi').toLowerCase();
    const category = req.query.category || 'all';
    const search = req.query.search || '';

    // Определяем нужные колонки таблицы в зависимости от языка
    const nameCol = `name_${lang}`;
    const categoryCol = `category_${lang}`;

    let query = `
      SELECT 
        id, 
        catalog_name, 
        COALESCE(name_${lang}, product_name) AS name, 
        COALESCE(category_${lang}, 'Muut') AS category, 
        price, 
        unit, 
        discount_percent, 
        original_price 
      FROM products 
      WHERE 1=1
    `;

    const params = [];

    // Фильтрация по категории
    if (category !== 'all') {
      query += ` AND (category_${lang} = ? OR category_fi = ?)`;
      params.push(category, category);
    }

    // Поиск по названию (ищем и в локализованном поле, и в исходном product_name)
    if (search) {
      query += ` AND (name_${lang} LIKE ? OR product_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    };
    query += ' ORDER BY id DESC';

    const stmt = db.prepare(query);
    const products = stmt.all(...params);

    res.json({ success: true, count: products.length, data: products });
  } catch (error) {
    console.error('Ошибка сервера:', error.message);
    res.status(500).json({ success: false, error: 'Ошибка сервера при получении данных' });
  }
});

/**
 * GET /api/categories
 * Возвращает список всех уникальных категорий на выбранном языке
 */
app.get('/api/categories', (req, res) => {
  try {
    const lang = (req.query.lang || 'fi').toLowerCase();
    const categoryCol = `category_${lang}`;

    const query = `
      SELECT DISTINCT ${categoryCol} AS category 
      FROM products 
      WHERE ${categoryCol} IS NOT NULL AND ${categoryCol} != ''
      ORDER BY category ASC
    `;

    const rows = db.prepare(query).all();
    const categories = rows.map(r => r.category);

    res.json({ success: true, categories });
  } catch (error) {
    console.error('Ошибка при получении категорий:', error.message);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});