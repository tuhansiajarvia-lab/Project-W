import Database from 'better-sqlite3';

const db = new Database('products.db');

// Удаляем старую таблицу, чтобы пересоздать её со всеми новыми колонками
db.exec(`DROP TABLE IF EXISTS products;`);

db.exec(`
  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_fi TEXT, name_en TEXT, name_ru TEXT,
    category_fi TEXT, category_en TEXT, category_ru TEXT,
    price REAL, unit TEXT, discount_percent TEXT, original_price REAL,
    raw_ocr_text TEXT,
    processed INTEGER DEFAULT 1
  );
`);

const stmt = db.prepare(`
  INSERT INTO products 
  (name_fi, name_en, name_ru, category_fi, category_en, category_ru, price, unit, discount_percent, original_price, raw_ocr_text, processed)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`);

stmt.run('Luomu Banaani', 'Organic Banana', 'Органический банан', 'Hedelmät', 'Fruits', 'Фрукты', 1.49, 'kg', '-25%', 1.99, 'Banaani 1.49');
stmt.run('Täysmaito 1l', 'Whole Milk 1l', 'Цельное молоко 1л', 'Maitotuotteet', 'Dairy', 'Молочные продукты', 0.95, 'kpl', null, null, 'Maito 0.95');
stmt.run('Kauraleipä', 'Oat Bread', 'Овсяный хлеб', 'Leipomo', 'Bakery', 'Выпечка', 1.89, 'pkg', '-10%', 2.10, 'Leipä 1.89');

console.log('База данных успешно пересоздана и заполнена!');