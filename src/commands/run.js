import chalk from 'chalk';
import { crawlCommand } from './crawl.js';
import { scanCommand } from './scan.js';
import { reviewCommand } from './review.js';
import { generateCommand } from './generate.js';

export async function runCommand(options) {
  console.log(chalk.blue.bold('\n🚀 Spouštím kompletní workflow...\n'));
  console.log(chalk.gray('─'.repeat(60)));

  const startTime = Date.now();

  try {
    // 1. Crawl
    console.log(chalk.blue('\n📍 Fáze 1: Crawling\n'));
    await crawlCommand({ login: true });

    // 2. Scan
    console.log(chalk.blue('\n📍 Fáze 2: AI Scanning\n'));
    await scanCommand({ retry: '3', framework: options.framework });

    // 3. Review (pokud není přeskočeno)
    if (!options.skipReview) {
      console.log(chalk.blue('\n📍 Fáze 3: Review\n'));
      await reviewCommand();
    }

    // 4. Generate
    console.log(chalk.blue('\n📍 Fáze 4: Generování Page Objects\n'));
    await generateCommand({});

    // Souhrn
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(chalk.gray('\n' + '─'.repeat(60)));
    console.log(chalk.green.bold(`\n✅ Workflow dokončen za ${elapsed}s\n`));

  } catch (error) {
    console.error(chalk.red(`\n❌ Workflow selhal: ${error.message}`));
    process.exit(1);
  }
}
