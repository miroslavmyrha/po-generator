import 'dotenv/config';
import type { Config, FrameworkDefaults } from './types.js';

/**
 * Deep partial type for nested config overrides
 * Arrays are not recursively made partial - they remain as-is
 */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? U[]
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P];
};

/**
 * Parse integer from environment variable with validation
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

/**
 * Create configuration from environment variables with optional overrides
 * This is the primary way to get a Config instance
 */
export function createConfig(overrides: DeepPartial<Config> = {}): Config {
  const framework = (overrides.framework ?? process.env.PO_GEN_FRAMEWORK ?? 'generic') as string;
  const frameworkDefaults = FRAMEWORK_DEFAULTS[framework] ?? FRAMEWORK_DEFAULTS.generic;

  return {
    framework,

    baseUrl: overrides.baseUrl ?? process.env.PO_GEN_BASE_URL ?? 'http://localhost:5173',

    auth: {
      enabled: overrides.auth?.enabled ?? process.env.PO_GEN_AUTH_ENABLED === 'true',
      loginUrl: overrides.auth?.loginUrl ?? process.env.PO_GEN_LOGIN_URL ?? '/login',
      credentials: {
        username: overrides.auth?.credentials?.username ?? process.env.PO_GEN_USERNAME,
        password: overrides.auth?.credentials?.password ?? process.env.PO_GEN_PASSWORD,
      },
      fields: {
        username: overrides.auth?.fields?.username ?? process.env.PO_GEN_FIELD_USERNAME ?? frameworkDefaults.loginFields.username,
        password: overrides.auth?.fields?.password ?? process.env.PO_GEN_FIELD_PASSWORD ?? frameworkDefaults.loginFields.password,
        submit: overrides.auth?.fields?.submit ?? process.env.PO_GEN_FIELD_SUBMIT ?? frameworkDefaults.loginFields.submit,
      },
      successUrl: overrides.auth?.successUrl ?? process.env.PO_GEN_SUCCESS_URL ?? '/dashboard',
    },

    ai: {
      baseUrl: overrides.ai?.baseUrl ?? process.env.PO_GEN_AI_URL ?? 'http://localhost:3000/api/v1',
      apiKey: overrides.ai?.apiKey ?? process.env.PO_GEN_AI_KEY,
      model: overrides.ai?.model ?? process.env.PO_GEN_AI_MODEL ?? 'llama3',
    },

    output: {
      dir: overrides.output?.dir ?? process.env.PO_GEN_OUTPUT_DIR ?? './output',
    },

    crawler: {
      maxDepth: overrides.crawler?.maxDepth ?? parseIntEnv(process.env.PO_GEN_MAX_DEPTH, 10, 1, 100),
      timeout: overrides.crawler?.timeout ?? parseIntEnv(process.env.PO_GEN_TIMEOUT, 30000, 1000, 120000),
      waitForSelector: overrides.crawler?.waitForSelector ?? process.env.PO_GEN_WAIT_SELECTOR ?? frameworkDefaults.waitForSelector,
      ignorePatterns: overrides.crawler?.ignorePatterns ?? (process.env.PO_GEN_IGNORE || '/logout,/api/,.pdf,.jpg,.png,.gif,.css,.js').split(',').filter(Boolean),
    },
  };
}

/**
 * Validate URL format and return warnings for insecure URLs
 */
function validateUrl(url: string, name: string): { error?: string; warning?: string } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' && !parsed.hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
      return { warning: `${name} uses HTTP - consider HTTPS for security` };
    }
    return {};
  } catch {
    return { error: `${name} is not a valid URL` };
  }
}

/**
 * Validate configuration and return errors/warnings
 */
export function validateConfig(cfg: Config): string[] {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!cfg.baseUrl) {
    errors.push('PO_GEN_BASE_URL is required');
  } else {
    const baseUrlCheck = validateUrl(cfg.baseUrl, 'PO_GEN_BASE_URL');
    if (baseUrlCheck.error) errors.push(baseUrlCheck.error);
    if (baseUrlCheck.warning) warnings.push(baseUrlCheck.warning);
  }

  if (!cfg.ai.apiKey) {
    errors.push('PO_GEN_AI_KEY is required');
  }

  if (cfg.ai.baseUrl) {
    const aiUrlCheck = validateUrl(cfg.ai.baseUrl, 'PO_GEN_AI_URL');
    if (aiUrlCheck.error) errors.push(aiUrlCheck.error);
    if (aiUrlCheck.warning) warnings.push(aiUrlCheck.warning);
  }

  if (cfg.auth.enabled) {
    if (!cfg.auth.credentials.username) errors.push('PO_GEN_USERNAME is required when auth is enabled');
    if (!cfg.auth.credentials.password) errors.push('PO_GEN_PASSWORD is required when auth is enabled');
  }

  return [...errors, ...warnings.map((w) => `[WARN] ${w}`)];
}
