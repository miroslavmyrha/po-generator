import OpenAI from 'openai';
import { config } from '../config.js';

let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({
      baseURL: config.ai.baseUrl,
      apiKey: config.ai.apiKey,
    });
  }
  return client;
}

// Framework-specific prompts
const FRAMEWORK_PROMPTS = {
  vuetify: `
VUETIFY 3 KOMPONENTY:
- v-btn → .v-btn
- v-text-field → .v-text-field (input je uvnitř)
- v-textarea → .v-textarea (textarea je uvnitř)
- v-select → .v-select (klik na .v-field, pak .v-list-item)
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

MODALY: .v-dialog, .v-overlay
`,

  symfony: `
SYMFONY/STIMULUS KOMPONENTY:
- Stimulus controllers: [data-controller="..."]
- Stimulus actions: [data-action="..."]
- Stimulus targets: [data-{controller}-target="..."]
- Turbo frames: turbo-frame[id="..."]
- Turbo streams: turbo-stream

FORMULÁŘE:
- Symfony form fields mají často id ve formátu: #{form_name}_{field_name}
- Error messages: .form-error-message, .invalid-feedback
- Form groups: .form-group, .mb-3

BOOTSTRAP KOMPONENTY (pokud jsou použity):
- Buttons: .btn, .btn-primary, .btn-secondary
- Inputs: .form-control, .form-select
- Modals: .modal, .modal-dialog
- Cards: .card, .card-body
- Tables: .table, tbody tr
- Alerts: .alert
- Dropdowns: .dropdown, .dropdown-menu, .dropdown-item

VUE KOMPONENTY (pokud jsou vložené):
- Hledej [data-v-*] atributy
- Vue root: #app, [id="app"]
- Vue komponenty mají často unikátní třídy

MODALY: .modal, [data-controller*="modal"], .modal-dialog
`,

  generic: `
OBECNÉ INTERAKTIVNÍ ELEMENTY:
- Tlačítka: button, [type="submit"], [type="button"], .btn, [role="button"]
- Odkazy: a[href]
- Inputy: input, textarea, select
- Checkboxy: input[type="checkbox"]
- Radio: input[type="radio"]
- Formuláře: form

JAVASCRIPT HANDLERY:
- [onclick], [onsubmit], [onchange]
- [data-action] (Stimulus)
- [@click], [v-on:click] (Vue)
- [data-*] custom atributy

MODALY/DIALOGY:
- .modal, [role="dialog"], dialog
- .popup, .overlay, .lightbox
`
};

const BASE_PROMPT = `
Jsi expert na webové testování s Playwright. Analyzuješ HTML stránky a vracíš strukturovaná data pro generování Page Objects.

PRAVIDLA PRO SELEKTORY (v pořadí priority):
1. data-testid nebo data-cy atributy (nejstabilnější)
2. Unikátní ID: #submit-button
3. aria-label: [aria-label="Close"]
4. Specifické třídy + text: .btn:has-text("Save")
5. Strukturální: .card-actions .btn:first-child
6. data-* atributy: [data-controller="modal"]

ZÁSADY:
- Preferuj selektory které přežijí refactoring
- Vyhni se indexům pokud to jde (nth-child je křehký)
- Používej :has-text() pro buttony a odkazy
- Pro formuláře používej label nebo placeholder

`;

const OUTPUT_FORMAT = `
VRAŤ POUZE VALIDNÍ JSON (žádný markdown, žádný text navíc):
{
  "pageAnalysis": {
    "url": "URL stránky",
    "purpose": "stručný popis účelu stránky (česky)",
    "shouldBePageObject": true | false | "ask_user",
    "reason": "důvod rozhodnutí (česky)",
    "suggestedClassName": "NazevPage"
  },
  "elements": [
    {
      "name": "camelCase název pro proměnnou",
      "component": "typ komponenty (button, input, select, link, stimulus, vue...)",
      "selector": "playwright selector",
      "action": "click | fill | select | check | toggle | none",
      "description": "co element dělá (česky)",
      "importance": "high | medium | low",
      "isModalTrigger": false
    }
  ],
  "modals": [
    {
      "triggerElement": "název elementu který otevírá modal",
      "expectedContent": "co modal pravděpodobně obsahuje"
    }
  ],
  "navigation": [
    {
      "element": "název elementu",
      "targetUrl": "kam vede odkaz"
    }
  ]
}
`;

function getScannerPrompt(framework = 'generic') {
  const frameworkPrompt = FRAMEWORK_PROMPTS[framework] || FRAMEWORK_PROMPTS.generic;
  return BASE_PROMPT + frameworkPrompt + OUTPUT_FORMAT;
}

export async function analyzeHtml(html, url, options = {}) {
  const { retries = 3, framework = 'generic' } = options;

  // Vyčisti HTML
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .substring(0, 50000);

  const prompt = getScannerPrompt(framework);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await getClient().chat.completions.create({
        model: config.ai.model,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: prompt,
          },
          {
            role: 'user',
            content: `URL: ${url}\n\nHTML:\n${cleanHtml}`,
          },
        ],
      });

      const content = response.choices[0].message.content;

      // Extrahuj JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI nevrátila validní JSON');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      if (attempt === retries) {
        console.error(`AI analýza selhala po ${retries} pokusech:`, error.message);
        return null;
      }
      console.warn(`Pokus ${attempt}/${retries} selhal, zkouším znovu...`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

export async function analyzeModalContent(html, triggerName, options = {}) {
  const { retries = 3, framework = 'generic' } = options;
  const cleanHtml = html.substring(0, 20000);

  const modalSelectors = {
    vuetify: '.v-dialog, .v-overlay',
    symfony: '.modal, .modal-dialog, [data-controller*="modal"]',
    generic: '.modal, [role="dialog"], dialog, .overlay'
  };

  const prompt = `
Analyzuj obsah modálního okna (dialog/drawer).
Modal byl otevřen kliknutím na: "${triggerName}"

Framework: ${framework}
Modal kontejner: ${modalSelectors[framework] || modalSelectors.generic}

VRAŤ POUZE VALIDNÍ JSON:
{
  "modalName": "camelCase název pro modal",
  "purpose": "účel modalu (česky)",
  "elements": [
    {
      "name": "camelCase název",
      "component": "typ komponenty",
      "selector": "selector RELATIVNÍ k modal kontejneru",
      "action": "click | fill | select | check | toggle | none",
      "description": "popis (česky)"
    }
  ],
  "actions": {
    "confirm": "selector pro potvrzení (pokud existuje)",
    "cancel": "selector pro zrušení (pokud existuje)"
  }
}

HTML modalu:
${cleanHtml}
`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await getClient().chat.completions.create({
        model: config.ai.model,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Invalid JSON');

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      if (attempt === retries) return null;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

export const SUPPORTED_FRAMEWORKS = ['vuetify', 'symfony', 'generic'];
