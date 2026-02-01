import { chromium, Page } from 'playwright';
import { config } from '../config.js';
import type { PageInfo, BrowserInstance, ModalContent, ElementInfo } from '../types.js';

export async function createBrowser(headless = true): Promise<BrowserInstance> {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  return { browser, context, page };
}

export async function login(page: Page): Promise<boolean> {
  if (!config.auth.enabled) return true;

  const loginUrl = config.baseUrl + config.auth.loginUrl;
  await page.goto(loginUrl);

  try {
    // Vyplň username
    await page.locator(config.auth.fields.username).first().fill(config.auth.credentials.username || '');

    // Vyplň password
    await page.locator(config.auth.fields.password).first().fill(config.auth.credentials.password || '');

    // Submit
    await page.locator(config.auth.fields.submit).first().click();

    // Čekej na úspěšný login
    await page.waitForURL((url) => url.pathname.includes(config.auth.successUrl), {
      timeout: 10000,
    });

    return true;
  } catch (error) {
    console.error('Login selhal:', (error as Error).message);
    return false;
  }
}

export async function crawlUrls(
  page: Page,
  onPageFound?: (pageInfo: PageInfo, page: Page) => Promise<void>
): Promise<PageInfo[]> {
  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = [{ url: config.baseUrl, depth: 0 }];
  const sitemap: PageInfo[] = [];

  while (queue.length > 0) {
    const { url, depth } = queue.shift()!;

    // Zkontroluj max hloubku
    if (depth > config.crawler.maxDepth) continue;

    let path: string;
    try {
      path = new URL(url).pathname;
    } catch {
      continue; // Nevalidní URL
    }

    // Přeskoč již navštívené
    if (visited.has(path)) continue;

    // Přeskoč ignorované patterns
    if (config.crawler.ignorePatterns.some((p) => path.includes(p))) continue;

    visited.add(path);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: config.crawler.timeout });

      // Čekej na framework selector
      await page
        .waitForSelector(config.crawler.waitForSelector, {
          timeout: config.crawler.timeout,
        })
        .catch(() => {});

      // Získej info o stránce
      const pageInfo = await page.evaluate(() => {
        return {
          title: document.title,
          hasForm: document.querySelectorAll('form, .v-form').length > 0,
          hasTable: document.querySelectorAll('.v-data-table, table').length > 0,
          hasCards: document.querySelectorAll('.v-card, .card').length > 0,
          interactiveCount:
            document.querySelectorAll('.v-btn, .btn, button, .v-text-field, .v-select, input, select, textarea, a[href]')
              .length,
        };
      });

      const entry: PageInfo = {
        url,
        path,
        ...pageInfo,
        crawledAt: new Date().toISOString(),
      };

      sitemap.push(entry);

      if (onPageFound) {
        await onPageFound(entry, page);
      }

      // Najdi další odkazy
      const links = await page.evaluate((baseUrl: string) => {
        const anchors = document.querySelectorAll('a[href]');
        return [...anchors]
          .map((a) => (a as HTMLAnchorElement).href)
          .filter((href) => href.startsWith(baseUrl))
          .map((href) => href.split('#')[0].split('?')[0]); // Odstraň hash a query
      }, config.baseUrl);

      // Přidej nové odkazy do queue
      for (const link of [...new Set(links)]) {
        try {
          const linkPath = new URL(link).pathname;
          if (!visited.has(linkPath)) {
            queue.push({ url: link, depth: depth + 1 });
          }
        } catch {
          // Nevalidní URL - přeskoč
        }
      }
    } catch (error) {
      console.error(`Chyba na ${path}:`, (error as Error).message);
    }
  }

  return sitemap;
}

export async function getPageHtml(page: Page): Promise<string> {
  return page.content();
}

export async function findAndClickModals(
  page: Page,
  triggers: ElementInfo[]
): Promise<ModalContent[]> {
  const modalContents: ModalContent[] = [];

  for (const trigger of triggers) {
    try {
      // Klikni na trigger
      await page.locator(trigger.selector).first().click();

      // Čekej na modal
      const modalSelector = '.v-dialog, .v-overlay__content .v-card, .v-navigation-drawer--active, .modal, [role="dialog"]';
      await page.waitForSelector(modalSelector, { timeout: 2000 });

      // Získej obsah
      const modalHtml = await page.locator(modalSelector).first().innerHTML();

      modalContents.push({
        trigger: trigger.name,
        html: modalHtml,
      });

      // Zavři modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } catch {
      // Modal se neotevřel - ok
    }
  }

  return modalContents;
}
