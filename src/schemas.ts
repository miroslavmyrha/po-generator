import { z } from 'zod';

// JS identifier pattern - prevents code injection
const jsIdentifierPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

// Max lengths to prevent huge generated files from malicious AI responses
const MAX_LENGTHS = {
  IDENTIFIER: 100,    // JS identifiers (names, class names)
  SELECTOR: 1000,     // CSS selectors
  DESCRIPTION: 500,   // Descriptions, purposes, reasons
  URL: 2000,          // URLs
} as const;

// Max array sizes to prevent DoS from huge AI responses
const MAX_ARRAY_SIZES = {
  ELEMENTS: 200,      // Max elements per page
  MODALS: 50,         // Max modals per page
  NAVIGATION: 200,    // Max navigation items
  TEST_CASES: 50,     // Max test cases per suite
  TEST_STEPS: 50,     // Max steps per test case
  TEST_ASSERTIONS: 20, // Max assertions per test case
  ARGS: 10,           // Max args per step
} as const;

// Element schema with validated name and length limits
export const ElementSchema = z.object({
  name: z.string()
    .max(MAX_LENGTHS.IDENTIFIER, 'Element name too long')
    .regex(jsIdentifierPattern, 'Element name must be valid JS identifier'),
  component: z.string().max(MAX_LENGTHS.IDENTIFIER, 'Component name too long'),
  selector: z.string().max(MAX_LENGTHS.SELECTOR, 'Selector too long'),
  action: z.enum(['click', 'fill', 'select', 'check', 'toggle', 'none']),
  description: z.string().max(MAX_LENGTHS.DESCRIPTION, 'Description too long'),
  importance: z.enum(['high', 'medium', 'low']),
  isModalTrigger: z.boolean().default(false),
});

// Page analysis schema with length limits
export const PageAnalysisSchema = z.object({
  url: z.string().max(MAX_LENGTHS.URL, 'URL too long'),
  purpose: z.string().max(MAX_LENGTHS.DESCRIPTION, 'Purpose too long'),
  shouldBePageObject: z.union([z.boolean(), z.literal('ask_user')]),
  reason: z.string().max(MAX_LENGTHS.DESCRIPTION, 'Reason too long'),
  suggestedClassName: z.string()
    .max(MAX_LENGTHS.IDENTIFIER, 'Class name too long')
    .regex(jsIdentifierPattern, 'Class name must be valid JS identifier'),
});

// Modal info schema with length limits
export const ModalInfoSchema = z.object({
  triggerElement: z.string().max(MAX_LENGTHS.IDENTIFIER, 'Trigger element name too long'),
  expectedContent: z.string().max(MAX_LENGTHS.DESCRIPTION, 'Expected content too long'),
});

// Navigation schema with length limits
export const NavigationSchema = z.object({
  element: z.string().max(MAX_LENGTHS.IDENTIFIER, 'Element name too long'),
  targetUrl: z.string().max(MAX_LENGTHS.URL, 'Target URL too long'),
});

// Full scan result schema
export const ScanResultSchema = z.object({
  pageAnalysis: PageAnalysisSchema,
  elements: z.array(ElementSchema).max(MAX_ARRAY_SIZES.ELEMENTS).default([]),
  modals: z.array(ModalInfoSchema).max(MAX_ARRAY_SIZES.MODALS).default([]),
  navigation: z.array(NavigationSchema).max(MAX_ARRAY_SIZES.NAVIGATION).default([]),
});

// Modal analysis schema with length limits
export const ModalAnalysisSchema = z.object({
  modalName: z.string()
    .max(MAX_LENGTHS.IDENTIFIER, 'Modal name too long')
    .regex(jsIdentifierPattern, 'Modal name must be valid JS identifier'),
  purpose: z.string().max(MAX_LENGTHS.DESCRIPTION, 'Purpose too long'),
  elements: z.array(ElementSchema).max(MAX_ARRAY_SIZES.ELEMENTS).default([]),
  actions: z.object({
    confirm: z.string().max(MAX_LENGTHS.SELECTOR, 'Confirm selector too long').optional(),
    cancel: z.string().max(MAX_LENGTHS.SELECTOR, 'Cancel selector too long').optional(),
  }).default({}),
});

