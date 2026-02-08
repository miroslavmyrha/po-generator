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

    const { createConfig, validateConfig } = await import('./config.js');
    const config = createConfig();
    const errors = validateConfig(config);

    expect(errors).toContain('PO_GEN_AI_KEY is required');
  });

  it('returns error when auth is enabled but username is missing', async () => {
    process.env.PO_GEN_BASE_URL = 'http://localhost:3000';
    process.env.PO_GEN_AI_KEY = 'test-key';
    process.env.PO_GEN_AUTH_ENABLED = 'true';
    process.env.PO_GEN_USERNAME = '';
    process.env.PO_GEN_PASSWORD = 'password123';

    const { createConfig, validateConfig } = await import('./config.js');
    const config = createConfig();
    const errors = validateConfig(config);

    expect(errors).toContain('PO_GEN_USERNAME is required when auth is enabled');
  });

  it('returns error when auth is enabled but password is missing', async () => {
    process.env.PO_GEN_BASE_URL = 'http://localhost:3000';
    process.env.PO_GEN_AI_KEY = 'test-key';
    process.env.PO_GEN_AUTH_ENABLED = 'true';
    process.env.PO_GEN_USERNAME = 'user@test.com';
    process.env.PO_GEN_PASSWORD = '';

    const { createConfig, validateConfig } = await import('./config.js');
    const config = createConfig();
    const errors = validateConfig(config);

    expect(errors).toContain('PO_GEN_PASSWORD is required when auth is enabled');
  });

  it('returns empty array when all required config is present', async () => {
    process.env.PO_GEN_BASE_URL = 'http://localhost:3000';
    process.env.PO_GEN_AI_KEY = 'test-key';
    process.env.PO_GEN_AUTH_ENABLED = 'false';

    const { createConfig, validateConfig } = await import('./config.js');
    const config = createConfig();
    const errors = validateConfig(config);

    expect(errors).toEqual([]);
  });

  it('returns empty array when auth is enabled with valid credentials', async () => {
    process.env.PO_GEN_BASE_URL = 'http://localhost:3000';
    process.env.PO_GEN_AI_KEY = 'test-key';
    process.env.PO_GEN_AUTH_ENABLED = 'true';
    process.env.PO_GEN_USERNAME = 'user@test.com';
    process.env.PO_GEN_PASSWORD = 'password123';

    const { createConfig, validateConfig } = await import('./config.js');
    const config = createConfig();
    const errors = validateConfig(config);

    expect(errors).toEqual([]);
  });

  it('does not require auth credentials when auth is disabled', async () => {
    process.env.PO_GEN_BASE_URL = 'http://localhost:3000';
    process.env.PO_GEN_AI_KEY = 'test-key';
    process.env.PO_GEN_AUTH_ENABLED = 'false';
    // Username and password intentionally not set

    const { createConfig, validateConfig } = await import('./config.js');
    const config = createConfig();
    const errors = validateConfig(config);

    expect(errors).not.toContain('PO_GEN_USERNAME is required when auth is enabled');
    expect(errors).not.toContain('PO_GEN_PASSWORD is required when auth is enabled');
  });

  it('can return multiple errors at once', async () => {
    process.env.PO_GEN_BASE_URL = '';
    process.env.PO_GEN_AI_KEY = '';
    process.env.PO_GEN_AUTH_ENABLED = 'true';
    process.env.PO_GEN_USERNAME = '';
    process.env.PO_GEN_PASSWORD = '';

    const { createConfig, validateConfig } = await import('./config.js');
    const config = createConfig();
    const errors = validateConfig(config);

    // Should have multiple errors
    expect(errors.length).toBeGreaterThan(1);
  });
});

describe('FRAMEWORK_REGISTRY', () => {
  it('has config for vuetify framework', async () => {
    const { FRAMEWORK_REGISTRY } = await import('./config.js');

    expect(FRAMEWORK_REGISTRY.vuetify).toBeDefined();
    expect(FRAMEWORK_REGISTRY.vuetify.waitForSelector).toBe('.v-application');
    expect(FRAMEWORK_REGISTRY.vuetify.loginFields.username).toContain('Email');
  });

  it('has config for symfony framework', async () => {
    const { FRAMEWORK_REGISTRY } = await import('./config.js');

    expect(FRAMEWORK_REGISTRY.symfony).toBeDefined();
    expect(FRAMEWORK_REGISTRY.symfony.loginFields.username).toContain('#username');
  });

  it('has config for generic framework', async () => {
    const { FRAMEWORK_REGISTRY } = await import('./config.js');

    expect(FRAMEWORK_REGISTRY.generic).toBeDefined();
    expect(FRAMEWORK_REGISTRY.generic.waitForSelector).toBe('body');
  });
});

