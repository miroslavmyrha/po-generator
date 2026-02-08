import { describe, it, expect, vi } from 'vitest';
import { generatePageObject, generateIndexFile, PageData } from './generator.js';
import type { ElementInfo } from '../types.js';

let lastWrittenContent = '';
vi.mock('./utils.js', async () => {
  const actual = await vi.importActual('./utils.js');
  return {
    ...actual,
    writeFileAtomic: vi.fn((_path: string, content: string) => { lastWrittenContent = content; }),
  };
});

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: { ...actual, mkdirSync: vi.fn() },
  };
});

/**
 * Tests for Page Object code generation
 *
 * WHY these tests matter:
 * - Generator is the core output of the entire tool
 * - Generated code must be syntactically valid
 * - Must handle edge cases (empty data, special characters)
 * - Must generate correct methods based on element actions
 */

describe('generatePageObject', () => {
  const minimalPageData: PageData = {
    pageAnalysis: {
      url: '/dashboard',
      purpose: 'Main dashboard',
      suggestedClassName: 'DashboardPage',
    },
    elements: [],
    modals: [],
  };

  describe('basic structure', () => {
    it('generates valid class with correct name', () => {
      const result = generatePageObject(minimalPageData);

      expect(result.className).toBe('DashboardPage');
      expect(result.code).toContain('export class DashboardPage');
    });

    it('includes JSDoc with URL and purpose', () => {
      const result = generatePageObject(minimalPageData);

      expect(result.code).toContain('* Page Object for /dashboard');
      expect(result.code).toContain('* Main dashboard');
    });

    it('generates JavaScript by default', () => {
      const result = generatePageObject(minimalPageData);

      expect(result.ext).toBe('js');
      expect(result.code).not.toContain('import { Page');
      expect(result.code).not.toContain(': Page');
    });

    it('generates TypeScript when option is set', () => {
      const result = generatePageObject(minimalPageData, { typescript: true });

      expect(result.ext).toBe('ts');
      expect(result.code).toContain("import { Page, Locator } from '@playwright/test'");
      expect(result.code).toContain('page: Page;');
      expect(result.code).toContain('constructor(page: Page)');
    });

    it('includes goto and waitForLoad methods', () => {
      const result = generatePageObject(minimalPageData);

      expect(result.code).toContain('async goto()');
      expect(result.code).toContain('await this.page.goto(this.url)');
      expect(result.code).toContain('async waitForLoad()');
    });

    it('sets correct URL in constructor', () => {
      const result = generatePageObject(minimalPageData);

      expect(result.code).toContain("this.url = '/dashboard'");
    });
  });

  describe('class name generation', () => {
    it('uses suggestedClassName when provided', () => {
      const result = generatePageObject(minimalPageData);
      expect(result.className).toBe('DashboardPage');
    });

    it('generates class name from URL path when suggestedClassName is missing', () => {
      const pageData = {
        ...minimalPageData,
        pageAnalysis: {
          url: '/users/settings',
          purpose: 'User settings',
          // suggestedClassName intentionally missing
        },
      };

      const result = generatePageObject(pageData);
      expect(result.className).toBe('UsersSettingsPage');
    });

    it('generates HomePage for root URL', () => {
      const pageData = {
        ...minimalPageData,
        pageAnalysis: {
          url: '/',
          purpose: 'Home page',
        },
      };

      const result = generatePageObject(pageData);
      expect(result.className).toBe('HomePage');
    });
  });

  describe('element generation', () => {
    it('generates locators for elements', () => {
      const pageData = {
        ...minimalPageData,
        elements: [
          {
            name: 'submitButton',
            component: 'button',
            selector: '#submit-btn',
            action: 'click' as const,
            description: 'Submit form button',
            importance: 'high' as const,
            isModalTrigger: false,
          },
        ],
      };

      const result = generatePageObject(pageData);

      expect(result.code).toContain('this.submitButton = page.locator');
      expect(result.code).toContain("'#submit-btn'");
      expect(result.code).toContain('/** Submit form button */');
    });

    it('escapes single quotes in selectors', () => {
      const pageData = {
        ...minimalPageData,
        elements: [
          {
            name: 'specialButton',
            component: 'button',
            selector: "[data-label='test']",
            action: 'click' as const,
            description: 'Button with quotes',
            importance: 'medium' as const,
            isModalTrigger: false,
          },
        ],
      };

      const result = generatePageObject(pageData);

      // Single quotes should be escaped
      expect(result.code).toContain("[data-label=\\'test\\']");
    });

    it('generates multiple elements correctly', () => {
      const pageData = {
        ...minimalPageData,
        elements: [
          {
            name: 'usernameInput',
            component: 'input',
            selector: '#username',
            action: 'fill' as const,
            description: 'Username field',
            importance: 'high' as const,
            isModalTrigger: false,
          },
          {
            name: 'passwordInput',
            component: 'input',
            selector: '#password',
            action: 'fill' as const,
            description: 'Password field',
            importance: 'high' as const,
            isModalTrigger: false,
          },
        ],
      };

      const result = generatePageObject(pageData);

      expect(result.code).toContain('this.usernameInput');
      expect(result.code).toContain('this.passwordInput');
    });
  });

  describe('method generation based on action type', () => {
    it('generates fill methods for fill action', () => {
      const pageData = {
        ...minimalPageData,
        elements: [
          {
            name: 'emailInput',
            component: 'input',
            selector: '#email',
            action: 'fill' as const,
            description: 'Email input field',
            importance: 'high' as const,
            isModalTrigger: false,
          },
        ],
      };

      const result = generatePageObject(pageData);

      expect(result.code).toContain('async fillEmailInput(value: string)');
      expect(result.code).toContain("await this.emailInput.locator('input, textarea').fill(value)");
    });

    it('generates select methods for select action', () => {
      const pageData = {
        ...minimalPageData,
        elements: [
          {
            name: 'countrySelect',
            component: 'select',
            selector: '#country',
            action: 'select' as const,
            description: 'Country dropdown',
            importance: 'medium' as const,
            isModalTrigger: false,
          },
        ],
      };

      const result = generatePageObject(pageData);

      expect(result.code).toContain('async selectCountrySelect(option: string)');
      expect(result.code).toContain('.click()');
      expect(result.code).toContain('filter({ hasText: option })');
    });

    it('generates click methods only for high importance click actions', () => {
      const pageData = {
        ...minimalPageData,
        elements: [
          {
            name: 'submitButton',
            component: 'button',
            selector: '#submit',
            action: 'click' as const,
            description: 'Submit button',
            importance: 'high' as const,
            isModalTrigger: false,
          },
          {
            name: 'cancelLink',
            component: 'link',
            selector: '#cancel',
            action: 'click' as const,
            description: 'Cancel link',
            importance: 'low' as const, // Low importance - no method
            isModalTrigger: false,
          },
        ],
      };

      const result = generatePageObject(pageData);

      expect(result.code).toContain('async clickSubmitButton()');
      expect(result.code).not.toContain('async clickCancelLink');
    });

    it('does not generate methods for "none" action', () => {
      const pageData = {
        ...minimalPageData,
        elements: [
          {
            name: 'statusLabel',
            component: 'label',
            selector: '.status',
            action: 'none' as const,
            description: 'Status display',
            importance: 'high' as const,
            isModalTrigger: false,
          },
        ],
      };

      const result = generatePageObject(pageData);

      // Element should exist but no action method
      expect(result.code).toContain('this.statusLabel');
      expect(result.code).not.toContain('async fillStatusLabel');
      expect(result.code).not.toContain('async clickStatusLabel');
    });
  });

  describe('modal generation', () => {
    it('generates modal object with elements', () => {
      const pageData: PageData = {
        ...minimalPageData,
        modals: [
          {
            modalName: 'confirmDialog',
            purpose: 'Confirm action',
            elements: [
              {
                name: 'confirmButton',
                component: 'button',
                selector: '.btn-confirm',
                action: 'click',
                description: 'Confirm button',
              },
            ],
            actions: {
              confirm: '.btn-confirm',
              cancel: '.btn-cancel',
            },
          },
        ],
      };

      const result = generatePageObject(pageData);

      expect(result.code).toContain('this.confirmDialog = {');
      expect(result.code).toContain('container: page.locator');
      expect(result.code).toContain('confirmButton:');
      expect(result.code).toContain("confirm: page.locator('.btn-confirm')");
      expect(result.code).toContain("cancel: page.locator('.btn-cancel')");
    });

    it('generates modal open/close methods', () => {
      const pageData: PageData = {
        ...minimalPageData,
        modals: [
          {
            modalName: 'deleteDialog',
            purpose: 'Delete confirmation',
            elements: [],
          },
        ],
      };

      const result = generatePageObject(pageData);

      expect(result.code).toContain('async openDeleteDialog()');
      expect(result.code).toContain('async closeDeleteDialog()');
      expect(result.code).toContain("keyboard.press('Escape')");
    });

    it('handles modal without modalName (uses triggerElement)', () => {
      const pageData: PageData = {
        ...minimalPageData,
        modals: [
          {
            triggerElement: 'editButton',
            purpose: 'Edit modal',
            elements: [
              {
                name: 'saveButton',
                component: 'button',
                selector: '.save',
                action: 'click',
                description: 'Save',
              },
            ],
          },
        ],
      };

      const result = generatePageObject(pageData);

      expect(result.code).toContain('// Modal: editButton');
    });
  });

  describe('edge cases', () => {
    it('handles empty elements array', () => {
      const result = generatePageObject(minimalPageData);

      expect(result.code).toContain('export class DashboardPage');
      expect(result.code).not.toContain('// Elements');
    });

    it('handles empty modals array', () => {
      const result = generatePageObject(minimalPageData);

      expect(result.code).not.toContain('// Modal:');
    });

    it('handles undefined elements', () => {
      const pageData = {
        pageAnalysis: {
          url: '/test',
          purpose: 'Test',
          suggestedClassName: 'TestPage',
        },
        elements: undefined as unknown as ElementInfo[],
        modals: [],
      };

      // Should not throw
      const result = generatePageObject(pageData);
      expect(result.className).toBe('TestPage');
    });
  });
});

describe('generateIndexFile', () => {
  it('generates exports for all class names', () => {
    const classNames = ['DashboardPage', 'LoginPage', 'SettingsPage'];

    generateIndexFile(classNames, '/tmp/test-output');

    expect(lastWrittenContent).toContain("export { DashboardPage } from './dashboard-page.js'");
    expect(lastWrittenContent).toContain("export { LoginPage } from './login-page.js'");
    expect(lastWrittenContent).toContain("export { SettingsPage } from './settings-page.js'");
  });

  it('sanitizes class names to prevent injection', () => {
    const classNames = ['Page"; console.log("xss'];

    generateIndexFile(classNames, '/tmp/test-output');

    // Malicious class name should be sanitized
    expect(lastWrittenContent).not.toContain('console.log');
    expect(lastWrittenContent).toContain('export { ');
  });
});
