import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generatePageObject, savePageObject, generateIndexFile, PageData } from './generator.js';

/**
 * Integration tests for Page Object file generation
 *
 * WHY these tests:
 * - Verify the complete flow: PageData → actual files on disk
 * - Catch file system issues (permissions, encoding, path handling)
 * - Ensure generated files are valid and importable
 *
 * WHAT we test:
 * - savePageObject writes correct content to correct location
 * - generateIndexFile creates valid index with all exports
 * - Generated files have correct structure for Playwright
 */

describe('Generator Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-gen-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('savePageObject', () => {
    it('creates output directory if it does not exist', () => {
      const nestedDir = path.join(tempDir, 'nested', 'pages');
      const code = 'export class TestPage {}';

      savePageObject(code, 'TestPage', nestedDir, 'ts');

      expect(fs.existsSync(nestedDir)).toBe(true);
    });

    it('writes JavaScript file with correct name and content', () => {
      const code = `export class LoginPage {
  constructor(page) {
    this.page = page;
  }
}`;
      const filePath = savePageObject(code, 'LoginPage', tempDir, 'js');

      expect(filePath).toBe(path.join(tempDir, 'login-page.js'));
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(code);
    });

    it('writes TypeScript file with correct extension', () => {
      const code = 'export class DashboardPage {}';

      const filePath = savePageObject(code, 'DashboardPage', tempDir, 'ts');

      expect(filePath.endsWith('.ts')).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('converts PascalCase class name to kebab-case filename', () => {
      // Note: camelToKebab only inserts dash between lowercase-uppercase pairs
      // So 'APIDocsPage' becomes 'apidocs-page' (API stays together)
      const testCases = [
        { className: 'LoginPage', expected: 'login-page.js' },
        { className: 'UserSettingsPage', expected: 'user-settings-page.js' },
        { className: 'APIDocsPage', expected: 'apidocs-page.js' }, // API stays together
        { className: 'HomePage', expected: 'home-page.js' },
        { className: 'UserProfileSettingsPage', expected: 'user-profile-settings-page.js' },
      ];

      for (const { className, expected } of testCases) {
        const filePath = savePageObject('', className, tempDir, 'js');
        expect(path.basename(filePath)).toBe(expected);
      }
    });

    it('overwrites existing file', () => {
      const filePath = path.join(tempDir, 'test-page.js');
      fs.writeFileSync(filePath, 'old content');

      savePageObject('new content', 'TestPage', tempDir, 'js');

      expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content');
    });
  });

  describe('generateIndexFile', () => {
    it('creates index file with exports for all classes', () => {
      const classNames = ['LoginPage', 'DashboardPage', 'SettingsPage'];

      const indexPath = generateIndexFile(classNames, tempDir, 'ts');

      expect(indexPath).toBe(path.join(tempDir, 'index.ts'));
      expect(fs.existsSync(indexPath)).toBe(true);

      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content).toContain("export { LoginPage } from './login-page.ts'");
      expect(content).toContain("export { DashboardPage } from './dashboard-page.ts'");
      expect(content).toContain("export { SettingsPage } from './settings-page.ts'");
    });

    it('creates JavaScript index file', () => {
      const classNames = ['HomePage'];

      const indexPath = generateIndexFile(classNames, tempDir, 'js');

      expect(indexPath.endsWith('index.js')).toBe(true);
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content).toContain("from './home-page.js'");
    });

    it('handles empty class list', () => {
      const indexPath = generateIndexFile([], tempDir, 'ts');

      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content).toContain('Auto-generated index file');
      // Should only have the comment, no exports
      expect(content).not.toContain('export {');
    });
  });

  describe('Full generation flow', () => {
    it('generates complete Page Object file from PageData', () => {
      const pageData: PageData = {
        pageAnalysis: {
          url: '/login',
          purpose: 'User authentication page',
          suggestedClassName: 'LoginPage',
        },
        elements: [
          {
            name: 'emailInput',
            component: 'v-text-field',
            selector: '#email',
            action: 'fill',
            description: 'Email input field',
            importance: 'high',
            isModalTrigger: false,
          },
          {
            name: 'passwordInput',
            component: 'v-text-field',
            selector: '#password',
            action: 'fill',
            description: 'Password input field',
            importance: 'high',
            isModalTrigger: false,
          },
          {
            name: 'submitButton',
            component: 'v-btn',
            selector: '.btn-submit',
            action: 'click',
            description: 'Login submit button',
            importance: 'high',
            isModalTrigger: false,
          },
        ],
        modals: [],
      };

      // Generate code
      const { code, className } = generatePageObject(pageData, { typescript: true });

      // Save to file
      const filePath = savePageObject(code, className, tempDir, 'ts');

      // Verify file exists and has correct content
      expect(fs.existsSync(filePath)).toBe(true);

      const savedCode = fs.readFileSync(filePath, 'utf-8');

      // Verify structure
      expect(savedCode).toContain('export class LoginPage');
      expect(savedCode).toContain("import { Page, Locator } from '@playwright/test'");
      expect(savedCode).toContain('this.emailInput');
      expect(savedCode).toContain('this.passwordInput');
      expect(savedCode).toContain('this.submitButton');
      expect(savedCode).toContain('async goto()');
      expect(savedCode).toContain('async fillEmailInput');
      expect(savedCode).toContain('async fillPasswordInput');
      expect(savedCode).toContain('async clickSubmitButton');
    });

    it('generates multiple Page Objects and valid index file', () => {
      const pages: PageData[] = [
        {
          pageAnalysis: { url: '/login', purpose: 'Login', suggestedClassName: 'LoginPage' },
          elements: [],
          modals: [],
        },
        {
          pageAnalysis: { url: '/dashboard', purpose: 'Dashboard', suggestedClassName: 'DashboardPage' },
          elements: [],
          modals: [],
        },
        {
          pageAnalysis: { url: '/settings', purpose: 'Settings', suggestedClassName: 'SettingsPage' },
          elements: [],
          modals: [],
        },
      ];

      const classNames: string[] = [];

      // Generate all Page Objects
      for (const pageData of pages) {
        const { code, className } = generatePageObject(pageData, { typescript: true });
        savePageObject(code, className, tempDir, 'ts');
        classNames.push(className);
      }

      // Generate index
      generateIndexFile(classNames, tempDir, 'ts');

      // Verify all files exist
      expect(fs.existsSync(path.join(tempDir, 'login-page.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'dashboard-page.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'settings-page.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'index.ts'))).toBe(true);

      // Verify index exports all classes
      const indexContent = fs.readFileSync(path.join(tempDir, 'index.ts'), 'utf-8');
      expect(indexContent).toContain('LoginPage');
      expect(indexContent).toContain('DashboardPage');
      expect(indexContent).toContain('SettingsPage');
    });

    it('generates Page Object with modal definitions', () => {
      const pageData: PageData = {
        pageAnalysis: {
          url: '/users',
          purpose: 'User management',
          suggestedClassName: 'UsersPage',
        },
        elements: [
          {
            name: 'addUserButton',
            component: 'button',
            selector: '#add-user',
            action: 'click',
            description: 'Opens add user modal',
            importance: 'high',
            isModalTrigger: true,
          },
        ],
        modals: [
          {
            modalName: 'addUserModal',
            purpose: 'Add new user form',
            elements: [
              {
                name: 'nameInput',
                component: 'input',
                selector: '#user-name',
                action: 'fill',
                description: 'User name field',
              },
              {
                name: 'emailInput',
                component: 'input',
                selector: '#user-email',
                action: 'fill',
                description: 'User email field',
              },
            ],
            actions: {
              confirm: '.btn-save',
              cancel: '.btn-cancel',
            },
          },
        ],
      };

      const { code, className } = generatePageObject(pageData, { typescript: true });
      const filePath = savePageObject(code, className, tempDir, 'ts');

      const savedCode = fs.readFileSync(filePath, 'utf-8');

      // Verify modal structure
      expect(savedCode).toContain('this.addUserModal = {');
      expect(savedCode).toContain('container:');
      expect(savedCode).toContain('nameInput:');
      expect(savedCode).toContain('emailInput:');
      expect(savedCode).toContain("confirm: page.locator('.btn-save')");
      expect(savedCode).toContain("cancel: page.locator('.btn-cancel')");

      // Verify modal methods
      expect(savedCode).toContain('async openAddUserModal()');
      expect(savedCode).toContain('async closeAddUserModal()');
    });
  });

  describe('Edge cases', () => {
    it('handles special characters in selectors', () => {
      const pageData: PageData = {
        pageAnalysis: { url: '/test', purpose: 'Test', suggestedClassName: 'TestPage' },
        elements: [
          {
            name: 'specialButton',
            component: 'button',
            selector: "[data-testid='btn-submit']",
            action: 'click',
            description: 'Button with quotes in selector',
            importance: 'high',
            isModalTrigger: false,
          },
        ],
        modals: [],
      };

      const { code } = generatePageObject(pageData);
      savePageObject(code, 'TestPage', tempDir, 'js');

      const savedCode = fs.readFileSync(path.join(tempDir, 'test-page.js'), 'utf-8');

      // Verify quotes are escaped
      expect(savedCode).toContain("[data-testid=\\'btn-submit\\']");
    });

    it('handles empty URL path (generates HomePage)', () => {
      const pageData: PageData = {
        pageAnalysis: { url: '/', purpose: 'Home page' },
        elements: [],
        modals: [],
      };

      const { className } = generatePageObject(pageData);

      expect(className).toBe('HomePage');
    });

    it('generates unique files for similar class names', () => {
      const page1: PageData = {
        pageAnalysis: { url: '/users', purpose: 'Users list', suggestedClassName: 'UsersPage' },
        elements: [],
        modals: [],
      };
      const page2: PageData = {
        pageAnalysis: { url: '/users/new', purpose: 'New user', suggestedClassName: 'UsersNewPage' },
        elements: [],
        modals: [],
      };

      const result1 = generatePageObject(page1);
      const result2 = generatePageObject(page2);

      const path1 = savePageObject(result1.code, result1.className, tempDir, 'ts');
      const path2 = savePageObject(result2.code, result2.className, tempDir, 'ts');

      // Should create different files
      expect(path1).not.toBe(path2);
      expect(fs.existsSync(path1)).toBe(true);
      expect(fs.existsSync(path2)).toBe(true);
    });
  });
});
