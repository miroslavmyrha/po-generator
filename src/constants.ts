// Error messages
export const ERRORS = {
  SITEMAP_NOT_FOUND: 'Sitemap not found. Run "po-gen crawl" first.',
  PAGE_NOT_FOUND: (page: string) => `Page "${page}" not found in sitemap.`,
  DECISIONS_NOT_FOUND: 'Decisions not found. Run "po-gen scan" first.',
  SCAN_NOT_FOUND: (path: string) => `Scan result for "${path}" not found.`,
  LOGIN_FAILED: 'Login failed. Check your credentials and selectors.',
  AI_FAILED: (attempts: number) => `AI analysis failed after ${attempts} attempts.`,
  INVALID_URL: (url: string) => `Invalid URL: ${url}`,
  CONFIG_MISSING: (field: string) => `Configuration error: ${field} is required.`,
  NO_PAGES_TO_GENERATE: 'No pages to generate. Edit decisions.json or run "po-gen review".',
  WORKFLOW_FAILED: (msg: string) => `Workflow failed: ${msg}`,
} as const;

// Success messages
export const SUCCESS = {
  LOGGED_IN: 'Logged in successfully',
  CRAWL_COMPLETE: (count: number) => `Found ${count} pages`,
  SCAN_COMPLETE: 'Scan complete',
  GENERATE_COMPLETE: (count: number) => `Generated ${count} Page Objects`,
  CONFIG_SAVED: 'Configuration saved to .env',
  CHANGES_SAVED: 'Changes saved',
  WORKFLOW_COMPLETE: (seconds: number) => `Workflow completed in ${seconds}s`,
} as const;

// UI Messages
export const MESSAGES = {
  NO_PAGES_TO_REVIEW: 'No pages need manual review.',
  PAGES_TO_REVIEW: (count: number) => `Found ${count} pages to review.`,
  MARKED_AS_PAGE_OBJECT: 'Marked as Page Object',
  MARKED_AS_SKIP: 'Skipped',
  CURRENT_STATE: 'Current state:',
  PAGE_OBJECTS: 'Page Objects',
  SKIPPED: 'Skipped',
  REMAINING: 'Remaining',
  REVIEW_PROMPT: '[p] Page Object  [s] Skip  [Enter] Skip question  [q] Quit: ',
  REASON: 'Reason',
  ELEMENTS: 'Elements',
  SUGGESTED_NAME: 'Suggested name',
} as const;

// Workflow phases
export const PHASES = {
  CRAWLING: 'Phase 1: Crawling',
  SCANNING: 'Phase 2: AI Scanning',
  REVIEW: 'Phase 3: Review',
  GENERATING: 'Phase 4: Generating Page Objects',
} as const;

// File names
export const FILES = {
  SITEMAP: 'sitemap.json',
  DECISIONS: 'decisions.json',
  SCANNED_DIR: 'scanned',
  PAGES_DIR: 'pages',
  INDEX: 'index',
} as const;

// Default timeouts (ms)
export const TIMEOUTS = {
  PAGE_LOAD: 30000,
  SELECTOR_WAIT: 5000,
  MODAL_WAIT: 2000,
  LOGIN_WAIT: 10000,
  NETWORK_IDLE: 30000,
  MODAL_CLOSE: 300,
} as const;

// Content limits
export const LIMITS = {
  HTML_MAX_LENGTH: 50000,
  MODAL_HTML_MAX_LENGTH: 20000,
} as const;

// Selector patterns
export const SELECTORS = {
  MODAL: '.v-dialog, .v-overlay__content .v-card, .v-navigation-drawer--active, .modal, [role="dialog"]',
  INTERACTIVE: '.v-btn, .btn, button, .v-text-field, .v-select, input, select, textarea, a[href]',
  FORM: 'form, .v-form',
  TABLE: '.v-data-table, table',
  CARD: '.v-card, .card',
  // Framework-specific modal content selectors for generated code
  MODAL_CONTENT: '.v-dialog, .v-overlay__content, .modal',
  // Form field selectors for generated methods
  FIELD_TRIGGER: '.v-field, .form-select, select',
  DROPDOWN_ITEM: '.v-list-item, .dropdown-item, option',
} as const;

// Re-export framework types and constants from centralized registry
// All framework configuration is now in frameworks.ts
export { FRAMEWORKS, FRAMEWORK_MODAL_SELECTORS } from './frameworks.js';
export type { Framework } from './frameworks.js';
