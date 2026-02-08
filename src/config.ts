import fs from 'fs';
import path from 'path';
import type { Config } from './types.js';
import { log } from './lib/logger.js';
import { FRAMEWORKS, FRAMEWORK_REGISTRY, isValidFramework, getFrameworkConfig } from './frameworks.js';
import type { Framework } from './frameworks.js';

/** @deprecated Use FRAMEWORKS from frameworks.ts */
export const SUPPORTED_FRAMEWORKS = FRAMEWORKS;
/** @deprecated Use Framework from frameworks.ts */
export type SupportedFramework = Framework;

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
 * Logs warning if value is invalid
 */
function parseIntEnv(value: string | undefined, defaultValue: number, min: number, max: number, name?: string): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min || parsed > max) {
    if (name) {
      log.warn(`Invalid ${name}: "${value}" - using default ${defaultValue}`);
    }
    return defaultValue;
  }
  return parsed;
}

/**
 * Check .env file permissions on Unix systems
 * Warns if file is world-readable (should be 600)
 */
function checkEnvPermissions(): void {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;

    const stats = fs.statSync(envPath);
    // Check if group or others have read permission (non-owner readable)
    const mode = stats.mode & 0o777;
    if ((mode & 0o077) !== 0) {
      log.warn('.env file has overly permissive permissions. Consider: chmod 600 .env');
    }
  } catch {
    // Ignore errors - permission check is advisory only
  }
}

// Re-export FRAMEWORK_REGISTRY for convenience
export { FRAMEWORK_REGISTRY } from './frameworks.js';

/**
 * Create configuration from environment variables with optional overrides
 * This is the primary way to get a Config instance
 */
export function createConfig(overrides: DeepPartial<Config> = {}): Config {
  // Check .env permissions on startup
  checkEnvPermissions();

  const framework = (overrides.framework ?? process.env.PO_GEN_FRAMEWORK ?? 'generic') as string;

  // Validate framework and warn on unknown values
  if (!isValidFramework(framework)) {
    log.warn(`Unknown framework "${framework}" - using "generic". Supported: ${FRAMEWORKS.join(', ')}`);
  }

  // Get framework configuration from centralized registry
  const frameworkConfig = getFrameworkConfig(framework);

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
        username: overrides.auth?.fields?.username ?? process.env.PO_GEN_FIELD_USERNAME ?? frameworkConfig.loginFields.username,
        password: overrides.auth?.fields?.password ?? process.env.PO_GEN_FIELD_PASSWORD ?? frameworkConfig.loginFields.password,
        submit: overrides.auth?.fields?.submit ?? process.env.PO_GEN_FIELD_SUBMIT ?? frameworkConfig.loginFields.submit,
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
      maxDepth: overrides.crawler?.maxDepth ?? parseIntEnv(process.env.PO_GEN_MAX_DEPTH, 10, 1, 100, 'PO_GEN_MAX_DEPTH'),
      timeout: overrides.crawler?.timeout ?? parseIntEnv(process.env.PO_GEN_TIMEOUT, 30000, 1000, 120000, 'PO_GEN_TIMEOUT'),
      waitForSelector: overrides.crawler?.waitForSelector ?? process.env.PO_GEN_WAIT_SELECTOR ?? frameworkConfig.waitForSelector,
      ignorePatterns: overrides.crawler?.ignorePatterns ?? (process.env.PO_GEN_IGNORE || '/logout,/api/,.pdf,.jpg,.png,.gif,.css,.js').split(',').filter(Boolean),
    },
  };
}

/**
 * Check if hostname is localhost (allowed for development)
 */
function isLocalhost(hostname: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(hostname);
}

/**
 * Check if hostname resolves to a private/internal IP address (excluding localhost)
 * Prevents SSRF attacks by blocking access to internal networks
 */
function isDangerousPrivateHost(hostname: string): boolean {
  // Allow localhost for development
  if (isLocalhost(hostname)) return false;

  // Block other loopback addresses
  if (/^127\.\d+\.\d+\.\d+$/.test(hostname)) return true;
  if (/^0\.0\.0\.0$/.test(hostname)) return true;

  // Check for private IP ranges (IPv4)
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);
    // Validate octets are in valid IP range (0-255)
    if (a > 255 || b > 255 || c > 255 || d > 255) {
      return true; // Invalid IP - treat as dangerous
    }
    // 10.0.0.0/8 - Private network
    if (a === 10) return true;
    // 172.16.0.0/12 - Private network
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 - Private network
    if (a === 192 && b === 168) return true;
    // 169.254.0.0/16 - Link-local (AWS metadata endpoint!)
    if (a === 169 && b === 254) return true;
  }

  return false;
}

/**
 * Validate URL format, check for SSRF risks, and return warnings for insecure URLs
 * Allows localhost for development but blocks other private IP ranges
 */
function validateUrl(url: string, name: string): { error?: string; warning?: string } {
  try {
    const parsed = new URL(url);

    // SSRF protection: block private/internal IPs (except localhost)
    if (isDangerousPrivateHost(parsed.hostname)) {
      return { error: `${name} points to private/internal network - potential SSRF risk. Use localhost or public URL.` };
    }

    // Warn about HTTP on non-localhost
    if (parsed.protocol === 'http:' && !isLocalhost(parsed.hostname)) {
      return { warning: `${name} uses HTTP - consider HTTPS for security` };
    }
    return {};
  } catch {
    return { error: `${name} is not a valid URL` };
  }
}

/**
 * Configuration validation result with structured errors and warnings
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate configuration and return structured result
 * Use this for programmatic access to validation results
 */
export function validateConfigStructured(cfg: Config): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate base URL
  if (!cfg.baseUrl) {
    errors.push('PO_GEN_BASE_URL is required');
  } else {
    const baseUrlCheck = validateUrl(cfg.baseUrl, 'PO_GEN_BASE_URL');
    if (baseUrlCheck.error) errors.push(baseUrlCheck.error);
    if (baseUrlCheck.warning) warnings.push(baseUrlCheck.warning);
  }

  // Validate AI config
  if (!cfg.ai.apiKey) {
    errors.push('PO_GEN_AI_KEY is required');
  }

  if (cfg.ai.baseUrl) {
    const aiUrlCheck = validateUrl(cfg.ai.baseUrl, 'PO_GEN_AI_URL');
    if (aiUrlCheck.error) errors.push(aiUrlCheck.error);
    if (aiUrlCheck.warning) warnings.push(aiUrlCheck.warning);
  }

  // Validate auth config
  if (cfg.auth.enabled) {
    if (!cfg.auth.credentials.username) {
      errors.push('PO_GEN_USERNAME is required when auth is enabled');
    }
    if (!cfg.auth.credentials.password) {
      errors.push('PO_GEN_PASSWORD is required when auth is enabled');
    }
  }

  // Validate framework using type-safe check
  if (!isValidFramework(cfg.framework)) {
    warnings.push(`Unknown framework "${cfg.framework}" - using generic defaults`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate configuration and return errors/warnings as string array
 * @deprecated Use validateConfigStructured for better type safety
 */
export function validateConfig(cfg: Config): string[] {
  const result = validateConfigStructured(cfg);
  return [...result.errors, ...result.warnings.map((w) => `[WARN] ${w}`)];
}
