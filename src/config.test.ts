import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for configuration validation
 *
 * WHY these tests matter:
 * - Configuration errors should be caught before any work begins
 * - Clear error messages help users fix issues quickly
 * - Auth configuration has conditional requirements
 */

describe('validateConfig', () => {
  // Store original env
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to get fresh config
    vi.resetModules();
    // Create a clean env copy
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  it('returns error when PO_GEN_AI_KEY is missing', async () => {
    process.env.PO_GEN_BASE_URL = 'http://localhost:3000';
    process.env.PO_GEN_AI_KEY = '';

    const { validateConfig } = await import('./config.js');
    const errors = validateConfig();

    expect(errors).toContain('PO_GEN_AI_KEY is required');
  });

  it('returns error when auth is enabled but username is missing', async () => {
    process.env.PO_GEN_BASE_URL = 'http://localhost:3000';
    process.env.PO_GEN_AI_KEY = 'test-key';
    process.env.PO_GEN_AUTH_ENABLED = 'true';
    process.env.PO_GEN_USERNAME = '';
    process.env.PO_GEN_PASSWORD = 'password123';

    const { validateConfig } = await import('./config.js');
    const errors = validateConfig();

    expect(errors).toContain('PO_GEN_USERNAME is required when auth is enabled');
  });

  it('returns error when auth is enabled but password is missing', async () => {
    process.env.PO_GEN_BASE_URL = 'http://localhost:3000';
    process.env.PO_GEN_AI_KEY = 'test-key';
    process.env.PO_GEN_AUTH_ENABLED = 'true';
    process.env.PO_GEN_USERNAME = 'user@test.com';
    process.env.PO_GEN_PASSWORD = '';

    const { validateConfig } = await import('./config.js');
    const errors = validateConfig();

    expect(errors).toContain('PO_GEN_PASSWORD is required when auth is enabled');
  });

  it('returns empty array when all required config is present', async () => {
    process.env.PO_GEN_BASE_URL = 'http://localhost:3000';
    process.env.PO_GEN_AI_KEY = 'test-key';
    process.env.PO_GEN_AUTH_ENABLED = 'false';

    const { validateConfig } = await import('./config.js');
    const errors = validateConfig();

    expect(errors).toEqual([]);
  });

  it('returns empty array when auth is enabled with valid credentials', async () => {
    process.env.PO_GEN_BASE_URL = 'http://localhost:3000';
    process.env.PO_GEN_AI_KEY = 'test-key';
    process.env.PO_GEN_AUTH_ENABLED = 'true';
    process.env.PO_GEN_USERNAME = 'user@test.com';
    process.env.PO_GEN_PASSWORD = 'password123';

    const { validateConfig } = await import('./config.js');
    const errors = validateConfig();

    expect(errors).toEqual([]);
  });

  it('does not require auth credentials when auth is disabled', async () => {
    process.env.PO_GEN_BASE_URL = 'http://localhost:3000';
    process.env.PO_GEN_AI_KEY = 'test-key';
    process.env.PO_GEN_AUTH_ENABLED = 'false';
    // Username and password intentionally not set

    const { validateConfig } = await import('./config.js');
    const errors = validateConfig();

    expect(errors).not.toContain('PO_GEN_USERNAME is required when auth is enabled');
    expect(errors).not.toContain('PO_GEN_PASSWORD is required when auth is enabled');
  });

  it('can return multiple errors at once', async () => {
    process.env.PO_GEN_BASE_URL = '';
    process.env.PO_GEN_AI_KEY = '';
    process.env.PO_GEN_AUTH_ENABLED = 'true';
    process.env.PO_GEN_USERNAME = '';
    process.env.PO_GEN_PASSWORD = '';

    const { validateConfig } = await import('./config.js');
    const errors = validateConfig();

    // Should have multiple errors
    expect(errors.length).toBeGreaterThan(1);
  });
});

