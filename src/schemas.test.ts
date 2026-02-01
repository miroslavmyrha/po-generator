import { describe, it, expect } from 'vitest';
import {
  validateScanResult,
  validateModalAnalysis,
  ElementSchema,
  ScanResultSchema,
} from './schemas.js';

/**
 * Tests for AI response validation schemas
 *
 * WHY these tests matter:
 * - AI responses are unpredictable and may not match expected format
 * - Invalid data must be caught early to prevent downstream errors
 * - Zod validation is our contract between AI and the rest of the app
 */

describe('ElementSchema', () => {
  it('validates a complete element', () => {
    const element = {
      name: 'submitButton',
      component: 'button',
      selector: '.btn-submit',
      action: 'click',
      description: 'Submit form button',
      importance: 'high',
      isModalTrigger: false,
    };

    const result = ElementSchema.safeParse(element);
    expect(result.success).toBe(true);
  });

  it('applies default value for isModalTrigger when missing', () => {
    const element = {
      name: 'submitButton',
      component: 'button',
      selector: '.btn-submit',
      action: 'click',
      description: 'Submit form button',
      importance: 'high',
      // isModalTrigger intentionally missing
    };

    const result = ElementSchema.safeParse(element);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isModalTrigger).toBe(false);
    }
  });

  it('rejects invalid action type', () => {
    const element = {
      name: 'submitButton',
      component: 'button',
      selector: '.btn-submit',
      action: 'invalid_action', // Not in enum
      description: 'Submit form button',
      importance: 'high',
    };

    const result = ElementSchema.safeParse(element);
    expect(result.success).toBe(false);
  });

  it('rejects invalid importance level', () => {
    const element = {
      name: 'submitButton',
      component: 'button',
      selector: '.btn-submit',
      action: 'click',
      description: 'Submit form button',
      importance: 'critical', // Not in enum (should be high/medium/low)
    };

    const result = ElementSchema.safeParse(element);
    expect(result.success).toBe(false);
  });

  it('rejects element with missing required fields', () => {
    const element = {
      name: 'submitButton',
      // Missing: component, selector, action, description, importance
    };

    const result = ElementSchema.safeParse(element);
    expect(result.success).toBe(false);
  });
});

describe('validateScanResult', () => {
  const validScanResult = {
    pageAnalysis: {
      url: '/dashboard',
      purpose: 'Main dashboard page',
      shouldBePageObject: true,
      reason: 'Contains interactive elements',
      suggestedClassName: 'DashboardPage',
    },
    elements: [
      {
        name: 'loginButton',
        component: 'button',
        selector: '#login-btn',
        action: 'click',
        description: 'Login button',
        importance: 'high',
        isModalTrigger: false,
      },
    ],
    modals: [],
    navigation: [],
  };

  it('validates a complete scan result', () => {
    const result = validateScanResult(validScanResult);

    expect(result).not.toBeNull();
    expect(result?.pageAnalysis.url).toBe('/dashboard');
    expect(result?.elements).toHaveLength(1);
  });

  it('validates scan result with "ask_user" decision', () => {
    const scanResult = {
      ...validScanResult,
      pageAnalysis: {
        ...validScanResult.pageAnalysis,
        shouldBePageObject: 'ask_user',
      },
    };

    const result = validateScanResult(scanResult);
    expect(result).not.toBeNull();
    expect(result?.pageAnalysis.shouldBePageObject).toBe('ask_user');
  });

  it('provides default empty arrays for optional fields', () => {
    const minimalResult = {
      pageAnalysis: {
        url: '/test',
        purpose: 'Test page',
        shouldBePageObject: false,
        reason: 'No interactive elements',
        suggestedClassName: 'TestPage',
      },
      // elements, modals, navigation intentionally missing
    };

    const result = validateScanResult(minimalResult);

    expect(result).not.toBeNull();
    expect(result?.elements).toEqual([]);
    expect(result?.modals).toEqual([]);
    expect(result?.navigation).toEqual([]);
  });

  it('returns null for completely invalid input', () => {
    const result = validateScanResult({ foo: 'bar' });
    expect(result).toBeNull();
  });

  it('returns null for null input', () => {
    const result = validateScanResult(null);
    expect(result).toBeNull();
  });

  it('returns null for undefined input', () => {
    const result = validateScanResult(undefined);
    expect(result).toBeNull();
  });

  it('returns null when pageAnalysis is missing', () => {
    const result = validateScanResult({
      elements: [],
      modals: [],
      navigation: [],
    });
    expect(result).toBeNull();
  });

  it('validates scan result with navigation data', () => {
    const scanResult = {
      ...validScanResult,
      navigation: [
        { element: 'homeLink', targetUrl: '/' },
        { element: 'aboutLink', targetUrl: '/about' },
      ],
    };

    const result = validateScanResult(scanResult);
    expect(result).not.toBeNull();
    expect(result?.navigation).toHaveLength(2);
  });

  it('validates scan result with modal data', () => {
    const scanResult = {
      ...validScanResult,
      modals: [
        {
          triggerElement: 'deleteButton',
          expectedContent: 'Confirmation dialog',
        },
      ],
    };

    const result = validateScanResult(scanResult);
    expect(result).not.toBeNull();
    expect(result?.modals).toHaveLength(1);
  });
});

