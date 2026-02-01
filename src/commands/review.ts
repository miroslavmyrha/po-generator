import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { config } from '../config.js';
import { FILES, ERRORS, SUCCESS, MESSAGES } from '../constants.js';
import { log } from '../lib/logger.js';
import type { Decisions } from '../types.js';

export async function reviewCommand(): Promise<void> {
  log.info('\n🔍 Interactive decision review...\n');

  const decisions = loadDecisions();
  const toReview = findPagesToReview(decisions);

  if (toReview.length === 0) {
    printNoReviewNeeded(decisions);
    return;
  }

  log.warn(MESSAGES.PAGES_TO_REVIEW(toReview.length));

  const modified = await interactiveReview(toReview, decisions);

  if (modified) {
    saveDecisions(decisions);
    log.success(SUCCESS.CHANGES_SAVED);
  }

  printSummary(decisions);
}

function loadDecisions(): Decisions {
  const decisionsPath = path.join(config.output.dir, FILES.DECISIONS);

  if (!fs.existsSync(decisionsPath)) {
    log.error(ERRORS.DECISIONS_NOT_FOUND);
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(decisionsPath, 'utf-8'));
}

function findPagesToReview(decisions: Decisions): [string, Decisions[string]][] {
  return Object.entries(decisions).filter(([, d]) => d.decision === 'ask_user');
}

function printNoReviewNeeded(decisions: Decisions): void {
  log.success(MESSAGES.NO_PAGES_TO_REVIEW);
  log.dim(`\n${MESSAGES.CURRENT_STATE}`);

  const counts = countDecisions(decisions);
  log.success(`   ${MESSAGES.PAGE_OBJECTS}: ${counts.pageObject}`);
  log.dim(`   ${MESSAGES.SKIPPED}: ${counts.skip}`);

  log.warn('\n💡 Tip: Run "po-gen generate" to create Page Objects.');
}

async function interactiveReview(
  toReview: [string, Decisions[string]][],
  decisions: Decisions
): Promise<boolean> {
  const rl = createReadlineInterface();
  const question = createQuestionFn(rl);

  let modified = false;

  for (const [pagePath, decision] of toReview) {
    printPageInfo(pagePath, decision);

    const answer = await question(`   ${MESSAGES.REVIEW_PROMPT}`);

    if (answer.toLowerCase() === 'q') {
      break;
    }

    if (answer.toLowerCase() === 'p') {
      decisions[pagePath].decision = 'page_object';
      log.success(`   → ${MESSAGES.MARKED_AS_PAGE_OBJECT}`);
      modified = true;
    } else if (answer.toLowerCase() === 's') {
      decisions[pagePath].decision = 'skip';
      log.dim(`   → ${MESSAGES.MARKED_AS_SKIP}`);
      modified = true;
    }

    console.log();
  }

  rl.close();
  return modified;
}

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function createQuestionFn(rl: readline.Interface): (prompt: string) => Promise<string> {
  return (prompt: string) => new Promise((resolve) => rl.question(prompt, resolve));
}

function printPageInfo(pagePath: string, decision: Decisions[string]): void {
  console.log('─'.repeat(60));
  log.info(`\n📄 ${pagePath}\n`);
  log.dim(`   ${MESSAGES.REASON}: ${decision.reason}`);
  log.dim(`   ${MESSAGES.ELEMENTS}: ${decision.elementCount}`);
  log.dim(`   ${MESSAGES.SUGGESTED_NAME}: ${decision.suggestedClassName}`);
  console.log();
}

function saveDecisions(decisions: Decisions): void {
  const decisionsPath = path.join(config.output.dir, FILES.DECISIONS);
  fs.writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2));
}

function printSummary(decisions: Decisions): void {
  const counts = countDecisions(decisions);

  log.info(`\n📊 ${MESSAGES.CURRENT_STATE}`);
  log.success(`   ${MESSAGES.PAGE_OBJECTS}: ${counts.pageObject}`);
  log.dim(`   ${MESSAGES.SKIPPED}: ${counts.skip}`);
  log.warn(`   ${MESSAGES.REMAINING}: ${counts.askUser}`);

  if (counts.askUser === 0 && counts.pageObject > 0) {
    log.warn('\n💡 Tip: Run "po-gen generate" to create Page Objects.');
  }
}

function countDecisions(decisions: Decisions) {
  const values = Object.values(decisions);
  return {
    pageObject: values.filter((d) => d.decision === 'page_object').length,
    skip: values.filter((d) => d.decision === 'skip').length,
    askUser: values.filter((d) => d.decision === 'ask_user').length,
  };
}
