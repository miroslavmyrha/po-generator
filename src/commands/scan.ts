import fs from 'fs';
import path from 'path';
import ora, { Ora } from 'ora';
import { ERRORS, SUCCESS, FILES, TIMEOUTS } from '../constants.js';
import { log } from '../lib/logger.js';
import { createBrowser, getPageHtml, findAndClickModals, handleAuthenticatedLogin } from '../lib/crawler.js';
import { analyzeHtml, analyzeModalContent } from '../lib/ai-client.js';
import { pathToFileName, getErrorMessage, registerCleanup, mapWithConcurrency, validateOutputPath, writeFileAtomic } from '../lib/utils.js';
import { loadSitemap as loadSitemapFile, countDecisions } from '../lib/data-loader.js';
import { AppError } from '../types.js';
import type { Config, ScanOptions, PageInfo, Decisions, FullScanResult, ScanResult, ModalAnalysis } from '../types.js';
import type { Framework } from '../constants.js';

/**
 * Scan context - groups related parameters for cleaner function signatures
 */
interface ScanContext {
  config: Config;
  page: import('playwright').Page;
  framework: Framework;
  options: ScanOptions;
  spinner: Ora;
}

export async function scanCommand(config: Config, options: ScanOptions): Promise<void> {
  const framework = (options.framework || config.framework || 'generic') as Framework;

  log.info('\n🤖 Starting AI scanner...\n');
  log.dim(`Framework: ${framework}\n`);

  const sitemap = loadSitemap(config, options);
  const { browser, page } = await createBrowser(true);
  const spinner = ora('Starting browser').start();

  // Register browser cleanup for graceful shutdown on SIGINT/SIGTERM
  // Returns unregister function to prevent handler accumulation in workflows
  const unregisterCleanup = registerCleanup(async () => {
    spinner.stop();
    await browser.close();
  });

  const context: ScanContext = { config, page, framework, options, spinner };

  try {
    await handleAuthenticatedLogin(config, page, spinner, { skipIfDisabled: true });
    const { results, decisions, failedCount } = await scanAllPages(context, sitemap);
    saveResults(config, results, decisions);
    printSummary(decisions, failedCount);
  } finally {
    spinner.stop(); // Ensure spinner is stopped on exit
    await browser.close();
    unregisterCleanup(); // Remove handler after browser closed - prevents accumulation
  }
}

// Data loading

function loadSitemap(config: Config, options: ScanOptions): PageInfo[] {
  let sitemap = loadSitemapFile(config);

  if (options.page) {
    sitemap = filterSitemap(sitemap, options.page);
  }

  log.dim(`Scanning ${sitemap.length} pages...\n`);
  return sitemap;
}

function filterSitemap(sitemap: PageInfo[], pageFilter: string): PageInfo[] {
  const filtered = sitemap.filter(
    (p) => p.path === pageFilter || p.path.includes(pageFilter)
  );

  if (filtered.length === 0) {
    throw new AppError(ERRORS.PAGE_NOT_FOUND(pageFilter), 'PAGE_NOT_FOUND');
  }

  return filtered;
}

// Scanning

interface ScanResults {
  results: FullScanResult[];
  decisions: Decisions;
  failedCount: number;
}

async function scanAllPages(context: ScanContext, sitemap: PageInfo[]): Promise<ScanResults> {
  const results: FullScanResult[] = [];
  const decisions: Decisions = {};
  let failedCount = 0;

  for (let i = 0; i < sitemap.length; i++) {
    const pageInfo = sitemap[i];
    const progress = `[${i + 1}/${sitemap.length}]`;

    context.spinner.start(`${progress} Scanning: ${pageInfo.path}`);

    const scanResult = await scanSinglePage(context, pageInfo, progress);

    if (scanResult) {
      results.push({ ...pageInfo, analysis: scanResult.analysis });
      decisions[pageInfo.path] = scanResult.decision;
      context.spinner.succeed(`${progress} ${pageInfo.path} - ${scanResult.analysis.elements?.length || 0} elements`);
    } else {
      failedCount++;
      context.spinner.warn(`${progress} ${pageInfo.path} - scan failed`);
    }
  }

  return { results, decisions, failedCount };
}

interface SingleScanResult {
  analysis: ScanResult;
  decision: Decisions[string];
}

async function scanSinglePage(
  context: ScanContext,
  pageInfo: PageInfo,
  progress: string
): Promise<SingleScanResult | null> {
  const { config, page, framework, options, spinner } = context;

  try {
    // Validate URL before navigation
    if (!pageInfo.url || typeof pageInfo.url !== 'string') {
      throw new Error(`Invalid URL for page: ${pageInfo.path}`);
    }

    await page.goto(pageInfo.url, { waitUntil: 'networkidle' });

    // Wait for main content selector - ignore timeout as page may still be usable
    await page
      .waitForSelector(config.crawler.waitForSelector, { timeout: TIMEOUTS.SELECTOR_WAIT })
      .catch((error: Error) => {
        // Only swallow timeout errors - re-throw unexpected errors
        if (error.name !== 'TimeoutError' && !error.message.includes('Timeout')) {
          throw error;
        }
        // Selector not found within timeout - continue anyway, page content may still be valid
      });

    const html = await getPageHtml(page);

    spinner.text = `${progress} AI analyzing: ${pageInfo.path}`;

    // Validate and parse retry count with bounds checking
    const retryStr = options.retry || '3';
    const retries = Math.max(1, Math.min(10, parseInt(retryStr, 10) || 3));

    const analysis = await analyzeHtml(config, html, pageInfo.path, {
      retries,
      framework,
    });

    if (!analysis) return null;

    // Scan modals if any triggers found
    const { analysis: analysisWithModals, failedModals } = await scanModals(context, analysis, progress, pageInfo.path);

    if (failedModals > 0) {
      log.debug(`${pageInfo.path}: ${failedModals} modal(s) failed analysis`);
    }

    const decision = createDecision(analysisWithModals);

    return { analysis: analysisWithModals, decision };
  } catch (error) {
    log.warn(`Error on ${pageInfo.path}: ${getErrorMessage(error)}`);
    return null;
  }
}

