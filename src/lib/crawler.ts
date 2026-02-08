import { chromium, Page } from 'playwright';
import { SELECTORS, TIMEOUTS, ERRORS, SUCCESS } from '../constants.js';
import { log } from './logger.js';
import { getErrorMessage, withRetry } from './utils.js';
import { AppError } from '../types.js';
import type { Config, PageInfo, BrowserInstance, ModalContent, ElementInfo } from '../types.js';
import type { Ora } from 'ora';

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
 * Login result - discriminated union for proper type narrowing
 */
export type LoginResult =
  | { success: true }
  | { success: false; error: string; step: 'navigate' | 'fill' | 'submit' | 'wait' };

/**
 * Perform login if authentication is enabled
 * Returns detailed result including which step failed
 */
export async function login(config: Config, page: Page): Promise<LoginResult> {
  if (!config.auth.enabled) return { success: true };

  const loginUrl = config.baseUrl + config.auth.loginUrl;

  try {
    await page.goto(loginUrl);
  } catch (error) {
    return { success: false, error: getErrorMessage(error), step: 'navigate' };
  }

  try {
    await fillLoginForm(config, page);
  } catch (error) {
    return { success: false, error: getErrorMessage(error), step: 'fill' };
  }

  try {
    await submitLoginForm(config, page);
  } catch (error) {
    return { success: false, error: getErrorMessage(error), step: 'submit' };
  }

  try {
    await waitForLoginSuccess(config, page);
    return { success: true };
  } catch (error) {
    return { success: false, error: getErrorMessage(error), step: 'wait' };
  }
}

async function fillLoginForm(config: Config, page: Page): Promise<void> {
  const { username, password } = config.auth.credentials;
  const fields = config.auth.fields;

  // Validate credentials are not empty
  if (!username || !password) {
    throw new AppError(
      'Login credentials are missing. Set PO_GEN_USERNAME and PO_GEN_PASSWORD.',
      'MISSING_CREDENTIALS'
    );
  }

  await page.locator(fields.username).first().fill(username);
  await page.locator(fields.password).first().fill(password);
}

async function submitLoginForm(config: Config, page: Page): Promise<void> {
  await page.locator(config.auth.fields.submit).first().click();
}

async function waitForLoginSuccess(config: Config, page: Page): Promise<void> {
  try {
    await page.waitForURL(
      (url) => url.pathname.includes(config.auth.successUrl),
      { timeout: TIMEOUTS.LOGIN_WAIT }
    );
  } catch (error) {
    // Provide clearer error message for timeout
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error(
        `Login timeout: Expected redirect to "${config.auth.successUrl}" within ${TIMEOUTS.LOGIN_WAIT}ms. ` +
        `Current URL: ${page.url()}. Check credentials or success URL pattern.`,
        { cause: error }
      );
    }
    throw error;
  }
}

/**
 * Sanitize error message to remove potential credential exposure
 * Removes common patterns where credentials might appear in error messages
 */
function sanitizeLoginError(error: string, config: Config): string {
  let sanitized = error;

  // Remove any occurrence of actual credentials from error message
  const { username, password } = config.auth.credentials;
  if (username) {
    sanitized = sanitized.replace(new RegExp(escapeRegex(username), 'g'), '[REDACTED]');
  }
  if (password) {
    sanitized = sanitized.replace(new RegExp(escapeRegex(password), 'g'), '[REDACTED]');
  }

  return sanitized;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Handle login with spinner feedback - shared by crawl and scan commands
 * @throws AppError if login fails with detailed error message
 * SECURITY: Error messages are sanitized to prevent credential exposure
 */
export async function handleAuthenticatedLogin(
  config: Config,
  page: Page,
  spinner: Ora,
  options?: { skipIfDisabled?: boolean }
): Promise<void> {
  const skipIfDisabled = options?.skipIfDisabled ?? false;

  if (!config.auth.enabled) {
    if (skipIfDisabled) return;
    // Auth not enabled but we were asked to login - just skip
    return;
  }

  spinner.text = 'Logging in...';
  const result = await login(config, page);

  if (result.success) {
    spinner.succeed(SUCCESS.LOGGED_IN);
  } else {
    // TypeScript now knows result has error and step properties
    const stepMsg = ` (failed at: ${result.step})`;
    // SECURITY: Sanitize error message to prevent credential exposure in logs
    const sanitizedError = sanitizeLoginError(result.error, config);
    spinner.fail(`${ERRORS.LOGIN_FAILED}${stepMsg}`);
    log.dim(`Error: ${sanitizedError}`);
    throw new AppError(`${ERRORS.LOGIN_FAILED}${stepMsg}`, 'LOGIN_FAILED');
  }
}

/**
 * Crawl all URLs in the application
 * Uses simple array queue - Array.shift() is O(n) but negligible for typical crawl sizes (<500 pages)
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
    const item = queue.shift();
    if (!item) break; // Safety check - should never happen but avoids non-null assertion
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
    const errorMsg = getErrorMessage(error);

    // Check if page context is still valid
    try {
      await page.evaluate(() => true);
    } catch {
      // Page context is invalid - this is a critical error
      log.error(`Page context lost on ${path}. Browser may have crashed.`);
      throw new AppError(`Browser context lost: ${errorMsg}`, 'BROWSER_CRASH');
    }

    // Page is still valid, just this navigation failed
    log.warn(`Error on ${path}: ${errorMsg}`);
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

/** Maximum retries for page navigation */
const NAV_MAX_RETRIES = 2;

async function navigateToPage(config: Config, page: Page, url: string): Promise<void> {
  // Retry navigation on transient network failures
  const result = await withRetry(
    async () => {
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: config.crawler.timeout,
      });
      return true; // Return non-null to indicate success
    },
    {
      maxRetries: NAV_MAX_RETRIES,
      baseDelay: 1000,
      onRetry: (attempt, max) => {
        log.debug(`Navigation retry ${attempt}/${max} for ${url}`);
      },
    }
  );

  if (!result) {
    throw new Error(`Failed to navigate to ${url} after ${NAV_MAX_RETRIES} attempts`);
  }

  await page
    .waitForSelector(config.crawler.waitForSelector, {
      timeout: TIMEOUTS.SELECTOR_WAIT,
    })
    .catch((error: Error) => {
      // Only swallow timeout errors - re-throw unexpected errors
      if (error.name !== 'TimeoutError' && !error.message.includes('Timeout')) {
        throw error;
      }
      // Selector not found within timeout - continue anyway, page content may still be valid
    });
}

async function extractPageInfo(page: Page, url: string, path: string): Promise<PageInfo> {
  // Batch all DOM queries into a single evaluate call for performance
  const info = await page.evaluate((selectors) => {
    // Single DOM traversal - collect all data at once
    const formSelector = selectors.form;
    const tableSelector = selectors.table;
    const cardSelector = selectors.card;
    const interactiveSelector = selectors.interactive;

    // Use a combined selector approach for fewer reflows
    return {
      title: document.title,
      hasForm: !!document.querySelector(formSelector),
      hasTable: !!document.querySelector(tableSelector),
      hasCards: !!document.querySelector(cardSelector),
      interactiveCount: document.querySelectorAll(interactiveSelector).length,
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
  } catch (error) {
    log.debug(`Modal trigger "${trigger.name}" did not open a modal: ${getErrorMessage(error)}`);
    return null;
  }
}

async function closeModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  // Brief delay to allow modal close animation to complete
  await page.waitForTimeout(TIMEOUTS.MODAL_CLOSE);
}
