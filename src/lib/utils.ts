import readline from 'readline';
import path from 'path';

/**
 * Shared utility functions
 */

/**
 * Convert URL path to safe filename
 * Example: '/users/settings' → 'users_settings'
 */
export function pathToFileName(urlPath: string): string {
  return urlPath.replace(/\//g, '_').replace(/^_/, '') || 'home';
}

/**
 * Create readline interface for interactive prompts
 */
export function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Create a promisified question function from readline interface
 * @param rl - readline interface
 * @param showDefault - whether to show default value in prompt
 */
export function createQuestionFn(
  rl: readline.Interface,
  showDefault = false
): (prompt: string, defaultValue?: string) => Promise<string> {
  return (prompt: string, defaultValue = ''): Promise<string> =>
    new Promise((resolve) => {
      const displayPrompt = showDefault && defaultValue
        ? `${prompt} (${defaultValue}): `
        : `${prompt}: `;
      rl.question(displayPrompt, (answer) => resolve(answer || defaultValue));
    });
}

/**
 * Capitalize first letter of string
 * Example: 'hello' → 'Hello'
 */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert PascalCase to kebab-case
 * Example: 'UserSettingsPage' → 'user-settings-page'
 */
export function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Escape single quotes in selector strings
 * Example: "[data-id='test']" → "[data-id=\'test\']"
 */
export function escapeSelector(selector: string): string {
  return selector.replace(/'/g, "\\'");
}

/**
 * Truncate string to max length with ellipsis
 */
export function truncate(str: string, length: number): string {
  if (!str) return '-';
  return str.length > length ? str.substring(0, length) + '...' : str;
}

/**
 * Check if string is a valid JavaScript identifier
 * Prevents code injection when generating Page Objects
 */
export function isValidJsIdentifier(name: string): boolean {
  if (!name) return false;
  // Must start with letter, underscore, or $, then letters, numbers, underscore, or $
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

/**
 * Sanitize string to be a valid JavaScript identifier
 * Removes invalid characters and ensures valid start
 */
export function sanitizeJsIdentifier(name: string): string {
  if (!name) return 'element';
  // Remove invalid characters
  let sanitized = name.replace(/[^a-zA-Z0-9_$]/g, '');
  // Ensure starts with valid character
  if (sanitized && /^[0-9]/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }
  return sanitized || 'element';
}

/**
 * Safely extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

/**
 * Validate that a path doesn't escape the base directory (path traversal protection)
 * @throws Error if path traversal is detected
 */
export function validateOutputPath(userPath: string, basePath: string = process.cwd()): string {
  const resolved = path.resolve(basePath, userPath);
  const base = path.resolve(basePath);

  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error(`Path traversal detected: ${userPath} escapes base directory`);
  }

  return resolved;
}

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds between retries (default: 1000) */
  baseDelay?: number;
  /** Whether to use exponential backoff (default: true) */
  exponentialBackoff?: boolean;
  /** Callback for logging on each retry attempt */
  onRetry?: (attempt: number, maxRetries: number, error: unknown) => void;
  /** Callback for logging on final failure */
  onFinalFailure?: (error: unknown) => void;
}

/**
 * Generic retry utility with exponential backoff
 * Executes an async operation with automatic retries on failure
 *
 * @param operation - Async function that may fail and need retrying
 * @param options - Retry configuration
 * @returns Result of the operation or null if all retries failed
 */
export async function withRetry<T>(
  operation: () => Promise<T | null>,
  options: RetryOptions = {}
): Promise<T | null> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    exponentialBackoff = true,
    onRetry,
    onFinalFailure,
  } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (result !== null) {
        return result;
      }
      // Result was null but no error - operation returned invalid data
    } catch (error) {
      if (onRetry) {
        onRetry(attempt, maxRetries, error);
      }
      if (attempt === maxRetries) {
        if (onFinalFailure) {
          onFinalFailure(error);
        }
        return null;
      }
      const delay = exponentialBackoff ? baseDelay * attempt : baseDelay;
      await sleep(delay);
    }
  }

  return null;
}

/**
 * Promise-based delay utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