interface ModalScanResult {
  analysis: ScanResult;
  failedModals: number;
}

async function scanModals(
  context: ScanContext,
  analysis: ScanResult,
  progress: string,
  pagePath: string
): Promise<ModalScanResult> {
  const { config, page, framework, spinner } = context;

  if (!analysis.elements) return { analysis, failedModals: 0 };

  const modalTriggers = analysis.elements.filter((e) => e.isModalTrigger);
  if (modalTriggers.length === 0) return { analysis, failedModals: 0 };

  spinner.text = `${progress} Scanning modals: ${pagePath}`;
  const modalContents = await findAndClickModals(page, modalTriggers);

  const modals: (ScanResult['modals'][number] & Partial<ModalAnalysis>)[] = [...(analysis.modals || [])];
  let failedModals = 0;

  // Analyze modals with concurrency limit to avoid overwhelming AI API
  const modalAnalyses = await mapWithConcurrency(
    modalContents,
    async (modal) => {
      const modalAnalysis = await analyzeModalContent(config, modal.html, modal.trigger, { framework });
      return { modal, modalAnalysis };
    },
    3 // Max 3 concurrent AI requests
  );

  for (const { modal, modalAnalysis } of modalAnalyses) {
    if (modalAnalysis) {
      modals.push({
        triggerElement: modal.trigger,
        expectedContent: modalAnalysis.purpose,
        ...modalAnalysis,
      });
    } else {
      failedModals++;
      log.debug(`Modal analysis failed for trigger: ${modal.trigger}`);
    }
  }

  return { analysis: { ...analysis, modals }, failedModals };
}

/**
 * Convert AI analysis result into a decision record
 * Maps AI's shouldBePageObject (true/false/ask_user) to decision enum
 * @param analysis - Scan result from AI analysis
 * @returns Decision record with status, reason, and metadata
 */
function createDecision(analysis: ScanResult): Decisions[string] {
  const shouldBe = analysis.pageAnalysis.shouldBePageObject;

  return {
    decision: shouldBe === true ? 'page_object' : shouldBe === false ? 'skip' : 'ask_user',
    reason: analysis.pageAnalysis.reason,
    suggestedClassName: analysis.pageAnalysis.suggestedClassName,
    elementCount: analysis.elements?.length || 0,
  };
}

// Saving results

function saveResults(config: Config, results: FullScanResult[], decisions: Decisions): void {
  // Validate output directory against path traversal attacks
  const validatedOutputDir = validateOutputPath(config.output.dir);
  const scannedDir = path.join(validatedOutputDir, FILES.SCANNED_DIR);
  const decisionsPath = path.join(validatedOutputDir, FILES.DECISIONS);

  try {
    fs.mkdirSync(scannedDir, { recursive: true });

    // Atomic writes prevent corrupted files on interrupt
    for (const result of results) {
      const fileName = pathToFileName(result.path);
      const filePath = path.join(scannedDir, `${fileName}.json`);
      writeFileAtomic(filePath, JSON.stringify(result, null, 2));
    }

    // Write decisions last - if it succeeds, all scan results were saved
    writeFileAtomic(decisionsPath, JSON.stringify(decisions, null, 2));

    log.success(SUCCESS.SCAN_COMPLETE);
    log.dim(`Results: ${scannedDir}/`);
    log.dim(`Decisions: ${decisionsPath}`);
  } catch (error) {
    throw new AppError(`Failed to save scan results: ${getErrorMessage(error)}`, 'SAVE_FAILED');
  }
}

// Summary

function printSummary(decisions: Decisions, failedCount = 0): void {
  const counts = countDecisions(decisions);

  log.info('\n📊 Decision summary:');
  log.success(`   Page Objects: ${counts.pageObject}`);
  log.dim(`   Skipped: ${counts.skip}`);
  log.warn(`   Needs review: ${counts.askUser}`);

  if (failedCount > 0) {
    log.error(`   Failed scans: ${failedCount}`);
  }

  if (counts.askUser > 0) {
    log.warn('\n💡 Tip: Run "po-gen review" for interactive decisions.');
  } else if (failedCount > 0) {
    log.warn('\n💡 Tip: Some pages failed. Check logs and re-run scan.');
  } else {
    log.info('\n💡 Tip: Run "po-gen generate" to create Page Objects.');
  }
}
