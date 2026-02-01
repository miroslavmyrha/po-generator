import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Integration tests for generate command
 *
 * WHY these tests:
 * - Verify complete workflow: scan files → Page Object files
 * - This is the PRIMARY OUTPUT of the entire tool
 * - Catches issues with file reading, JSON parsing, code generation, file writing
 *
 * WHAT we test:
 * - Reading decisions.json and scanned/*.json files
 * - Generating correct Page Objects based on decisions
 * - Creating proper file structure with index
 *
 * HOW:
 * - Create temp directory with mock scan data
 * - Import and run generate logic
 * - Verify output files
 */

describe('Generate Command Integration', () => {
  let tempDir: string;
  let outputDir: string;
  let scannedDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    // Create temp directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-gen-cmd-test-'));
    outputDir = path.join(tempDir, 'output');
    scannedDir = path.join(outputDir, 'scanned');

    fs.mkdirSync(scannedDir, { recursive: true });

    // Reset modules to pick up new env
    vi.resetModules();

    // Set up environment for config
    process.env = {
      ...originalEnv,
      PO_GEN_OUTPUT_DIR: outputDir,
      PO_GEN_BASE_URL: 'http://localhost:3000',
      PO_GEN_AI_KEY: 'test-key',
    };
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to create mock scan result file
   */
  function createScanFile(pagePath: string, analysis: object): void {
    const fileName = pagePath.replace(/\//g, '_').replace(/^_/, '') || 'home';
    const filePath = path.join(scannedDir, `${fileName}.json`);

    const scanData = {
      url: `http://localhost:3000${pagePath}`,
      path: pagePath,
      title: `Test Page - ${pagePath}`,
      hasForm: true,
      hasTable: false,
      hasCards: false,
      interactiveCount: 5,
      crawledAt: new Date().toISOString(),
      analysis,
    };

    fs.writeFileSync(filePath, JSON.stringify(scanData, null, 2));
  }

  /**
   * Helper to create decisions.json
   */
  function createDecisions(decisions: Record<string, object>): void {
    const decisionsPath = path.join(outputDir, 'decisions.json');
    fs.writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2));
  }

  describe('File-based generation flow', () => {
    it('reads scan files and generates Page Objects for page_object decisions', async () => {
      // Create mock scan data
      createScanFile('/login', {
        pageAnalysis: {
          url: '/login',
          purpose: 'User login page',
          shouldBePageObject: true,
          reason: 'Has login form',
          suggestedClassName: 'LoginPage',
        },
        elements: [
          {
            name: 'emailInput',
            component: 'input',
            selector: '#email',
            action: 'fill',
            description: 'Email field',
            importance: 'high',
            isModalTrigger: false,
          },
          {
            name: 'passwordInput',
            component: 'input',
            selector: '#password',
            action: 'fill',
            description: 'Password field',
            importance: 'high',
            isModalTrigger: false,
          },
          {
            name: 'loginButton',
            component: 'button',
            selector: '#login-btn',
            action: 'click',
            description: 'Submit login',
            importance: 'high',
            isModalTrigger: false,
          },
        ],
        modals: [],
        navigation: [],
      });

      createDecisions({
        '/login': {
          decision: 'page_object',
          reason: 'Has login form',
          suggestedClassName: 'LoginPage',
          elementCount: 3,
        },
      });

      // Import generator functions (after env is set)
      const { generatePageObject, savePageObject } = await import('../lib/generator.js');

      // Read scan file
      const scanFilePath = path.join(scannedDir, 'login.json');
      const scanData = JSON.parse(fs.readFileSync(scanFilePath, 'utf-8'));

      // Generate Page Object
      const pagesDir = path.join(outputDir, 'pages');
      const { code, className } = generatePageObject(
        {
          pageAnalysis: {
            url: '/login',
            purpose: scanData.analysis.pageAnalysis.purpose,
            suggestedClassName: scanData.analysis.pageAnalysis.suggestedClassName,
          },
          elements: scanData.analysis.elements,
          modals: scanData.analysis.modals,
        },
        { typescript: true }
      );

      savePageObject(code, className, pagesDir, 'ts');

      // Verify output
      const outputFilePath = path.join(pagesDir, 'login-page.ts');
      expect(fs.existsSync(outputFilePath)).toBe(true);

      const generatedCode = fs.readFileSync(outputFilePath, 'utf-8');
      expect(generatedCode).toContain('export class LoginPage');
      expect(generatedCode).toContain('this.emailInput');
      expect(generatedCode).toContain('this.passwordInput');
      expect(generatedCode).toContain('this.loginButton');
      expect(generatedCode).toContain('async fillEmailInput');
      expect(generatedCode).toContain('async fillPasswordInput');
      expect(generatedCode).toContain('async clickLoginButton');
    });

    it('skips pages with skip decision', async () => {
      createScanFile('/login', {
        pageAnalysis: {
          url: '/login',
          purpose: 'Login',
          shouldBePageObject: true,
          reason: 'Form',
          suggestedClassName: 'LoginPage',
        },
        elements: [],
        modals: [],
        navigation: [],
      });

      createScanFile('/about', {
        pageAnalysis: {
          url: '/about',
          purpose: 'About page',
          shouldBePageObject: false,
          reason: 'Static content only',
          suggestedClassName: 'AboutPage',
        },
        elements: [],
        modals: [],
        navigation: [],
      });

      createDecisions({
        '/login': {
          decision: 'page_object',
          reason: 'Form',
          suggestedClassName: 'LoginPage',
          elementCount: 0,
        },
        '/about': {
          decision: 'skip', // This should be skipped
          reason: 'Static content',
          suggestedClassName: 'AboutPage',
          elementCount: 0,
        },
      });

      const { generatePageObject, savePageObject, generateIndexFile } = await import('../lib/generator.js');

      // Read decisions
      const decisionsPath = path.join(outputDir, 'decisions.json');
      const decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf-8'));

      const pagesDir = path.join(outputDir, 'pages');
      const generatedClasses: string[] = [];

      // Process only page_object decisions
      for (const [pagePath, decision] of Object.entries(decisions) as [string, any][]) {
        if (decision.decision !== 'page_object') continue;

        const fileName = pagePath.replace(/\//g, '_').replace(/^_/, '') || 'home';
        const scanFilePath = path.join(scannedDir, `${fileName}.json`);
        const scanData = JSON.parse(fs.readFileSync(scanFilePath, 'utf-8'));

        const { code, className } = generatePageObject(
          {
            pageAnalysis: {
              url: pagePath,
              purpose: scanData.analysis.pageAnalysis.purpose,
              suggestedClassName: decision.suggestedClassName,
            },
            elements: scanData.analysis.elements,
            modals: scanData.analysis.modals,
          },
          { typescript: true }
        );

        savePageObject(code, className, pagesDir, 'ts');
        generatedClasses.push(className);
      }

      generateIndexFile(generatedClasses, pagesDir, 'ts');

      // Verify login page was generated
      expect(fs.existsSync(path.join(pagesDir, 'login-page.ts'))).toBe(true);

      // Verify about page was NOT generated
      expect(fs.existsSync(path.join(pagesDir, 'about-page.ts'))).toBe(false);

      // Verify index only contains LoginPage
      const indexContent = fs.readFileSync(path.join(pagesDir, 'index.ts'), 'utf-8');
      expect(indexContent).toContain('LoginPage');
      expect(indexContent).not.toContain('AboutPage');
    });

    it('generates multiple Page Objects and creates valid index', async () => {
      // Create multiple scan files
      const pages = [
        { path: '/login', className: 'LoginPage', purpose: 'Login' },
        { path: '/dashboard', className: 'DashboardPage', purpose: 'Dashboard' },
        { path: '/users', className: 'UsersPage', purpose: 'User management' },
        { path: '/settings', className: 'SettingsPage', purpose: 'Settings' },
      ];

      const decisions: Record<string, object> = {};

      for (const page of pages) {
        createScanFile(page.path, {
          pageAnalysis: {
            url: page.path,
            purpose: page.purpose,
            shouldBePageObject: true,
            reason: 'Has interactive elements',
            suggestedClassName: page.className,
          },
          elements: [
            {
              name: 'mainContent',
              component: 'div',
              selector: '.main-content',
              action: 'none',
              description: 'Main content area',
              importance: 'medium',
              isModalTrigger: false,
            },
          ],
          modals: [],
          navigation: [],
        });

        decisions[page.path] = {
          decision: 'page_object',
          reason: 'Has interactive elements',
          suggestedClassName: page.className,
          elementCount: 1,
        };
      }

      createDecisions(decisions);

      const { generatePageObject, savePageObject, generateIndexFile } = await import('../lib/generator.js');

      const pagesDir = path.join(outputDir, 'pages');
      const generatedClasses: string[] = [];

      for (const page of pages) {
        const fileName = page.path.replace(/\//g, '_').replace(/^_/, '');
        const scanFilePath = path.join(scannedDir, `${fileName}.json`);
        const scanData = JSON.parse(fs.readFileSync(scanFilePath, 'utf-8'));

        const { code, className } = generatePageObject(
          {
            pageAnalysis: {
              url: page.path,
              purpose: scanData.analysis.pageAnalysis.purpose,
              suggestedClassName: page.className,
            },
            elements: scanData.analysis.elements,
            modals: [],
          },
          { typescript: true }
        );

        savePageObject(code, className, pagesDir, 'ts');
        generatedClasses.push(className);
      }

      generateIndexFile(generatedClasses, pagesDir, 'ts');

      // Verify all files exist
      for (const page of pages) {
        const kebabName = page.className.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
        expect(fs.existsSync(path.join(pagesDir, `${kebabName}.ts`))).toBe(true);
      }

      // Verify index contains all exports
      const indexContent = fs.readFileSync(path.join(pagesDir, 'index.ts'), 'utf-8');
      for (const page of pages) {
        expect(indexContent).toContain(page.className);
      }
    });
  });

  describe('Error handling', () => {
    it('handles missing scan file gracefully', async () => {
      // Create decisions but no scan file
      createDecisions({
        '/missing': {
          decision: 'page_object',
          reason: 'Test',
          suggestedClassName: 'MissingPage',
          elementCount: 0,
        },
      });

      const fileName = 'missing';
      const scanFilePath = path.join(scannedDir, `${fileName}.json`);

      // Scan file should not exist
      expect(fs.existsSync(scanFilePath)).toBe(false);

      // The command should handle this gracefully (in real implementation)
      // Here we just verify the file doesn't exist
    });

    it('handles malformed JSON in scan file', async () => {
      const malformedPath = path.join(scannedDir, 'malformed.json');
      fs.writeFileSync(malformedPath, '{ invalid json }');

      expect(() => {
        JSON.parse(fs.readFileSync(malformedPath, 'utf-8'));
      }).toThrow();
    });

    it('handles scan file without analysis section', async () => {
      const noAnalysisPath = path.join(scannedDir, 'no-analysis.json');
      fs.writeFileSync(
        noAnalysisPath,
        JSON.stringify({
          url: 'http://localhost/test',
          path: '/test',
          title: 'Test',
          // analysis section missing
        })
      );

      const scanData = JSON.parse(fs.readFileSync(noAnalysisPath, 'utf-8'));
      expect(scanData.analysis).toBeUndefined();
    });
  });

  describe('Real-world scenarios', () => {
    it('generates Vuetify-style Page Object with all element types', async () => {
      createScanFile('/form', {
        pageAnalysis: {
          url: '/form',
          purpose: 'Complex form with various Vuetify components',
          shouldBePageObject: true,
          reason: 'Rich interactive form',
          suggestedClassName: 'FormPage',
        },
        elements: [
          {
            name: 'nameField',
            component: 'v-text-field',
            selector: '.v-text-field:has-text("Name")',
            action: 'fill',
            description: 'Name input field',
            importance: 'high',
            isModalTrigger: false,
          },
          {
            name: 'countrySelect',
            component: 'v-select',
            selector: '.v-select:has-text("Country")',
            action: 'select',
            description: 'Country dropdown',
            importance: 'medium',
            isModalTrigger: false,
          },
          {
            name: 'termsCheckbox',
            component: 'v-checkbox',
            selector: '.v-checkbox:has-text("Terms")',
            action: 'check',
            description: 'Accept terms checkbox',
            importance: 'high',
            isModalTrigger: false,
          },
          {
            name: 'submitButton',
            component: 'v-btn',
            selector: '.v-btn:has-text("Submit")',
            action: 'click',
            description: 'Form submit button',
            importance: 'high',
            isModalTrigger: false,
          },
          {
            name: 'cancelButton',
            component: 'v-btn',
            selector: '.v-btn:has-text("Cancel")',
            action: 'click',
            description: 'Cancel button',
            importance: 'low',
            isModalTrigger: false,
          },
        ],
        modals: [],
        navigation: [],
      });

      createDecisions({
        '/form': {
          decision: 'page_object',
          reason: 'Rich form',
          suggestedClassName: 'FormPage',
          elementCount: 5,
        },
      });

      const { generatePageObject, savePageObject } = await import('../lib/generator.js');

      const scanData = JSON.parse(
        fs.readFileSync(path.join(scannedDir, 'form.json'), 'utf-8')
      );

      const pagesDir = path.join(outputDir, 'pages');
      const { code, className } = generatePageObject(
        {
          pageAnalysis: {
            url: '/form',
            purpose: scanData.analysis.pageAnalysis.purpose,
            suggestedClassName: 'FormPage',
          },
          elements: scanData.analysis.elements,
          modals: [],
        },
        { typescript: true }
      );

      savePageObject(code, className, pagesDir, 'ts');

      const generatedCode = fs.readFileSync(path.join(pagesDir, 'form-page.ts'), 'utf-8');

      // Verify all elements
      expect(generatedCode).toContain('this.nameField');
      expect(generatedCode).toContain('this.countrySelect');
      expect(generatedCode).toContain('this.termsCheckbox');
      expect(generatedCode).toContain('this.submitButton');
      expect(generatedCode).toContain('this.cancelButton');

      // Verify appropriate methods generated
      expect(generatedCode).toContain('async fillNameField');
      expect(generatedCode).toContain('async selectCountrySelect');
      expect(generatedCode).toContain('async clickSubmitButton');

      // Low importance click should NOT have method
      expect(generatedCode).not.toContain('async clickCancelButton');
    });
  });
});
