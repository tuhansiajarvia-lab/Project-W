import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Определение __dirname для ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Гарантированный абсолютный путь к корневой папке scraper/catalogs/lidl
const BASE_CATALOGS_DIR = path.resolve(__dirname, '..', 'catalogs', 'lidl');

async function downloadCatalogs() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  console.log('Открываем страницу лидл каталогов...');
  await page.goto('https://www.lidl.fi/tarjouslehdet', { waitUntil: 'domcontentloaded' });

  // 1. Закрываем куки
  try {
    const cookieBtn = await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 3000 });
    if (cookieBtn) {
      await cookieBtn.click();
      console.log('Баннер куки закрыт.');
    }
  } catch (e) {}

  // 2. Закрываем окно выбора магазина (Valitse Lidl-myymälä)
  try {
    const closeBtn = await page.waitForSelector('button[aria-label*="Sulje"], button.flyout__close, .dialog__close', { timeout: 3000 });
    if (closeBtn) {
      await closeBtn.click();
      console.log('Окно выбора магазина закрыто.');
    } else {
      await page.keyboard.press('Escape');
    }
  } catch (e) {
    await page.keyboard.press('Escape');
  }

  await page.waitForTimeout(1000);

  // 3. Ищем карточки каталогов
  const catalogSelector = 'article, .flyer-item, a[href*="leaflets"], a[href*="tarjousleht"]';
  await page.waitForSelector(catalogSelector, { timeout: 10000 }).catch(() => {
    console.log('Элементы каталогов не найдены по селектору.');
  });

  // Собираем ссылки из всех найденных блоков
  const catalogLinks = await page.$$eval('a', links =>
    Array.from(new Set(
      links
        .map(l => l.href)
        .filter(href => href.includes('leaflets') || href.includes('tarjousleht') || href.includes('/l/fi/'))
    ))
  );

  console.log(`Найдено ссылок на каталоги: ${catalogLinks.length}`);

  if (catalogLinks.length === 0) {
    console.log('Пробуем кликнуть по первой карточке каталога напрямую...');
    const cards = await page.$$(catalogSelector);
    if (cards.length > 0) {
      await cards[0].click();
      await page.waitForTimeout(3000);
      console.log('Перешли в каталог:', page.url());
      catalogLinks.push(page.url());
    }
  }

  for (let i = 0; i < catalogLinks.length; i++) {
    const link = catalogLinks[i];
    
    // Путь теперь жестко зафиксирован относительно корня проекта scraper/
    const folderName = path.join(BASE_CATALOGS_DIR, `catalog_${i + 1}`);

    if (!fs.existsSync(folderName)) {
      fs.mkdirSync(folderName, { recursive: true });
    }

    console.log(`\nОткрываем каталог ${i + 1}: ${link}`);
    const catalogPage = await context.newPage();
    await catalogPage.goto(link, { waitUntil: 'domcontentloaded' });
    await catalogPage.waitForTimeout(3000);

    for (let pageNum = 1; pageNum <= 10; pageNum++) {
      const imgPath = path.join(folderName, `page_${pageNum}.png`);
      await catalogPage.screenshot({ path: imgPath });
      console.log(`  Сохранена страница ${pageNum} -> ${imgPath}`);

      const nextButton = await catalogPage.$('button[aria-label*="Seuraava"], button[aria-label*="Next"], .nav-next');
      if (nextButton) {
        await nextButton.click();
        await catalogPage.waitForTimeout(1500);
      } else {
        await catalogPage.keyboard.press('ArrowRight');
        await catalogPage.waitForTimeout(1500);
      }
    }
    await catalogPage.close();
  }

  await browser.close();
  console.log('\nСкачивание завершено!');
}

downloadCatalogs().catch(console.error);