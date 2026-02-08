import { describe, it, expect } from 'vitest';
import { generateTestFile } from './test-generator.js';
import type { TestSuite } from '../types.js';

/**
 * Tests for Playwright test code generation
 *
 * WHY these tests matter:
 * - Generated test code must be syntactically valid
 * - Must handle edge cases (special characters, empty data)
 * - Security: AI-provided identifiers must be sanitized
 * - Assertions must map to correct Playwright matchers
 */

const validTestSuite: TestSuite = {
  suiteName: 'Login Page Tests',
  testCases: [
    {
      name: 'should login with valid credentials',
      steps: [
        { method: 'goto', args: [] },
        { method: 'fillEmailInput', args: ['user@test.com'] },
        { method: 'fillPasswordInput', args: ['ValidPass123!'] },
        { method: 'clickSubmitBtn', args: [] },
      ],
      assertions: [
        { type: 'url', value: 'dashboard' },
      ],
    },
  ],
};

describe('generateTestFile', () => {
  describe('basic structure', () => {
    it('generates valid test file with imports', () => {
      const result = generateTestFile(validTestSuite, '../pages/login-page', 'LoginPage');

      expect(result.code).toContain("import { test, expect } from '@playwright/test'");
      expect(result.code).toContain("import { LoginPage } from '../pages/login-page'");
    });

    it('generates test.describe with suite name', () => {
      const result = generateTestFile(validTestSuite, '../pages/login-page', 'LoginPage');

      expect(result.code).toContain("test.describe('Login Page Tests'");
    });

    it('generates correct file name from class name', () => {
      const result = generateTestFile(validTestSuite, '../pages/login-page', 'LoginPage');

      expect(result.fileName).toBe('login.spec.ts');
    });

    it('returns suite name', () => {
      const result = generateTestFile(validTestSuite, '../pages/login-page', 'LoginPage');

      expect(result.suiteName).toBe('Login Page Tests');
    });

    it('creates page object instance in test', () => {
      const result = generateTestFile(validTestSuite, '../pages/login-page', 'LoginPage');

      expect(result.code).toContain('const loginPage = new LoginPage(page)');
    });
  });

  describe('step generation', () => {
    it('generates steps with no arguments', () => {
      const result = generateTestFile(validTestSuite, '../pages/login-page', 'LoginPage');

      expect(result.code).toContain('await loginPage.goto()');
    });

    it('generates steps with string arguments', () => {
      const result = generateTestFile(validTestSuite, '../pages/login-page', 'LoginPage');

      expect(result.code).toContain("await loginPage.fillEmailInput('user@test.com')");
      expect(result.code).toContain("await loginPage.fillPasswordInput('ValidPass123!')");
    });

    it('generates click steps', () => {
      const result = generateTestFile(validTestSuite, '../pages/login-page', 'LoginPage');

      expect(result.code).toContain('await loginPage.clickSubmitBtn()');
    });
  });

  describe('assertion generation', () => {
    it('generates URL assertions with safe RegExp constructor', () => {
      const result = generateTestFile(validTestSuite, '../pages/login-page', 'LoginPage');

      expect(result.code).toContain("await expect(page).toHaveURL(new RegExp('dashboard'))");
    });

    it('generates visible assertions', () => {
      const suite: TestSuite = {
        suiteName: 'Test',
        testCases: [{
          name: 'visibility test',
          steps: [{ method: 'goto', args: [] }],
          assertions: [{ type: 'visible', selector: '.success-message' }],
        }],
      };

      const result = generateTestFile(suite, '../pages/test-page', 'TestPage');

      expect(result.code).toContain("await expect(page.locator('.success-message')).toBeVisible()");
    });

    it('generates hidden assertions', () => {
      const suite: TestSuite = {
        suiteName: 'Test',
        testCases: [{
          name: 'hidden test',
          steps: [{ method: 'goto', args: [] }],
          assertions: [{ type: 'hidden', selector: '.error' }],
        }],
      };

      const result = generateTestFile(suite, '../pages/test-page', 'TestPage');

      expect(result.code).toContain("await expect(page.locator('.error')).toBeHidden()");
    });

    it('generates text assertions', () => {
      const suite: TestSuite = {
        suiteName: 'Test',
        testCases: [{
          name: 'text test',
          steps: [{ method: 'goto', args: [] }],
          assertions: [{ type: 'text', selector: '.title', value: 'Welcome' }],
        }],
      };

      const result = generateTestFile(suite, '../pages/test-page', 'TestPage');

      expect(result.code).toContain("await expect(page.locator('.title')).toContainText('Welcome')");
    });

    it('generates count assertions', () => {
      const suite: TestSuite = {
        suiteName: 'Test',
        testCases: [{
          name: 'count test',
          steps: [{ method: 'goto', args: [] }],
          assertions: [{ type: 'count', selector: '.item', value: '5' }],
        }],
      };

      const result = generateTestFile(suite, '../pages/test-page', 'TestPage');

      expect(result.code).toContain("await expect(page.locator('.item')).toHaveCount(5)");
    });

    it('generates enabled assertions', () => {
      const suite: TestSuite = {
        suiteName: 'Test',
        testCases: [{
          name: 'enabled test',
          steps: [{ method: 'goto', args: [] }],
          assertions: [{ type: 'enabled', selector: '#submit' }],
        }],
      };

      const result = generateTestFile(suite, '../pages/test-page', 'TestPage');

      expect(result.code).toContain("await expect(page.locator('#submit')).toBeEnabled()");
    });

    it('generates disabled assertions', () => {
      const suite: TestSuite = {
        suiteName: 'Test',
        testCases: [{
          name: 'disabled test',
          steps: [{ method: 'goto', args: [] }],
          assertions: [{ type: 'disabled', selector: '#submit' }],
        }],
      };

      const result = generateTestFile(suite, '../pages/test-page', 'TestPage');

      expect(result.code).toContain("await expect(page.locator('#submit')).toBeDisabled()");
    });
  });

  describe('multiple test cases', () => {
    it('generates multiple tests in one suite', () => {
      const suite: TestSuite = {
        suiteName: 'Multi Test',
        testCases: [
          {
            name: 'test one',
            steps: [{ method: 'goto', args: [] }],
            assertions: [{ type: 'visible', selector: '.page' }],
          },
          {
            name: 'test two',
            steps: [{ method: 'goto', args: [] }],
            assertions: [{ type: 'url', value: 'home' }],
          },
        ],
      };

      const result = generateTestFile(suite, '../pages/multi-page', 'MultiPage');

      expect(result.code).toContain("test('test one'");
      expect(result.code).toContain("test('test two'");
    });
  });

  describe('security and edge cases', () => {
    it('escapes single quotes in test names', () => {
      const suite: TestSuite = {
        suiteName: "User's Profile",
        testCases: [{
          name: "should show user's name",
          steps: [{ method: 'goto', args: [] }],
          assertions: [{ type: 'visible', selector: '.name' }],
        }],
      };

      const result = generateTestFile(suite, '../pages/profile-page', 'ProfilePage');

      expect(result.code).toContain("test.describe('User\\'s Profile'");
      expect(result.code).toContain("test('should show user\\'s name'");
    });

    it('escapes special characters in arguments', () => {
      const suite: TestSuite = {
        suiteName: 'Test',
        testCases: [{
          name: 'special args',
          steps: [{ method: 'fillInput', args: ["value'with\"quotes"] }],
          assertions: [{ type: 'visible', selector: '.ok' }],
        }],
      };

      const result = generateTestFile(suite, '../pages/test-page', 'TestPage');

      expect(result.code).toContain("value\\'with\"quotes");
    });

    it('sanitizes method names from AI', () => {
      const suite: TestSuite = {
        suiteName: 'Test',
        testCases: [{
          name: 'sanitize test',
          steps: [{ method: 'goto', args: [] }],
          assertions: [{ type: 'visible', selector: '.ok' }],
        }],
      };

      const result = generateTestFile(suite, '../pages/test-page', 'TestPage');

      // Method name should be sanitized via sanitizeJsIdentifier
      expect(result.code).toContain('await testPage.goto()');
    });

    it('handles file name generation for complex class names', () => {
      const suite: TestSuite = {
        suiteName: 'Test',
        testCases: [{
          name: 'test',
          steps: [{ method: 'goto', args: [] }],
          assertions: [{ type: 'visible', selector: '.ok' }],
        }],
      };

      const result = generateTestFile(suite, '../pages/user-settings-page', 'UserSettingsPage');

      expect(result.fileName).toBe('user-settings.spec.ts');
    });

    it('escapes backslashes in import paths', () => {
      const suite: TestSuite = {
        suiteName: 'Test',
        testCases: [{
          name: 'test',
          steps: [{ method: 'goto', args: [] }],
          assertions: [{ type: 'visible', selector: '.ok' }],
        }],
      };

      // Windows-style path with backslashes
      const result = generateTestFile(suite, '..\\pages\\test-page', 'TestPage');

      // Backslashes should be escaped
      expect(result.code).toContain("'..\\\\pages\\\\test-page'");
    });

    it('escapes newlines in test names to prevent unterminated strings', () => {
      const suite: TestSuite = {
        suiteName: "Suite\nwith\nnewlines",
        testCases: [{
          name: "test\nwith\nnewline",
          steps: [{ method: 'goto', args: [] }],
          assertions: [{ type: 'visible', selector: '.ok' }],
        }],
      };

      const result = generateTestFile(suite, '../pages/test-page', 'TestPage');

      // Newlines should be escaped, not literal
      expect(result.code).not.toContain("'Suite\nwith");
      expect(result.code).toContain('Suite\\nwith\\nnewlines');
    });

    it('escapes template expressions in arguments', () => {
      const suite: TestSuite = {
        suiteName: 'Test',
        testCases: [{
          name: 'template injection',
          steps: [{ method: 'fillInput', args: ['${process.exit(1)}'] }],
          assertions: [{ type: 'visible', selector: '.ok' }],
        }],
      };

      const result = generateTestFile(suite, '../pages/test-page', 'TestPage');

      expect(result.code).toContain("'\\${process.exit(1)}'");
      expect(result.code).not.toContain("'${process.exit(1)}'");
    });

    it('sanitizes className in import statement', () => {
      const suite: TestSuite = {
        suiteName: 'Test',
        testCases: [{
          name: 'test',
          steps: [{ method: 'goto', args: [] }],
          assertions: [{ type: 'visible', selector: '.ok' }],
        }],
      };

      // Malicious className that could break import
      const result = generateTestFile(suite, '../pages/test-page', 'Page"; console.log("xss'); //');

      // Should be sanitized — no injection
      expect(result.code).not.toContain('console.log');
      expect(result.code).toContain('import { ');
    });

    it('handles non-numeric count assertion value', () => {
      const suite: TestSuite = {
        suiteName: 'Test',
        testCases: [{
          name: 'count test',
          steps: [{ method: 'goto', args: [] }],
          assertions: [{ type: 'count', selector: '.item', value: 'abc' }],
        }],
      };

      const result = generateTestFile(suite, '../pages/test-page', 'TestPage');

      // Should fall back to 0 for non-numeric value
      expect(result.code).toContain('toHaveCount(0)');
    });

    it('prevents URL assertion regex injection', () => {
      const suite: TestSuite = {
        suiteName: 'Test',
        testCases: [{
          name: 'url test',
          steps: [{ method: 'goto', args: [] }],
          assertions: [{ type: 'url', value: "/); process.exit(1); //" }],
        }],
      };

      const result = generateTestFile(suite, '../pages/test-page', 'TestPage');

      // Should use new RegExp() with escaped string, not regex literal
      expect(result.code).toContain("new RegExp('");
      expect(result.code).not.toContain('//);');
    });
  });
});
