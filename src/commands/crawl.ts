import fs from 'fs';
import path from 'path';
import ora from 'ora';
import { FILES, SUCCESS } from '../constants.js';
import { log } from '../lib/logger.js';
import { createBrowser, crawlUrls, handleAuthenticatedLogin } from '../lib/crawler.js';
import { truncate, registerCleanup, getFsErrorCode, getFsErrorMessage, validateOutputPath, writeFileAtomic } from '../lib/utils.js';
import { AppError } from '../types.js';
import type { Config, CrawlOptions, PageInfo } from '../types.js';

export async function crawlCommand(config: Config, options: CrawlOptions): Promise<void> {
  log.info('\n🔍 Starting crawler...\n');

  // Apply depth option override if provided
  if (options.depth) {
    const depth = parseInt(options.depth, 10);
    if (!isNaN(depth) && depth > 0 && depth <= 100) {
      config.crawler.maxDepth = depth;
      log.dim(`Max depth: ${depth}\n`);
    }
  }

  const spinner = ora('Starting browser').start();
  const { browser, page } = await createBrowser(true);

  // Register browser cleanup for graceful shutdown on SIGINT/SIGTERM
  // Returns unregister function to prevent handler accumulation in workflows
  const unregisterCleanup = registerCleanup(async () => {
    spinner.stop();
    await browser.close();
  });

  try {
    // Handle login if auth is enabled and not explicitly skipped
    if (options.login !== false) {
      await handleAuthenticatedLogin(config, page, spinner, { skipIfDisabled: true });
    }
    const sitemap = await performCrawl(config, page, spinner);
    saveSitemap(config, sitemap);
    printSummary(sitemap);
  } finally {
    spinner.stop(); // Ensure spinner is stopped on exit
    await browser.close();
    unregisterCleanup(); // Remove handler after browser closed - prevents accumulation
  }
}

async function performCrawl(
  config: Config,
  page: import('playwright').Page,
  spinner: ReturnType<typeof ora>
): Promise<PageInfo[]> {
  spinner.start('Crawling application...');
  let pageCount = 0;

  const sitemap = await crawlUrls(config, page, async (pageInfo) => {
    pageCount++;
    spinner.text = `Crawling: ${pageInfo.path} (${pageCount} pages)`;
  });

  spinner.succeed(SUCCESS.CRAWL_COMPLETE(sitemap.length));
  return sitemap;
}

function saveSitemap(config: Config, sitemap: PageInfo[]): void {
  // Validate output directory against path traversal attacks
  const outputDir = validateOutputPath(config.output.dir);
  const sitemapPath = path.join(outputDir, FILES.SITEMAP);

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    // Atomic write prevents corrupted files on interrupt
    writeFileAtomic(sitemapPath, JSON.stringify(sitemap, null, 2));
    log.success(`Sitemap saved: ${sitemapPath}`);
  } catch (error) {
    const errorCode = getFsErrorCode(error);
    const errorMsg = getFsErrorMessage(error, sitemapPath);
    throw new AppError(`Failed to save sitemap: ${errorMsg}`, `SAVE_FAILED_${errorCode}`);
  }
}

function printSummary(sitemap: PageInfo[]): void {
  log.info('\n📊 Pages overview:\n');

  const table = sitemap.map((p) => ({
    path: p.path,
    title: truncate(p.title, 30),
    elements: p.interactiveCount,
    form: p.hasForm ? '✓' : '',
    table: p.hasTable ? '✓' : '',
  }));

  // eslint-disable-next-line no-console -- CLI table output
  console.table(table);

  log.info('\n💡 Tip: Run "po-gen scan" for AI element analysis.\n');
}
