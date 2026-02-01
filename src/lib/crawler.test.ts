import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createConfig } from '../config.js';

/**
 * Tests for crawler helper functions
 *
 * WHY these tests matter:
 * - URL parsing is critical for crawling - wrong parsing = broken sitemap
 * - Ignore patterns prevent infinite loops and unnecessary crawling
 * - These are pure functions, easy to test in isolation
 */

describe('parseUrlPath', () => {
  // Need to import after mocking
  let parseUrlPath: (url: string) => string | null;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import('./crawler.js');
    parseUrlPath = module.parseUrlPath;
  });

  it('extracts pathname from valid URL', () => {
    expect(parseUrlPath('http://localhost:3000/dashboard')).toBe('/dashboard');
  });

  it('handles URL with query parameters', () => {
    expect(parseUrlPath('http://localhost:3000/users?page=1')).toBe('/users');
  });

  it('handles URL with hash', () => {
    expect(parseUrlPath('http://localhost:3000/docs#section1')).toBe('/docs');
  });

  it('handles root URL', () => {
    expect(parseUrlPath('http://localhost:3000/')).toBe('/');
  });

  it('handles URL without trailing slash', () => {
    expect(parseUrlPath('http://localhost:3000')).toBe('/');
  });

  it('handles complex nested paths', () => {
    expect(parseUrlPath('https://example.com/api/v1/users/123/settings')).toBe(
      '/api/v1/users/123/settings'
    );
  });

  it('returns null for invalid URL', () => {
    expect(parseUrlPath('not-a-url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseUrlPath('')).toBeNull();
  });

  it('returns null for malformed URL', () => {
    expect(parseUrlPath('http://')).toBeNull();
  });

  it('handles URL with port number', () => {
    expect(parseUrlPath('http://localhost:8080/admin')).toBe('/admin');
  });

  it('handles HTTPS URLs', () => {
    expect(parseUrlPath('https://secure.example.com/login')).toBe('/login');
  });

  it('preserves URL-encoded characters in path', () => {
    expect(parseUrlPath('http://localhost/path%20with%20spaces')).toBe('/path%20with%20spaces');
  });
});

describe('shouldIgnorePath', () => {
  let shouldIgnorePath: typeof import('./crawler.js').shouldIgnorePath;
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import('./crawler.js');
    shouldIgnorePath = module.shouldIgnorePath;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Create a test config with specific ignore patterns
  const testConfig = createConfig({
    crawler: {
      ignorePatterns: ['/logout', '/api/', '/admin', '.pdf', '.jpg'],
    },
  });

  it('ignores paths containing /logout', () => {
    expect(shouldIgnorePath(testConfig, '/logout')).toBe(true);
    expect(shouldIgnorePath(testConfig, '/user/logout')).toBe(true);
  });

  it('ignores paths containing /api/', () => {
    expect(shouldIgnorePath(testConfig, '/api/users')).toBe(true);
    expect(shouldIgnorePath(testConfig, '/v1/api/data')).toBe(true);
  });

  it('ignores paths with .pdf extension', () => {
    expect(shouldIgnorePath(testConfig, '/documents/report.pdf')).toBe(true);
  });

  it('ignores paths with .jpg extension', () => {
    expect(shouldIgnorePath(testConfig, '/images/photo.jpg')).toBe(true);
  });

  it('does not ignore valid page paths', () => {
    expect(shouldIgnorePath(testConfig, '/dashboard')).toBe(false);
    expect(shouldIgnorePath(testConfig, '/users')).toBe(false);
    expect(shouldIgnorePath(testConfig, '/settings/profile')).toBe(false);
  });

  it('does not ignore paths that partially match pattern', () => {
    // /api without trailing slash should not match /api/
    expect(shouldIgnorePath(testConfig, '/apikey')).toBe(false);
  });

  it('handles root path', () => {
    expect(shouldIgnorePath(testConfig, '/')).toBe(false);
  });

  it('is case-sensitive', () => {
    // Assuming patterns are lowercase
    expect(shouldIgnorePath(testConfig, '/LOGOUT')).toBe(false);
    expect(shouldIgnorePath(testConfig, '/API/users')).toBe(false);
  });
});
