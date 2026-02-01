import fs from 'fs';
import path from 'path';
import readline from 'readline';
import chalk from 'chalk';

export async function initCommand(): Promise<void> {
  console.log(chalk.blue('\n🔧 Inicializace po-generator\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string, defaultValue = ''): Promise<string> =>
    new Promise((resolve) => {
      const displayPrompt = defaultValue
        ? `${prompt} (${chalk.gray(defaultValue)}): `
        : `${prompt}: `;
      rl.question(displayPrompt, (answer) => resolve(answer || defaultValue));
    });

  console.log(chalk.gray('Odpověz na otázky pro vytvoření konfigurace.\n'));

  // Framework
  const framework = await question('Framework (vuetify/symfony/generic)', 'generic');

  // Základní URL
  const baseUrl = await question('URL aplikace', 'http://localhost:5173');

  // Auth
  const authEnabled = (await question('Potřebuje login? (y/n)', 'y')).toLowerCase() === 'y';

  let authConfig: Record<string, string> = {};
  if (authEnabled) {
    console.log(chalk.gray('\nKonfigurace loginu:'));
    authConfig = {
      loginUrl: await question('  Login URL', '/login'),
      username: await question('  Username/Email'),
      password: await question('  Password'),
      successUrl: await question('  URL po přihlášení', '/dashboard'),
    };
  }

  // AI
  console.log(chalk.gray('\nKonfigurace AI (Open WebUI):'));
  const aiUrl = await question('  API URL', 'http://localhost:3000/api/v1');
  const aiKey = await question('  API Key', 'sk-xxx');
  const aiModel = await question('  Model', 'llama3');

  // Output
  const outputDir = await question('\nVýstupní adresář', './output');

  rl.close();

  // Vytvoř .env soubor
  let envContent = `# Aplikace
PO_GEN_BASE_URL=${baseUrl}

# Framework: vuetify | symfony | generic
PO_GEN_FRAMEWORK=${framework}

# Login
PO_GEN_AUTH_ENABLED=${authEnabled}
`;

  if (authEnabled) {
    envContent += `PO_GEN_LOGIN_URL=${authConfig.loginUrl}
PO_GEN_USERNAME=${authConfig.username}
PO_GEN_PASSWORD=${authConfig.password}
PO_GEN_SUCCESS_URL=${authConfig.successUrl}
`;
  }

  envContent += `
# AI (Open WebUI)
PO_GEN_AI_URL=${aiUrl}
PO_GEN_AI_KEY=${aiKey}
PO_GEN_AI_MODEL=${aiModel}

# Output
PO_GEN_OUTPUT_DIR=${outputDir}
`;

  const envPath = path.join(process.cwd(), '.env');
  fs.writeFileSync(envPath, envContent);

  console.log(chalk.green(`\n✅ Konfigurace uložena do .env`));
  console.log(chalk.gray(`   ${envPath}\n`));

  // Vytvoř output adresář
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(chalk.blue('📁 Struktura projektu:'));
  console.log(chalk.gray(`   .env                 - konfigurace`));
  console.log(chalk.gray(`   ${outputDir}/`));
  console.log(chalk.gray(`   ├── sitemap.json     - mapa stránek`));
  console.log(chalk.gray(`   ├── scanned/         - AI analýzy`));
  console.log(chalk.gray(`   ├── decisions.json   - rozhodnutí`));
  console.log(chalk.gray(`   └── pages/           - Page Objects`));

  console.log(chalk.yellow('\n💡 Další kroky:'));
  console.log(chalk.gray('   1. Zkontroluj .env soubor'));
  console.log(chalk.gray('   2. Spusť: po-gen crawl'));
  console.log(chalk.gray('   3. Nebo rovnou: po-gen run\n'));
}
