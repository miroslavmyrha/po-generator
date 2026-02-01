import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  loadJsonFile,
  loadDecisions,
  saveDecisions,
  loadSitemap,
  countDecisions,
  findPagesToReview,
  getPageObjectPaths,
} from './data-loader.js';
import { createConfig } from '../config.js';
import { AppError } from '../types.js';
import type { Decisions, Config } from '../types.js';

/**
 * Tests for data-loader module
 *
 * WHY these tests matter:
 * - File loading is critical for the workflow - if JSON parsing fails, the whole tool breaks
 * - Decision counting is used in multiple commands - bugs here affect UX
 * - These are pure functions with side effects (file I/O), easy to test with temp files
 */

describe('data-loader', () => {
  let tempDir: string;
  let testConfig: Config;

  beforeEach(() => {
    vi.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-gen-test-'));
    testConfig = createConfig({
      output: { dir: tempDir },
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadJsonFile', () => {
    it('loads and parses valid JSON file', () => {
      const testData = { key: 'value', number: 42 };
      const filePath = path.join(tempDir, 'test.json');
      fs.writeFileSync(filePath, JSON.stringify(testData));

      const result = loadJsonFile<typeof testData>(filePath, 'File not found', 'NOT_FOUND');

      expect(result).toEqual(testData);
    });

    it('throws AppError when file does not exist', () => {
      const filePath = path.join(tempDir, 'nonexistent.json');

      expect(() => loadJsonFile(filePath, 'Custom error message', 'CUSTOM_CODE')).toThrow(AppError);
      expect(() => loadJsonFile(filePath, 'Custom error message', 'CUSTOM_CODE')).toThrow(
        'Custom error message'
      );
    });

    it('throws AppError with INVALID_JSON code for malformed JSON', () => {
      const filePath = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(filePath, '{ invalid json }');

      expect(() => loadJsonFile(filePath, 'Not used', 'NOT_USED')).toThrow(AppError);

      try {
        loadJsonFile(filePath, 'Not used', 'NOT_USED');
      } catch (error) {
        expect((error as AppError).code).toBe('INVALID_JSON');
        expect((error as AppError).message).toContain('Invalid JSON');
      }
    });
  });

  describe('countDecisions', () => {
    it('counts decisions correctly when all types present', () => {
      const decisions: Decisions = {
        '/page1': { decision: 'page_object', reason: '', elementCount: 5 },
        '/page2': { decision: 'skip', reason: '', elementCount: 0 },
        '/page3': { decision: 'ask_user', reason: '', elementCount: 3 },
        '/page4': { decision: 'page_object', reason: '', elementCount: 10 },
      };

      const counts = countDecisions(decisions);

      expect(counts.pageObject).toBe(2);
      expect(counts.skip).toBe(1);
      expect(counts.askUser).toBe(1);
    });

    it('returns zeros for empty decisions', () => {
      const counts = countDecisions({});

      expect(counts.pageObject).toBe(0);
      expect(counts.skip).toBe(0);
      expect(counts.askUser).toBe(0);
    });

    it('handles single decision type', () => {
      const decisions: Decisions = {
        '/page1': { decision: 'page_object', reason: '', elementCount: 5 },
        '/page2': { decision: 'page_object', reason: '', elementCount: 3 },
      };

      const counts = countDecisions(decisions);

      expect(counts.pageObject).toBe(2);
      expect(counts.skip).toBe(0);
      expect(counts.askUser).toBe(0);
    });
  });

  describe('findPagesToReview', () => {
    it('returns only ask_user decisions', () => {
      const decisions: Decisions = {
        '/page1': { decision: 'page_object', reason: '', elementCount: 5 },
        '/page2': { decision: 'ask_user', reason: 'Unclear purpose', elementCount: 2 },
        '/page3': { decision: 'skip', reason: '', elementCount: 0 },
        '/page4': { decision: 'ask_user', reason: 'Too complex', elementCount: 15 },
      };

      const toReview = findPagesToReview(decisions);

      expect(toReview).toHaveLength(2);
      expect(toReview.map(([path]) => path)).toContain('/page2');
      expect(toReview.map(([path]) => path)).toContain('/page4');
    });

    it('returns empty array when no reviews needed', () => {
      const decisions: Decisions = {
        '/page1': { decision: 'page_object', reason: '', elementCount: 5 },
        '/page2': { decision: 'skip', reason: '', elementCount: 0 },
      };

      const toReview = findPagesToReview(decisions);

      expect(toReview).toHaveLength(0);
    });
  });

  describe('getPageObjectPaths', () => {
    it('returns paths marked as page_object', () => {
      const decisions: Decisions = {
        '/dashboard': { decision: 'page_object', reason: '', elementCount: 10 },
        '/login': { decision: 'page_object', reason: '', elementCount: 5 },
        '/logout': { decision: 'skip', reason: '', elementCount: 0 },
        '/settings': { decision: 'ask_user', reason: '', elementCount: 3 },
      };

      const paths = getPageObjectPaths(decisions);

      expect(paths).toHaveLength(2);
      expect(paths).toContain('/dashboard');
      expect(paths).toContain('/login');
      expect(paths).not.toContain('/logout');
      expect(paths).not.toContain('/settings');
    });

    it('returns empty array when no page objects', () => {
      const decisions: Decisions = {
        '/page1': { decision: 'skip', reason: '', elementCount: 0 },
      };

      const paths = getPageObjectPaths(decisions);

      expect(paths).toHaveLength(0);
    });
  });

  describe('saveDecisions and loadDecisions integration', () => {
    it('saves and loads decisions correctly', () => {
      const decisions: Decisions = {
        '/test': { decision: 'page_object', reason: 'Test page', elementCount: 5 },
      };

      // Create decisions.json file
      const decisionsPath = path.join(tempDir, 'decisions.json');
      fs.writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2));

      const loaded = loadDecisions(testConfig);

      expect(loaded).toEqual(decisions);
    });

    it('saves decisions to correct location', () => {
      const decisions: Decisions = {
        '/test': { decision: 'page_object', reason: 'Test page', elementCount: 5 },
      };

      saveDecisions(testConfig, decisions);

      const decisionsPath = path.join(tempDir, 'decisions.json');
      expect(fs.existsSync(decisionsPath)).toBe(true);

      const loaded = JSON.parse(fs.readFileSync(decisionsPath, 'utf-8'));
      expect(loaded).toEqual(decisions);
    });
  });

  describe('loadSitemap', () => {
    it('loads sitemap from config output directory', () => {
      const sitemap = [
        { url: 'http://localhost/page1', path: '/page1', title: 'Page 1', hasForm: false, hasTable: false, hasCards: false, interactiveCount: 5, crawledAt: '2024-01-01' },
      ];

      const sitemapPath = path.join(tempDir, 'sitemap.json');
      fs.writeFileSync(sitemapPath, JSON.stringify(sitemap));

      const loaded = loadSitemap(testConfig);

      expect(loaded).toEqual(sitemap);
    });
  });
});
