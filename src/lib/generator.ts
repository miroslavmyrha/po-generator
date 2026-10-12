import fs from 'fs';
import path from 'path';
import { SELECTORS } from '../constants.js';
import { capitalize, camelToKebab, escapeStringForCodeGen, sanitizeJsIdentifier, escapeJsDocComment, writeFileAtomic } from './utils.js';
import type { GeneratedPageObject, GeneratorOptions, ElementInfo } from '../types.js';

/**
 * Modal element info for generator (subset of ElementInfo, more flexible)
 */
interface ModalElementInfo {
  name: string;
  component: string;
  selector: string;
  action: string;
  description: string;
  locator?: ElementInfo['locator'];
}

/**
 * Modal data structure accepted by generator
 * Flexible to accept both simple modal info and full analysis
 */
interface ModalData {
  modalName?: string;
  triggerElement?: string;
  purpose?: string;
  expectedContent?: string;
  elements?: ModalElementInfo[];
  actions?: {
    confirm?: string;
    cancel?: string;
  };
}

/**
 * Page data structure for generating Page Objects
 */
export interface PageData {
  pageAnalysis: {
    url: string;
    purpose: string;
    suggestedClassName?: string;
  };
  elements: ElementInfo[];
  modals: ModalData[];
}

/**
 * Generate Page Object code from analyzed page data
 * SECURITY: suggestedClassName from AI is sanitized to prevent code injection
 */
export function generatePageObject(pageData: PageData, options: GeneratorOptions = {}): GeneratedPageObject {
  const { typescript = false } = options;
  const ext = typescript ? 'ts' : 'js';

  // CRITICAL: Sanitize AI-provided className to prevent code injection
  const rawClassName = pageData.pageAnalysis.suggestedClassName || pathToClassName(pageData.pageAnalysis.url);
  const className = sanitizeClassName(rawClassName);

  const code = buildPageObjectCode(pageData, className, typescript);

  return { code, className, ext };
}

/**
 * Sanitize class name to be a valid JavaScript/TypeScript class identifier
 * Prevents code injection via malicious AI responses
 */
function sanitizeClassName(name: string): string {
  if (!name) return 'UnnamedPage';

  // Remove any non-alphanumeric characters except underscore
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '');

  // Ensure starts with uppercase letter (PascalCase for classes)
  if (!sanitized || !/^[A-Z]/.test(sanitized)) {
    sanitized = 'Page' + capitalize(sanitized || 'Unknown');
  }

  // Ensure ends with 'Page' for consistency
  if (!sanitized.endsWith('Page')) {
    sanitized += 'Page';
  }

  return sanitized;
}

/** Members every Page Object has; an element or modal must not take one of these names. */
const RESERVED_NAMES = new Set(['page', 'url', 'goto', 'waitForLoad', 'constructor']);

interface NamedElement {
  name: string;
  element: ElementInfo | ModalElementInfo;
}

interface NamedModal {
  name: string;
  elements: NamedElement[];
  actions: { confirm?: string; cancel?: string };
  /** Only modals the AI analysed get open/close methods */
  hasMethods: boolean;
}

/**
 * Gives every member of the class a name that is a valid identifier and is used only once.
 * The AI may repeat a name or pick one the class already has; without this the generated
 * file would declare a member twice or silently overwrite one.
 */
function uniqueName(raw: string, taken: Set<string>, fallback: string): string {
  const base = sanitizeJsIdentifier(raw) || fallback;
  let name = base;
  for (let n = 2; taken.has(name) || RESERVED_NAMES.has(name); n++) {
    name = `${base}${n}`;
  }
  taken.add(name);
  return name;
}

