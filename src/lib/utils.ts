import readline from 'readline';
import path from 'path';
import fs from 'fs';
import { AppError } from '../types.js';

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
 * Escape special characters in selector strings for safe embedding in code
 * Handles single quotes, backslashes, and backticks
 * Example: "[data-id='test']" → "[data-id=\'test\']"
 */
export function escapeSelector(selector: string): string {
  if (!selector) return '';
  return selector
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/'/g, "\\'")     // Escape single quotes
    .replace(/`/g, '\\`');    // Escape backticks for template safety
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
 * File system error codes for discrimination
 */
export type FsErrorCode = 'ENOENT' | 'EACCES' | 'ENOSPC' | 'EISDIR' | 'ENOTDIR' | 'EEXIST' | 'UNKNOWN';

/**
 * Extract file system error code from error object
 */
export function getFsErrorCode(error: unknown): FsErrorCode {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    if (['ENOENT', 'EACCES', 'ENOSPC', 'EISDIR', 'ENOTDIR', 'EEXIST'].includes(code)) {
      return code as FsErrorCode;
    }
  }
  return 'UNKNOWN';
}

/**
 * Get user-friendly error message for file system errors
 */
export function getFsErrorMessage(error: unknown, filePath: string): string {
  const code = getFsErrorCode(error);
  const fileName = path.basename(filePath);

  switch (code) {
    case 'ENOENT':
      return `File not found: ${fileName}`;
    case 'EACCES':
      return `Permission denied: ${fileName}`;
    case 'ENOSPC':
      return `Disk full - cannot write: ${fileName}`;
    case 'EISDIR':
      return `Expected file but found directory: ${fileName}`;
    case 'ENOTDIR':
      return `Expected directory but found file: ${filePath}`;
    case 'EEXIST':
      return `File already exists: ${fileName}`;
    default:
      return getErrorMessage(error);
  }
}

/**
 * Write file atomically - write to temp file first, then rename
 * Prevents partial/corrupted files on crash or interrupt
 * @param filePath - Target file path
 * @param content - Content to write
 */
export function writeFileAtomic(filePath: string, content: string): void {
  const tempPath = `${filePath}.tmp.${process.pid}`;

  try {
    // Write to temporary file
    fs.writeFileSync(tempPath, content);
    // Atomic rename (on same filesystem)
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    // Clean up temp file on error
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Validate that a path doesn't escape the base directory (path traversal protection)
 * Resolves symlinks to prevent bypass via symbolic link traversal
 * Checks parent directories to prevent TOCTOU race conditions
 * @throws AppError if path traversal is detected
 */
export function validateOutputPath(userPath: string, basePath: string = process.cwd()): string {
  const resolved = path.resolve(basePath, userPath);
  const base = path.resolve(basePath);

  // Initial check on logical paths
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new AppError(`Path traversal detected: ${userPath} escapes base directory`, 'PATH_TRAVERSAL');
  }

  // Resolve symlinks to detect symlink-based traversal
  try {
    const realBase = fs.realpathSync(base);

    // Check the target path if it exists
    if (fs.existsSync(resolved)) {
      const realResolved = fs.realpathSync(resolved);
      if (!realResolved.startsWith(realBase + path.sep) && realResolved !== realBase) {
        throw new AppError(`Symlink traversal detected: ${userPath} escapes base directory`, 'PATH_TRAVERSAL');
      }
    } else {
      // Target doesn't exist - check all existing parent directories
      // This prevents TOCTOU race where symlink is created between check and use
      let currentPath = resolved;
      while (currentPath !== base && currentPath !== path.dirname(currentPath)) {
        const parentPath = path.dirname(currentPath);
        if (fs.existsSync(parentPath)) {
          const realParent = fs.realpathSync(parentPath);
          if (!realParent.startsWith(realBase) && realParent !== realBase) {
            throw new AppError(`Symlink traversal detected in parent: ${userPath}`, 'PATH_TRAVERSAL');
          }
          break; // Found existing parent, it's safe
        }
        currentPath = parentPath;
      }
    }
  } catch (error) {
    // Re-throw AppErrors, ignore fs errors (base may not exist yet)
    if (error instanceof AppError) throw error;
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
 * @param ms - Delay in milliseconds (must be >= 0)
 */
export function sleep(ms: number): Promise<void> {
  // Clamp to valid range: negative values become 0
  const delay = Math.max(0, ms);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Execute promises with concurrency limit
 * Prevents overwhelming APIs with too many concurrent requests
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param concurrency - Maximum concurrent operations (default: 3)
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 3
): Promise<R[]> {
  if (items.length === 0) return [];
  if (concurrency < 1) concurrency = 1;

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  /**
   * Get next index atomically - returns -1 if no more items
   * Must capture index in single synchronous operation to prevent race
   */
  function getNextIndex(): number {
    if (nextIndex >= items.length) return -1;
    return nextIndex++;
  }

  async function worker(): Promise<void> {
    let index: number;
    // Atomic check-and-increment prevents race between workers
    while ((index = getNextIndex()) !== -1) {
      results[index] = await fn(items[index], index);
    }
  }

  // Create worker pool - limit to actual item count
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, () => worker());

  await Promise.all(workers);
  return results;
}

/**
 * Escape text for use in JSDoc comments
 * Prevents comment injection by escaping comment-closing sequences
 */
export function escapeJsDocComment(text: string): string {
  if (!text) return '';
  // Escape sequences that would close the comment or inject newlines
  return text
    .replace(/\*\//g, '*\u200B/')  // Zero-width space to break */
    .replace(/\r?\n/g, ' ')         // Replace newlines with spaces
    .trim();
}

// Global cleanup registry for graceful shutdown
const cleanupHandlers: Array<() => Promise<void> | void> = [];

/**
 * Register a cleanup handler for graceful shutdown on SIGINT/SIGTERM
 * Handlers are called in reverse registration order (LIFO)
 * Returns unregister function to remove the handler after successful completion
 */
export function registerCleanup(handler: () => Promise<void> | void): () => void {
  cleanupHandlers.push(handler);
  // Return unregister function to prevent accumulation
  return () => {
    const index = cleanupHandlers.indexOf(handler);
    if (index > -1) {
      cleanupHandlers.splice(index, 1);
    }
  };
}

/**
 * Run all cleanup handlers (called by signal handlers)
 * Takes snapshot of handlers to prevent issues if handler modifies the array
 */
export async function runCleanupHandlers(): Promise<void> {
  // Snapshot handlers to prevent array mutation during iteration
  const handlers = [...cleanupHandlers].reverse();
  cleanupHandlers.length = 0; // Clear immediately to prevent re-runs

  for (const handler of handlers) {
    try {
      await handler();
    } catch {
      // Ignore cleanup errors during shutdown
    }
  }
}

/**
 * Clear all cleanup handlers - used after successful command completion
 * Prevents handler accumulation in workflows that run multiple commands
 */
export function clearCleanupHandlers(): void {
  cleanupHandlers.length = 0;
}
