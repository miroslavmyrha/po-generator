import { crawlCommand } from './crawl.js';
import { scanCommand } from './scan.js';
import { reviewCommand } from './review.js';
import { generateCommand } from './generate.js';
import { ERRORS, SUCCESS, PHASES } from '../constants.js';
import { log } from '../lib/logger.js';
import type { RunOptions } from '../types.js';

export async function runCommand(options: RunOptions): Promise<void> {
  log.info('\n🚀 Starting complete workflow...\n');
  console.log('─'.repeat(60));

  const startTime = Date.now();

  try {
    await runCrawlPhase();
    await runScanPhase(options);
    await runReviewPhase(options);
    await runGeneratePhase();

    printWorkflowComplete(startTime);
  } catch (error) {
    log.error(ERRORS.WORKFLOW_FAILED((error as Error).message));
    process.exit(1);
  }
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
  console.log('\n' + '─'.repeat(60));
  log.success(SUCCESS.WORKFLOW_COMPLETE(elapsed));
}
