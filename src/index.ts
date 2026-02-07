// Entry point for programmatic usage
export { createConfig, validateConfigStructured } from './config.js';
export { createBrowser, login, crawlUrls, getPageHtml, findAndClickModals } from './lib/crawler.js';
export { analyzeHtml, analyzeModalContent, generateTestScenarios, clearAIClient } from './lib/ai-client.js';
export { generatePageObject, savePageObject, generateIndexFile } from './lib/generator.js';
export { generateTestFile, saveTestFile } from './lib/test-generator.js';
export { log } from './lib/logger.js';

// Export framework utilities from centralized registry
export {
  FRAMEWORKS,
  FRAMEWORK_REGISTRY,
  getFrameworkConfig,
  isValidFramework,
} from './frameworks.js';
export type { Framework, FrameworkConfig } from './frameworks.js';

// Export constants
export { ERRORS, SUCCESS, FILES, TIMEOUTS, SELECTORS, MESSAGES, PHASES } from './constants.js';

// Export types
export type * from './types.js';
