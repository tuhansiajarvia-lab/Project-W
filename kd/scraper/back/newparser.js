import fs from 'fs';
import path from 'path';
import OpenAI from 'openai'; // DeepSeek совместим с OpenAI SDK
import Database from 'better-sqlite3';

const db = new Database('products.db');

// Инициализация клиента DeepSeek
const deepseek = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com' // или актуальный эндпоинт DeepSeek
});

async function parseCatalogPage(imagePath, catalogName) {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const prompt = `
    Ты профессиональный парсер рекламных каталогов Lidl Финляндия. 
    Проанализируй изображение страницы каталога и верни JSON-массив товаров.
    Для каждого товара укажи следующие поля:
    - product_name (строка, исходный текст с картинки на финском/шведском)
    - price (число, текущая цена в евро, если есть)
    - unit (строка, единица измерения, например: kg, kpl, l, pkt)
    - discount_percent (строка или число, размер скидки если есть)
    - original_price (число, старая цена до скидки)
    - name_fi, name_en, name_ru (переведенные и очищенные названия на финском, английском и русском)
    - category_fi, category_en, category_ru (категории товара на трех языках)

    Ответ верни строго в формате JSON без лишнего текста и Markdown-разметки (только валидный JSON-массив).
    `;

    try {
        const response = await deepseek.chat.completions.create({
            model: "deepseek-chat", // или модель с поддержкой vision, если используется мультимодальный эндпоинт
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