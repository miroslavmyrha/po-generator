import { chromium } from 'playwright';
import { config } from '../config.js';

export async function createBrowser(headless = true) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  return { browser, context, page };
}

export async function login(page) {
  if (!config.auth.enabled) return true;

  const loginUrl = config.baseUrl + config.auth.loginUrl;
  await page.goto(loginUrl);

  try {
    // Vyplň username
    await page.locator(config.auth.fields.username).fill(config.auth.credentials.username);

    // Vyplň password
    await page.locator(config.auth.fields.password).fill(config.auth.credentials.password);

    // Submit
    await page.locator(config.auth.fields.submit).click();

    // Čekej na úspěšný login
    await page.waitForURL((url) => url.pathname.includes(config.auth.successUrl), {
      timeout: 10000,
    });

    return true;
  } catch (error) {
    console.error('Login selhal:', error.message);
    return false;
  }
}

export async function crawlUrls(page, onPageFound) {
  const visited = new Set();
  const queue = [config.baseUrl];
  const sitemap = [];

  while (queue.length > 0) {
    const url = queue.shift();
    const path = new URL(url).pathname;

    // Přeskoč již navštívené
    if (visited.has(path)) continue;

    // Přeskoč ignorované patterns
    if (config.crawler.ignorePatterns.some((p) => path.includes(p))) continue;

    visited.add(path);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: config.crawler.timeout });

      // Čekej na Vuetify
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
          hasCards: document.querySelectorAll('.v-card').length > 0,
          interactiveCount:
            document.querySelectorAll('.v-btn, .v-text-field, .v-select, .v-checkbox, a[href]')
              .length,
        };
      });

      const entry = {
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
      const links = await page.evaluate((baseUrl) => {
        const anchors = document.querySelectorAll('a[href]');
        return [...anchors]
          .map((a) => a.href)
          .filter((href) => href.startsWith(baseUrl))
          .map((href) => href.split('#')[0].split('?')[0]); // Odstraň hash a query
      }, config.baseUrl);

      // Přidej nové odkazy do queue
      for (const link of [...new Set(links)]) {
        const linkPath = new URL(link).pathname;
        if (!visited.has(linkPath)) {
          queue.push(link);
        }
      }
    } catch (error) {
      console.error(`Chyba na ${path}:`, error.message);
    }
  }

  return sitemap;
}

export async function getPageHtml(page) {
  return page.content();
}

export async function findAndClickModals(page, triggers) {
  const modalContents = [];

  for (const trigger of triggers) {
    try {
      // Klikni na trigger
      await page.locator(trigger.selector).first().click();

      // Čekej na modal
      const modalSelector = '.v-dialog, .v-overlay__content .v-card, .v-navigation-drawer--active';
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
