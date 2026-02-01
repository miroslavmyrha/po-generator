import { crawlCommand } from './crawl.js';
import { scanCommand } from './scan.js';
import { reviewCommand } from './review.js';
import { generateCommand } from './generate.js';
import { SUCCESS, PHASES } from '../constants.js';
import { log } from '../lib/logger.js';
import type { Config, RunOptions } from '../types.js';

const SEPARATOR = '─'.repeat(60);

export async function runCommand(config: Config, options: RunOptions): Promise<void> {
  log.info('\n🚀 Starting complete workflow...\n');
  log.dim(SEPARATOR);

  const startTime = Date.now();

  await runCrawlPhase(config);
  await runScanPhase(config, options);
  await runReviewPhase(config, options);
  await runGeneratePhase(config);

  printWorkflowComplete(startTime);
}

async function runCrawlPhase(config: Config): Promise<void> {
  log.info(`\n📍 ${PHASES.CRAWLING}\n`);
  await crawlCommand(config, { login: true });
}

async function runScanPhase(config: Config, options: RunOptions): Promise<void> {
  log.info(`\n📍 ${PHASES.SCANNING}\n`);
  await scanCommand(config, { retry: '3', framework: options.framework });
}

async function runReviewPhase(config: Config, options: RunOptions): Promise<void> {
  if (options.skipReview) return;

  log.info(`\n📍 ${PHASES.REVIEW}\n`);
  await reviewCommand(config);
}

async function runGeneratePhase(config: Config): Promise<void> {
  log.info(`\n📍 ${PHASES.GENERATING}\n`);
  await generateCommand(config, {});
}

function printWorkflowComplete(startTime: number): void {
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  log.dim('\n' + SEPARATOR);
  log.success(SUCCESS.WORKFLOW_COMPLETE(elapsed));
}
