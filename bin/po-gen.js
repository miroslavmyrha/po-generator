#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { config, validateConfig } from '../src/config.js';
import { crawlCommand } from '../src/commands/crawl.js';
import { scanCommand } from '../src/commands/scan.js';
import { generateCommand } from '../src/commands/generate.js';
import { reviewCommand } from '../src/commands/review.js';
import { runCommand } from '../src/commands/run.js';
import { initCommand } from '../src/commands/init.js';

const program = new Command();

program
  .name('po-gen')
  .description('Page Object Generator s AI (Vuetify, Symfony, generic)')
  .version('1.0.0');

// Init - vytvoří .env soubor
program
  .command('init')
  .description('Inicializace - vytvoří .env soubor')
  .action(initCommand);

// Crawl - najde všechny URL
program
  .command('crawl')
  .description('Projde aplikaci a najde všechny URL')
  .option('-u, --url <url>', 'Base URL aplikace')
  .option('--no-login', 'Přeskočit login')
  .option('-d, --depth <number>', 'Max hloubka crawlování', '10')
  .action(async (options) => {
    const errors = validateConfig();
    if (errors.length && !options.url) {
      console.error(chalk.red('Chyby konfigurace:'));
      errors.forEach(e => console.error(chalk.red(`  - ${e}`)));
      console.log(chalk.yellow('\nSpusť "po-gen init" pro vytvoření konfigurace.'));
      process.exit(1);
    }
    await crawlCommand(options);
  });

// Scan - AI skenuje elementy
program
  .command('scan')
  .description('AI oskenuje elementy na stránkách')
  .option('-p, --page <path>', 'Skenovat pouze konkrétní stránku')
  .option('-f, --framework <type>', 'Framework: vuetify, symfony, generic', config.framework)
  .option('--retry <number>', 'Počet retries při chybě AI', '3')
  .action(async (options) => {
    const errors = validateConfig();
    if (errors.length) {
      console.error(chalk.red('Chyby konfigurace:'));
      errors.forEach(e => console.error(chalk.red(`  - ${e}`)));
      process.exit(1);
    }
    await scanCommand(options);
  });

// Generate - vytvoří Page Objects
program
  .command('generate')
  .description('Vygeneruje Page Objects ze scan výsledků')
  .option('-o, --output <dir>', 'Výstupní adresář')
  .option('--typescript', 'Generovat TypeScript soubory')
  .action(generateCommand);

// Review - interaktivní review decisions
program
  .command('review')
  .description('Interaktivní review AI rozhodnutí')
  .action(reviewCommand);

// Run - vše najednou
program
  .command('run')
  .description('Spustí celý proces: crawl → scan → generate')
  .option('-f, --framework <type>', 'Framework: vuetify, symfony, generic', config.framework)
  .option('--skip-review', 'Přeskočit interaktivní review')
  .action(async (options) => {
    const errors = validateConfig();
    if (errors.length) {
      console.error(chalk.red('Chyby konfigurace:'));
      errors.forEach(e => console.error(chalk.red(`  - ${e}`)));
      console.log(chalk.yellow('\nSpusť "po-gen init" pro vytvoření konfigurace.'));
      process.exit(1);
    }
    await runCommand(options);
  });

program.parse();
