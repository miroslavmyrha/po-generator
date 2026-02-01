import { crawlCommand } from './crawl.js';
import { scanCommand } from './scan.js';
import { reviewCommand } from './review.js';
import { generateCommand } from './generate.js';
import { SUCCESS, PHASES } from '../constants.js';
import { log } from '../lib/logger.js';
import type { RunOptions } from '../types.js';

const SEPARATOR = '─'.repeat(60);

export async function runCommand(options: RunOptions): Promise<void> {
  log.info('\n🚀 Starting complete workflow...\n');
  log.dim(SEPARATOR);

  const startTime = Date.now();

  await runCrawlPhase();
  await runScanPhase(options);
  await runReviewPhase(options);
  await runGeneratePhase();

  printWorkflowComplete(startTime);
}

async function runCrawlPhase(): Promise<void> {
  log.info(`\n📍 ${PHASES.CRAWLING}\n`);
  await crawlCommand({ login: true });
}

async function runScanPhase(options: RunOptions): Promise<void> {
  log.info(`\n📍 ${PHASES.SCANNING}\n`);
  await scanCommand({ retry: '3', framework: options.framework });
}

async function runReviewPhase(options: RunOptions): Promise<void> {
  if (options.skipReview) return;

  log.info(`\n📍 ${PHASES.REVIEW}\n`);
  await reviewCommand();
}

async function runGeneratePhase(): Promise<void> {
  log.info(`\n📍 ${PHASES.GENERATING}\n`);
  await generateCommand({});
}

function printWorkflowComplete(startTime: number): void {
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  log.dim('\n' + SEPARATOR);
  log.success(SUCCESS.WORKFLOW_COMPLETE(elapsed));
}
