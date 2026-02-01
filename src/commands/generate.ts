import fs from 'fs';
import path from 'path';
import ora from 'ora';
import { config } from '../config.js';
import { FILES, ERRORS, SUCCESS } from '../constants.js';
import { log } from '../lib/logger.js';
import { generatePageObject, savePageObject, generateIndexFile } from '../lib/generator.js';
import { pathToFileName } from '../lib/utils.js';
import { AppError } from '../types.js';
import type { GenerateOptions, Decisions, ScanResult } from '../types.js';

interface GeneratedFile {
  className: string;
  filePath: string;
  pagePath: string;
}

export async function generateCommand(options: GenerateOptions): Promise<void> {
  log.info('\n📝 Generating Page Objects...\n');

  const outputDir = options.output || path.join(config.output.dir, FILES.PAGES_DIR);
  const typescript = options.typescript || false;
  const ext = typescript ? 'ts' : 'js';

  const decisions = loadDecisions();
  const pagesToGenerate = getPageObjectPaths(decisions);

  if (pagesToGenerate.length === 0) {
    log.warn(ERRORS.NO_PAGES_TO_GENERATE);
    return;
  }

  log.dim(`Generating ${pagesToGenerate.length} Page Objects...\n`);

  const spinner = ora('Generating...').start();
  const generated = await generateAllPageObjects(pagesToGenerate, decisions, outputDir, ext, spinner);

  if (generated.length > 0) {
    await generateIndex(generated, outputDir, ext, spinner);
  }

  printSummary(generated, outputDir);
}

function loadDecisions(): Decisions {
  const decisionsPath = path.join(config.output.dir, FILES.DECISIONS);

  if (!fs.existsSync(decisionsPath)) {
    throw new AppError(ERRORS.DECISIONS_NOT_FOUND, 'DECISIONS_NOT_FOUND');
  }

  return JSON.parse(fs.readFileSync(decisionsPath, 'utf-8'));
}

function getPageObjectPaths(decisions: Decisions): string[] {
  return Object.entries(decisions)
    .filter(([, d]) => d.decision === 'page_object')
    .map(([pagePath]) => pagePath);
}

async function generateAllPageObjects(
  pagePaths: string[],
  decisions: Decisions,
  outputDir: string,
  ext: string,
  spinner: ReturnType<typeof ora>
): Promise<GeneratedFile[]> {
  const generated: GeneratedFile[] = [];
  const scannedDir = path.join(config.output.dir, FILES.SCANNED_DIR);

  for (const pagePath of pagePaths) {
    const result = await generateSinglePageObject(pagePath, decisions, scannedDir, outputDir, ext, spinner);
    if (result) {
      generated.push(result);
    }
  }

  return generated;
}

async function generateSinglePageObject(
  pagePath: string,
  decisions: Decisions,
  scannedDir: string,
  outputDir: string,
  ext: string,
  spinner: ReturnType<typeof ora>
): Promise<GeneratedFile | null> {
  const fileName = pathToFileName(pagePath);
  const scanFile = path.join(scannedDir, `${fileName}.json`);

  if (!fs.existsSync(scanFile)) {
    spinner.warn(ERRORS.SCAN_NOT_FOUND(pagePath));
    return null;
  }

  const scanData = JSON.parse(fs.readFileSync(scanFile, 'utf-8'));

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
  generated: GeneratedFile[],
  outputDir: string,
  ext: string,
  spinner: ReturnType<typeof ora>
): Promise<void> {
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
