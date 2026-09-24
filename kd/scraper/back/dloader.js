import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function downloadCatalogs() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Открываем страницу лидл каталогов...');
  await page.goto('https://www.lidl.fi/tarjoukset/mainokset', { waitUntil: 'networkidle' });

  await page.waitForSelector('a[href*="/tarjouslehti/"]', { timeout: 10000 }).catch(() => {
    console.log('Элементы каталогов не найдены по селектору.');
  });

  const catalogLinks = await page.$$eval('a[href*="/tarjouslehti/"]', links =>
    Array.from(new Set(links.map(l => l.href)))
  );

  console.log(`Найдено каталогов: ${catalogLinks.length}`);

  for (let i = 0; i < catalogLinks.length; i++) {
    const link = catalogLinks[i];
    const folderName = `catalog_${i + 1}`;

    if (!fs.existsSync(folderName)) {
      fs.mkdirSync(folderName);
    }

    console.log(`\nОткрываем каталог ${i + 1}: ${link}`);
    const catalogPage = await browser.newPage();
    await catalogPage.goto(link, { waitUntil: 'domcontentloaded' });
    await catalogPage.waitForTimeout(3000);

    for (let pageNum = 1; pageNum <= 10; pageNum++) {
      const imgPath = path.join(folderName, `page_${pageNum}.png`);
      await catalogPage.screenshot({ path: imgPath });
      console.log(`  Сохранена страница ${pageNum} -> ${imgPath}`);

      const nextButton = await catalogPage.$('button[aria-label*="Seuraava"]');
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
  console.log('\nСкачивание каталогов завершено!');
}

downloadCatalogs().catch(console.error);