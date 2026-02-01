import readline from 'readline';

/**
 * Shared utility functions
 */

/**
 * Convert URL path to safe filename
 * Example: '/users/settings' → 'users_settings'
 */
export function pathToFileName(urlPath: string): string {
  return urlPath.replace(/\//g, '_').replace(/^_/, '') || 'home';
}

/**
 * Create readline interface for interactive prompts
 */
export function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Create a promisified question function from readline interface
 * @param rl - readline interface
 * @param showDefault - whether to show default value in prompt
 */
export function createQuestionFn(
  rl: readline.Interface,
  showDefault = false
): (prompt: string, defaultValue?: string) => Promise<string> {
  return (prompt: string, defaultValue = ''): Promise<string> =>
    new Promise((resolve) => {
      const displayPrompt = showDefault && defaultValue
        ? `${prompt} (${defaultValue}): `
        : `${prompt}: `;
      rl.question(displayPrompt, (answer) => resolve(answer || defaultValue));
    });
}

/**
 * Capitalize first letter of string
 * Example: 'hello' → 'Hello'
 */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert PascalCase to kebab-case
 * Example: 'UserSettingsPage' → 'user-settings-page'
 */
export function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Escape single quotes in selector strings
 * Example: "[data-id='test']" → "[data-id=\'test\']"
 */
export function escapeSelector(selector: string): string {
  return selector.replace(/'/g, "\\'");
}

/**
 * Truncate string to max length with ellipsis
 */
export function truncate(str: string, length: number): string {
  if (!str) return '-';
  return str.length > length ? str.substring(0, length) + '...' : str;
}
