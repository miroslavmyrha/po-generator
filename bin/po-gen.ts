#!/usr/bin/env -S node --import tsx

import { Command } from 'commander';
import { config, validateConfig } from '../src/config.js';
import { crawlCommand } from '../src/commands/crawl.js';
import { scanCommand } from '../src/commands/scan.js';
import { generateCommand } from '../src/commands/generate.js';
import { reviewCommand } from '../src/commands/review.js';
import { runCommand } from '../src/commands/run.js';
import { initCommand } from '../src/commands/init.js';
import { log } from '../src/lib/logger.js';

const program = new Command();

program
  .name('po-gen')
  .description('Page Object Generator with AI (Vuetify, Symfony, generic)')
  .version('1.0.0');

// Init - create .env configuration file
program
  .command('init')
  .description('Initialize - create .env configuration file')
  .action(initCommand);

// Crawl - discover all URLs in application
program
  .command('crawl')
  .description('Crawl application and find all URLs')
  .option('-u, --url <url>', 'Base URL of the application')
  .option('--no-login', 'Skip login')
  .option('-d, --depth <number>', 'Max crawl depth', '10')
  .action(async (options) => {
    if (!validateConfiguration(options.url)) return;
    await crawlCommand(options);
  });

// Scan - AI analyzes page elements
program
  .command('scan')
  .description('AI scan pages for interactive elements')
  .option('-p, --page <path>', 'Scan specific page only')
  .option('-f, --framework <type>', 'Framework: vuetify, symfony, generic', config.framework)
  .option('--retry <number>', 'Number of retries on AI error', '3')
  .action(async (options) => {
    if (!validateConfiguration()) return;
    await scanCommand(options);
  });

// Generate - create Page Objects from scan results
program
  .command('generate')
  .description('Generate Page Objects from scan results')
  .option('-o, --output <dir>', 'Output directory')
  .option('--typescript', 'Generate TypeScript files')
  .action(generateCommand);

// Review - interactive review of AI decisions
program
  .command('review')
  .description('Interactive review of AI decisions')
  .action(reviewCommand);

// Run - execute full workflow
program
  .command('run')
  .description('Run full workflow: crawl → scan → generate')
  .option('-f, --framework <type>', 'Framework: vuetify, symfony, generic', config.framework)
  .option('--skip-review', 'Skip interactive review')
  .action(async (options) => {
    if (!validateConfiguration()) return;
    await runCommand(options);
  });

program.parse();

/**
 * Validate configuration and show errors if invalid
 */
function validateConfiguration(skipIfUrl = false): boolean {
  const errors = validateConfig();

  if (errors.length && !skipIfUrl) {
    log.error('Configuration errors:');
    errors.forEach((e) => log.error(`  - ${e}`));
    log.warn('\nRun "po-gen init" to create configuration.');
    process.exit(1);
  }

  return true;
}
