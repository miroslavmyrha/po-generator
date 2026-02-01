import { describe, it, expect } from 'vitest';
import {
  pathToFileName,
  capitalize,
  camelToKebab,
  escapeSelector,
  truncate,
  createReadlineInterface,
  createQuestionFn,
} from './utils.js';

/**
 * Tests for shared utility functions
 *
 * WHY these tests matter:
 * - pathToFileName is used for generating unique filenames from URLs
 * - capitalize/camelToKebab are used in code generation
 * - escapeSelector prevents code injection in generated selectors
 * - truncate is used for display formatting
 */

describe('pathToFileName', () => {
  it('converts path to filename by replacing slashes with underscores', () => {
    expect(pathToFileName('/users/settings')).toBe('users_settings');
  });

  it('removes leading underscore after conversion', () => {
    expect(pathToFileName('/dashboard')).toBe('dashboard');
  });

  it('returns "home" for root path', () => {
    expect(pathToFileName('/')).toBe('home');
  });

  it('returns "home" for empty string', () => {
    expect(pathToFileName('')).toBe('home');
  });

  it('handles multiple slashes', () => {
    expect(pathToFileName('/a/b/c/d')).toBe('a_b_c_d');
  });
});

describe('capitalize', () => {
  it('capitalizes first letter of string', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('returns empty string for empty input', () => {
    expect(capitalize('')).toBe('');
  });

  it('handles single character', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('keeps rest of string unchanged', () => {
    expect(capitalize('helloWorld')).toBe('HelloWorld');
  });

  it('handles already capitalized string', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });
});

describe('camelToKebab', () => {
  it('converts PascalCase to kebab-case', () => {
    expect(camelToKebab('UserSettingsPage')).toBe('user-settings-page');
  });

  it('converts camelCase to kebab-case', () => {
    expect(camelToKebab('userSettings')).toBe('user-settings');
  });

  it('handles single word', () => {
    expect(camelToKebab('user')).toBe('user');
  });

  it('handles consecutive capitals', () => {
    expect(camelToKebab('APIDocsPage')).toBe('apidocs-page');
  });

  it('returns empty string for empty input', () => {
    expect(camelToKebab('')).toBe('');
  });
});

describe('escapeSelector', () => {
  it('escapes single quotes', () => {
    expect(escapeSelector("[data-id='test']")).toBe("[data-id=\\'test\\']");
  });

  it('handles multiple single quotes', () => {
    expect(escapeSelector("a'b'c")).toBe("a\\'b\\'c");
  });

  it('returns unchanged string without quotes', () => {
    expect(escapeSelector('.btn-primary')).toBe('.btn-primary');
  });

  it('handles empty string', () => {
    expect(escapeSelector('')).toBe('');
  });
});

describe('truncate', () => {
  it('truncates long strings with ellipsis', () => {
    expect(truncate('This is a very long string', 10)).toBe('This is a ...');
  });

  it('returns string unchanged if shorter than limit', () => {
    expect(truncate('Short', 10)).toBe('Short');
  });

  it('returns string unchanged if equal to limit', () => {
    expect(truncate('Exactly10!', 10)).toBe('Exactly10!');
  });

  it('returns dash for empty string', () => {
    expect(truncate('', 10)).toBe('-');
  });

  it('handles zero length limit', () => {
    expect(truncate('Test', 0)).toBe('...');
  });
});

describe('readline utilities', () => {
  it('createReadlineInterface returns interface with expected methods', () => {
    const rl = createReadlineInterface();

    expect(rl).toBeDefined();
    expect(typeof rl.question).toBe('function');
    expect(typeof rl.close).toBe('function');

    rl.close();
  });

  it('createQuestionFn returns a function', () => {
    const rl = createReadlineInterface();
    const question = createQuestionFn(rl);

    expect(typeof question).toBe('function');

    rl.close();
  });

  it('createQuestionFn with showDefault returns a function', () => {
    const rl = createReadlineInterface();
    const question = createQuestionFn(rl, true);

    expect(typeof question).toBe('function');

    rl.close();
  });
});
