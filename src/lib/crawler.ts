import { chromium, Page } from 'playwright';
import { SELECTORS, TIMEOUTS, ERRORS } from '../constants.js';
import { log } from './logger.js';
import type { Config, PageInfo, BrowserInstance, ModalContent, ElementInfo } from '../types.js';

/**
 * Create a new browser instance
 */
export async function createBrowser(headless = true): Promise<BrowserInstance> {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * Perform login if authentication is enabled
 */
export async function login(config: Config, page: Page): Promise<boolean> {
  if (!config.auth.enabled) return true;

  const loginUrl = config.baseUrl + config.auth.loginUrl;
  await page.goto(loginUrl);

  try {
    await fillLoginForm(config, page);
    await submitLoginForm(config, page);
    await waitForLoginSuccess(config, page);
    return true;
  } catch (error) {
    log.error(ERRORS.LOGIN_FAILED);
    log.dim((error as Error).message);
    return false;
  }
}

async function fillLoginForm(config: Config, page: Page): Promise<void> {
  const { username, password } = config.auth.credentials;
  const fields = config.auth.fields;

  await page.locator(fields.username).first().fill(username || '');
  await page.locator(fields.password).first().fill(password || '');
}

async function submitLoginForm(config: Config, page: Page): Promise<void> {
  await page.locator(config.auth.fields.submit).first().click();
}

async function waitForLoginSuccess(config: Config, page: Page): Promise<void> {
  await page.waitForURL(
    (url) => url.pathname.includes(config.auth.successUrl),
    { timeout: TIMEOUTS.LOGIN_WAIT }
  );
}

/**
 * Crawl all URLs in the application
 */
export async function crawlUrls(
  config: Config,
  page: Page,
  onPageFound?: (pageInfo: PageInfo, page: Page) => Promise<void>
): Promise<PageInfo[]> {
  const visited = new Set<string>();
  const queue: CrawlQueueItem[] = [{ url: config.baseUrl, depth: 0 }];
  const sitemap: PageInfo[] = [];

  while (queue.length > 0) {
    const item = queue.shift()!;
    const result = await processQueueItem(config, page, item, visited);

    if (!result) continue;

    sitemap.push(result.pageInfo);

    if (onPageFound) {
      await onPageFound(result.pageInfo, page);
    }

    // Add discovered links to queue
    for (const link of result.links) {
      queue.push({ url: link, depth: item.depth + 1 });
    }
  }

  return sitemap;
}

interface CrawlQueueItem {
  url: string;
  depth: number;
}

interface ProcessResult {
  pageInfo: PageInfo;
  links: string[];
}

async function processQueueItem(
  config: Config,
  page: Page,
  item: CrawlQueueItem,
  visited: Set<string>
): Promise<ProcessResult | null> {
  const { url, depth } = item;

  // Check max depth
  if (depth > config.crawler.maxDepth) return null;

  // Parse and validate URL
  const path = parseUrlPath(url);
  if (!path) return null;

  // Skip if already visited
  if (visited.has(path)) return null;

  // Skip ignored patterns
  if (shouldIgnorePath(config, path)) return null;

  visited.add(path);

  try {
    await navigateToPage(config, page, url);
    const pageInfo = await extractPageInfo(page, url, path);
    const links = await extractLinks(config, page);

    return { pageInfo, links };
  } catch (error) {
    log.warn(`Error on ${path}: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Parse URL and extract pathname
 * @internal Exported for testing
 */
export function parseUrlPath(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/**
 * Check if path matches any ignore pattern
 * @internal Exported for testing
 */
export function shouldIgnorePath(config: Config, path: string): boolean {
  return config.crawler.ignorePatterns.some((pattern) => path.includes(pattern));
}

async function navigateToPage(config: Config, page: Page, url: string): Promise<void> {
  await page.goto(url, {
    waitUntil: 'networkidle',
    timeout: config.crawler.timeout,
  });

  await page
    .waitForSelector(config.crawler.waitForSelector, {
      timeout: TIMEOUTS.SELECTOR_WAIT,
    })
    .catch(() => {
      // Selector not found within timeout - continue anyway, page content may still be valid
    });
}

async function extractPageInfo(page: Page, url: string, path: string): Promise<PageInfo> {
  const info = await page.evaluate((selectors) => {
    return {
      title: document.title,
      hasForm: document.querySelectorAll(selectors.form).length > 0,
      hasTable: document.querySelectorAll(selectors.table).length > 0,
      hasCards: document.querySelectorAll(selectors.card).length > 0,
      interactiveCount: document.querySelectorAll(selectors.interactive).length,
    };
  }, {
    form: SELECTORS.FORM,
    table: SELECTORS.TABLE,
    card: SELECTORS.CARD,
    interactive: SELECTORS.INTERACTIVE,
  });

  return {
    url,
    path,
    ...info,
    crawledAt: new Date().toISOString(),
  };
}

async function extractLinks(config: Config, page: Page): Promise<string[]> {
  const baseUrl = config.baseUrl;

  const links = await page.evaluate((base: string) => {
    const anchors = document.querySelectorAll('a[href]');
    return [...anchors]
      .map((a) => (a as HTMLAnchorElement).href)
      .filter((href) => href.startsWith(base))
      .map((href) => href.split('#')[0].split('?')[0]);
  }, baseUrl);

  return [...new Set(links)];
}

/**
 * Get full HTML content of the page
 */
export async function getPageHtml(page: Page): Promise<string> {
  return page.content();
}

/**
 * Find and analyze modal dialogs
 */
export async function findAndClickModals(
  page: Page,
  triggers: ElementInfo[]
): Promise<ModalContent[]> {
  const modalContents: ModalContent[] = [];

  for (const trigger of triggers) {
    const content = await tryOpenModal(page, trigger);
    if (content) {
      modalContents.push(content);
    }
  }

  return modalContents;
}

async function tryOpenModal(page: Page, trigger: ElementInfo): Promise<ModalContent | null> {
  try {
    await page.locator(trigger.selector).first().click();
    await page.waitForSelector(SELECTORS.MODAL, { timeout: TIMEOUTS.MODAL_WAIT });

    const html = await page.locator(SELECTORS.MODAL).first().innerHTML();

    await closeModal(page);

    return { trigger: trigger.name, html };
  } catch {
    return null;
  }
}

async function closeModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  // Brief delay to allow modal close animation to complete
  await page.waitForTimeout(TIMEOUTS.MODAL_CLOSE);
}