describe('FRAMEWORK_DEFAULTS', () => {
  it('has defaults for vuetify framework', async () => {
    const { FRAMEWORK_DEFAULTS } = await import('./config.js');

    expect(FRAMEWORK_DEFAULTS.vuetify).toBeDefined();
    expect(FRAMEWORK_DEFAULTS.vuetify.waitForSelector).toBe('.v-application');
    expect(FRAMEWORK_DEFAULTS.vuetify.loginFields.username).toContain('Email');
  });

  it('has defaults for symfony framework', async () => {
    const { FRAMEWORK_DEFAULTS } = await import('./config.js');

    expect(FRAMEWORK_DEFAULTS.symfony).toBeDefined();
    expect(FRAMEWORK_DEFAULTS.symfony.loginFields.username).toContain('#username');
  });

  it('has defaults for generic framework', async () => {
    const { FRAMEWORK_DEFAULTS } = await import('./config.js');

    expect(FRAMEWORK_DEFAULTS.generic).toBeDefined();
    expect(FRAMEWORK_DEFAULTS.generic.waitForSelector).toBe('body');
  });
});

describe('config object', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses environment variables for configuration', async () => {
    process.env.PO_GEN_BASE_URL = 'http://custom-url.com';
    process.env.PO_GEN_AI_KEY = 'custom-key';
    process.env.PO_GEN_FRAMEWORK = 'vuetify';

    const { config } = await import('./config.js');

    expect(config.baseUrl).toBe('http://custom-url.com');
    expect(config.ai.apiKey).toBe('custom-key');
    expect(config.framework).toBe('vuetify');
  });

  it('uses default values when env variables are not set', async () => {
    delete process.env.PO_GEN_BASE_URL;
    delete process.env.PO_GEN_FRAMEWORK;
    delete process.env.PO_GEN_OUTPUT_DIR;

    const { config } = await import('./config.js');

    expect(config.baseUrl).toBe('http://localhost:5173');
    expect(config.framework).toBe('generic');
    expect(config.output.dir).toBe('./output');
  });

  it('parses numeric environment variables', async () => {
    process.env.PO_GEN_MAX_DEPTH = '5';
    process.env.PO_GEN_TIMEOUT = '60000';

    const { config } = await import('./config.js');

    expect(config.crawler.maxDepth).toBe(5);
    expect(config.crawler.timeout).toBe(60000);
  });

  it('parses ignore patterns from comma-separated string', async () => {
    process.env.PO_GEN_IGNORE = '/logout,/api,/admin';

    const { config } = await import('./config.js');

    expect(config.crawler.ignorePatterns).toEqual(['/logout', '/api', '/admin']);
  });

  it('uses default for invalid maxDepth', async () => {
    process.env.PO_GEN_MAX_DEPTH = 'invalid';

    const { config } = await import('./config.js');

    expect(config.crawler.maxDepth).toBe(10); // default
  });

  it('uses default for out-of-range maxDepth', async () => {
    process.env.PO_GEN_MAX_DEPTH = '500'; // over max of 100

    const { config } = await import('./config.js');

    expect(config.crawler.maxDepth).toBe(10); // default
  });

  it('uses default for negative timeout', async () => {
    process.env.PO_GEN_TIMEOUT = '-1000';

    const { config } = await import('./config.js');

    expect(config.crawler.timeout).toBe(30000); // default
  });
});

describe('URL validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('warns when using HTTP with non-localhost URL', async () => {
    process.env.PO_GEN_BASE_URL = 'http://example.com';
    process.env.PO_GEN_AI_KEY = 'test-key';

    const { validateConfig } = await import('./config.js');
    const errors = validateConfig();

    expect(errors.some(e => e.includes('[WARN]') && e.includes('HTTP'))).toBe(true);
  });

  it('does not warn when using HTTP with localhost', async () => {
    process.env.PO_GEN_BASE_URL = 'http://localhost:3000';
    process.env.PO_GEN_AI_KEY = 'test-key';

    const { validateConfig } = await import('./config.js');
    const errors = validateConfig();

    expect(errors.some(e => e.includes('[WARN]'))).toBe(false);
  });

  it('does not warn when using HTTPS', async () => {
    process.env.PO_GEN_BASE_URL = 'https://example.com';
    process.env.PO_GEN_AI_KEY = 'test-key';

    const { validateConfig } = await import('./config.js');
    const errors = validateConfig();

    expect(errors.some(e => e.includes('[WARN]'))).toBe(false);
  });

  it('returns error for invalid URL format', async () => {
    process.env.PO_GEN_BASE_URL = 'not-a-valid-url';
    process.env.PO_GEN_AI_KEY = 'test-key';

    const { validateConfig } = await import('./config.js');
    const errors = validateConfig();

    expect(errors.some(e => e.includes('not a valid URL'))).toBe(true);
  });
});
