import express from 'express';
import path from 'path';
import cors from 'cors';
import Database from 'better-sqlite3';

const app = express();
const PORT = process.env.PORT || 3000;

// Otetaan CORS käyttöön
app.use(cors());
app.use(express.json());

// Tarjotaan staattiset tiedostot front-kansiosta
const frontPath = path.resolve(process.cwd(), '..', 'front');
app.use(express.static(frontPath));

// Tietokannan polku db-kansiossa
const dbPath = path.resolve(process.cwd(), '..', 'db', 'products.db');
const db = new Database(dbPath, { readonly: true });

// API: Hae kategorioiden lista
app.get('/api/categories', (req, res) => {
  try {
    const query = `
      SELECT DISTINCT catalog_folder AS category 
      FROM products 
      WHERE catalog_folder IS NOT NULL AND catalog_folder != ''
    `;
    const rows = db.prepare(query).all();
    const categories = rows.map(r => r.category);

    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Hae tuotelistaus hakuehdoilla ja suodatuksella
app.get('/api/products', (req, res) => {
  const { search = '', category = '' } = req.query;

  try {
    let query = `
      SELECT 
        id, 
        store,
        catalog_folder,
        page,
        product_name AS name, 
        catalog_folder AS category, 
        CAST(price AS REAL) AS price, 
        CAST(original_price AS REAL) AS original_price,
        discount_percent,
        offer_type,
        raw_text
      FROM products 
      WHERE 1=1
    `;
    const params = [];  

    // Haku nimen tai raakatekstin mukaan
    if (search) {
      query += ` AND (product_name LIKE ? OR raw_text LIKE ?)`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam);
    }

    // Suodatus katalogikansion (kategorian/kaupan) mukaan
    if (category && category !== 'all') {
      query += ` AND catalog_folder = ?`;
      params.push(category);
    }

    query += ` ORDER BY id DESC`;

    const stmt = db.prepare(query);
    const rawProducts = stmt.all(...params);

    const data = rawProducts.map(p => ({
      ...p,
      price: p.price ? Number(p.price) : null,
      original_price: p.original_price ? Number(p.original_price) : null,
      discount_percent: p.discount_percent ? Number(p.discount_percent) : null
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Palvelin käynnissä: http://localhost:${PORT}`);
});