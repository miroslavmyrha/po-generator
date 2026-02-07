import OpenAI from 'openai';
import { ERRORS, LIMITS } from '../constants.js';
import { FRAMEWORK_PROMPTS, FRAMEWORK_MODAL_SELECTORS } from '../frameworks.js';
import type { Framework } from '../frameworks.js';
import { log } from './logger.js';
import { getErrorMessage, withRetry, registerCleanup } from './utils.js';
import { validateScanResult, validateModalAnalysis, validateTestSuite } from '../schemas.js';
import { AppError } from '../types.js';
import type { Config, ScanResult, ModalAnalysis, TestSuite, AnalyzeOptions } from '../types.js';

// Cached OpenAI client instance
let cachedClient: OpenAI | null = null;
let cachedClientBaseUrl: string | null = null;

/**
 * Clear cached OpenAI client - called on process cleanup
 * Prevents memory leaks in long-running processes
 */
export function clearAIClient(): void {
  cachedClient = null;
  cachedClientBaseUrl = null;
}

// Register cleanup handler to clear client on process exit
registerCleanup(clearAIClient);

/**
 * Create or return cached OpenAI client with config
 * Client is cached per base URL to avoid reconnection overhead
 * SECURITY: API key is NOT included in cache key to prevent exposure in logs
 */
function createClient(config: Config): OpenAI {
  // Cache key based on base URL only - API key not included for security
  if (cachedClient && cachedClientBaseUrl === config.ai.baseUrl) {
    return cachedClient;
  }

  cachedClient = new OpenAI({
    baseURL: config.ai.baseUrl,
    apiKey: config.ai.apiKey,
    timeout: 60000, // 60 second timeout to prevent hanging
    maxRetries: 0, // We handle retries ourselves with withRetry
  });
  cachedClientBaseUrl = config.ai.baseUrl;

  return cachedClient;
}

// Framework prompts are now imported from frameworks.ts

const BASE_PROMPT = `
You are an expert in web testing with Playwright. You analyze HTML pages and return structured data for generating Page Objects.

SELECTOR PRIORITY (in order):
1. data-testid or data-cy attributes (most stable)
2. Unique ID: #submit-button
3. aria-label: [aria-label="Close"]
4. Specific classes + text: .btn:has-text("Save")
5. Structural: .card-actions .btn:first-child
6. data-* attributes: [data-controller="modal"]

PRINCIPLES:
- Prefer selectors that survive refactoring
- Avoid indexes if possible (nth-child is fragile)
- Use :has-text() for buttons and links
- For forms use label or placeholder
`;

const OUTPUT_FORMAT = `
RETURN ONLY VALID JSON (no markdown, no extra text):
{
  "pageAnalysis": {
    "url": "page URL",
    "purpose": "brief description of page purpose",
    "shouldBePageObject": true | false | "ask_user",
    "reason": "reason for decision",
    "suggestedClassName": "PageName"
  },
  "elements": [
    {
      "name": "camelCase variable name",
      "component": "component type (button, input, select, link, stimulus, vue...)",
      "selector": "playwright selector",
      "action": "click | fill | select | check | toggle | none",
      "description": "what the element does",
      "importance": "high | medium | low",
      "isModalTrigger": false
    }
  ],
  "modals": [
    {
      "triggerElement": "element name that opens modal",
      "expectedContent": "what modal probably contains"
    }
  ],
  "navigation": [
    {
      "element": "element name",
      "targetUrl": "where link leads"
    }
  ]
}
`;

/**
 * Pre-computed full prompts for each framework
 * Computed once at module load to avoid string concatenation on every call
 */
const FULL_PROMPTS: Record<Framework, string> = {
  vuetify: BASE_PROMPT + FRAMEWORK_PROMPTS.vuetify + OUTPUT_FORMAT,
  symfony: BASE_PROMPT + FRAMEWORK_PROMPTS.symfony + OUTPUT_FORMAT,
  generic: BASE_PROMPT + FRAMEWORK_PROMPTS.generic + OUTPUT_FORMAT,
};

/**
 * Get the complete scanner prompt for a given framework
 * @param framework - Target framework (vuetify, symfony, or generic)
 * @returns Pre-computed complete prompt string for AI analysis
 */
function getScannerPrompt(framework: Framework): string {
  return FULL_PROMPTS[framework] ?? FULL_PROMPTS.generic;
}

/**
 * Analyze HTML content using AI
 */
