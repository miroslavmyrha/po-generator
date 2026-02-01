// Entry point pro programatické použití
export { config, validateConfig } from './config.js';
export { createBrowser, login, crawlUrls, getPageHtml, findAndClickModals } from './lib/crawler.js';
export { analyzeHtml, analyzeModalContent } from './lib/ai-client.js';
export { generatePageObject, savePageObject, generateIndexFile } from './lib/generator.js';
