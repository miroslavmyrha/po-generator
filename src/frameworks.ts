/**
 * Centralized Framework Configuration Registry
 *
 * All framework-specific configuration in one place.
 * To add a new framework:
 * 1. Add entry to FRAMEWORK_REGISTRY
 * 2. Add framework name to FRAMEWORKS array
 */

// Supported framework identifiers
export const FRAMEWORKS = ['vuetify', 'symfony', 'generic'] as const;
export type Framework = (typeof FRAMEWORKS)[number];

/**
 * Complete framework configuration
 */
export interface FrameworkConfig {
  /** CSS selector to wait for page load */
  waitForSelector: string;
  /** Login form field selectors */
  loginFields: {
    username: string;
    password: string;
    submit: string;
  };
  /** Modal container selectors for AI analysis */
  modalSelectors: string;
  /** AI prompt describing framework-specific components */
  aiPrompt: string;
}

/**
 * Central registry of all framework configurations
 * Single source of truth for framework-specific behavior
 */
export const FRAMEWORK_REGISTRY: Record<Framework, FrameworkConfig> = {
  vuetify: {
    waitForSelector: '.v-application',
    loginFields: {
      username: ".v-text-field:has-text('Email') input",
      password: ".v-text-field:has-text('Password') input",
      submit: ".v-btn:has-text('Login')",
    },
    modalSelectors: '.v-dialog, .v-overlay',
    aiPrompt: `
VUETIFY 3 COMPONENTS:
- v-btn → .v-btn
- v-text-field → .v-text-field (input inside)
- v-textarea → .v-textarea (textarea inside)
- v-select → .v-select (click .v-field, then .v-list-item)
- v-autocomplete → .v-autocomplete
- v-checkbox → .v-checkbox
- v-switch → .v-switch
- v-radio-group → .v-radio-group
- v-data-table → .v-data-table
- v-dialog → .v-dialog
- v-card → .v-card
- v-tab → .v-tab
- v-expansion-panel → .v-expansion-panel
- v-navigation-drawer → .v-navigation-drawer
- v-app-bar → .v-app-bar
- v-list-item → .v-list-item
- v-menu → .v-menu

MODALS: .v-dialog, .v-overlay
`,
  },

  symfony: {
    waitForSelector: 'body',
    loginFields: {
      username: "#username, #_username, input[name='_username'], input[name='email']",
      password: "#password, #_password, input[name='_password'], input[type='password']",
      submit: "button[type='submit'], input[type='submit'], .btn:has-text('Login'), .btn:has-text('Přihlásit')",
    },
    modalSelectors: '.modal, .modal-dialog, [data-controller*="modal"]',
    aiPrompt: `
SYMFONY/STIMULUS COMPONENTS:
- Stimulus controllers: [data-controller="..."]
- Stimulus actions: [data-action="..."]
- Stimulus targets: [data-{controller}-target="..."]
- Turbo frames: turbo-frame[id="..."]
- Turbo streams: turbo-stream

FORMS:
- Symfony form fields often have id format: #{form_name}_{field_name}
- Error messages: .form-error-message, .invalid-feedback
- Form groups: .form-group, .mb-3

BOOTSTRAP COMPONENTS (if used):
- Buttons: .btn, .btn-primary, .btn-secondary
- Inputs: .form-control, .form-select
- Modals: .modal, .modal-dialog
- Cards: .card, .card-body
- Tables: .table, tbody tr
- Alerts: .alert
- Dropdowns: .dropdown, .dropdown-menu, .dropdown-item

VUE COMPONENTS (if embedded):
- Look for [data-v-*] attributes
- Vue root: #app, [id="app"]
- Vue components often have unique classes

MODALS: .modal, [data-controller*="modal"], .modal-dialog
`,
  },

  generic: {
    waitForSelector: 'body',
    loginFields: {
      username: "input[type='email'], input[name='email'], input[name='username'], #email, #username",
      password: "input[type='password'], #password",
      submit: "button[type='submit'], input[type='submit']",
    },
    modalSelectors: '.modal, [role="dialog"], dialog, .overlay',
    aiPrompt: `
COMMON INTERACTIVE ELEMENTS:
- Buttons: button, [type="submit"], [type="button"], .btn, [role="button"]
- Links: a[href]
- Inputs: input, textarea, select
- Checkboxes: input[type="checkbox"]
- Radio: input[type="radio"]
- Forms: form

JAVASCRIPT HANDLERS:
- [onclick], [onsubmit], [onchange]
- [data-action] (Stimulus)
- [@click], [v-on:click] (Vue)
- [data-*] custom attributes

MODALS/DIALOGS:
- .modal, [role="dialog"], dialog
- .popup, .overlay, .lightbox
`,
  },
};

/**
 * Get framework configuration with fallback to generic
 */
export function getFrameworkConfig(framework: string): FrameworkConfig {
  return FRAMEWORK_REGISTRY[framework as Framework] ?? FRAMEWORK_REGISTRY.generic;
}

/**
 * Check if framework is supported
 */
export function isValidFramework(framework: string): framework is Framework {
  return FRAMEWORKS.includes(framework as Framework);
}

// Legacy exports for backwards compatibility
// These map to the new centralized registry

/** @deprecated Use FRAMEWORK_REGISTRY[framework].loginFields and waitForSelector */
export const FRAMEWORK_DEFAULTS: Record<string, { waitForSelector: string; loginFields: FrameworkConfig['loginFields'] }> = {
  vuetify: {
    waitForSelector: FRAMEWORK_REGISTRY.vuetify.waitForSelector,
    loginFields: FRAMEWORK_REGISTRY.vuetify.loginFields,
  },
  symfony: {
    waitForSelector: FRAMEWORK_REGISTRY.symfony.waitForSelector,
    loginFields: FRAMEWORK_REGISTRY.symfony.loginFields,
  },
  generic: {
    waitForSelector: FRAMEWORK_REGISTRY.generic.waitForSelector,
    loginFields: FRAMEWORK_REGISTRY.generic.loginFields,
  },
};

/** @deprecated Use FRAMEWORK_REGISTRY[framework].modalSelectors */
export const FRAMEWORK_MODAL_SELECTORS: Record<Framework, string> = {
  vuetify: FRAMEWORK_REGISTRY.vuetify.modalSelectors,
  symfony: FRAMEWORK_REGISTRY.symfony.modalSelectors,
  generic: FRAMEWORK_REGISTRY.generic.modalSelectors,
};

/** @deprecated Use FRAMEWORK_REGISTRY[framework].aiPrompt */
export const FRAMEWORK_PROMPTS: Record<Framework, string> = {
  vuetify: FRAMEWORK_REGISTRY.vuetify.aiPrompt,
  symfony: FRAMEWORK_REGISTRY.symfony.aiPrompt,
  generic: FRAMEWORK_REGISTRY.generic.aiPrompt,
};