describe('createConfig', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses environment variables for configuration', async () => {
    process.env.PO_GEN_BASE_URL = 'http://custom-url.com';
    process.env.PO_GEN_AI_KEY = 'custom-key';
    process.env.PO_GEN_FRAMEWORK = 'vuetify';

    const { createConfig } = await import('./config.js');
    const config = createConfig();

    expect(config.baseUrl).toBe('http://custom-url.com');
    expect(config.ai.apiKey).toBe('custom-key');
    expect(config.framework).toBe('vuetify');
  });

  it('uses default values when env variables are not set', async () => {
    delete process.env.PO_GEN_BASE_URL;
    delete process.env.PO_GEN_FRAMEWORK;
    delete process.env.PO_GEN_OUTPUT_DIR;

    const { createConfig } = await import('./config.js');
    const config = createConfig();

    expect(config.baseUrl).toBe('http://localhost:5173');
    expect(config.framework).toBe('generic');
    expect(config.output.dir).toBe('./output');
  });

  it('parses numeric environment variables', async () => {
    process.env.PO_GEN_MAX_DEPTH = '5';
    process.env.PO_GEN_TIMEOUT = '60000';

    const { createConfig } = await import('./config.js');
    const config = createConfig();

    expect(config.crawler.maxDepth).toBe(5);
    expect(config.crawler.timeout).toBe(60000);
  });

  it('parses ignore patterns from comma-separated string', async () => {
    process.env.PO_GEN_IGNORE = '/logout,/api,/admin';

    const { createConfig } = await import('./config.js');
    const config = createConfig();

    expect(config.crawler.ignorePatterns).toEqual(['/logout', '/api', '/admin']);
  });

  it('uses default for invalid maxDepth', async () => {
    process.env.PO_GEN_MAX_DEPTH = 'invalid';

    const { createConfig } = await import('./config.js');
    const config = createConfig();

    expect(config.crawler.maxDepth).toBe(10); // default
  });

  it('uses default for out-of-range maxDepth', async () => {
    process.env.PO_GEN_MAX_DEPTH = '500'; // over max of 100

    const { createConfig } = await import('./config.js');
    const config = createConfig();

    expect(config.crawler.maxDepth).toBe(10); // default
  });

  it('uses default for negative timeout', async () => {
    process.env.PO_GEN_TIMEOUT = '-1000';

    const { createConfig } = await import('./config.js');
    const config = createConfig();

    expect(config.crawler.timeout).toBe(30000); // default
  });

  it('accepts overrides to config values', async () => {
    const { createConfig } = await import('./config.js');
    const config = createConfig({
      baseUrl: 'http://override.com',
      framework: 'symfony',
      ai: { apiKey: 'override-key' },
    });

    expect(config.baseUrl).toBe('http://override.com');
    expect(config.framework).toBe('symfony');
    expect(config.ai.apiKey).toBe('override-key');
  });

  it('deeply merges nested overrides', async () => {
    const { createConfig } = await import('./config.js');
    const config = createConfig({
      auth: { enabled: true, credentials: { username: 'test' } },
    });

    expect(config.auth.enabled).toBe(true);
    expect(config.auth.credentials.username).toBe('test');
    // Other nested values should still exist
    expect(config.auth.loginUrl).toBeDefined();
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

    const { createConfig, validateConfig } = await import('./config.js');
    const config = createConfig();
    const errors = validateConfig(config);

    expect(errors.some(e => e.includes('[WARN]') && e.includes('HTTP'))).toBe(true);
  });

  it('does not warn when using HTTP with localhost', async () => {
    process.env.PO_GEN_BASE_URL = 'http://localhost:3000';
    process.env.PO_GEN_AI_KEY = 'test-key';

    const { createConfig, validateConfig } = await import('./config.js');
    const config = createConfig();
    const errors = validateConfig(config);

    expect(errors.some(e => e.includes('[WARN]'))).toBe(false);
  });

  it('does not warn when using HTTPS', async () => {
    process.env.PO_GEN_BASE_URL = 'https://example.com';
    process.env.PO_GEN_AI_KEY = 'test-key';

    const { createConfig, validateConfig } = await import('./config.js');
    const config = createConfig();
    const errors = validateConfig(config);

    expect(errors.some(e => e.includes('[WARN]'))).toBe(false);
  });

  it('returns error for invalid URL format', async () => {
    process.env.PO_GEN_BASE_URL = 'not-a-valid-url';
    process.env.PO_GEN_AI_KEY = 'test-key';

    const { createConfig, validateConfig } = await import('./config.js');
    const config = createConfig();
    const errors = validateConfig(config);

    expect(errors.some(e => e.includes('not a valid URL'))).toBe(true);
  });
});
