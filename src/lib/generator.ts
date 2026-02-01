import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import type { ScanResult, ModalAnalysis, GeneratedPageObject, GeneratorOptions, ElementInfo } from '../types.js';

interface PageData {
  pageAnalysis: {
    url: string;
    purpose: string;
    suggestedClassName?: string;
  };
  elements: ElementInfo[];
  modals: (ModalAnalysis & { triggerElement?: string })[];
}

export function generatePageObject(pageData: PageData, options: GeneratorOptions = {}): GeneratedPageObject {
  const { typescript = false } = options;
  const ext = typescript ? 'ts' : 'js';
  const typeAnnotation = typescript ? ': Page' : '';

  const className = pageData.pageAnalysis.suggestedClassName || pathToClassName(pageData.pageAnalysis.url);

  let code = '';

  // Imports
  if (typescript) {
    code += `import { Page, Locator } from '@playwright/test';\n\n`;
  }

  // Class header
  code += `/**
 * Page Object pro ${pageData.pageAnalysis.url}
 * ${pageData.pageAnalysis.purpose}
 *
 * @generated Automaticky generováno pomocí po-generator
 */
export class ${className} {
`;

  // Type declarations for TypeScript
  if (typescript) {
    code += `  page: Page;\n`;
    code += `  url: string;\n\n`;
  }

  // Constructor
  code += `  /**
   * @param {${typescript ? 'Page' : 'import("@playwright/test").Page'}} page
   */
  constructor(page${typeAnnotation}) {
    this.page = page;
    this.url = '${pageData.pageAnalysis.url}';\n\n`;

  // Base elements
  if (pageData.elements && pageData.elements.length > 0) {
    code += `    // Elementy\n`;
    for (const el of pageData.elements) {
      code += `    /** ${el.description} */\n`;
      code += `    this.${el.name} = page.locator('${escapeSelector(el.selector)}');\n\n`;
    }
  }

  // Modal objects
  if (pageData.modals && pageData.modals.length > 0) {
    for (const modal of pageData.modals) {
      if (modal.elements && modal.elements.length > 0) {
        code += `    // Modal: ${modal.modalName || modal.triggerElement}\n`;
        code += `    this.${modal.modalName || 'modal'} = {\n`;
        code += `      container: page.locator('.v-dialog, .v-overlay__content, .modal, [role="dialog"]'),\n`;

        for (const el of modal.elements) {
          code += `      /** ${el.description} */\n`;
          code += `      ${el.name}: page.locator('.v-dialog ${escapeSelector(el.selector)}, .v-overlay__content ${escapeSelector(el.selector)}, .modal ${escapeSelector(el.selector)}'),\n`;
        }

        if (modal.actions) {
          if (modal.actions.confirm) {
            code += `      confirm: page.locator('${escapeSelector(modal.actions.confirm)}'),\n`;
          }
          if (modal.actions.cancel) {
            code += `      cancel: page.locator('${escapeSelector(modal.actions.cancel)}'),\n`;
          }
        }

        code += `    };\n\n`;
      }
    }
  }

  code += `  }\n\n`;

  // Methods
  code += generateMethods(pageData, className);

  code += `}\n`;

  return { code, className, ext };
}

function generateMethods(pageData: PageData, className: string): string {
  let methods = '';

  // goto method
  methods += `  /**
   * Navigace na stránku
   */
  async goto() {
    await this.page.goto(this.url);
    await this.page.waitForLoadState('networkidle');
  }\n\n`;

  // waitForLoad
  methods += `  /**
   * Čekání na načtení stránky
   */
  async waitForLoad() {
    await this.page.waitForSelector('body');
  }\n\n`;

  if (!pageData.elements) return methods;

  // Fill methods
  const fillElements = pageData.elements.filter((e) => e.action === 'fill');
  for (const el of fillElements) {
    methods += `  /**
   * Vyplní ${el.description}
   * @param {string} value
   */
  async fill${capitalize(el.name)}(value: string) {
    await this.${el.name}.locator('input, textarea').fill(value);
  }\n\n`;
  }

  // Select methods
  const selectElements = pageData.elements.filter((e) => e.action === 'select');
  for (const el of selectElements) {
    methods += `  /**
   * Vybere hodnotu v ${el.description}
   * @param {string} option
   */
  async select${capitalize(el.name)}(option: string) {
    await this.${el.name}.locator('.v-field, .form-select, select').click();
    await this.page.locator('.v-list-item, .dropdown-item, option').filter({ hasText: option }).click();
  }\n\n`;
  }

  // Click methods for important buttons
  const clickElements = pageData.elements.filter(
    (e) => e.action === 'click' && e.importance === 'high'
  );
  for (const el of clickElements) {
    methods += `  /**
   * Klikne na ${el.description}
   */
  async click${capitalize(el.name)}() {
    await this.${el.name}.click();
  }\n\n`;
  }

  // Modal methods
  if (pageData.modals) {
    for (const modal of pageData.modals) {
      if (modal.modalName) {
        methods += `  /**
   * Otevře modal ${modal.modalName}
   */
  async open${capitalize(modal.modalName)}() {
    // Click trigger to open modal
    await this.${modal.modalName}.container.waitFor();
  }\n\n`;

        methods += `  /**
   * Zavře modal ${modal.modalName}
   */
  async close${capitalize(modal.modalName)}() {
    await this.page.keyboard.press('Escape');
    await this.${modal.modalName}.container.waitFor({ state: 'hidden' });
  }\n\n`;
      }
    }
  }

  return methods;
}

export function savePageObject(pageObjectCode: string, className: string, outputDir: string, ext = 'js'): string {
  const fileName = `${camelToKebab(className)}.${ext}`;
  const filePath = path.join(outputDir, fileName);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filePath, pageObjectCode);

  return filePath;
}

export function generateIndexFile(classNames: string[], outputDir: string, ext = 'js'): string {
  let code = '// Auto-generated index file\n\n';

  for (const className of classNames) {
    const fileName = camelToKebab(className);
    code += `export { ${className} } from './${fileName}.${ext}';\n`;
  }

  const filePath = path.join(outputDir, `index.${ext}`);
  fs.writeFileSync(filePath, code);

  return filePath;
}

// Helpers
function pathToClassName(urlPath: string): string {
  if (!urlPath || urlPath === '/') return 'HomePage';

  return urlPath
    .split('/')
    .filter(Boolean)
    .map(capitalize)
    .join('') + 'Page';
}

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function escapeSelector(selector: string): string {
  return selector.replace(/'/g, "\\'");
}
