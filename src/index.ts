// Entry point for programmatic usage
export { createConfig, validateConfig, FRAMEWORK_DEFAULTS } from './config.js';
export { createBrowser, login, crawlUrls, getPageHtml, findAndClickModals } from './lib/crawler.js';
export { analyzeHtml, analyzeModalContent, SUPPORTED_FRAMEWORKS } from './lib/ai-client.js';
export { generatePageObject, savePageObject, generateIndexFile } from './lib/generator.js';
export { log } from './lib/logger.js';

// Export constants
export { ERRORS, SUCCESS, FILES, TIMEOUTS, SELECTORS, FRAMEWORKS, MESSAGES, PHASES } from './constants.js';
export type { Framework } from './constants.js';

// Export types
export type * from './types.js';
