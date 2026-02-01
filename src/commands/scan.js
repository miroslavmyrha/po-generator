import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { config } from '../config.js';
import { createBrowser, login, getPageHtml, findAndClickModals } from '../lib/crawler.js';
import { analyzeHtml, analyzeModalContent } from '../lib/ai-client.js';

export async function scanCommand(options) {
  const framework = options.framework || config.framework || 'generic';

  console.log(chalk.blue('\n🤖 Spouštím AI scanner...\n'));
  console.log(chalk.gray(`Framework: ${framework}\n`));

  // Načti sitemap
  const sitemapPath = path.join(config.output.dir, 'sitemap.json');

  if (!fs.existsSync(sitemapPath)) {
    console.error(chalk.red('Sitemap neexistuje. Nejdřív spusť "po-gen crawl".'));
    process.exit(1);
  }

  let sitemap = JSON.parse(fs.readFileSync(sitemapPath, 'utf-8'));

  // Filtruj na konkrétní stránku pokud je zadána
  if (options.page) {
    sitemap = sitemap.filter((p) => p.path === options.page || p.path.includes(options.page));

    if (sitemap.length === 0) {
      console.error(chalk.red(`Stránka "${options.page}" nebyla nalezena v sitemap.`));
      process.exit(1);
    }
  }

  console.log(chalk.gray(`Skenuji ${sitemap.length} stránek...\n`));

  const spinner = ora('Spouštím prohlížeč').start();
  const { browser, page } = await createBrowser(true);

  const scanResults = [];
  const decisions = {};

  try {
    // Login
    if (config.auth.enabled) {
      spinner.text = 'Přihlašuji se...';
      await login(page);
      spinner.succeed('Přihlášen');
    }

    // Skenuj každou stránku
    for (let i = 0; i < sitemap.length; i++) {
      const pageInfo = sitemap[i];
      spinner.start(`[${i + 1}/${sitemap.length}] Skenuji: ${pageInfo.path}`);

      try {
        // Načti stránku
        await page.goto(pageInfo.url, { waitUntil: 'networkidle' });
        await page.waitForSelector(config.crawler.waitForSelector, { timeout: 5000 }).catch(() => {});

        // Získej HTML
        const html = await getPageHtml(page);

        // AI analýza
        spinner.text = `[${i + 1}/${sitemap.length}] AI analyzuje: ${pageInfo.path}`;
        const analysis = await analyzeHtml(html, pageInfo.path, {
          retries: parseInt(options.retry) || 3,
          framework,
        });

        if (!analysis) {
          spinner.warn(`AI analýza selhala pro ${pageInfo.path}`);
          continue;
        }

        // Skenuj modály
        if (analysis.elements) {
          const modalTriggers = analysis.elements.filter((e) => e.isModalTrigger);

          if (modalTriggers.length > 0) {
            spinner.text = `[${i + 1}/${sitemap.length}] Skenuji modály: ${pageInfo.path}`;
            const modalContents = await findAndClickModals(page, modalTriggers);

            // Analyzuj obsah modalů
            for (const modal of modalContents) {
              const modalAnalysis = await analyzeModalContent(modal.html, modal.trigger, { framework });
              if (modalAnalysis) {
                analysis.modals = analysis.modals || [];
                analysis.modals.push({
                  triggerElement: modal.trigger,
                  ...modalAnalysis,
                });
              }
            }
          }
        }

        // Ulož výsledek
        scanResults.push({
          ...pageInfo,
          analysis,
        });

        // Připrav decision
        decisions[pageInfo.path] = {
          decision: analysis.pageAnalysis.shouldBePageObject === true
            ? 'page_object'
            : analysis.pageAnalysis.shouldBePageObject === false
              ? 'skip'
              : 'ask_user',
          reason: analysis.pageAnalysis.reason,
          suggestedClassName: analysis.pageAnalysis.suggestedClassName,
          elementCount: analysis.elements?.length || 0,
        };

        spinner.succeed(`[${i + 1}/${sitemap.length}] ${pageInfo.path} - ${analysis.elements?.length || 0} elementů`);

      } catch (error) {
        spinner.warn(`Chyba na ${pageInfo.path}: ${error.message}`);
      }
    }

    // Ulož výsledky
    const scannedDir = path.join(config.output.dir, 'scanned');
    fs.mkdirSync(scannedDir, { recursive: true });

    for (const result of scanResults) {
      const fileName = result.path.replace(/\//g, '_').replace(/^_/, '') || 'home';
      const filePath = path.join(scannedDir, `${fileName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
    }

    // Ulož decisions
    const decisionsPath = path.join(config.output.dir, 'decisions.json');
    fs.writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2));

    console.log(chalk.green(`\n✅ Scan dokončen`));
    console.log(chalk.gray(`   Výsledky: ${scannedDir}/`));
    console.log(chalk.gray(`   Decisions: ${decisionsPath}`));

    // Souhrn
    const pageObjects = Object.values(decisions).filter((d) => d.decision === 'page_object').length;
    const skipped = Object.values(decisions).filter((d) => d.decision === 'skip').length;
    const askUser = Object.values(decisions).filter((d) => d.decision === 'ask_user').length;

    console.log(chalk.blue('\n📊 Souhrn rozhodnutí:'));
    console.log(chalk.green(`   ✅ Page Objects: ${pageObjects}`));
    console.log(chalk.gray(`   ⏭️  Přeskočeno: ${skipped}`));
    console.log(chalk.yellow(`   ❓ K rozhodnutí: ${askUser}`));

    if (askUser > 0) {
      console.log(chalk.yellow(`\n💡 Tip: Spusť "po-gen review" pro interaktivní rozhodnutí.`));
    } else {
      console.log(chalk.yellow(`\n💡 Tip: Spusť "po-gen generate" pro vytvoření Page Objects.`));
    }

  } finally {
    await browser.close();
  }
}