export async function analyzeHtml(
  config: Config,
  html: string,
  url: string,
  options: AnalyzeOptions = {}
): Promise<ScanResult | null> {
  const { retries = 3, framework = 'generic' } = options;
  const cleanHtml = cleanHtmlContent(html);
  // framework is already Framework type (from options or default 'generic')
  const prompt = getScannerPrompt(framework);
  const client = createClient(config);

  return withRetry(
    async () => {
      const result = await callAI(client, config.ai.model, prompt, url, cleanHtml);
      const validated = validateScanResult(result);
      if (!validated) {
        log.warn('Invalid response format from AI');
      }
      return validated;
    },
    {
      maxRetries: retries,
      onRetry: (attempt, max) => {
        log.warn(`Attempt ${attempt}/${max} failed, retrying...`);
      },
      onFinalFailure: (error) => {
        log.error(ERRORS.AI_FAILED(retries));
        log.dim(getErrorMessage(error));
      },
    }
  );
}

/**
 * Analyze modal content using AI
 */
export async function analyzeModalContent(
  config: Config,
  html: string,
  triggerName: string,
  options: AnalyzeOptions = {}
): Promise<ModalAnalysis | null> {
  const { retries = 3, framework = 'generic' } = options;
  // Sanitize modal HTML (remove scripts, styles, comments) before AI analysis
  const cleanHtml = cleanHtmlContent(html.substring(0, LIMITS.MODAL_HTML_MAX_LENGTH));
  const client = createClient(config);

  // framework is already Framework type (from options or default 'generic')
  const prompt = buildModalPrompt(triggerName, framework, FRAMEWORK_MODAL_SELECTORS);

  return withRetry(
    async () => {
      const result = await callAISimple(client, config.ai.model, prompt + cleanHtml);
      return validateModalAnalysis(result);
    },
    {
      maxRetries: retries,
      onRetry: (attempt, max, error) => {
        log.debug(`Modal analysis attempt ${attempt}/${max} failed: ${getErrorMessage(error)}`);
      },
    }
  );
}

/**
 * Generate test scenarios for a page using AI
 * @param config - Application configuration
 * @param scanResult - Scan result with page elements
 * @param pageObjectClassName - Name of the Page Object class
 * @param pageUrl - URL path of the page
 * @param options - Retry and framework options
 * @returns TestSuite or null if generation fails
 */
export async function generateTestScenarios(
  config: Config,
  scanResult: ScanResult,
  pageObjectClassName: string,
  pageUrl: string,
  options: AnalyzeOptions = {}
): Promise<TestSuite | null> {
  const { retries = 3 } = options;
  const client = createClient(config);
  const prompt = buildTestGenPrompt(scanResult, pageObjectClassName, pageUrl);

  return withRetry(
    async () => {
      const result = await callAISimple(client, config.ai.model, prompt);
      const validated = validateTestSuite(result);
      if (!validated) {
        log.warn('Invalid test scenario format from AI');
      }
      return validated;
    },
    {
      maxRetries: retries,
      onRetry: (attempt, max) => {
        log.warn(`Test generation attempt ${attempt}/${max} failed, retrying...`);
      },
      onFinalFailure: (error) => {
        log.error(ERRORS.AI_TEST_GEN_FAILED(retries));
        log.dim(getErrorMessage(error));
      },
    }
  );
}

/**
 * Build AI prompt for test scenario generation
 */
function buildTestGenPrompt(scanResult: ScanResult, pageObjectClassName: string, pageUrl: string): string {
  const elements = scanResult.elements || [];
  const fillElements = elements.filter(e => e.action === 'fill');
  const clickElements = elements.filter(e => e.action === 'click' && e.importance === 'high');
  const selectElements = elements.filter(e => e.action === 'select');

  const elementList = elements.map(e =>
    `- ${e.name} (${e.component}, action: ${e.action}, importance: ${e.importance}): ${e.description}`
  ).join('\n');

  const methodList: string[] = ['goto()'];
  for (const el of fillElements) {
    methodList.push(`fill${el.name.charAt(0).toUpperCase() + el.name.slice(1)}(value: string)`);
  }
  for (const el of selectElements) {
    methodList.push(`select${el.name.charAt(0).toUpperCase() + el.name.slice(1)}(option: string)`);
  }
  for (const el of clickElements) {
    methodList.push(`click${el.name.charAt(0).toUpperCase() + el.name.slice(1)}()`);
  }

  return `You are an expert Playwright test writer. Generate test scenarios for the page at "${pageUrl}".

PAGE OBJECT: ${pageObjectClassName}
PURPOSE: ${scanResult.pageAnalysis.purpose}

AVAILABLE ELEMENTS:
${elementList || '(no elements)'}

AVAILABLE METHODS on ${pageObjectClassName}:
${methodList.map(m => `- ${m}`).join('\n')}

RULES:
- Use ONLY methods listed above (they are the Page Object methods)
- method field must be a valid JS identifier matching the method name (without parentheses)
- args array contains the string arguments to pass to the method
- For fill methods, use realistic test data (e.g., "user@test.com", "ValidPass123!")
- For assertions, use types: url, visible, hidden, text, count, enabled, disabled
- Generate 2-5 meaningful test cases covering key user flows
- Each test must have at least 1 step and 1 assertion

RETURN ONLY VALID JSON:
{
  "suiteName": "descriptive suite name",
  "testCases": [
    {
      "name": "should do something specific",
      "steps": [
        { "method": "goto", "args": [] },
        { "method": "fillEmailInput", "args": ["user@test.com"] }
      ],
      "assertions": [
        { "type": "visible", "selector": ".success-message" },
        { "type": "url", "value": "/dashboard" }
      ]
    }
  ]
}
`;
}

