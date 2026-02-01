import 'dotenv/config';
import type { Config, FrameworkDefaults } from './types.js';

// Framework-specific defaults
export const FRAMEWORK_DEFAULTS: Record<string, FrameworkDefaults> = {
  vuetify: {
    waitForSelector: '.v-application',
    loginFields: {
      username: ".v-text-field:has-text('Email') input",
      password: ".v-text-field:has-text('Password') input",
      submit: ".v-btn:has-text('Login')",
    },
  },
  symfony: {
    waitForSelector: 'body',
    loginFields: {
      username: "#username, #_username, input[name='_username'], input[name='email']",
      password: "#password, #_password, input[name='_password'], input[type='password']",
      submit: "button[type='submit'], input[type='submit'], .btn:has-text('Login'), .btn:has-text('Přihlásit')",
    },
  },
  generic: {
    waitForSelector: 'body',
    loginFields: {
      username: "input[type='email'], input[name='email'], input[name='username'], #email, #username",
      password: "input[type='password'], #password",
      submit: "button[type='submit'], input[type='submit']",
    },
  },
};

const framework = process.env.PO_GEN_FRAMEWORK || 'generic';
const frameworkDefaults = FRAMEWORK_DEFAULTS[framework] || FRAMEWORK_DEFAULTS.generic;

export const config: Config = {
  framework,

  baseUrl: process.env.PO_GEN_BASE_URL || 'http://localhost:5173',

  auth: {
    enabled: process.env.PO_GEN_AUTH_ENABLED === 'true',
    loginUrl: process.env.PO_GEN_LOGIN_URL || '/login',
    credentials: {
      username: process.env.PO_GEN_USERNAME,
      password: process.env.PO_GEN_PASSWORD,
    },
    fields: {
      username: process.env.PO_GEN_FIELD_USERNAME || frameworkDefaults.loginFields.username,
      password: process.env.PO_GEN_FIELD_PASSWORD || frameworkDefaults.loginFields.password,
      submit: process.env.PO_GEN_FIELD_SUBMIT || frameworkDefaults.loginFields.submit,
    },
    successUrl: process.env.PO_GEN_SUCCESS_URL || '/dashboard',
  },

  ai: {
    baseUrl: process.env.PO_GEN_AI_URL || 'http://localhost:3000/api/v1',
    apiKey: process.env.PO_GEN_AI_KEY,
    model: process.env.PO_GEN_AI_MODEL || 'llama3',
  },

  output: {
    dir: process.env.PO_GEN_OUTPUT_DIR || './output',
  },

  crawler: {
    maxDepth: parseInt(process.env.PO_GEN_MAX_DEPTH || '10'),
    timeout: parseInt(process.env.PO_GEN_TIMEOUT || '5000'),
    waitForSelector: process.env.PO_GEN_WAIT_SELECTOR || frameworkDefaults.waitForSelector,
    ignorePatterns: (process.env.PO_GEN_IGNORE || '/logout,/api/,.pdf').split(','),
  },
};

export function validateConfig(): string[] {
  const errors: string[] = [];

  if (!config.baseUrl) errors.push('PO_GEN_BASE_URL is required');
  if (!config.ai.apiKey) errors.push('PO_GEN_AI_KEY is required');

  if (config.auth.enabled) {
    if (!config.auth.credentials.username) errors.push('PO_GEN_USERNAME is required when auth is enabled');
    if (!config.auth.credentials.password) errors.push('PO_GEN_PASSWORD is required when auth is enabled');
  }

  return errors;
}
