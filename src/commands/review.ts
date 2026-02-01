import fs from 'fs';
import path from 'path';
import readline from 'readline';
import chalk from 'chalk';
import { config } from '../config.js';
import type { Decisions } from '../types.js';

export async function reviewCommand(): Promise<void> {
  console.log(chalk.blue('\n🔍 Interaktivní review rozhodnutí...\n'));

  const decisionsPath = path.join(config.output.dir, 'decisions.json');

  if (!fs.existsSync(decisionsPath)) {
    console.error(chalk.red('Decisions neexistují. Nejdřív spusť "po-gen scan".'));
    process.exit(1);
  }

  const decisions: Decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf-8'));

  // Najdi stránky k rozhodnutí
  const toReview = Object.entries(decisions)
    .filter(([, d]) => d.decision === 'ask_user');

  if (toReview.length === 0) {
    console.log(chalk.green('Žádné stránky k manuálnímu rozhodnutí.'));
    console.log(chalk.gray('\nAktuální stav:'));

    const pageObjects = Object.entries(decisions).filter(([, d]) => d.decision === 'page_object');
    const skipped = Object.entries(decisions).filter(([, d]) => d.decision === 'skip');

    console.log(chalk.green(`   ✅ Page Objects: ${pageObjects.length}`));
    console.log(chalk.gray(`   ⏭️  Přeskočeno: ${skipped.length}`));

    console.log(chalk.yellow('\n💡 Tip: Spusť "po-gen generate" pro vytvoření Page Objects.'));
    return;
  }

  console.log(chalk.yellow(`Nalezeno ${toReview.length} stránek k rozhodnutí.\n`));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => new Promise((resolve) => rl.question(prompt, resolve));

  let modified = false;

  for (const [pagePath, decision] of toReview) {
    console.log(chalk.blue('─'.repeat(60)));
    console.log(chalk.white(`\n📄 ${pagePath}\n`));
    console.log(chalk.gray(`   Důvod: ${decision.reason}`));
    console.log(chalk.gray(`   Elementy: ${decision.elementCount}`));
    console.log(chalk.gray(`   Navrhovaný název: ${decision.suggestedClassName}`));
    console.log();

    const answer = await question(
      chalk.yellow('   [p] Page Object  [s] Skip  [Enter] Přeskočit  [q] Konec: ')
    );

    if (answer.toLowerCase() === 'q') {
      break;
    }

    if (answer.toLowerCase() === 'p') {
      decisions[pagePath].decision = 'page_object';
      console.log(chalk.green('   → Označeno jako Page Object'));
      modified = true;
    } else if (answer.toLowerCase() === 's') {
      decisions[pagePath].decision = 'skip';
      console.log(chalk.gray('   → Přeskočeno'));
      modified = true;
    }

    console.log();
  }

  rl.close();

  // Ulož změny
  if (modified) {
    fs.writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2));
    console.log(chalk.green('\n✅ Změny uloženy.'));
  }

  // Souhrn
  const pageObjects = Object.entries(decisions).filter(([, d]) => d.decision === 'page_object');
  const skipped = Object.entries(decisions).filter(([, d]) => d.decision === 'skip');
  const remaining = Object.entries(decisions).filter(([, d]) => d.decision === 'ask_user');

  console.log(chalk.blue('\n📊 Aktuální stav:'));
  console.log(chalk.green(`   ✅ Page Objects: ${pageObjects.length}`));
  console.log(chalk.gray(`   ⏭️  Přeskočeno: ${skipped.length}`));
  console.log(chalk.yellow(`   ❓ Zbývá: ${remaining.length}`));

  if (remaining.length === 0 && pageObjects.length > 0) {
    console.log(chalk.yellow('\n💡 Tip: Spusť "po-gen generate" pro vytvoření Page Objects.'));
  }
}
