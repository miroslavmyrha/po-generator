import { z } from 'zod';
import { log } from './lib/logger.js';

// JS identifier pattern - prevents code injection
const jsIdentifierPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

// Element schema with validated name
export const ElementSchema = z.object({
  name: z.string().regex(jsIdentifierPattern, 'Element name must be valid JS identifier'),
  component: z.string(),
  selector: z.string().max(1000, 'Selector too long'),
  action: z.enum(['click', 'fill', 'select', 'check', 'toggle', 'none']),
  description: z.string(),
  importance: z.enum(['high', 'medium', 'low']),
  isModalTrigger: z.boolean().default(false),
});

// Page analysis schema
export const PageAnalysisSchema = z.object({
  url: z.string(),
  purpose: z.string(),
  shouldBePageObject: z.union([z.boolean(), z.literal('ask_user')]),
  reason: z.string(),
  suggestedClassName: z.string().regex(jsIdentifierPattern, 'Class name must be valid JS identifier'),
});

// Modal info schema
export const ModalInfoSchema = z.object({
  triggerElement: z.string(),
  expectedContent: z.string(),
});

// Navigation schema
export const NavigationSchema = z.object({
  element: z.string(),
  targetUrl: z.string(),
});

// Full scan result schema
export const ScanResultSchema = z.object({
  pageAnalysis: PageAnalysisSchema,
  elements: z.array(ElementSchema).default([]),
  modals: z.array(ModalInfoSchema).default([]),
  navigation: z.array(NavigationSchema).default([]),
});

// Modal analysis schema
export const ModalAnalysisSchema = z.object({
  modalName: z.string().regex(jsIdentifierPattern, 'Modal name must be valid JS identifier'),
  purpose: z.string(),
  elements: z.array(ElementSchema).default([]),
  actions: z.object({
    confirm: z.string().optional(),
    cancel: z.string().optional(),
  }).default({}),
});

// Type exports from schemas
export type ElementInfo = z.infer<typeof ElementSchema>;
export type PageAnalysis = z.infer<typeof PageAnalysisSchema>;
export type ModalInfo = z.infer<typeof ModalInfoSchema>;
export type NavigationInfo = z.infer<typeof NavigationSchema>;
export type ScanResult = z.infer<typeof ScanResultSchema>;
export type ModalAnalysis = z.infer<typeof ModalAnalysisSchema>;

// Validation helpers with logging
export function validateScanResult(data: unknown): ScanResult | null {
  try {
    return ScanResultSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      log.debug(`ScanResult validation failed: ${error.errors.map(e => e.message).join(', ')}`);
    }
    return null;
  }
}

export function validateModalAnalysis(data: unknown): ModalAnalysis | null {
  try {
    return ModalAnalysisSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      log.debug(`ModalAnalysis validation failed: ${error.errors.map(e => e.message).join(', ')}`);
    }
    return null;
  }
}
