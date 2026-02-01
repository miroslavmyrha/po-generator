import type { Page, Browser, BrowserContext, Locator } from 'playwright';

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

export interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

// AI Scanner types
export interface PageAnalysis {
  url: string;
  purpose: string;
  shouldBePageObject: boolean | 'ask_user';
  reason: string;
  suggestedClassName: string;
}

export interface ElementInfo {
  name: string;
  component: string;
  selector: string;
  action: 'click' | 'fill' | 'select' | 'check' | 'toggle' | 'none';
  description: string;
  importance: 'high' | 'medium' | 'low';
  isModalTrigger: boolean;
}

export interface ModalInfo {
  triggerElement: string;
  expectedContent: string;
}

export interface NavigationInfo {
  element: string;
  targetUrl: string;
}

export interface ScanResult {
  pageAnalysis: PageAnalysis;
  elements: ElementInfo[];
  modals: ModalInfo[];
  navigation: NavigationInfo[];
}

export interface ModalAnalysis {
  modalName: string;
  purpose: string;
  elements: ElementInfo[];
  actions: {
    confirm?: string;
    cancel?: string;
  };
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

export interface Decisions {
  [path: string]: Decision;
}

// Scan result with page info
export interface FullScanResult extends PageInfo {
  analysis: ScanResult;
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
  framework?: string;
  retry?: string;
}

export interface GenerateOptions {
  output?: string;
  typescript?: boolean;
}

export interface RunOptions {
  framework?: string;
  skipReview?: boolean;
}

export interface AnalyzeOptions {
  retries?: number;
  framework?: string;
}

export type Framework = 'vuetify' | 'symfony' | 'generic';
