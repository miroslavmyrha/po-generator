import fs from 'fs';
import path from 'path';
import ora, { Ora } from 'ora';
import { config } from '../config.js';
import { ERRORS, SUCCESS, FILES } from '../constants.js';
import { log } from '../lib/logger.js';
import { createBrowser, login, getPageHtml, findAndClickModals } from '../lib/crawler.js';
import { analyzeHtml, analyzeModalContent } from '../lib/ai-client.js';
import type { ScanOptions, PageInfo, Decisions, FullScanResult, ScanResult, ModalAnalysis } from '../types.js';
import type { Framework } from '../constants.js';

export async function scanCommand(options: ScanOptions): Promise<void> {
  const framework = (options.framework || config.framework || 'generic') as Framework;

  log.info('\n🤖 Starting AI scanner...\n');
  log.dim(`Framework: ${framework}\n`);

  const sitemap = loadSitemap(options);
  const { browser, page } = await createBrowser(true);
  const spinner = ora('Starting browser').start();

  try {
    await performLogin(spinner);
    const { results, decisions } = await scanAllPages(page, sitemap, framework, spinner, options);
    saveResults(results, decisions);
    printSummary(decisions);
  } finally {
    await browser.close();
  }
}

// Data loading

function loadSitemap(options: ScanOptions): PageInfo[] {
  const sitemapPath = path.join(config.output.dir, FILES.SITEMAP);

  if (!fs.existsSync(sitemapPath)) {
    log.error(ERRORS.SITEMAP_NOT_FOUND);
    process.exit(1);
  }

  let sitemap: PageInfo[] = JSON.parse(fs.readFileSync(sitemapPath, 'utf-8'));

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
    log.error(ERRORS.PAGE_NOT_FOUND(pageFilter));
    process.exit(1);
  }

  return filtered;
}

// Authentication

async function performLogin(spinner: Ora): Promise<void> {
  if (!config.auth.enabled) return;

  spinner.text = 'Logging in...';
  const { page } = await createBrowser(true);
  const success = await login(page);

  if (success) {
    spinner.succeed(SUCCESS.LOGGED_IN);
  } else {
    spinner.fail(ERRORS.LOGIN_FAILED);
    process.exit(1);
  }
}

// Scanning

interface ScanResults {
  results: FullScanResult[];
  decisions: Decisions;
}

async function scanAllPages(
  page: import('playwright').Page,
  sitemap: PageInfo[],
  framework: Framework,
  spinner: Ora,
  options: ScanOptions
): Promise<ScanResults> {
  const results: FullScanResult[] = [];
  const decisions: Decisions = {};

  for (let i = 0; i < sitemap.length; i++) {
    const pageInfo = sitemap[i];
    const progress = `[${i + 1}/${sitemap.length}]`;

    spinner.start(`${progress} Scanning: ${pageInfo.path}`);

    const scanResult = await scanSinglePage(page, pageInfo, framework, options, spinner, progress);

    if (scanResult) {
      results.push({ ...pageInfo, analysis: scanResult.analysis });
      decisions[pageInfo.path] = scanResult.decision;
      spinner.succeed(`${progress} ${pageInfo.path} - ${scanResult.analysis.elements?.length || 0} elements`);
    } else {
      spinner.warn(`${progress} ${pageInfo.path} - scan failed`);
    }
  }

  return { results, decisions };
}

interface SingleScanResult {
  analysis: ScanResult;
  decision: Decisions[string];
}

async function scanSinglePage(
  page: import('playwright').Page,
  pageInfo: PageInfo,
  framework: Framework,
  options: ScanOptions,
  spinner: Ora,
  progress: string
): Promise<SingleScanResult | null> {
  try {
    await page.goto(pageInfo.url, { waitUntil: 'networkidle' });
    await page.waitForSelector(config.crawler.waitForSelector, { timeout: 5000 }).catch(() => {});

    const html = await getPageHtml(page);

    spinner.text = `${progress} AI analyzing: ${pageInfo.path}`;

    const analysis = await analyzeHtml(html, pageInfo.path, {
      retries: parseInt(options.retry || '3'),
      framework,
    });

    if (!analysis) return null;

    // Scan modals if any triggers found
    const analysisWithModals = await scanModals(page, analysis, framework, spinner, progress, pageInfo.path);

    const decision = createDecision(analysisWithModals);

    return { analysis: analysisWithModals, decision };
  } catch (error) {
    log.warn(`Error on ${pageInfo.path}: ${(error as Error).message}`);
    return null;
  }
}

async function scanModals(
  page: import('playwright').Page,
  analysis: ScanResult,
  framework: Framework,
  spinner: Ora,
  progress: string,
  pagePath: string
): Promise<ScanResult> {
  if (!analysis.elements) return analysis;

  const modalTriggers = analysis.elements.filter((e) => e.isModalTrigger);
  if (modalTriggers.length === 0) return analysis;

  spinner.text = `${progress} Scanning modals: ${pagePath}`;
  const modalContents = await findAndClickModals(page, modalTriggers);

  const modals: (ScanResult['modals'][number] & Partial<ModalAnalysis>)[] = [...(analysis.modals || [])];

  for (const modal of modalContents) {
    const modalAnalysis = await analyzeModalContent(modal.html, modal.trigger, { framework });
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

function saveResults(results: FullScanResult[], decisions: Decisions): void {
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

function pathToFileName(urlPath: string): string {
  return urlPath.replace(/\//g, '_').replace(/^_/, '') || 'home';
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

function countDecisions(decisions: Decisions) {
  const values = Object.values(decisions);
  return {
    pageObject: values.filter((d) => d.decision === 'page_object').length,
    skip: values.filter((d) => d.decision === 'skip').length,
    askUser: values.filter((d) => d.decision === 'ask_user').length,
  };
}
