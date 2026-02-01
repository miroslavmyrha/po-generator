import { SUCCESS, MESSAGES } from '../constants.js';
import { log } from '../lib/logger.js';
import {
  loadDecisions,
  saveDecisions,
  countDecisions,
  findPagesToReview,
} from '../lib/data-loader.js';
import { createReadlineInterface, createQuestionFn } from '../lib/utils.js';
import type { Config, Decisions } from '../types.js';

export async function reviewCommand(config: Config): Promise<void> {
  log.info('\n🔍 Interactive decision review...\n');

  const decisions = loadDecisions(config);
  const toReview = findPagesToReview(decisions);

  if (toReview.length === 0) {
    printNoReviewNeeded(decisions);
    return;
  }

  log.warn(MESSAGES.PAGES_TO_REVIEW(toReview.length));

  const modified = await interactiveReview(toReview, decisions);

  if (modified) {
    saveDecisions(config, decisions);
    log.success(SUCCESS.CHANGES_SAVED);
  }

  printSummary(decisions);
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

function printPageInfo(pagePath: string, decision: Decisions[string]): void {
  console.log('─'.repeat(60));
  log.info(`\n📄 ${pagePath}\n`);
  log.dim(`   ${MESSAGES.REASON}: ${decision.reason}`);
  log.dim(`   ${MESSAGES.ELEMENTS}: ${decision.elementCount}`);
  log.dim(`   ${MESSAGES.SUGGESTED_NAME}: ${decision.suggestedClassName}`);
  console.log();
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
