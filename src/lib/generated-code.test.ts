import path from 'path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { ElementSchema } from '../schemas.js';
import type { ElementInfo } from '../types.js';
import { generatePageObject, locatorCode } from './generator.js';

// The generator writes source code as text. These tests hand that text to the TypeScript
// compiler, with the real types of Playwright, so a Page Object that would not compile
// or parse fails here and not in the project of whoever generated it.

const ROOT = path.resolve(import.meta.dirname, '../..');
// the generated file imports '@playwright/test'; this project has 'playwright', which carries the same types
const STUB = path.join(ROOT, '__generated__/playwright-test.d.ts');
const STUB_CODE = `declare module '@playwright/test' { export type { Page, Locator } from 'playwright'; }`;

function problems(code: string, extension: 'ts' | 'js'): string[] {
  const file = path.join(ROOT, `__generated__/page.${extension}`);
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    allowJs: true,
    checkJs: false,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const virtual: Record<string, string> = { [file]: code, [STUB]: STUB_CODE };
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.readFile = (name) => virtual[name] ?? readFile(name);
  host.fileExists = (name) => name in virtual || fileExists(name);
  host.getSourceFile = (name, languageVersion, ...rest) =>
    name in virtual ? ts.createSourceFile(name, virtual[name]!, languageVersion, true) : getSourceFile(name, languageVersion, ...rest);

  const program = ts.createProgram([file, STUB], options, host);
  const source = program.getSourceFile(file)!;
  const found = extension === 'ts' ? ts.getPreEmitDiagnostics(program, source) : program.getSyntacticDiagnostics(source);
  return found.map((problem) => ts.flattenDiagnosticMessageText(problem.messageText, '\n'));
}

const element = (changes: Partial<ElementInfo> & { name: string }): ElementInfo =>
  ElementSchema.parse({ component: 'input', selector: '#' + changes.name, action: 'none', description: changes.name, importance: 'high', ...changes });

const page = {
  pageAnalysis: { url: '/users', purpose: 'User management', suggestedClassName: 'UsersPage' },
  elements: [
    element({ name: 'searchField', action: 'fill', locator: { by: 'role', role: 'searchbox', name: 'Search' } }),
    element({ name: 'emailField', action: 'fill', locator: { by: 'label', text: "User's e-mail" } }),
    element({ name: 'noteField', action: 'fill', selector: '.v-text-field:has-text("Note")' }),
    element({ name: 'roleSelect', action: 'select', locator: { by: 'role', role: 'combobox', name: 'Role' } }),
    element({ name: 'countrySelect', action: 'select', selector: '#country' }),
    element({ name: 'addUserBtn', action: 'click', isModalTrigger: true, locator: { by: 'role', role: 'button', name: 'Add user', exact: true } }),
    element({ name: 'filter', action: 'click', locator: { by: 'testId', text: 'filter' } }),
    element({ name: 'emptyState', locator: { by: 'text', text: 'No users yet' } }),
    element({ name: 'hint', locator: { by: 'placeholder', text: 'Type a name' } }),
    // names the AI repeats or that the class already uses
    element({ name: 'searchField', action: 'fill' }),
    element({ name: 'page', action: 'click' }),
    element({ name: 'url' }),
    element({ name: 'goto', action: 'click' }),
  ],
  modals: [
    {
      modalName: 'addUserModal',
      triggerElement: 'addUserBtn',
      elements: [
        element({ name: 'nameField', action: 'fill', locator: { by: 'label', text: 'Name' } }),
        element({ name: 'container', action: 'click', selector: '.inner' }),
      ],
      actions: { confirm: '.save', cancel: '.cancel' },
    },
    { modalName: 'deleteDialog' }, // named, but its content was never analysed
    { triggerElement: 'addUserBtn', elements: [element({ name: 'closeBtn', action: 'click' })] }, // known only by its trigger
    { modalName: 'addUserBtn', elements: [element({ name: 'x' })] }, // named like an element
  ],
};

