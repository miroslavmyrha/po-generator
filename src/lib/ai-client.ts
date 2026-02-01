import OpenAI from 'openai';
import { ERRORS, LIMITS, FRAMEWORK_MODAL_SELECTORS } from '../constants.js';
import { log } from './logger.js';
import { getErrorMessage, withRetry } from './utils.js';
import { validateScanResult, validateModalAnalysis } from '../schemas.js';
import { AppError } from '../types.js';
import type { Config, ScanResult, ModalAnalysis, AnalyzeOptions } from '../types.js';
import type { Framework } from '../constants.js';

/**
 * Create OpenAI client with config
 */
function createClient(config: Config): OpenAI {
  return new OpenAI({
    baseURL: config.ai.baseUrl,
    apiKey: config.ai.apiKey,
  });
}

// Framework-specific prompts
const FRAMEWORK_PROMPTS: Record<Framework, string> = {
  vuetify: `
VUETIFY 3 COMPONENTS:
- v-btn → .v-btn
- v-text-field → .v-text-field (input inside)
- v-textarea → .v-textarea (textarea inside)
- v-select → .v-select (click .v-field, then .v-list-item)
- v-autocomplete → .v-autocomplete
- v-checkbox → .v-checkbox
- v-switch → .v-switch
- v-radio-group → .v-radio-group
- v-data-table → .v-data-table
- v-dialog → .v-dialog
- v-card → .v-card
- v-tab → .v-tab
- v-expansion-panel → .v-expansion-panel
- v-navigation-drawer → .v-navigation-drawer
- v-app-bar → .v-app-bar
- v-list-item → .v-list-item
- v-menu → .v-menu

MODALS: .v-dialog, .v-overlay
`,

  symfony: `
SYMFONY/STIMULUS COMPONENTS:
- Stimulus controllers: [data-controller="..."]
- Stimulus actions: [data-action="..."]
- Stimulus targets: [data-{controller}-target="..."]
- Turbo frames: turbo-frame[id="..."]
- Turbo streams: turbo-stream

FORMS:
- Symfony form fields often have id format: #{form_name}_{field_name}
- Error messages: .form-error-message, .invalid-feedback
- Form groups: .form-group, .mb-3

BOOTSTRAP COMPONENTS (if used):
- Buttons: .btn, .btn-primary, .btn-secondary
- Inputs: .form-control, .form-select
- Modals: .modal, .modal-dialog
- Cards: .card, .card-body
- Tables: .table, tbody tr
- Alerts: .alert
- Dropdowns: .dropdown, .dropdown-menu, .dropdown-item

VUE COMPONENTS (if embedded):
- Look for [data-v-*] attributes
- Vue root: #app, [id="app"]
- Vue components often have unique classes

MODALS: .modal, [data-controller*="modal"], .modal-dialog
`,

  generic: `
COMMON INTERACTIVE ELEMENTS:
- Buttons: button, [type="submit"], [type="button"], .btn, [role="button"]
- Links: a[href]
- Inputs: input, textarea, select
- Checkboxes: input[type="checkbox"]
- Radio: input[type="radio"]
- Forms: form

JAVASCRIPT HANDLERS:
- [onclick], [onsubmit], [onchange]
- [data-action] (Stimulus)
- [@click], [v-on:click] (Vue)
- [data-*] custom attributes

MODALS/DIALOGS:
- .modal, [role="dialog"], dialog
- .popup, .overlay, .lightbox
`,
};

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
 * Build the complete scanner prompt for a given framework
 * Combines base prompt + framework-specific selectors + output format
 * @param framework - Target framework (vuetify, symfony, or generic)
 * @returns Complete prompt string for AI analysis
 */
function getScannerPrompt(framework: Framework): string {
  const frameworkPrompt = FRAMEWORK_PROMPTS[framework] || FRAMEWORK_PROMPTS.generic;
  return BASE_PROMPT + frameworkPrompt + OUTPUT_FORMAT;
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
  const prompt = getScannerPrompt(framework as Framework);
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
  const cleanHtml = html.substring(0, LIMITS.MODAL_HTML_MAX_LENGTH);
  const client = createClient(config);

  const prompt = buildModalPrompt(triggerName, framework as Framework, FRAMEWORK_MODAL_SELECTORS);

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

// Helper functions

/**
 * Clean HTML content by removing scripts, styles, and comments
 * @internal Exported for testing
 */
export function cleanHtmlContent(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .substring(0, LIMITS.HTML_MAX_LENGTH);
}

/**
 * Extract content from AI response with validation
 */
function extractResponseContent(response: OpenAI.Chat.Completions.ChatCompletion): string {
  const choice = response.choices?.[0];
  if (!choice?.message?.content) {
    throw new AppError('Invalid AI response: missing choices or content', 'AI_INVALID_RESPONSE');
  }
  return choice.message.content;
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
 * @internal Exported for testing
 */
export function parseJsonResponse(content: string | null): unknown {
  if (!content) {
    throw new AppError('Empty AI response', 'AI_EMPTY_RESPONSE');
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new AppError('No JSON found in response', 'AI_INVALID_JSON');
  }

  return JSON.parse(jsonMatch[0]);
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

export const SUPPORTED_FRAMEWORKS: Framework[] = ['vuetify', 'symfony', 'generic'];
