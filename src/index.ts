// Entry point pro programatické použití
export { config, validateConfig, FRAMEWORK_DEFAULTS } from './config.js';
export { createBrowser, login, crawlUrls, getPageHtml, findAndClickModals } from './lib/crawler.js';
export { analyzeHtml, analyzeModalContent, SUPPORTED_FRAMEWORKS } from './lib/ai-client.js';
export { generatePageObject, savePageObject, generateIndexFile } from './lib/generator.js';

// Export types
export type * from './types.js';