function nameMembers(pageData: PageData): { elements: NamedElement[]; modals: NamedModal[] } {
  const taken = new Set<string>();
  const elements = (pageData.elements ?? []).map((element) => ({ name: uniqueName(element.name, taken, 'element'), element }));

  const modals: NamedModal[] = [];
  for (const modal of pageData.modals ?? []) {
    // a modal the AI only guessed at (no name, nothing inside) gives the class nothing to hold
    if (!modal.modalName && (!modal.elements || modal.elements.length === 0)) continue;
    // a modal known only by the element that opens it is named after that element
    const raw = modal.modalName || (modal.triggerElement ? `${modal.triggerElement}Modal` : 'modal');
    const inside = new Set<string>(['container', 'confirm', 'cancel']);
    modals.push({
      name: uniqueName(raw, taken, 'modal'),
      elements: (modal.elements ?? []).map((element) => ({ name: uniqueName(element.name, inside, 'element'), element })),
      actions: modal.actions ?? {},
      hasMethods: Boolean(modal.modalName),
    });
  }
  return { elements, modals };
}

const quote = (value: string): string => `'${escapeStringForCodeGen(value)}'`;

/**
 * The Playwright expression that finds an element.
 * A locator by role, label, placeholder, test id or text is what Playwright recommends and what
 * survives a redesign; the CSS selector is the fallback when the AI gave nothing better.
 */
export function locatorCode(element: ElementInfo | ModalElementInfo, scope = 'page'): string | null {
  const locator = 'locator' in element ? element.locator : undefined;
  if (!locator) return null;

  switch (locator.by) {
    case 'role': {
      const options = locator.name ? `, { name: ${quote(locator.name)}${locator.exact ? ', exact: true' : ''} }` : '';
      return `${scope}.getByRole('${locator.role}'${options})`;
    }
    case 'label':
      return `${scope}.getByLabel(${quote(locator.text)})`;
    case 'placeholder':
      return `${scope}.getByPlaceholder(${quote(locator.text)})`;
    case 'testId':
      return `${scope}.getByTestId(${quote(locator.text)})`;
    case 'text':
      return `${scope}.getByText(${quote(locator.text)})`;
  }
}

function buildPageObjectCode(pageData: PageData, className: string, typescript: boolean): string {
  const members = nameMembers(pageData);
  const fills = members.elements.filter(({ element }) => element.action === 'fill');
  const selects = members.elements.filter(({ element }) => element.action === 'select');

  const parts: string[] = [];
  parts.push(generateImports(typescript));
  parts.push(generateHelpers(typescript, fills.length > 0, selects.length > 0));
  parts.push(generateClassHeader(pageData, className));
  parts.push(generateTypeDeclarations(members, typescript));
  parts.push(generateConstructor(pageData, members, typescript));
  parts.push(generateNavigationMethods());
  parts.push(generateFillMethods(fills, typescript));
  parts.push(generateSelectMethods(selects, typescript));
  parts.push(generateClickMethods(members.elements));
  parts.push(generateModalMethods(members.modals));
  parts.push('}\n');

  return parts.join('');
}

function generateImports(typescript: boolean): string {
  if (typescript) {
    return `import type { Page, Locator } from '@playwright/test';\n\n`;
  }
  return '';
}

/**
 * Functions shared by the methods of the class, written into the file only when used.
 * They look at the page when the test runs, so the same Page Object works whether the
 * locator found the form control itself or the component wrapped around it.
 */
function generateHelpers(typescript: boolean, fill: boolean, select: boolean): string {
  const locator = typescript ? ': Locator' : '';
  const page = typescript ? ': Page' : '';
  const text = typescript ? ': string' : '';
  let code = '';

  if (fill) {
    code += `/** The control to type into: the element itself, or the input inside a wrapper component. */
async function fieldOf(locator${locator})${typescript ? ': Promise<Locator>' : ''} {
  const inner = locator.locator('input, textarea');
  return (await inner.count()) > 0 ? inner.first() : locator;
}

`;
  }
  if (select) {
    code += `/** Picks an option of a native select, or of a dropdown a component builds in its place. */
async function chooseOption(page${page}, locator${locator}, option${text})${typescript ? ': Promise<void>' : ''} {
  if ((await locator.evaluate((element) => element.tagName)) === 'SELECT') {
    await locator.selectOption({ label: option });
    return;
  }
  const trigger = locator.locator('${SELECTORS.FIELD_TRIGGER}');
  await ((await trigger.count()) > 0 ? trigger.first() : locator).click();
  await page.getByRole('option', { name: option }).or(page.locator('${SELECTORS.DROPDOWN_ITEM}').filter({ hasText: option })).first().click();
}

`;
  }
  return code;
}

