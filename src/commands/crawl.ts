import fs from 'fs';
import path from 'path';
import ora from 'ora';
import { FILES, SUCCESS } from '../constants.js';
import { log } from '../lib/logger.js';
import { createBrowser, crawlUrls, handleAuthenticatedLogin } from '../lib/crawler.js';
import { truncate, getErrorMessage } from '../lib/utils.js';
import { AppError } from '../types.js';
import type { Config, CrawlOptions, PageInfo } from '../types.js';

export async function crawlCommand(config: Config, options: CrawlOptions): Promise<void> {
  log.info('\n🔍 Starting crawler...\n');

  const spinner = ora('Starting browser').start();
  const { browser, page } = await createBrowser(true);

  try {
    // Handle login if auth is enabled and not explicitly skipped
    if (options.login !== false) {
      await handleAuthenticatedLogin(config, page, spinner, { skipIfDisabled: true });
    }
    const sitemap = await performCrawl(config, page, spinner);
    saveSitemap(config, sitemap);
    printSummary(sitemap);
  } finally {
    await browser.close();
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
  const outputDir = config.output.dir;
  const sitemapPath = path.join(outputDir, FILES.SITEMAP);

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(sitemapPath, JSON.stringify(sitemap, null, 2));
    log.success(`Sitemap saved: ${sitemapPath}`);
  } catch (error) {
    throw new AppError(`Failed to save sitemap: ${getErrorMessage(error)}`, 'SAVE_FAILED');
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

  // console.table is appropriate here - it's a formatted table output, not debug logging
  console.table(table);

  log.info('\n💡 Tip: Run "po-gen scan" for AI element analysis.\n');
}
