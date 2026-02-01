import type { Page, Browser, BrowserContext } from 'playwright';
import type { Framework } from './constants.js';

// Re-export schema types
export type {
  ElementInfo,
  PageAnalysis,
  ModalInfo,
  NavigationInfo,
  ScanResult,
  ModalAnalysis,
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
  framework: string;
  baseUrl: string;
  auth: AuthConfig;
  ai: AIConfig;
  output: OutputConfig;
  crawler: CrawlerConfig;
}

export interface FrameworkDefaults {
  waitForSelector: string;
  loginFields: {
    username: string;
    password: string;
    submit: string;
  };
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
}

export interface AnalyzeOptions {
  retries?: number;
  framework?: Framework;
}

// Export Framework type
export type { Framework };