// Helper functions

/**
 * Clean HTML content by removing scripts, styles, and comments
 * Uses simple non-backtracking patterns to prevent ReDoS
 * @internal Exported for testing
 */
export function cleanHtmlContent(html: string): string {
  if (!html) return '';

  // Truncate first to limit regex processing time
  const truncated = html.substring(0, LIMITS.HTML_MAX_LENGTH);

  // Use simple, non-backtracking patterns to prevent ReDoS
  // Remove script tags (non-greedy, case insensitive)
  let result = truncated.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  // Remove style tags
  result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove HTML comments
  result = result.replace(/<!--[\s\S]*?-->/g, '');

  return result;
}

/**
 * Extract content from AI response with validation
 */
function extractResponseContent(response: OpenAI.Chat.Completions.ChatCompletion): string {
  const choice = response.choices?.[0];
  const content = choice?.message?.content;

  if (!content) {
    throw new AppError('Invalid AI response: missing choices or content', 'AI_INVALID_RESPONSE');
  }

  // Check for empty or whitespace-only response
  if (!content.trim()) {
    throw new AppError('AI returned empty response', 'AI_EMPTY_RESPONSE');
  }

  return content;
}

async function callAI(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  url: string,
  html: string
): Promise<unknown> {
  const response = await client.chat.completions.create({
    model,
    temperature: 0.1,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `URL: ${url}\n\nHTML:\n${html}` },
    ],
  });

  return parseJsonResponse(extractResponseContent(response));
}

async function callAISimple(client: OpenAI, model: string, prompt: string): Promise<unknown> {
  const response = await client.chat.completions.create({
    model,
    temperature: 0.1,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJsonResponse(extractResponseContent(response));
}

/**
 * Parse JSON from AI response, handling markdown code blocks
 * Uses balanced bracket matching to find the first complete JSON object
 * @internal Exported for testing
 */
export function parseJsonResponse(content: string | null): unknown {
  if (!content) {
    throw new AppError('Empty AI response', 'AI_EMPTY_RESPONSE');
  }

  // Find first { and extract balanced JSON object
  const startIndex = content.indexOf('{');
  if (startIndex === -1) {
    throw new AppError('No JSON found in response', 'AI_INVALID_JSON');
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\' && inString) {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') depth++;
      if (char === '}') {
        depth--;
        if (depth === 0) {
          const jsonStr = content.substring(startIndex, i + 1);
          const parsed = JSON.parse(jsonStr);

          // Prevent prototype pollution by nullifying prototype
          if (parsed && typeof parsed === 'object') {
            Object.setPrototypeOf(parsed, null);
          }

          return parsed;
        }
      }
    }
  }

  throw new AppError('Incomplete JSON in response', 'AI_INVALID_JSON');
}

/**
 * Build AI prompt for modal content analysis
 * @param triggerName - Name of the element that triggered the modal
 * @param framework - Target framework for selector patterns
 * @param selectors - Framework-specific modal container selectors
 * @returns Formatted prompt string for modal analysis
 */
function buildModalPrompt(
  triggerName: string,
  framework: Framework,
  selectors: Record<Framework, string>
): string {
  return `
Analyze modal/dialog content.
Modal was opened by clicking: "${triggerName}"

Framework: ${framework}
Modal container: ${selectors[framework] || selectors.generic}

RETURN ONLY VALID JSON:
{
  "modalName": "camelCase name for modal",
  "purpose": "modal purpose",
  "elements": [
    {
      "name": "camelCase name",
      "component": "component type",
      "selector": "selector RELATIVE to modal container",
      "action": "click | fill | select | check | toggle | none",
      "description": "description"
    }
  ],
  "actions": {
    "confirm": "selector for confirm (if exists)",
    "cancel": "selector for cancel (if exists)"
  }
}

Modal HTML:
`;
}