describe('generated Page Object', () => {
  it('compiles as strict TypeScript against the types of Playwright', () => {
    const { code, ext } = generatePageObject(page, { typescript: true });
    expect(ext).toBe('ts');
    expect(problems(code, 'ts')).toEqual([]);
  });

  it('is valid JavaScript without type annotations', () => {
    const { code, ext } = generatePageObject(page);
    expect(ext).toBe('js');
    expect(problems(code, 'js')).toEqual([]);
    expect(code).not.toMatch(/\((value|option|locator|page): /);
  });

  it('compiles for a page with nothing on it', () => {
    const empty = { pageAnalysis: { url: '/', purpose: 'Home' }, elements: [], modals: [] };
    expect(problems(generatePageObject(empty, { typescript: true }).code, 'ts')).toEqual([]);
    expect(problems(generatePageObject(empty).code, 'js')).toEqual([]);
  });

  it('the check itself notices broken code', () => {
    expect(problems('export class A { constructor() { this.missing = 1 } }', 'ts')).not.toEqual([]);
    expect(problems('export class A { async fill(value: string) {} }', 'js')).not.toEqual([]);
  });

  it('declares every member once, even when names repeat or collide', () => {
    const { code } = generatePageObject(page, { typescript: true });
    for (const name of ['searchField', 'searchField2', 'page2', 'url2', 'goto2', 'addUserModal', 'deleteDialog', 'addUserBtnModal', 'addUserBtn2']) {
      expect(code.match(new RegExp(`readonly ${name}:`, 'g')), name).toHaveLength(1);
    }
    // an element inside a modal may not take the place of the modal's own container
    expect(code).toContain('container2: Locator');
  });

  it('prefers the locators Playwright recommends and keeps CSS as the fallback', () => {
    const { code } = generatePageObject(page, { typescript: true });
    expect(code).toContain("this.searchField = page.getByRole('searchbox', { name: 'Search' });");
    expect(code).toContain("this.emailField = page.getByLabel('User\\'s e-mail');");
    expect(code).toContain("this.addUserBtn = page.getByRole('button', { name: 'Add user', exact: true });");
    expect(code).toContain("this.filter = page.getByTestId('filter');");
    expect(code).toContain("this.emptyState = page.getByText('No users yet');");
    expect(code).toContain("this.hint = page.getByPlaceholder('Type a name');");
    expect(code).toContain(`this.noteField = page.locator('.v-text-field:has-text("Note")');`);
    // inside a modal the recommended locator is looked up within the modal
    expect(code).toMatch(/nameField: page\.locator\('[^']+'\)\.getByLabel\('Name'\),/);
  });

  it('gives a named modal without analysed content what its methods use', () => {
    const { code } = generatePageObject(page, { typescript: true });
    expect(code).toContain('readonly deleteDialog: { container: Locator };');
    expect(code).toContain('async openDeleteDialog()');
  });
});

describe('locator from the AI', () => {
  it('falls back to the selector when the AI sends a locator that makes no sense', () => {
    for (const locator of [{ by: 'role', role: 'banana', name: 'x' }, { by: 'xpath', text: '//a' }, { by: 'label' }, 'button', 5, { by: 'role', role: "button'); process.exit(1); ('" }]) {
      const parsed = element({ name: 'save', locator: locator as never });
      expect(parsed.locator, JSON.stringify(locator)).toBeUndefined();
      expect(locatorCode(parsed)).toBeNull();
      expect(parsed.selector).toBe('#save');
    }
  });

  it('cannot inject code through a name', () => {
    const evil = element({ name: 'save', locator: { by: 'role', role: 'button', name: "x' }); process.exit(1); ({ a: '" } });
    const { code } = generatePageObject({ pageAnalysis: { url: '/', purpose: 'x' }, elements: [evil], modals: [] }, { typescript: true });
    expect(problems(code, 'ts')).toEqual([]);
    expect(code).toContain("name: 'x\\' }); process.exit(1); ({ a: \\''");
  });
});
