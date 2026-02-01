import path from 'path';
import ora from 'ora';
import { FILES, ERRORS, SUCCESS } from '../constants.js';
import { log } from '../lib/logger.js';
import { generatePageObject, savePageObject, generateIndexFile } from '../lib/generator.js';
import { loadDecisions, getPageObjectPaths, loadScanResult } from '../lib/data-loader.js';
import type { Config, GenerateOptions, Decisions, ScanResult } from '../types.js';

interface GeneratedFile {
  className: string;
  filePath: string;
  pagePath: string;
}

/**
 * Generation context - groups related parameters for cleaner function signatures
 */
interface GenerateContext {
  config: Config;
  decisions: Decisions;
  outputDir: string;
  ext: string;
  spinner: ReturnType<typeof ora>;
}

export async function generateCommand(config: Config, options: GenerateOptions): Promise<void> {
  log.info('\n📝 Generating Page Objects...\n');

  const outputDir = options.output || path.join(config.output.dir, FILES.PAGES_DIR);
  const typescript = options.typescript || false;
  const ext = typescript ? 'ts' : 'js';

  const decisions = loadDecisions(config);
  const pagesToGenerate = getPageObjectPaths(decisions);

  if (pagesToGenerate.length === 0) {
    log.warn(ERRORS.NO_PAGES_TO_GENERATE);
    return;
  }

  log.dim(`Generating ${pagesToGenerate.length} Page Objects...\n`);

  const spinner = ora('Generating...').start();
  const context: GenerateContext = { config, decisions, outputDir, ext, spinner };

  const generated = await generateAllPageObjects(context, pagesToGenerate);

  if (generated.length > 0) {
    await generateIndex(context, generated);
  }

  printSummary(generated, outputDir);
}

async function generateAllPageObjects(
  context: GenerateContext,
  pagePaths: string[]
): Promise<GeneratedFile[]> {
  const generated: GeneratedFile[] = [];

  for (const pagePath of pagePaths) {
    const result = await generateSinglePageObject(context, pagePath);
    if (result) {
      generated.push(result);
    }
  }

  return generated;
}

async function generateSinglePageObject(
  context: GenerateContext,
  pagePath: string
): Promise<GeneratedFile | null> {
  const { config, decisions, outputDir, ext, spinner } = context;

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

  spinner.text = `Generating: ${pagePath}`;

  try {
    const pageData = buildPageData(pagePath, analysis, decisions);
    const { code, className } = generatePageObject(pageData, { typescript: ext === 'ts' });
    const filePath = savePageObject(code, className, outputDir, ext);

    spinner.succeed(`${className} → ${path.basename(filePath)}`);

    return { className, filePath, pagePath };
  } catch (error) {
    spinner.warn(`Error generating ${pagePath}: ${(error as Error).message}`);
    return null;
  }
}

function buildPageData(pagePath: string, analysis: ScanResult, decisions: Decisions) {
  return {
    pageAnalysis: {
      url: pagePath,
      purpose: analysis.pageAnalysis?.purpose || '',
      suggestedClassName:
        decisions[pagePath]?.suggestedClassName ||
        analysis.pageAnalysis?.suggestedClassName,
    },
    elements: analysis.elements || [],
    modals: analysis.modals || [],
  };
}

async function generateIndex(
  context: GenerateContext,
  generated: GeneratedFile[]
): Promise<void> {
  const { outputDir, ext, spinner } = context;

  spinner.start('Generating index file...');
  const classNames = generated.map((g) => g.className);
  const indexPath = generateIndexFile(classNames, outputDir, ext);
  spinner.succeed(`Index → ${path.basename(indexPath)}`);
}

function printSummary(generated: GeneratedFile[], outputDir: string): void {
  log.success(SUCCESS.GENERATE_COMPLETE(generated.length));
  log.dim(`Output: ${outputDir}/`);

  log.info('\n📁 Files:');
  for (const g of generated) {
    log.dim(`   ${g.className} (${g.pagePath})`);
  }

  printUsageExample(generated);
}

function printUsageExample(generated: GeneratedFile[]): void {
  if (generated.length === 0) return;

  const example = generated[0];
  const varName = example.className.replace('Page', '').toLowerCase();

  log.info('\n💡 Usage example:\n');
  log.dim(`   import { ${example.className} } from './pages';`);
  log.dim('');
  log.dim(`   test('example', async ({ page }) => {`);
  log.dim(`     const ${varName} = new ${example.className}(page);`);
  log.dim(`     await ${varName}.goto();`);
  log.dim('   });');
}
