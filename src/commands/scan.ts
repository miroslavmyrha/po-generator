import fs from 'fs';
import path from 'path';
import ora, { Ora } from 'ora';
import { ERRORS, SUCCESS, FILES, TIMEOUTS } from '../constants.js';
import { log } from '../lib/logger.js';
import { createBrowser, login, getPageHtml, findAndClickModals } from '../lib/crawler.js';
import { analyzeHtml, analyzeModalContent } from '../lib/ai-client.js';
import { pathToFileName, getErrorMessage } from '../lib/utils.js';
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

  const context: ScanContext = { config, page, framework, options, spinner };

  try {
    await performLogin(context);
    const { results, decisions } = await scanAllPages(context, sitemap);
    saveResults(config, results, decisions);
    printSummary(decisions);
  } finally {
    await browser.close();
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

// Authentication

async function performLogin(context: ScanContext): Promise<void> {
  const { config, page, spinner } = context;

  if (!config.auth.enabled) return;

  spinner.text = 'Logging in...';
  const success = await login(config, page);

  if (success) {
    spinner.succeed(SUCCESS.LOGGED_IN);
  } else {
    spinner.fail(ERRORS.LOGIN_FAILED);
    throw new AppError(ERRORS.LOGIN_FAILED, 'LOGIN_FAILED');
  }
}

// Scanning

interface ScanResults {
  results: FullScanResult[];
  decisions: Decisions;
}

async function scanAllPages(context: ScanContext, sitemap: PageInfo[]): Promise<ScanResults> {
  const results: FullScanResult[] = [];
  const decisions: Decisions = {};

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
      context.spinner.warn(`${progress} ${pageInfo.path} - scan failed`);
    }
  }

  return { results, decisions };
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
    await page.goto(pageInfo.url, { waitUntil: 'networkidle' });

    // Wait for main content selector - ignore timeout as page may still be usable
    await page
      .waitForSelector(config.crawler.waitForSelector, { timeout: TIMEOUTS.SELECTOR_WAIT })
      .catch(() => {
        // Selector not found within timeout - continue anyway, page content may still be valid
      });

    const html = await getPageHtml(page);

    spinner.text = `${progress} AI analyzing: ${pageInfo.path}`;

    const analysis = await analyzeHtml(config, html, pageInfo.path, {
      retries: parseInt(options.retry || '3', 10),
      framework,
    });

    if (!analysis) return null;

    // Scan modals if any triggers found
    const analysisWithModals = await scanModals(context, analysis, progress, pageInfo.path);

    const decision = createDecision(analysisWithModals);

    return { analysis: analysisWithModals, decision };
  } catch (error) {
    log.warn(`Error on ${pageInfo.path}: ${getErrorMessage(error)}`);
    return null;
  }
}

async function scanModals(
  context: ScanContext,
  analysis: ScanResult,
  progress: string,
  pagePath: string
): Promise<ScanResult> {
  const { config, page, framework, spinner } = context;

  if (!analysis.elements) return analysis;

  const modalTriggers = analysis.elements.filter((e) => e.isModalTrigger);
  if (modalTriggers.length === 0) return analysis;

  spinner.text = `${progress} Scanning modals: ${pagePath}`;
  const modalContents = await findAndClickModals(page, modalTriggers);

  const modals: (ScanResult['modals'][number] & Partial<ModalAnalysis>)[] = [...(analysis.modals || [])];

  for (const modal of modalContents) {
    const modalAnalysis = await analyzeModalContent(config, modal.html, modal.trigger, { framework });
    if (modalAnalysis) {
      modals.push({
        triggerElement: modal.trigger,
        expectedContent: modalAnalysis.purpose,
        ...modalAnalysis,
      });
    }
  }

  return { ...analysis, modals };
}

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
  const scannedDir = path.join(config.output.dir, FILES.SCANNED_DIR);
  fs.mkdirSync(scannedDir, { recursive: true });

  for (const result of results) {
    const fileName = pathToFileName(result.path);
    const filePath = path.join(scannedDir, `${fileName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
  }

  const decisionsPath = path.join(config.output.dir, FILES.DECISIONS);
  fs.writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2));

  log.success(SUCCESS.SCAN_COMPLETE);
  log.dim(`Results: ${scannedDir}/`);
  log.dim(`Decisions: ${decisionsPath}`);
}

// Summary

function printSummary(decisions: Decisions): void {
  const counts = countDecisions(decisions);

  log.info('\n📊 Decision summary:');
  log.success(`   Page Objects: ${counts.pageObject}`);
  log.dim(`   Skipped: ${counts.skip}`);
  log.warn(`   Needs review: ${counts.askUser}`);

  if (counts.askUser > 0) {
    log.warn('\n💡 Tip: Run "po-gen review" for interactive decisions.');
  } else {
    log.info('\n💡 Tip: Run "po-gen generate" to create Page Objects.');
  }
}