// Test step schema - single action in a test case
export const TestStepSchema = z.object({
  method: z.string()
    .max(MAX_LENGTHS.IDENTIFIER, 'Method name too long')
    .regex(jsIdentifierPattern, 'Method name must be valid JS identifier'),
  args: z.array(z.string().max(MAX_LENGTHS.SELECTOR, 'Argument too long')).max(MAX_ARRAY_SIZES.ARGS).default([]),
  description: z.string().max(MAX_LENGTHS.DESCRIPTION, 'Step description too long').optional(),
});

// Test assertion schema - expected outcome
export const TestAssertionSchema = z.object({
  type: z.enum(['url', 'visible', 'hidden', 'text', 'count', 'enabled', 'disabled']),
  selector: z.string().max(MAX_LENGTHS.SELECTOR, 'Selector too long').optional(),
  value: z.string().max(MAX_LENGTHS.DESCRIPTION, 'Assertion value too long').optional(),
});

// Test case schema - single test scenario
export const TestCaseSchema = z.object({
  name: z.string().max(MAX_LENGTHS.DESCRIPTION, 'Test name too long'),
  steps: z.array(TestStepSchema).min(1, 'Test must have at least one step').max(MAX_ARRAY_SIZES.TEST_STEPS),
  assertions: z.array(TestAssertionSchema).min(1, 'Test must have at least one assertion').max(MAX_ARRAY_SIZES.TEST_ASSERTIONS),
});

// Test suite schema - collection of test cases for a page
export const TestSuiteSchema = z.object({
  suiteName: z.string().max(MAX_LENGTHS.DESCRIPTION, 'Suite name too long'),
  testCases: z.array(TestCaseSchema).min(1, 'Suite must have at least one test case').max(MAX_ARRAY_SIZES.TEST_CASES),
});

// Type exports from schemas
export type ElementInfo = z.infer<typeof ElementSchema>;
export type PageAnalysis = z.infer<typeof PageAnalysisSchema>;
export type ModalInfo = z.infer<typeof ModalInfoSchema>;
export type NavigationInfo = z.infer<typeof NavigationSchema>;
export type ScanResult = z.infer<typeof ScanResultSchema>;
export type ModalAnalysis = z.infer<typeof ModalAnalysisSchema>;
export type TestStep = z.infer<typeof TestStepSchema>;
export type TestAssertion = z.infer<typeof TestAssertionSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type TestSuite = z.infer<typeof TestSuiteSchema>;

/**
 * Validation result with optional error details
 */
export interface ValidationResult<T> {
  data: T | null;
  errors?: string[];
}

/**
 * Generic schema validator — returns data or null
 */
function validate<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Generic schema validator — returns data with error details
 */
function validateWithErrors<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { data: result.data };
  }
  return {
    data: null,
    errors: result.error.issues.map(e => `${String(e.path.join('.'))}: ${e.message}`),
  };
}

// Named validation functions for each schema
export const validateScanResult = (data: unknown): ScanResult | null => validate(ScanResultSchema, data);
export const validateScanResultWithErrors = (data: unknown): ValidationResult<ScanResult> => validateWithErrors(ScanResultSchema, data);
export const validateModalAnalysis = (data: unknown): ModalAnalysis | null => validate(ModalAnalysisSchema, data);
export const validateModalAnalysisWithErrors = (data: unknown): ValidationResult<ModalAnalysis> => validateWithErrors(ModalAnalysisSchema, data);
export const validateTestSuite = (data: unknown): TestSuite | null => validate(TestSuiteSchema, data);
export const validateTestSuiteWithErrors = (data: unknown): ValidationResult<TestSuite> => validateWithErrors(TestSuiteSchema, data);
