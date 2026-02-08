import { describe, it, expect } from 'vitest';
import {
  pathToFileName,
  capitalize,
  camelToKebab,
  escapeStringForCodeGen,
  sanitizeJsIdentifier,
  isValidJsIdentifier,
  getErrorMessage,
  validateOutputPath,
  truncate,
  createReadlineInterface,
  createQuestionFn,
  parseRetryCount,
  safeJsonParse,
  withRetry,
  escapeJsDocComment,
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

describe('escapeStringForCodeGen (selector escaping)', () => {
  it('escapes single quotes', () => {
    expect(escapeStringForCodeGen("[data-id='test']")).toBe("[data-id=\\'test\\']");
  });

  it('handles multiple single quotes', () => {
    expect(escapeStringForCodeGen("a'b'c")).toBe("a\\'b\\'c");
  });

  it('returns unchanged string without quotes', () => {
    expect(escapeStringForCodeGen('.btn-primary')).toBe('.btn-primary');
  });

  it('handles empty string', () => {
    expect(escapeStringForCodeGen('')).toBe('');
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

describe('escapeStringForCodeGen', () => {
  it('escapes single quotes', () => {
    expect(escapeStringForCodeGen("it's")).toBe("it\\'s");
  });

  it('escapes backslashes', () => {
    expect(escapeStringForCodeGen('path\\to')).toBe('path\\\\to');
  });

  it('escapes backticks', () => {
    expect(escapeStringForCodeGen('`template`')).toBe('\\`template\\`');
  });

  it('escapes template expressions', () => {
    expect(escapeStringForCodeGen('${inject}')).toBe('\\${inject}');
  });

  it('escapes newlines', () => {
    expect(escapeStringForCodeGen('line1\nline2')).toBe('line1\\nline2');
  });

  it('escapes carriage returns', () => {
    expect(escapeStringForCodeGen('line1\rline2')).toBe('line1\\rline2');
  });

  it('returns empty string for empty input', () => {
    expect(escapeStringForCodeGen('')).toBe('');
  });

  it('handles combined escape scenarios', () => {
    const input = "val'ue\nwith\\all`${chars}";
    const result = escapeStringForCodeGen(input);
    expect(result).toBe("val\\'ue\\nwith\\\\all\\`\\${chars}");
  });
});

describe('sanitizeJsIdentifier', () => {
  it('returns valid identifier unchanged', () => {
    expect(sanitizeJsIdentifier('validName')).toBe('validName');
  });

  it('strips non-alphanumeric characters', () => {
    expect(sanitizeJsIdentifier('alert("xss")')).toBe('alertxss');
  });

  it('prefixes identifiers starting with a number', () => {
    expect(sanitizeJsIdentifier('123abc')).toBe('_123abc');
  });

  it('returns "element" for empty string', () => {
    expect(sanitizeJsIdentifier('')).toBe('element');
  });

  it('returns "element" for all-invalid characters', () => {
    expect(sanitizeJsIdentifier('!@#%^&*()')).toBe('element');
  });

  it('preserves $ and _ characters', () => {
    expect(sanitizeJsIdentifier('$elem_1')).toBe('$elem_1');
  });
});

describe('isValidJsIdentifier', () => {
  it('accepts valid identifiers', () => {
    expect(isValidJsIdentifier('myVar')).toBe(true);
    expect(isValidJsIdentifier('_private')).toBe(true);
    expect(isValidJsIdentifier('$element')).toBe(true);
  });

  it('rejects invalid identifiers', () => {
    expect(isValidJsIdentifier('123abc')).toBe(false);
    expect(isValidJsIdentifier('has space')).toBe(false);
    expect(isValidJsIdentifier('has-dash')).toBe(false);
    expect(isValidJsIdentifier('')).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('test'))).toBe('test');
  });

  it('returns string errors as-is', () => {
    expect(getErrorMessage('string error')).toBe('string error');
  });

  it('returns fallback for unknown types', () => {
    expect(getErrorMessage(42)).toBe('Unknown error');
    expect(getErrorMessage(null)).toBe('Unknown error');
  });
});

describe('validateOutputPath', () => {
  it('accepts paths within base directory', () => {
    const result = validateOutputPath('output/pages', '/tmp/test-project');
    expect(result).toBe('/tmp/test-project/output/pages');
  });

  it('rejects path traversal with ../', () => {
    expect(() => validateOutputPath('../../etc/passwd', '/tmp/test-project'))
      .toThrow('Path traversal detected');
  });

  it('rejects absolute paths outside base', () => {
    expect(() => validateOutputPath('/etc/passwd', '/tmp/test-project'))
      .toThrow('Path traversal detected');
  });

  it('accepts base directory itself', () => {
    const result = validateOutputPath('.', '/tmp/test-project');
    expect(result).toBe('/tmp/test-project');
  });
});

describe('parseRetryCount', () => {
  it('returns default for undefined', () => {
    expect(parseRetryCount()).toBe(3);
  });

  it('parses valid string', () => {
    expect(parseRetryCount('5')).toBe(5);
  });

  it('clamps to minimum 1', () => {
    expect(parseRetryCount('0')).toBe(1);
    expect(parseRetryCount('-5')).toBe(1);
  });

  it('clamps to maximum 10', () => {
    expect(parseRetryCount('99')).toBe(10);
  });

  it('uses default for invalid string', () => {
    expect(parseRetryCount('abc')).toBe(3);
  });

  it('accepts custom default', () => {
    expect(parseRetryCount(undefined, 5)).toBe(5);
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    const result = safeJsonParse('{"name": "test"}');
    expect((result as Record<string, string>).name).toBe('test');
  });

  it('nullifies prototype on parsed object', () => {
    const result = safeJsonParse('{"key": "value"}');
    expect(Object.getPrototypeOf(result)).toBeNull();
  });

  it('returns primitives unchanged', () => {
    expect(safeJsonParse('"hello"')).toBe('hello');
    expect(safeJsonParse('42')).toBe(42);
  });

  it('throws on invalid JSON', () => {
    expect(() => safeJsonParse('{invalid}')).toThrow();
  });
});

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const result = await withRetry(async () => 'ok', { baseDelay: 1 });
    expect(result).toBe('ok');
  });

  it('retries on error and succeeds', async () => {
    let attempt = 0;
    const result = await withRetry(
      async () => {
        attempt++;
        if (attempt < 3) throw new Error('fail');
        return 'ok';
      },
      { maxRetries: 3, baseDelay: 1 }
    );
    expect(result).toBe('ok');
    expect(attempt).toBe(3);
  });

  it('retries on null return and succeeds', async () => {
    let attempt = 0;
    const result = await withRetry(
      async () => {
        attempt++;
        if (attempt < 2) return null;
        return 'ok';
      },
      { maxRetries: 3, baseDelay: 1 }
    );
    expect(result).toBe('ok');
  });

  it('returns null after all retries exhausted', async () => {
    const result = await withRetry(
      async () => { throw new Error('fail'); },
      { maxRetries: 2, baseDelay: 1 }
    );
    expect(result).toBeNull();
  });

  it('calls onRetry on non-final failures only', async () => {
    const retryCalls: number[] = [];
    await withRetry(
      async () => { throw new Error('fail'); },
      {
        maxRetries: 3,
        baseDelay: 1,
        onRetry: (attempt) => { retryCalls.push(attempt); },
      }
    );
    // Should be called on attempts 1 and 2, NOT on final attempt 3
    expect(retryCalls).toEqual([1, 2]);
  });

  it('calls onFinalFailure on last attempt', async () => {
    let finalCalled = false;
    await withRetry(
      async () => { throw new Error('fail'); },
      {
        maxRetries: 2,
        baseDelay: 1,
        onFinalFailure: () => { finalCalled = true; },
      }
    );
    expect(finalCalled).toBe(true);
  });

  it('does not call onRetry when succeeding on first try', async () => {
    let retryCalled = false;
    await withRetry(
      async () => 'ok',
      {
        baseDelay: 1,
        onRetry: () => { retryCalled = true; },
      }
    );
    expect(retryCalled).toBe(false);
  });
});

describe('escapeJsDocComment', () => {
  it('escapes */ to prevent comment injection', () => {
    const result = escapeJsDocComment('close */ inject code');
    expect(result).not.toContain('*/');
    expect(result).toContain('*');
  });

  it('replaces newlines with spaces', () => {
    expect(escapeJsDocComment('line1\nline2')).toBe('line1 line2');
  });

  it('handles \\r\\n newlines', () => {
    expect(escapeJsDocComment('line1\r\nline2')).toBe('line1 line2');
  });

  it('trims whitespace', () => {
    expect(escapeJsDocComment('  text  ')).toBe('text');
  });

  it('returns empty string for empty input', () => {
    expect(escapeJsDocComment('')).toBe('');
  });

  it('passes through normal text unchanged', () => {
    expect(escapeJsDocComment('Normal description')).toBe('Normal description');
  });
});
