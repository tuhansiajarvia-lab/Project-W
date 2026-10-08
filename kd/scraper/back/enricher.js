import fs from 'fs';
import path from 'path';

// URL нашего запущенного Python OCR микросервиса
const OCR_SERVICE_URL = 'http://127.0.0.1:5000/process-image';

/**
 * Функция для отправки одного изображения в Python OCR
 */
async function processImageWithOCR(imagePath) {
  try {
    const response = await fetch(OCR_SERVICE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image_path: imagePath }),
    });

    if (!response.ok) {
      throw new Error(`Ошибка OCR сервера: status ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Ошибка при обработке файла ${imagePath}:`, error.message);
    return null;
  }
}

/**
 * Основная функция обогащения всех каталогов Lidl
 */
async function processAllCatalogs() {
  const lidlCatalogsDir = path.join(process.cwd(), 'catalogs', 'lidl');

  if (!fs.existsSync(lidlCatalogsDir)) {
    console.log('Папка с каталогами не найдена:', lidlCatalogsDir);
    return;
  }

  // Получаем список всех папок catalog_*
  const catalogFolders = fs.readdirSync(lidlCatalogsDir).filter(folder => folder.startsWith('catalog_'));

  console.log(`Найдено каталогов для обработки: ${catalogFolders.length}`);

  for (const catalogFolder of catalogFolders) {
    const catalogPath = path.join(lidlCatalogsDir, catalogFolder);
    console.log(`\n--- Обработка каталога: ${catalogFolder} ---`);

    // Читаем все .png файлы из каталога и сортируем их по номеру страницы
    const imageFiles = fs.readdirSync(catalogPath)
      .filter(file => file.endsWith('.png'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
        const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
        return numA - numB;
      });

    const catalogResults = [];

    for (const imageFile of imageFiles) {
      const absoluteImagePath = path.join(catalogPath, imageFile);
      console.log(`[OCR] Отправляем страницу: ${imageFile}...`);

      const ocrResult = await processImageWithOCR(absoluteImagePath);

      if (ocrResult && ocrResult.success) {
        console.log(`  └─ Найдено текстовых блоков: ${ocrResult.text_blocks.length}`);
        catalogResults.push({
          page: imageFile,
          text_blocks: ocrResult.text_blocks,
        });
      }
    }

    // Сохраняем итоговый результат распознавания в JSON рядом с картинками
    const resultJsonPath = path.join(catalogPath, 'ocr_results.json');
    fs.writeFileSync(resultJsonPath, JSON.stringify(catalogResults, null, 2), 'utf-8');
    console.log(`Результаты сохранены в: ${resultJsonPath}`);
  }

  console.log('\nОбработка всех каталогов завершена!');
}

processAllCatalogs().catch(console.error);