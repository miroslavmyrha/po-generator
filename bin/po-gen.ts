#!/usr/bin/env -S node --import tsx

// Load environment variables FIRST - before any other imports that use them
import 'dotenv/config';

import { Command } from 'commander';
import { createConfig, validateConfigStructured } from '../src/config.js';
import { crawlCommand } from '../src/commands/crawl.js';
import { scanCommand } from '../src/commands/scan.js';
import { generateCommand } from '../src/commands/generate.js';
import { reviewCommand } from '../src/commands/review.js';
import { runCommand } from '../src/commands/run.js';
import { initCommand } from '../src/commands/init.js';
import { log } from '../src/lib/logger.js';
import { runCleanupHandlers } from '../src/lib/utils.js';
import { AppError } from '../src/types.js';
import type { Config } from '../src/types.js';

// Handle graceful shutdown on SIGINT (Ctrl+C) and SIGTERM
// Use process.once to prevent handler accumulation on repeated imports
process.once('SIGINT', async () => {
  log.dim('\n\nShutting down gracefully...');
  await runCleanupHandlers();
  process.exit(130); // Standard exit code for SIGINT
});

process.once('SIGTERM', async () => {
  log.dim('\nReceived SIGTERM, shutting down...');
  await runCleanupHandlers();
  process.exit(143); // Standard exit code for SIGTERM
});

// Handle unhandled promise rejections
process.once('unhandledRejection', async (reason) => {
  log.error(`Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  await runCleanupHandlers();
  process.exit(1);
});

// Create config once at startup
const config = createConfig();

const program = new Command();

program
  .name('po-gen')
  .description('Page Object Generator with AI (Vuetify, Symfony, generic)')
  .version('1.0.0');

// Init - create .env configuration file
program
  .command('init')
  .description('Initialize - create .env configuration file')
  .action(wrapCommand(initCommand));

// Crawl - discover all URLs in application
program
  .command('crawl')
  .description('Crawl application and find all URLs')
  .option('-u, --url <url>', 'Base URL of the application')
  .option('--no-login', 'Skip login')
  .option('-d, --depth <number>', 'Max crawl depth', '10')
  .action(
    wrapCommand(async (options) => {
      requireConfig(config, options.url);
      await crawlCommand(config, options);
    })
  );

// Scan - AI analyzes page elements
program
  .command('scan')
  .description('AI scan pages for interactive elements')
  .option('-p, --page <path>', 'Scan specific page only')
  .option('-f, --framework <type>', 'Framework: vuetify, symfony, generic', config.framework)
  .option('--retry <number>', 'Number of retries on AI error', '3')
  .action(
    wrapCommand(async (options) => {
      requireConfig(config);
      await scanCommand(config, options);
    })
  );

// Generate - create Page Objects from scan results
program
  .command('generate')
  .description('Generate Page Objects from scan results')
  .option('-o, --output <dir>', 'Output directory')
  .option('--typescript', 'Generate TypeScript files')
  .action(wrapCommand((options) => generateCommand(config, options)));

// Review - interactive review of AI decisions
program
  .command('review')
  .description('Interactive review of AI decisions')
  .action(wrapCommand(() => reviewCommand(config)));

// Run - execute full workflow
program
  .command('run')
  .description('Run full workflow: crawl → scan → generate')
  .option('-f, --framework <type>', 'Framework: vuetify, symfony, generic', config.framework)
  .option('--skip-review', 'Skip interactive review')
  .action(
    wrapCommand(async (options) => {
      requireConfig(config);
      await runCommand(config, options);
    })
  );

program.parse();

/**
 * Wrap command handler with error handling
 */
function wrapCommand<T>(handler: (options: T) => Promise<void>): (options: T) => Promise<void> {
  return async (options: T) => {
    try {
      await handler(options);
    } catch (error) {
      if (error instanceof AppError) {
        log.error(error.message);
        process.exit(1);
      }
      // Unexpected error - show full stack trace
      log.error(`Unexpected error: ${(error as Error).message}`);
      console.error(error);
      process.exit(1);
    }
  };
}

/**
 * Validate configuration and exit if invalid
 * Uses structured validation for clear separation of errors vs warnings
 */
function requireConfig(cfg: Config, skipIfUrl = false): void {
  const result = validateConfigStructured(cfg);

  // Show warnings but don't block
  for (const warning of result.warnings) {
    log.warn(`  ⚠ ${warning}`);
  }

  // Errors block execution
  if (!result.isValid && !skipIfUrl) {
    log.error('Configuration errors:');
    for (const error of result.errors) {
      log.error(`  - ${error}`);
    }
    log.warn('\nRun "po-gen init" to create configuration.');
    process.exit(1);
  }
}
