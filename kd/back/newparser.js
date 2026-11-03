import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import Database from 'better-sqlite3';

const db = new Database('db/products.db');

const deepseek = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com'
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function parseCatalogPage(imagePath) {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const prompt = `
    Ты профессиональный парсер рекламных каталогов Lidl Финляндия. 
    Проанализируй изображение страницы каталога и верни JSON-объект с массивом товаров в ключе "products".
    Для каждого товара укажи следующие поля:
    - product_name (строка, исходный текст с картинки на финском/шведском)
    - price (число, текущая цена в евро, если есть, иначе null)
    - unit (строка, единица измерения, например: kg, kpl, l, pkt)
    - discount_percent (строка или число, размер скидки если есть)
    - original_price (число, старая цена до скидки, если есть)
    - name_fi, name_en, name_ru (переведенные и очищенные названия на финском, английском и русском)
    - category_fi, category_en, category_ru (категории товара на трех языках)

    Ответ верни строго в формате JSON без лишнего текста и Markdown-разметки.
    `;

    try {
        const response = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        { 
                            type: "image_url", 
                            image_url: { url: `data:image/png;base64,${base64Image}` } 
                        }
                    ]
                }
            ],
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);
        return result.products || [];
    } catch (error) {
        console.error(`Ошибка при обработке страницы ${imagePath}:`, error);
        return [];
    }
}

async function processAllPages(imagesDir) {
    const files = fs.readdirSync(imagesDir).filter(file => file.endsWith('.png'));
    
    console.log(`Найдено страниц для обработки: ${files.length}`);

    // Подготовка таблицы в SQLite, если её еще нет
    db.prepare(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_name TEXT,
            price REAL,
            unit TEXT,
            discount_percent TEXT,
            original_price REAL,
            name_fi TEXT,
            name_en TEXT,
            name_ru TEXT,
            category_fi TEXT,
            category_en TEXT,
            category_ru TEXT
        )
    `).run();

    const insertStmt = db.prepare(`
        INSERT INTO products (product_name, price, unit, discount_percent, original_price, name_fi, name_en, name_ru, category_fi, category_en, category_ru)
        VALUES (@product_name, @price, @unit, @discount_percent, @original_price, @name_fi, @name_en, @name_ru, @category_fi, @category_en, @category_ru)
    `);

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = path.join(imagesDir, file);
        console.log(`Обработка страницы [${i + 1}/${files.length}]: ${file}...`);

        const products = await parseCatalogPage(filePath);
        
        // Сохранение товаров в базу данных в рамках транзакции
        const insertMany = db.transaction((items) => {
            for (const item of items) insertStmt.run(item);
        });
        insertMany(products);

        console.log(`Страница ${file} обработана. Найдено товаров: ${products.length}`);

        // Если это не последняя страница, делаем паузу 15 секунд
        if (i < files.length - 1) {
            console.log(`Пауза 10 секунд перед следующей страницей...`);
            await sleep(10000);
        }
    }

    console.log('Парсинг всего каталога успешно завершен!');
}

// Запуск функции по папке с картинками (например, скачанными через dloader.js)
processAllPages('./catalogs');