describe('validateModalAnalysis', () => {
  // Note: Modal elements must have all required ElementSchema fields including 'importance'
  const validModalAnalysis = {
    modalName: 'confirmDialog',
    purpose: 'Confirm delete action',
    elements: [
      {
        name: 'confirmButton',
        component: 'button',
        selector: '.btn-confirm',
        action: 'click',
        description: 'Confirm action',
        importance: 'high', // Required field
      },
    ],
    actions: {
      confirm: '.btn-confirm',
      cancel: '.btn-cancel',
    },
  };

  it('validates a complete modal analysis', () => {
    const result = validateModalAnalysis(validModalAnalysis);

    expect(result).not.toBeNull();
    expect(result?.modalName).toBe('confirmDialog');
    expect(result?.elements).toHaveLength(1);
  });

  it('validates modal without actions (defaults to empty object)', () => {
    const modalWithoutActions = {
      modalName: 'infoDialog',
      purpose: 'Display information',
      elements: [],
      // actions intentionally missing - will default to {}
    };

    const result = validateModalAnalysis(modalWithoutActions);
    expect(result).not.toBeNull();
    // Schema has .default({}) so actions will be an empty object, not undefined
    expect(result?.actions).toEqual({});
  });

  it('validates modal with partial actions', () => {
    const modalWithPartialActions = {
      modalName: 'confirmDialog',
      purpose: 'Confirm action',
      elements: [],
      actions: {
        confirm: '.btn-ok',
        // cancel intentionally missing - optional field
      },
    };

    const result = validateModalAnalysis(modalWithPartialActions);
    expect(result).not.toBeNull();
    expect(result?.actions?.confirm).toBe('.btn-ok');
    expect(result?.actions?.cancel).toBeUndefined();
  });

  it('returns null for invalid input', () => {
    const result = validateModalAnalysis({ invalid: 'data' });
    expect(result).toBeNull();
  });

  it('returns null for null input', () => {
    const result = validateModalAnalysis(null);
    expect(result).toBeNull();
  });

  it('returns null when element is missing required importance field', () => {
    const modalWithInvalidElement = {
      modalName: 'dialog',
      purpose: 'Test',
      elements: [
        {
          name: 'button',
          component: 'button',
          selector: '.btn',
          action: 'click',
          description: 'Button',
          // importance missing - required
        },
      ],
    };

    const result = validateModalAnalysis(modalWithInvalidElement);
    expect(result).toBeNull();
  });
});

describe('Edge cases and AI response quirks', () => {
  it('handles extra fields gracefully (AI might add unexpected fields)', () => {
    const scanResultWithExtra = {
      pageAnalysis: {
        url: '/test',
        purpose: 'Test',
        shouldBePageObject: true,
        reason: 'Test',
        suggestedClassName: 'TestPage',
        extraField: 'should be ignored', // AI might add this
      },
      elements: [],
      unexpectedArray: [1, 2, 3], // AI might add this
    };

    // Zod strips unknown fields by default
    const result = validateScanResult(scanResultWithExtra);
    expect(result).not.toBeNull();
  });

  it('handles string "true" for boolean (common AI mistake)', () => {
    const scanResult = {
      pageAnalysis: {
        url: '/test',
        purpose: 'Test',
        shouldBePageObject: 'true', // String instead of boolean - this should fail
        reason: 'Test',
        suggestedClassName: 'TestPage',
      },
    };

    // This should fail because shouldBePageObject expects boolean | "ask_user"
    const result = validateScanResult(scanResult);
    expect(result).toBeNull();
  });

  it('handles elements with special characters in selectors', () => {
    const scanResult = {
      pageAnalysis: {
        url: '/test',
        purpose: 'Test',
        shouldBePageObject: true,
        reason: 'Test',
        suggestedClassName: 'TestPage',
      },
      elements: [
        {
          name: 'specialButton',
          component: 'button',
          selector: '[data-testid="btn-submit\'s"]', // Quotes in selector
          action: 'click',
          description: 'Button with special chars',
          importance: 'high',
        },
      ],
    };

    const result = validateScanResult(scanResult);
    expect(result).not.toBeNull();
    expect(result?.elements[0].selector).toBe('[data-testid="btn-submit\'s"]');
  });
});
