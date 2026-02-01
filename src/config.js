import 'dotenv/config';

export const config = {
  baseUrl: process.env.PO_GEN_BASE_URL || 'http://localhost:5173',

  auth: {
    enabled: process.env.PO_GEN_AUTH_ENABLED === 'true',
    loginUrl: process.env.PO_GEN_LOGIN_URL || '/login',
    credentials: {
      username: process.env.PO_GEN_USERNAME,
      password: process.env.PO_GEN_PASSWORD,
    },
    fields: {
      username: process.env.PO_GEN_FIELD_USERNAME || ".v-text-field:has-text('Email') input",
      password: process.env.PO_GEN_FIELD_PASSWORD || ".v-text-field:has-text('Password') input",
      submit: process.env.PO_GEN_FIELD_SUBMIT || ".v-btn:has-text('Login')",
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
    waitForSelector: process.env.PO_GEN_WAIT_SELECTOR || '.v-application',
    ignorePatterns: (process.env.PO_GEN_IGNORE || '/logout,/api/,.pdf').split(','),
  },
};

export function validateConfig() {
  const errors = [];

  if (!config.baseUrl) errors.push('PO_GEN_BASE_URL is required');
  if (!config.ai.apiKey) errors.push('PO_GEN_AI_KEY is required');

  if (config.auth.enabled) {
    if (!config.auth.credentials.username) errors.push('PO_GEN_USERNAME is required when auth is enabled');
    if (!config.auth.credentials.password) errors.push('PO_GEN_PASSWORD is required when auth is enabled');
  }

  return errors;
}
