import fs from 'fs';
import path from 'path';
import { sanitizeJsIdentifier, camelToKebab, writeFileAtomic } from './utils.js';
import type { GeneratedTestFile, TestSuite, TestCase, TestStep, TestAssertion } from '../types.js';

/**
 * Generate a Playwright test file from validated test suite data
 * @param testSuite - Validated test suite from AI
 * @param pageObjectRelativePath - Relative import path to the Page Object file
 * @param pageObjectClassName - Class name of the Page Object
 * @returns Generated test file with code, suite name, and file name
 */
export function generateTestFile(
  testSuite: TestSuite,
  pageObjectRelativePath: string,
  pageObjectClassName: string
): GeneratedTestFile {
  const suiteName = testSuite.suiteName;
  const fileName = `${camelToKebab(pageObjectClassName.replace(/Page$/, ''))}.spec.ts`;
  const code = buildTestFileCode(testSuite, pageObjectRelativePath, pageObjectClassName);

  return { code, suiteName, fileName };
}

/**
 * Save test file to disk with atomic write
 * @param code - Generated test code
 * @param fileName - File name for the test
 * @param outputDir - Directory to write to
 * @returns Full path to the saved file
 */
export function saveTestFile(code: string, fileName: string, outputDir: string): string {
  const filePath = path.join(outputDir, fileName);
  fs.mkdirSync(outputDir, { recursive: true });
  writeFileAtomic(filePath, code);
  return filePath;
}

function buildTestFileCode(
  testSuite: TestSuite,
  pageObjectRelativePath: string,
  pageObjectClassName: string
): string {
  const lines: string[] = [];

  // Imports
  lines.push("import { test, expect } from '@playwright/test';");
  lines.push(`import { ${pageObjectClassName} } from '${escapeStringValue(pageObjectRelativePath)}';`);
  lines.push('');

  // Test suite
  const suiteName = escapeStringValue(testSuite.suiteName);
  lines.push(`test.describe('${suiteName}', () => {`);

  for (const testCase of testSuite.testCases) {
    lines.push('');
    lines.push(generateSingleTest(testCase, pageObjectClassName));
  }

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

function generateSingleTest(testCase: TestCase, pageObjectClassName: string): string {
  const lines: string[] = [];
  const testName = escapeStringValue(testCase.name);
  const varName = pageObjectClassName.charAt(0).toLowerCase() + pageObjectClassName.slice(1);
  const safeVarName = sanitizeJsIdentifier(varName);

  lines.push(`  test('${testName}', async ({ page }) => {`);
  lines.push(`    const ${safeVarName} = new ${pageObjectClassName}(page);`);

  // Steps
  for (const step of testCase.steps) {
    lines.push(generateStep(step, safeVarName));
  }

  // Assertions
  for (const assertion of testCase.assertions) {
    lines.push(generateAssertion(assertion, safeVarName));
  }

  lines.push('  });');

  return lines.join('\n');
}

function generateStep(step: TestStep, varName: string): string {
  const safeMethod = sanitizeJsIdentifier(step.method);
  const args = step.args.map(a => `'${escapeStringValue(a)}'`).join(', ');
  return `    await ${varName}.${safeMethod}(${args});`;
}

function generateAssertion(assertion: TestAssertion, varName: string): string {
  const value = assertion.value ? escapeStringValue(assertion.value) : '';
  const selector = assertion.selector ? escapeStringValue(assertion.selector) : '';

  switch (assertion.type) {
    case 'url':
      return `    await expect(page).toHaveURL(/${value}/);`;
    case 'visible':
      return `    await expect(page.locator('${selector}')).toBeVisible();`;
    case 'hidden':
      return `    await expect(page.locator('${selector}')).toBeHidden();`;
    case 'text':
      return `    await expect(page.locator('${selector}')).toContainText('${value}');`;
    case 'count': {
      const count = parseInt(value, 10) || 0;
      return `    await expect(page.locator('${selector}')).toHaveCount(${count});`;
    }
    case 'enabled':
      return `    await expect(page.locator('${selector}')).toBeEnabled();`;
    case 'disabled':
      return `    await expect(page.locator('${selector}')).toBeDisabled();`;
    default:
      return `    // Unknown assertion type: ${assertion.type}`;
  }
}

/**
 * Escape string for safe embedding in generated code
 * Handles single quotes, backslashes, backticks, and template expressions
 */
function escapeStringValue(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}
