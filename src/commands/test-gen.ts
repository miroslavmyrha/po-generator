import path from 'path';
import ora, { Ora } from 'ora';
import { FILES, ERRORS, SUCCESS } from '../constants.js';
import { log } from '../lib/logger.js';
import { generateTestScenarios } from '../lib/ai-client.js';
import { generateTestFile, saveTestFile } from '../lib/test-generator.js';
import { loadDecisions, getPageObjectPaths, loadScanResult } from '../lib/data-loader.js';
import { validateOutputPath, getErrorMessage, camelToKebab } from '../lib/utils.js';
import type { Config, TestGenOptions, Decisions, ScanResult } from '../types.js';

interface GeneratedTest {
  suiteName: string;
  filePath: string;
  pagePath: string;
}

/**
 * Test generation context - groups related parameters
 */
interface TestGenContext {
  config: Config;
  decisions: Decisions;
  outputDir: string;
  pagesDir: string;
  retries: number;
  spinner: Ora;
}

export async function testGenCommand(config: Config, options: TestGenOptions): Promise<void> {
  log.info('\n🧪 Generating Tests...\n');

  const outputDir = options.output
    ? validateOutputPath(options.output)
    : path.join(config.output.dir, FILES.TESTS_DIR);
  const pagesDir = path.join(config.output.dir, FILES.PAGES_DIR);
  const retries = parseInt(options.retry || '3', 10) || 3;

  const decisions = loadDecisions(config);
  const pagesToGenerate = getPageObjectPaths(decisions);

  if (pagesToGenerate.length === 0) {
    log.warn(ERRORS.NO_PAGE_OBJECTS);
    return;
  }

  log.dim(`Generating tests for ${pagesToGenerate.length} pages...\n`);

  const spinner = ora('Generating tests...').start();
  const context: TestGenContext = { config, decisions, outputDir, pagesDir, retries, spinner };

  try {
    const generated = await generateAllTests(context, pagesToGenerate);
    printSummary(generated, outputDir);
  } finally {
    spinner.stop();
  }
}

async function generateAllTests(
  context: TestGenContext,
  pagePaths: string[]
): Promise<GeneratedTest[]> {
  const generated: GeneratedTest[] = [];

  for (const pagePath of pagePaths) {
    const result = await generateSingleTest(context, pagePath);
    if (result) {
      generated.push(result);
    }
  }

  return generated;
}

async function generateSingleTest(
  context: TestGenContext,
  pagePath: string
): Promise<GeneratedTest | null> {
  const { config, decisions, outputDir, pagesDir, retries, spinner } = context;

  const scanData = loadScanResult(config, pagePath);
  if (!scanData) {
    spinner.warn(ERRORS.SCAN_NOT_FOUND(pagePath));
    return null;
  }

  const analysis = scanData.analysis;
  if (!analysis) {
    spinner.warn(`No analysis for ${pagePath}`);
    return null;
  }

  const className = decisions[pagePath]?.suggestedClassName
    || analysis.pageAnalysis?.suggestedClassName
    || 'UnknownPage';

  spinner.text = `Generating tests: ${pagePath}`;

  try {
    const testSuite = await generateTestScenarios(
      config, analysis, className, pagePath, { retries }
    );

    if (!testSuite) {
      spinner.warn(ERRORS.TEST_GEN_FAILED(pagePath));
      return null;
    }

    const pageObjectRelativePath = computeRelativeImportPath(outputDir, pagesDir, className);
    const { code, suiteName, fileName } = generateTestFile(testSuite, pageObjectRelativePath, className);
    const filePath = saveTestFile(code, fileName, outputDir);

    spinner.succeed(`${suiteName} → ${path.basename(filePath)}`);

    return { suiteName, filePath, pagePath };
  } catch (error) {
    spinner.warn(`Error generating test for ${pagePath}: ${getErrorMessage(error)}`);
    return null;
  }
}

/**
 * Compute relative import path from test file to Page Object file
 * @param testsDir - Directory where test files are written
 * @param pagesDir - Directory where Page Object files live
 * @param className - Page Object class name (used to derive file name)
 * @returns Relative import path (e.g., '../pages/login-page')
 */
function computeRelativeImportPath(testsDir: string, pagesDir: string, className: string): string {
  const fileName = camelToKebab(className);
  const pageObjectFile = path.join(pagesDir, fileName);
  let relative = path.relative(testsDir, pageObjectFile);

  // Ensure path starts with './' or '../'
  if (!relative.startsWith('.')) {
    relative = './' + relative;
  }

  return relative;
}

function printSummary(generated: GeneratedTest[], outputDir: string): void {
  if (generated.length === 0) {
    log.warn('No test files were generated.');
    return;
  }

  log.success(SUCCESS.TEST_GEN_COMPLETE(generated.length));
  log.dim(`Output: ${outputDir}/`);

  log.info('\n📁 Test Files:');
  for (const g of generated) {
    log.dim(`   ${g.suiteName} (${g.pagePath})`);
  }

  log.info('\n💡 Run tests with:\n');
  log.dim('   npx playwright test');
}