function generateClassHeader(pageData: PageData, className: string): string {
  return `/**
 * Page Object for ${escapeJsDocComment(pageData.pageAnalysis.url)}
 * ${escapeJsDocComment(pageData.pageAnalysis.purpose)}
 *
 * @generated Automatically generated by po-generator
 */
export class ${className} {
`;
}

/** TypeScript needs every member declared; plain JavaScript gets them from the constructor. */
function generateTypeDeclarations(members: { elements: NamedElement[]; modals: NamedModal[] }, typescript: boolean): string {
  if (!typescript) return '';

  const lines = ['  readonly page: Page;', '  readonly url: string;'];
  for (const { name } of members.elements) {
    lines.push(`  readonly ${name}: Locator;`);
  }
  for (const modal of members.modals) {
    const fields = ['container: Locator', ...modal.elements.map(({ name }) => `${name}: Locator`)];
    if (modal.actions.confirm) fields.push('confirm: Locator');
    if (modal.actions.cancel) fields.push('cancel: Locator');
    lines.push(`  readonly ${modal.name}: { ${fields.join('; ')} };`);
  }
  return lines.join('\n') + '\n\n';
}

function generateConstructor(pageData: PageData, members: { elements: NamedElement[]; modals: NamedModal[] }, typescript: boolean): string {
  const typeAnnotation = typescript ? ': Page' : '';
  const pageType = typescript ? 'Page' : 'import("@playwright/test").Page';

  // Escape URL to prevent code injection via malicious URL parameters
  const escapedUrl = escapeStringForCodeGen(pageData.pageAnalysis.url);

  let code = `  /**
   * @param {${pageType}} page
   */
  constructor(page${typeAnnotation}) {
    this.page = page;
    this.url = '${escapedUrl}';\n\n`;

  code += generateElementDeclarations(members.elements);
  code += generateModalDeclarations(members.modals);
  code += `  }\n\n`;

  return code;
}

function generateElementDeclarations(elements: NamedElement[]): string {
  if (elements.length === 0) return '';

  // Use array accumulation instead of string += for performance
  const lines: string[] = ['    // Elements'];
  for (const { name, element } of elements) {
    lines.push(`    /** ${escapeJsDocComment(element.description)} */`);
    lines.push(`    this.${name} = ${locatorCode(element) ?? `page.locator(${quote(element.selector)})`};`);
    lines.push('');
  }
  return lines.join('\n');
}

// Pre-compute modal content selectors for performance
const MODAL_CONTENT_PARTS = SELECTORS.MODAL_CONTENT.split(', ');

function generateModalDeclarations(modals: NamedModal[]): string {
  // Use array accumulation instead of string += for performance
  const lines: string[] = [];

  for (const modal of modals) {
    lines.push(`    // Modal: ${modal.name}`);
    lines.push(`    this.${modal.name} = {`);
    lines.push(`      container: page.locator('${SELECTORS.MODAL}'),`);

    for (const { name, element } of modal.elements) {
      lines.push(`      /** ${escapeJsDocComment(element.description)} */`);
      // a recommended locator is looked up inside the modal; a CSS selector is prefixed with it
      const selector = escapeStringForCodeGen(element.selector);
      const css = `page.locator('${MODAL_CONTENT_PARTS.map((part) => `${part} ${selector}`).join(', ')}')`;
      lines.push(`      ${name}: ${locatorCode(element, `page.locator('${SELECTORS.MODAL}')`) ?? css},`);
    }
    if (modal.actions.confirm) {
      lines.push(`      confirm: page.locator(${quote(modal.actions.confirm)}),`);
    }
    if (modal.actions.cancel) {
      lines.push(`      cancel: page.locator(${quote(modal.actions.cancel)}),`);
    }

    lines.push('    };');
    lines.push('');
  }

  return lines.join('\n');
}

