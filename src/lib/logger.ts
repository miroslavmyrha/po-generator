import chalk from 'chalk';
import type { Logger } from '../types.js';

/**
 * Logging utility with colored console output
 * Provides simple, consistent logging methods across the application
 * Implements Logger interface for dependency injection
 */
export const log: Logger = {
  info: (msg: string) => console.log(chalk.blue(msg)),
  success: (msg: string) => console.log(chalk.green(`✅ ${msg}`)),
  warn: (msg: string) => console.log(chalk.yellow(`⚠️  ${msg}`)),
  error: (msg: string) => console.error(chalk.red(`❌ ${msg}`)),
  debug: (msg: string) => {
    if (process.env.DEBUG) console.log(chalk.gray(`🔍 ${msg}`));
  },
  step: (msg: string) => console.log(chalk.cyan(`→ ${msg}`)),
  dim: (msg: string) => console.log(chalk.gray(msg)),
};

/**
 * Create a no-op logger for testing or silent mode
 */
export function createNoopLogger(): Logger {
  const noop = () => {};
  return {
    info: noop,
    success: noop,
    warn: noop,
    error: noop,
    debug: noop,
    step: noop,
    dim: noop,
  };
}

// Re-export ProgressReporter type for convenience
export type { ProgressReporter } from '../types.js';

/**
 * Create a no-op progress reporter for testing or silent mode
 */
export function createNoopProgressReporter(): import('../types.js').ProgressReporter {
  const noop = () => {};
  return {
    start: noop,
    stop: noop,
    succeed: noop,
    fail: noop,
    warn: noop,
    text: '',
  };
}
