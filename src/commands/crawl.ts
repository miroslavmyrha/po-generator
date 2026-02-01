import fs from 'fs';
import path from 'path';
import ora from 'ora';
import { config } from '../config.js';
import { FILES, SUCCESS, ERRORS } from '../constants.js';
import { log } from '../lib/logger.js';
import { createBrowser, login, crawlUrls } from '../lib/crawler.js';
import type { CrawlOptions, PageInfo } from '../types.js';

export async function crawlCommand(options: CrawlOptions): Promise<void> {
  log.info('\n🔍 Starting crawler...\n');

  const spinner = ora('Starting browser').start();
  const { browser, page } = await createBrowser(true);

  try {
    await handleLogin(options, spinner);
    const sitemap = await performCrawl(page, spinner);
    saveSitemap(sitemap);
    printSummary(sitemap);
  } finally {
    await browser.close();
  }
}

async function handleLogin(options: CrawlOptions, spinner: ReturnType<typeof ora>): Promise<void> {
  if (!config.auth.enabled || options.login === false) return;

  spinner.text = 'Logging in...';
  const { page } = await createBrowser(true);
  const success = await login(page);

  if (!success) {
    spinner.fail(ERRORS.LOGIN_FAILED);
    process.exit(1);
  }

  spinner.succeed(SUCCESS.LOGGED_IN);
}

async function performCrawl(
  page: import('playwright').Page,
  spinner: ReturnType<typeof ora>
): Promise<PageInfo[]> {
  spinner.start('Crawling application...');
  let pageCount = 0;

  const sitemap = await crawlUrls(page, async (pageInfo) => {
    pageCount++;
    spinner.text = `Crawling: ${pageInfo.path} (${pageCount} pages)`;
  });

  spinner.succeed(SUCCESS.CRAWL_COMPLETE(sitemap.length));
  return sitemap;
}

function saveSitemap(sitemap: PageInfo[]): void {
  const outputDir = config.output.dir;
  fs.mkdirSync(outputDir, { recursive: true });

  const sitemapPath = path.join(outputDir, FILES.SITEMAP);
  fs.writeFileSync(sitemapPath, JSON.stringify(sitemap, null, 2));

  log.success(`Sitemap saved: ${sitemapPath}`);
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

  console.table(table);

  log.info('\n💡 Tip: Run "po-gen scan" for AI element analysis.\n');
}

function truncate(str: string, length: number): string {
  if (!str) return '-';
  return str.length > length ? str.substring(0, length) + '...' : str;
}
