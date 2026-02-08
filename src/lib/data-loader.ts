import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { FILES, ERRORS } from '../constants.js';
import { log } from './logger.js';
import { pathToFileName, writeFileAtomic, getFsErrorCode, safeJsonParse } from './utils.js';
import { AppError } from '../types.js';
import type { Config, PageInfo, Decisions, FullScanResult } from '../types.js';

/**
 * Load and validate JSON file with proper error handling
 * @internal Exported for testing
 */
/**
 * Load and validate JSON file with proper error handling
 * @param filePath - Path to the JSON file
 * @param errorMessage - Error message if file not found
 * @param errorCode - Error code if file not found
 * @param schema - Optional Zod schema for validation
 * @internal Exported for testing
 */
export function loadJsonFile<T>(
  filePath: string,
  errorMessage: string,
  errorCode: string,
  schema?: z.ZodSchema<T>
): T {
  // No TOCTOU: try to read directly, handle ENOENT in catch
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = safeJsonParse(content);

    // Validate with Zod schema if provided
    if (schema) {
      const result = schema.safeParse(parsed);
      if (!result.success) {
        const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new AppError(`Invalid data in ${path.basename(filePath)}: ${issues}`, 'VALIDATION_FAILED');
      }
      return result.data;
    }

    return parsed as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Handle file not found (ENOENT)
    if (getFsErrorCode(error) === 'ENOENT') {
      throw new AppError(errorMessage, errorCode);
    }
    if (error instanceof SyntaxError) {
      throw new AppError(`Invalid JSON in ${path.basename(filePath)}: ${error.message}`, 'INVALID_JSON');
    }
    throw error;
  }
}

/**
 * Load decisions from output directory
 */
export function loadDecisions(config: Config): Decisions {
  const decisionsPath = path.join(config.output.dir, FILES.DECISIONS);
  return loadJsonFile<Decisions>(decisionsPath, ERRORS.DECISIONS_NOT_FOUND, 'DECISIONS_NOT_FOUND');
}

/**
 * Save decisions to output directory (atomic write)
 */
export function saveDecisions(config: Config, decisions: Decisions): void {
  const decisionsPath = path.join(config.output.dir, FILES.DECISIONS);
  writeFileAtomic(decisionsPath, JSON.stringify(decisions, null, 2));
}

/**
 * Load sitemap from output directory
 */
export function loadSitemap(config: Config): PageInfo[] {
  const sitemapPath = path.join(config.output.dir, FILES.SITEMAP);
  return loadJsonFile<PageInfo[]>(sitemapPath, ERRORS.SITEMAP_NOT_FOUND, 'SITEMAP_NOT_FOUND');
}

/**
 * Load scan result for a specific page if it exists
 * Returns null if file doesn't exist or fails to parse (does NOT throw)
 *
 * Note: Unlike loadSitemap/loadDecisions which throw on missing files,
 * this function returns null since scan results are optional per-page data.
 *
 * @param config - Application configuration
 * @param pagePath - URL path of the page (e.g., '/users/settings')
 * @returns Scan result or null if not found/invalid
 */
export function loadScanResult(config: Config, pagePath: string): FullScanResult | null {
  const fileName = pathToFileName(pagePath);
  const scanFile = path.join(config.output.dir, FILES.SCANNED_DIR, `${fileName}.json`);

  // No TOCTOU: try to read directly, return null on ENOENT
  try {
    const content = fs.readFileSync(scanFile, 'utf-8');
    return safeJsonParse(content) as FullScanResult;
  } catch (error) {
    // ENOENT is expected for missing files - don't log
    if (getFsErrorCode(error) !== 'ENOENT') {
      log.debug(`Failed to load scan result for ${pagePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
 * Count decisions by type - single pass for efficiency
 */
export function countDecisions(decisions: Decisions): DecisionCounts {
  const counts: DecisionCounts = { pageObject: 0, skip: 0, askUser: 0 };

  for (const value of Object.values(decisions)) {
    switch (value.decision) {
      case 'page_object':
        counts.pageObject++;
        break;
      case 'skip':
        counts.skip++;
        break;
      case 'ask_user':
        counts.askUser++;
        break;
    }
  }

  return counts;
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
