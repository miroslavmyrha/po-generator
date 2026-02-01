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
  elements: z.array(ElementSchema).default([]),
  modals: z.array(ModalInfoSchema).default([]),
  navigation: z.array(NavigationSchema).default([]),
});

// Modal analysis schema with length limits
export const ModalAnalysisSchema = z.object({
  modalName: z.string()
    .max(MAX_LENGTHS.IDENTIFIER, 'Modal name too long')
    .regex(jsIdentifierPattern, 'Modal name must be valid JS identifier'),
  purpose: z.string().max(MAX_LENGTHS.DESCRIPTION, 'Purpose too long'),
  elements: z.array(ElementSchema).default([]),
  actions: z.object({
    confirm: z.string().max(MAX_LENGTHS.SELECTOR, 'Confirm selector too long').optional(),
    cancel: z.string().max(MAX_LENGTHS.SELECTOR, 'Cancel selector too long').optional(),
  }).default({}),
});

// Type exports from schemas
export type ElementInfo = z.infer<typeof ElementSchema>;
export type PageAnalysis = z.infer<typeof PageAnalysisSchema>;
export type ModalInfo = z.infer<typeof ModalInfoSchema>;
export type NavigationInfo = z.infer<typeof NavigationSchema>;
export type ScanResult = z.infer<typeof ScanResultSchema>;
export type ModalAnalysis = z.infer<typeof ModalAnalysisSchema>;

/**
 * Validation result with optional error details
 */
export interface ValidationResult<T> {
  data: T | null;
  errors?: string[];
}

/**
 * Validate scan result data against schema
 * Returns data and any validation errors for caller to handle logging
 */
export function validateScanResult(data: unknown): ScanResult | null {
  const result = ScanResultSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate scan result with detailed error information
 */
export function validateScanResultWithErrors(data: unknown): ValidationResult<ScanResult> {
  const result = ScanResultSchema.safeParse(data);
  if (result.success) {
    return { data: result.data };
  }
  return {
    data: null,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Validate modal analysis data against schema
 * Returns data and any validation errors for caller to handle logging
 */
export function validateModalAnalysis(data: unknown): ModalAnalysis | null {
  const result = ModalAnalysisSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate modal analysis with detailed error information
 */
export function validateModalAnalysisWithErrors(data: unknown): ValidationResult<ModalAnalysis> {
  const result = ModalAnalysisSchema.safeParse(data);
  if (result.success) {
    return { data: result.data };
  }
  return {
    data: null,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}