function generateNavigationMethods(): string {
  return `  /**
   * Navigate to page
   */
  async goto() {
    await this.page.goto(this.url);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Wait for page to load
   */
  async waitForLoad() {
    await this.page.waitForSelector('body');
  }

`;
}

function generateFillMethods(elements: NamedElement[], typescript: boolean): string {
  if (elements.length === 0) return '';
  const text = typescript ? ': string' : '';

  // Use array accumulation for performance
  const methods = elements.map(({ name, element }) => {
    return `  /**
   * Fill ${escapeJsDocComment(element.description)}
   * @param {string} value
   */
  async fill${capitalize(name)}(value${text}) {
    await (await fieldOf(this.${name})).fill(value);
  }`;
  });

  return methods.join('\n\n') + '\n\n';
}

function generateSelectMethods(elements: NamedElement[], typescript: boolean): string {
  if (elements.length === 0) return '';
  const text = typescript ? ': string' : '';

  // Use array accumulation for performance
  const methods = elements.map(({ name, element }) => {
    return `  /**
   * Select value in ${escapeJsDocComment(element.description)}
   * @param {string} option
   */
  async select${capitalize(name)}(option${text}) {
    await chooseOption(this.page, this.${name}, option);
  }`;
  });

  return methods.join('\n\n') + '\n\n';
}

function generateClickMethods(elements: NamedElement[]): string {
  const clickElements = elements.filter(({ element }) => element.action === 'click' && 'importance' in element && element.importance === 'high');
  if (clickElements.length === 0) return '';

  // Use array accumulation for performance
  const methods = clickElements.map(({ name, element }) => {
    return `  /**
   * Click ${escapeJsDocComment(element.description)}
   */
  async click${capitalize(name)}() {
    await this.${name}.click();
  }`;
  });

  return methods.join('\n\n') + '\n\n';
}

function generateModalMethods(modals: NamedModal[]): string {
  let code = '';

  for (const modal of modals) {
    if (!modal.hasMethods) continue;
    code += `  /**
   * Open modal ${modal.name}
   */
  async open${capitalize(modal.name)}() {
    await this.${modal.name}.container.waitFor();
  }

  /**
   * Close modal ${modal.name}
   */
  async close${capitalize(modal.name)}() {
    await this.page.keyboard.press('Escape');
    await this.${modal.name}.container.waitFor({ state: 'hidden' });
  }

`;
  }

  return code;
}

/**
 * Save Page Object code to file (atomic write)
 */
export function savePageObject(pageObjectCode: string, className: string, outputDir: string, ext = 'js'): string {
  const fileName = `${camelToKebab(className)}.${ext}`;
  const filePath = path.join(outputDir, fileName);

  fs.mkdirSync(outputDir, { recursive: true });
  writeFileAtomic(filePath, pageObjectCode);

  return filePath;
}

/**
 * Generate index file that exports all Page Objects (atomic write)
 */
export function generateIndexFile(classNames: string[], outputDir: string, ext = 'js'): string {
  let code = '// Auto-generated index file\n\n';

  for (const className of classNames) {
    // Sanitize at point of use — defense-in-depth for public API
    const safeName = sanitizeJsIdentifier(className);
    const fileName = camelToKebab(safeName);
    code += `export { ${safeName} } from './${fileName}.${ext}';\n`;
  }

  const filePath = path.join(outputDir, `index.${ext}`);
  writeFileAtomic(filePath, code);

  return filePath;
}

// Helper functions

/**
 * Convert URL path to PascalCase class name
 * @param urlPath - URL path (e.g., '/users/settings')
 * @returns PascalCase class name with 'Page' suffix (e.g., 'UsersSettingsPage')
 * @example
 *   pathToClassName('/') => 'HomePage'
 *   pathToClassName('/dashboard') => 'DashboardPage'
 *   pathToClassName('/users/profile') => 'UsersProfilePage'
 */
function pathToClassName(urlPath: string): string {
  if (!urlPath || urlPath === '/') return 'HomePage';

  return (
    urlPath
      .split('/')
      .filter(Boolean)
      .map(capitalize)
      .join('') + 'Page'
  );
}
