import fs from 'fs';
import path from 'path';
import { SUCCESS } from '../constants.js';
import { log } from '../lib/logger.js';
import { createReadlineInterface, createQuestionFn } from '../lib/utils.js';

interface InitConfig {
  framework: string;
  baseUrl: string;
  auth: AuthConfig | null;
  ai: AiConfig;
  outputDir: string;
}

interface AuthConfig {
  loginUrl: string;
  username: string;
  password: string;
  successUrl: string;
}

interface AiConfig {
  url: string;
  key: string;
  model: string;
}

export async function initCommand(): Promise<void> {
  log.info('\n🔧 Initializing po-generator\n');

  const rl = createReadlineInterface();
  const question = createQuestionFn(rl, true); // Show default values in prompts

  log.dim('Answer the questions to create configuration.\n');

  const config = await collectConfiguration(question);
  rl.close();

  saveEnvFile(config);
  createOutputDirectory(config.outputDir);
  printProjectStructure(config.outputDir);
  printNextSteps();
}

async function collectConfiguration(
  question: (prompt: string, defaultValue?: string) => Promise<string>
): Promise<InitConfig> {
  const framework = await question('Framework (vuetify/symfony/generic)', 'generic');
  const baseUrl = await question('Application URL', 'http://localhost:5173');
  const auth = await collectAuthConfig(question);

  log.dim('\nAI configuration (Open WebUI):');
  const ai = await collectAiConfig(question);

  const outputDir = await question('\nOutput directory', './output');

  return { framework, baseUrl, auth, ai, outputDir };
}

async function collectAuthConfig(
  question: (prompt: string, defaultValue?: string) => Promise<string>
): Promise<AuthConfig | null> {
  const authEnabled = (await question('Requires login? (y/n)', 'y')).toLowerCase() === 'y';

  if (!authEnabled) return null;

  log.dim('\nLogin configuration:');
  return {
    loginUrl: await question('  Login URL', '/login'),
    username: await question('  Username/Email'),
    password: await question('  Password'),
    successUrl: await question('  URL after login', '/dashboard'),
  };
}

async function collectAiConfig(
  question: (prompt: string, defaultValue?: string) => Promise<string>
): Promise<AiConfig> {
  return {
    url: await question('  API URL', 'http://localhost:3000/api/v1'),
    key: await question('  API Key', 'sk-xxx'),
    model: await question('  Model', 'llama3'),
  };
}

function saveEnvFile(config: InitConfig): void {
  const envContent = buildEnvContent(config);
  const envPath = path.join(process.cwd(), '.env');

  fs.writeFileSync(envPath, envContent);

  log.success(SUCCESS.CONFIG_SAVED);
  log.dim(`   ${envPath}\n`);
}

function buildEnvContent(config: InitConfig): string {
  let content = `# Application
PO_GEN_BASE_URL=${config.baseUrl}

# Framework: vuetify | symfony | generic
PO_GEN_FRAMEWORK=${config.framework}

# Login
PO_GEN_AUTH_ENABLED=${config.auth !== null}
`;

  if (config.auth) {
    content += `PO_GEN_LOGIN_URL=${config.auth.loginUrl}
PO_GEN_USERNAME=${config.auth.username}
PO_GEN_PASSWORD=${config.auth.password}
PO_GEN_SUCCESS_URL=${config.auth.successUrl}
`;
  }

  content += `
# AI (Open WebUI)
PO_GEN_AI_URL=${config.ai.url}
PO_GEN_AI_KEY=${config.ai.key}
PO_GEN_AI_MODEL=${config.ai.model}

# Output
PO_GEN_OUTPUT_DIR=${config.outputDir}
`;

  return content;
}

function createOutputDirectory(outputDir: string): void {
  fs.mkdirSync(outputDir, { recursive: true });
}

function printProjectStructure(outputDir: string): void {
  log.info('📁 Project structure:');
  log.dim('   .env                 - configuration');
  log.dim(`   ${outputDir}/`);
  log.dim('   ├── sitemap.json     - page map');
  log.dim('   ├── scanned/         - AI analysis');
  log.dim('   ├── decisions.json   - decisions');
  log.dim('   └── pages/           - Page Objects');
}

function printNextSteps(): void {
  log.warn('\n💡 Next steps:');
  log.dim('   1. Check .env file');
  log.dim('   2. Run: po-gen crawl');
  log.dim('   3. Or directly: po-gen run\n');
}
