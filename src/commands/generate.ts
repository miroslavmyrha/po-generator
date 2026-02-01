import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { config } from '../config.js';
import { generatePageObject, savePageObject, generateIndexFile } from '../lib/generator.js';
import type { GenerateOptions, Decisions } from '../types.js';

interface GeneratedInfo {
  className: string;
  filePath: string;
  path: string;
}

export async function generateCommand(options: GenerateOptions): Promise<void> {
  console.log(chalk.blue('\n📝 Generuji Page Objects...\n'));

  const outputDir = options.output || path.join(config.output.dir, 'pages');
  const typescript = options.typescript || false;
  const ext = typescript ? 'ts' : 'js';

  // Načti decisions
  const decisionsPath = path.join(config.output.dir, 'decisions.json');

  if (!fs.existsSync(decisionsPath)) {
    console.error(chalk.red('Decisions neexistují. Nejdřív spusť "po-gen scan".'));
    process.exit(1);
  }

  const decisions: Decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf-8'));

  // Filtruj pouze page_object
  const toGenerate = Object.entries(decisions)
    .filter(([, d]) => d.decision === 'page_object')
    .map(([pagePath]) => pagePath);

  if (toGenerate.length === 0) {
    console.log(chalk.yellow('Žádné stránky k generování.'));
    console.log(chalk.gray('Uprav decisions.json nebo spusť "po-gen review".'));
    return;
  }

  console.log(chalk.gray(`Generuji ${toGenerate.length} Page Objects...\n`));

  const spinner = ora('Generuji...').start();
  const generated: GeneratedInfo[] = [];
  const scannedDir = path.join(config.output.dir, 'scanned');

  for (const pagePath of toGenerate) {
    const fileName = pagePath.replace(/\//g, '_').replace(/^_/, '') || 'home';
    const scanFile = path.join(scannedDir, `${fileName}.json`);

    if (!fs.existsSync(scanFile)) {
      spinner.warn(`Scan výsledek pro ${pagePath} neexistuje`);
      continue;
    }

    const scanData = JSON.parse(fs.readFileSync(scanFile, 'utf-8'));

    if (!scanData.analysis) {
      spinner.warn(`Žádná analýza pro ${pagePath}`);
      continue;
    }

    spinner.text = `Generuji: ${pagePath}`;

    try {
      // Připrav data pro generátor
      const pageData = {
        pageAnalysis: {
          url: pagePath,
          purpose: scanData.analysis.pageAnalysis?.purpose || '',
          suggestedClassName: decisions[pagePath]?.suggestedClassName ||
            scanData.analysis.pageAnalysis?.suggestedClassName,
        },
        elements: scanData.analysis.elements || [],
        modals: scanData.analysis.modals || [],
      };

      // Generuj kód
      const { code, className } = generatePageObject(pageData, { typescript });

      // Ulož
      const filePath = savePageObject(code, className, outputDir, ext);

      generated.push({ className, filePath, path: pagePath });
      spinner.succeed(`${className} → ${path.basename(filePath)}`);

    } catch (error) {
      spinner.warn(`Chyba při generování ${pagePath}: ${(error as Error).message}`);
    }
  }

  // Generuj index soubor
  if (generated.length > 0) {
    spinner.start('Generuji index soubor...');
    const classNames = generated.map((g) => g.className);
    const indexPath = generateIndexFile(classNames, outputDir, ext);
    spinner.succeed(`Index → ${path.basename(indexPath)}`);
  }

  // Souhrn
  console.log(chalk.green(`\n✅ Vygenerováno ${generated.length} Page Objects`));
  console.log(chalk.gray(`   Výstup: ${outputDir}/`));

  console.log(chalk.blue('\n📁 Soubory:'));
  for (const g of generated) {
    console.log(chalk.gray(`   ${g.className} (${g.path})`));
  }

  // Příklad použití
  console.log(chalk.blue('\n💡 Příklad použití v testu:\n'));
  if (generated.length > 0) {
    const example = generated[0];
    console.log(chalk.gray(`   import { ${example.className} } from './pages';`));
    console.log(chalk.gray(`   `));
    console.log(chalk.gray(`   test('example', async ({ page }) => {`));
    console.log(chalk.gray(`     const ${example.className.replace('Page', '').toLowerCase()} = new ${example.className}(page);`));
    console.log(chalk.gray(`     await ${example.className.replace('Page', '').toLowerCase()}.goto();`));
    console.log(chalk.gray(`   });`));
  }
}
