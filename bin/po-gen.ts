#!/usr/bin/env -S node --import tsx

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
  .description('Initialize - create .env configuration file')
  .action(initCommand);

// Crawl - najde všechny URL
program
  .command('crawl')
  .description('Crawl application and find all URLs')
  .option('-u, --url <url>', 'Base URL of the application')
  .option('--no-login', 'Skip login')
  .option('-d, --depth <number>', 'Max crawl depth', '10')
  .action(async (options) => {
    const errors = validateConfig();
    if (errors.length && !options.url) {
      console.error(chalk.red('Configuration errors:'));
      errors.forEach(e => console.error(chalk.red(`  - ${e}`)));
      console.log(chalk.yellow('\nRun "po-gen init" to create configuration.'));
      process.exit(1);
    }
    await crawlCommand(options);
  });

// Scan - AI skenuje elementy
program
  .command('scan')
  .description('AI scan pages for interactive elements')
  .option('-p, --page <path>', 'Scan specific page only')
  .option('-f, --framework <type>', 'Framework: vuetify, symfony, generic', config.framework)
  .option('--retry <number>', 'Number of retries on AI error', '3')
  .action(async (options) => {
    const errors = validateConfig();
    if (errors.length) {
      console.error(chalk.red('Configuration errors:'));
      errors.forEach(e => console.error(chalk.red(`  - ${e}`)));
      process.exit(1);
    }
    await scanCommand(options);
  });

// Generate - vytvoří Page Objects
program
  .command('generate')
  .description('Generate Page Objects from scan results')
  .option('-o, --output <dir>', 'Output directory')
  .option('--typescript', 'Generate TypeScript files')
  .action(generateCommand);

// Review - interaktivní review decisions
program
  .command('review')
  .description('Interactive review of AI decisions')
  .action(reviewCommand);

// Run - vše najednou
program
  .command('run')
  .description('Run full workflow: crawl → scan → generate')
  .option('-f, --framework <type>', 'Framework: vuetify, symfony, generic', config.framework)
  .option('--skip-review', 'Skip interactive review')
  .action(async (options) => {
    const errors = validateConfig();
    if (errors.length) {
      console.error(chalk.red('Configuration errors:'));
      errors.forEach(e => console.error(chalk.red(`  - ${e}`)));
      console.log(chalk.yellow('\nRun "po-gen init" to create configuration.'));
      process.exit(1);
    }
    await runCommand(options);
  });

program.parse();
