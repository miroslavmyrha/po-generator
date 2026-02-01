import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { FILES, ERRORS } from '../constants.js';
import { AppError } from '../types.js';
import type { PageInfo, Decisions, FullScanResult } from '../types.js';

/**
 * Load and validate JSON file with proper error handling
 * @internal Exported for testing
 */
export function loadJsonFile<T>(filePath: string, errorMessage: string, errorCode: string): T {
  if (!fs.existsSync(filePath)) {
    throw new AppError(errorMessage, errorCode);
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AppError(`Invalid JSON in ${path.basename(filePath)}: ${error.message}`, 'INVALID_JSON');
    }
    throw error;
  }
}

/**
 * Load decisions from output directory
 */
export function loadDecisions(): Decisions {
  const decisionsPath = path.join(config.output.dir, FILES.DECISIONS);
  return loadJsonFile<Decisions>(decisionsPath, ERRORS.DECISIONS_NOT_FOUND, 'DECISIONS_NOT_FOUND');
}

/**
 * Save decisions to output directory
 */
export function saveDecisions(decisions: Decisions): void {
  const decisionsPath = path.join(config.output.dir, FILES.DECISIONS);
  fs.writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2));
}

/**
 * Load sitemap from output directory
 */
export function loadSitemap(): PageInfo[] {
  const sitemapPath = path.join(config.output.dir, FILES.SITEMAP);
  return loadJsonFile<PageInfo[]>(sitemapPath, ERRORS.SITEMAP_NOT_FOUND, 'SITEMAP_NOT_FOUND');
}

/**
 * Load scan result for a specific page
 */
export function loadScanResult(pagePath: string): FullScanResult | null {
  const fileName = pagePath.replace(/\//g, '_').replace(/^_/, '') || 'home';
  const scanFile = path.join(config.output.dir, FILES.SCANNED_DIR, `${fileName}.json`);

  if (!fs.existsSync(scanFile)) {
    return null;
  }

  try {
    return loadJsonFile<FullScanResult>(scanFile, '', '');
  } catch {
    return null;
  }
}

/**
 * Decision counting result
 */
export interface DecisionCounts {
  pageObject: number;
  skip: number;
  askUser: number;
}

/**
 * Count decisions by type
 */
export function countDecisions(decisions: Decisions): DecisionCounts {
  const values = Object.values(decisions);
  return {
    pageObject: values.filter((d) => d.decision === 'page_object').length,
    skip: values.filter((d) => d.decision === 'skip').length,
    askUser: values.filter((d) => d.decision === 'ask_user').length,
  };
}

/**
 * Find pages that need user review
 */
export function findPagesToReview(decisions: Decisions): [string, Decisions[string]][] {
  return Object.entries(decisions).filter(([, d]) => d.decision === 'ask_user');
}

/**
 * Get paths for pages marked as page_object
 */
export function getPageObjectPaths(decisions: Decisions): string[] {
  return Object.entries(decisions)
    .filter(([, d]) => d.decision === 'page_object')
    .map(([pagePath]) => pagePath);
}
