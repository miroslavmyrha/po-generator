import type { Page, Browser, BrowserContext } from 'playwright';
import type { Framework } from './constants.js';

/**
 * Custom error class for application errors
 * Allows distinguishing between expected errors and unexpected exceptions
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'APP_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Re-export schema types
export type {
  ElementInfo,
  PageAnalysis,
  ModalInfo,
  NavigationInfo,
  ScanResult,
  ModalAnalysis,
  TestStep,
  TestAssertion,
  TestCase,
  TestSuite,
} from './schemas.js';

// Config types
export interface AuthConfig {
  enabled: boolean;
  loginUrl: string;
  credentials: {
    username: string | undefined;
    password: string | undefined;
  };
  fields: {
    username: string;
    password: string;
    submit: string;
  };
  successUrl: string;
}

export interface AIConfig {
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
}

export interface CrawlerConfig {
  maxDepth: number;
  timeout: number;
  waitForSelector: string;
  ignorePatterns: string[];
}

export interface OutputConfig {
  dir: string;
}

export interface Config {
  readonly framework: string;
  readonly baseUrl: string;
  readonly auth: Readonly<AuthConfig>;
  readonly ai: Readonly<AIConfig>;
  readonly output: Readonly<OutputConfig>;
  crawler: CrawlerConfig; // Mutable - can be overridden by CLI options
}

// Browser types
export interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

// Crawler types
export interface PageInfo {
  url: string;
  path: string;
  title: string;
  hasForm: boolean;
  hasTable: boolean;
  hasCards: boolean;
  interactiveCount: number;
  crawledAt: string;
}

export interface ModalContent {
  trigger: string;
  html: string;
}

// Decision types
export interface Decision {
  decision: 'page_object' | 'skip' | 'ask_user';
  reason: string;
  suggestedClassName?: string;
  elementCount: number;
}

export type Decisions = Record<string, Decision>;

// Scan result with page info
export interface FullScanResult extends PageInfo {
  analysis: import('./schemas.js').ScanResult;
}

// Scan data file structure (loaded from JSON)
export interface ScanDataFile extends PageInfo {
  analysis?: import('./schemas.js').ScanResult;
}

// Generator types
export interface GeneratedPageObject {
  code: string;
  className: string;
  ext: string;
}

export interface GeneratorOptions {
  typescript?: boolean;
}

// Command options
export interface CrawlOptions {
  url?: string;
  login?: boolean;
  depth?: string;
}

export interface ScanOptions {
  page?: string;
  framework?: Framework;
  retry?: string;
}

export interface GenerateOptions {
  output?: string;
  typescript?: boolean;
}

export interface RunOptions {
  framework?: Framework;
  skipReview?: boolean;
  skipTests?: boolean;
}

export interface TestGenOptions {
  output?: string;
  retry?: string;
}

export interface GeneratedTestFile {
  code: string;
  suiteName: string;
  fileName: string;
}

export interface AnalyzeOptions {
  retries?: number;
  framework?: Framework;
}

// Export Framework type
export type { Framework };

/**
 * Logger interface for dependency injection
 * Allows mocking in tests and alternative implementations
 */
export interface Logger {
  info(msg: string): void;
  success(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
  step(msg: string): void;
  dim(msg: string): void;
}

/**
 * Progress reporter interface for dependency injection
 * Abstracts spinner/progress indicator for testability
 */
export interface ProgressReporter {
  start(text: string): void;
  stop(): void;
  succeed(text: string): void;
  fail(text: string): void;
  warn(text: string): void;
  text: string;
}
