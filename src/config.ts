import 'dotenv/config';
import type { Config, FrameworkDefaults } from './types.js';

/**
 * Parse integer from environment variable with validation
 * Returns default value if parsing fails or value is out of range
 */
function parseIntEnv(value: string | undefined, defaultValue: number, min: number, max: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min || parsed > max) {
    return defaultValue;
  }
  return parsed;
}

// Framework-specific defaults
export const FRAMEWORK_DEFAULTS: Record<string, FrameworkDefaults> = {
  vuetify: {
    waitForSelector: '.v-application',
    loginFields: {
      username: ".v-text-field:has-text('Email') input",
      password: ".v-text-field:has-text('Password') input",
      submit: ".v-btn:has-text('Login')",
    },
  },
  symfony: {
    waitForSelector: 'body',
    loginFields: {
      username: "#username, #_username, input[name='_username'], input[name='email']",
      password: "#password, #_password, input[name='_password'], input[type='password']",
      submit: "button[type='submit'], input[type='submit'], .btn:has-text('Login'), .btn:has-text('Přihlásit')",
    },
  },
  generic: {
    waitForSelector: 'body',
    loginFields: {
      username: "input[type='email'], input[name='email'], input[name='username'], #email, #username",
      password: "input[type='password'], #password",
      submit: "button[type='submit'], input[type='submit']",
    },
  },
};

const framework = process.env.PO_GEN_FRAMEWORK || 'generic';
const frameworkDefaults = FRAMEWORK_DEFAULTS[framework] || FRAMEWORK_DEFAULTS.generic;

export const config: Config = {
  framework,

  baseUrl: process.env.PO_GEN_BASE_URL || 'http://localhost:5173',

  auth: {
    enabled: process.env.PO_GEN_AUTH_ENABLED === 'true',
    loginUrl: process.env.PO_GEN_LOGIN_URL || '/login',
    credentials: {
      username: process.env.PO_GEN_USERNAME,
      password: process.env.PO_GEN_PASSWORD,
    },
    fields: {
      username: process.env.PO_GEN_FIELD_USERNAME || frameworkDefaults.loginFields.username,
      password: process.env.PO_GEN_FIELD_PASSWORD || frameworkDefaults.loginFields.password,
      submit: process.env.PO_GEN_FIELD_SUBMIT || frameworkDefaults.loginFields.submit,
    },
    successUrl: process.env.PO_GEN_SUCCESS_URL || '/dashboard',
  },

  ai: {
    baseUrl: process.env.PO_GEN_AI_URL || 'http://localhost:3000/api/v1',
    apiKey: process.env.PO_GEN_AI_KEY,
    model: process.env.PO_GEN_AI_MODEL || 'llama3',
  },

  output: {
    dir: process.env.PO_GEN_OUTPUT_DIR || './output',
  },

  crawler: {
    maxDepth: parseIntEnv(process.env.PO_GEN_MAX_DEPTH, 10, 1, 100),
    timeout: parseIntEnv(process.env.PO_GEN_TIMEOUT, 30000, 1000, 120000),
    waitForSelector: process.env.PO_GEN_WAIT_SELECTOR || frameworkDefaults.waitForSelector,
    ignorePatterns: (process.env.PO_GEN_IGNORE || '/logout,/api/,.pdf,.jpg,.png,.gif,.css,.js').split(','),
  },
};

/**
 * Validate URL format and return warnings for insecure URLs
 */
function validateUrl(url: string, name: string): { error?: string; warning?: string } {
  try {
    const parsed = new URL(url);
    // Warn if using HTTP with credentials or external AI service
    if (parsed.protocol === 'http:' && !parsed.hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
      return { warning: `${name} uses HTTP - consider HTTPS for security` };
    }
    return {};
  } catch {
    return { error: `${name} is not a valid URL` };
  }
}

export function validateConfig(): string[] {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.baseUrl) {
    errors.push('PO_GEN_BASE_URL is required');
  } else {
    const baseUrlCheck = validateUrl(config.baseUrl, 'PO_GEN_BASE_URL');
    if (baseUrlCheck.error) errors.push(baseUrlCheck.error);
    if (baseUrlCheck.warning) warnings.push(baseUrlCheck.warning);
  }

  if (!config.ai.apiKey) {
    errors.push('PO_GEN_AI_KEY is required');
  }

  if (config.ai.baseUrl) {
    const aiUrlCheck = validateUrl(config.ai.baseUrl, 'PO_GEN_AI_URL');
    if (aiUrlCheck.error) errors.push(aiUrlCheck.error);
    if (aiUrlCheck.warning) warnings.push(aiUrlCheck.warning);
  }

  if (config.auth.enabled) {
    if (!config.auth.credentials.username) errors.push('PO_GEN_USERNAME is required when auth is enabled');
    if (!config.auth.credentials.password) errors.push('PO_GEN_PASSWORD is required when auth is enabled');
  }

  // Return warnings as part of errors array with [WARN] prefix
  return [...errors, ...warnings.map((w) => `[WARN] ${w}`)];
}
