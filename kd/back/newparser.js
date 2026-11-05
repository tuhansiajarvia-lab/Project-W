import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import OpenAI from 'openai';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Жестко фиксируем абсолютный путь к папке db в корне проекта (kd/db)
const dbDir = path.resolve(__dirname, '../db');

// Принудительно создаем папку, если её нет
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`📁 Создана папка для базы данных: ${dbDir}`);
}

const dbPath = path.join(dbDir, 'products.db');
console.log(`📂 Путь к файлу БД: ${dbPath}`);

// Инициализация базы данных
const db = new Database(dbPath);

// Создаем таблицу под структуру, которую ожидает server.js
db.exec(`
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store TEXT,
        catalog_folder TEXT,
        page INTEGER,
        product_name TEXT,
        price REAL,
        original_price REAL,
        discount_percent REAL,
        offer_type TEXT,
        raw_text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_name, price)
    )
`);

// Подготавливаем SQL-запрос для вставки с защитой от дубликатов (INSERT OR IGNORE)
const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO products (
        store, catalog_folder, page, product_name, price, original_price, discount_percent, offer_type, raw_text
    ) 
    VALUES (
        @store, @catalog_folder, @page, @product_name, @price, @original_price, @discount_percent, @offer_type, @raw_text
    )
`);

// Подключаемся к локальной Ollama
const deepseek = new OpenAI({
    baseURL: 'http://localhost:11434/v1',
    apiKey: 'ollama'
});

// Функция рекурсивного поиска PNG
function getPngFiles(dirPath) {
    let results = [];
    if (!fs.existsSync(dirPath)) return results;
    
    const list = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const file of list) {
        const fullPath = path.join(dirPath, file.name);
        if (file.isDirectory()) {
            results = results.concat(getPngFiles(fullPath));
        } else if (file.name.toLowerCase().endsWith('.png')) {
            results.push(fullPath);
        }
    }
    return results;
}

// Функция парсинга страницы и сохранения в SQLite
async function parsePageAndSale(filePath) {
    console.log(`Чтение файла картинки: ${filePath}`);
    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString('base64');

    const prompt = `
    Extract products from this supermarket catalog page into a JSON object with a key "products" containing an array of items.
    Each item must have:
    - "product_name": string (product name in Finnish)
    - "price": number (regular/current price)
    - "original_price": number or null (old price before discount, if present)
    - "discount_percent": number or null (discount percentage as a number, e.g. 14 for -14%, or null)
    - "offer_type": string or null (e.g. "Tarjous", "Club", or null)
    `;

    const response = await deepseek.chat.completions.create({
        model: "minicpm-v",
        messages: [
            {
                role: "system",
                content: "You are a precise OCR and data extraction assistant that outputs strictly in JSON format."
            },
            {
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/png;base64,${base64Image}`
                        }
                    }
                ]
            }
        ],
        response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    console.log("Ответ от модели:\n", content);

    try {
        const parsedData = JSON.parse(content);
        const products = parsedData.products || [];

        if (products.length > 0) {
            // Используем транзакцию для быстрой и безопасной записи пачки товаров
            const insertMany = db.transaction((items) => {
                for (const item of items) {
                    insertStmt.run({
                        store: 'lidl',
                        catalog_folder: path.basename(path.dirname(filePath)), // имя папки каталога
                        page: 1, // номер страницы
                        product_name: item.product_name || item.name || 'Unknown',
                        price: typeof item.price === 'number' ? item.price : 0,
                        original_price: item.original_price || null,
                        discount_percent: item.discount_percent || null,
                        offer_type: item.offer_type || null,
                        raw_text: content
                    });
                }
            });

            insertMany(products);
            console.log(`Успешно сохранено товаров в БД: ${products.length}`);
        } else {
            console.log("На странице не найдено товаров для сохранения.");
        }
    } catch (e) {
        console.error("Ошибка при парсинге JSON или записи в БД:", e.message);
    }
}

// Главная функция обхода каталогов
async function processAllPages(dir) {
    const files = getPngFiles(dir);
    console.log(`Найдено страниц для обработки: ${files.length}`);
    
    if (files.length === 0) {
        console.log("Не найдено ни одной картинки для парсинга.");
        return;
    }

    for (let i = 0; i < files.length; i++) {
        const filePath = files[i];
        console.log(`\n--- Обработка файла [${i + 1}/${files.length}]: ${filePath} ---`);
        
        try {
            await parsePageAndSale(filePath);
        } catch (error) {
            console.error(`Ошибка при обработке файла ${filePath}:`, error.message);
        }

        if (i < files.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log('Парсинг всего каталога и сохранение в БД успешно завершены!');
}

// Запуск обхода каталогов Lidl
processAllPages('../catalogs/lidl');