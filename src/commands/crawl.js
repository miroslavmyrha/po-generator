import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { config } from '../config.js';
import { createBrowser, login, crawlUrls } from '../lib/crawler.js';

export async function crawlCommand(options) {
  console.log(chalk.blue('\n🔍 Spouštím crawler...\n'));

  const spinner = ora('Spouštím prohlížeč').start();

  const { browser, page } = await createBrowser(true);

  try {
    // Login pokud je potřeba
    if (config.auth.enabled && options.login !== false) {
      spinner.text = 'Přihlašuji se...';
      const loginSuccess = await login(page);

      if (!loginSuccess) {
        spinner.fail('Login selhal');
        await browser.close();
        process.exit(1);
      }
      spinner.succeed('Přihlášen');
    }

    // Crawl
    spinner.start('Procházím aplikaci...');
    let pageCount = 0;

    const sitemap = await crawlUrls(page, async (pageInfo) => {
      pageCount++;
      spinner.text = `Procházím: ${pageInfo.path} (${pageCount} stránek)`;
    });

    spinner.succeed(`Nalezeno ${sitemap.length} stránek`);

    // Ulož sitemap
    const outputDir = config.output.dir;
    fs.mkdirSync(outputDir, { recursive: true });

    const sitemapPath = path.join(outputDir, 'sitemap.json');
    fs.writeFileSync(sitemapPath, JSON.stringify(sitemap, null, 2));

    console.log(chalk.green(`\n✅ Sitemap uložena: ${sitemapPath}`));

    // Zobraz přehled
    console.log(chalk.blue('\n📊 Přehled stránek:\n'));

    const table = sitemap.map((p) => ({
      path: p.path,
      title: p.title?.substring(0, 30) || '-',
      elements: p.interactiveCount,
      form: p.hasForm ? '✓' : '',
      table: p.hasTable ? '✓' : '',
    }));

    console.table(table);

    console.log(chalk.yellow('\n💡 Tip: Spusť "po-gen scan" pro AI analýzu elementů.\n'));
  } finally {
    await browser.close();
  }
}
