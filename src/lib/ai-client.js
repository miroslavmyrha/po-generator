import OpenAI from 'openai';
import { config } from '../config.js';

const client = new OpenAI({
  baseURL: config.ai.baseUrl,
  apiKey: config.ai.apiKey,
});

const SCANNER_PROMPT = `
Jsi expert na Vuetify 3 a Playwright testování. Analyzuješ HTML stránky a vracíš strukturovaná data pro generování Page Objects.

PRAVIDLA PRO SELEKTORY (v pořadí priority):
1. data-testid nebo data-cy atributy
2. Vuetify třídy + unikátní text: .v-btn:has-text("Save")
3. aria-label: [aria-label="Close"]
4. Unikátní ID: #submit-button
5. Strukturální: .v-card-actions .v-btn:first-child

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
      "component": "vuetify komponenta (v-btn, v-text-field...)",
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

export async function analyzeHtml(html, url, retries = 3) {
  // Vyčisti HTML
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .substring(0, 50000);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: config.ai.model,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: SCANNER_PROMPT,
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

export async function analyzeModalContent(html, triggerName, retries = 3) {
  const cleanHtml = html.substring(0, 20000);

  const prompt = `
Analyzuj obsah modálního okna (dialog/drawer) ve Vuetify 3 aplikaci.
Modal byl otevřen kliknutím na: "${triggerName}"

VRAŤ POUZE VALIDNÍ JSON:
{
  "modalName": "camelCase název pro modal",
  "purpose": "účel modalu (česky)",
  "elements": [
    {
      "name": "camelCase název",
      "component": "vuetify komponenta",
      "selector": "selector RELATIVNÍ k .v-dialog nebo .v-overlay",
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
      const response = await client.chat.completions.create({
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
