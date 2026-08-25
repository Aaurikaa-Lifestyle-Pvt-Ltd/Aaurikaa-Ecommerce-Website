#!/usr/bin/env node

/**
 * WS-1 Phase 5 — automated sign-off runner.
 *
 * Usage:
 *   cd backend && npm run signoff:ws-1
 *
 * Runs unit + integration coverage for 1.6 / 1.7 / 1.8 and matching frontend
 * Jest patterns. Manual QA matrix remains human-gated:
 *   docs/qa-reports/ws-1-manual-qa-matrix.md
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FRONTEND_ROOT = path.join(ROOT, '..', 'frontend');
const JEST_BIN = path.join(ROOT, 'node_modules', 'jest', 'bin', 'jest.js');
const FRONTEND_JEST_BIN = path.join(FRONTEND_ROOT, 'node_modules', 'jest', 'bin', 'jest.js');

const BACKEND_PATTERNS = [
  'tests/utils/primaryKeywordValidation.test.js',
  'tests/utils/productCategoryValidation.test.js',
  'tests/utils/keyFeatureNormalization.test.js',
  'tests/utils/productPublishGuard.test.js',
  'tests/controllers/primaryKeywordEffectiveStatus.test.js',
  'tests/controllers/sellerPrimaryCategoryImmutability.test.js',
  'tests/controllers/adminPrimaryCategoryAuthority.test.js',
  'tests/controllers/legacyFeaturesRegression.test.js',
];

const FRONTEND_PATTERNS = [
  'tests/utils/productAutosavePayload.test.js',
  'tests/utils/keyFeatureRows.test.js',
  'tests/components/ProductKeyFeatureEditor.test.js',
  'tests/components/ProductTabsKeyFeatures.test.jsx',
];

const CHECKLIST = [
  { id: 'W1', label: 'Unit: primaryKeywordValidation' },
  { id: 'W2', label: 'Unit: productCategoryValidation' },
  { id: 'W3', label: 'Unit: keyFeatureNormalization (identity + multi-value)' },
  { id: 'W4', label: 'Unit/integration: publish guard uniqueness stub' },
  { id: 'W5', label: 'Integration: keyword duplicates allowed + effective status' },
  { id: 'W6', label: 'Integration: seller primary category immutability' },
  { id: 'W7', label: 'Integration: admin primary authority + secondary validation' },
  { id: 'W8', label: 'Regression: legacy features[] persistence' },
  { id: 'W9', label: 'Frontend: autosave + key feature editor + ProductTabs' },
];

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runJest(jestBin, cwd, patterns) {
  const result = spawnSync(process.execPath, [jestBin, ...patterns, '--runInBand'], {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JWT_SECRET: process.env.JWT_SECRET || 'test-jwt-secret',
    },
    stdio: 'inherit',
  });
  return result.status === 0;
}

function main() {
  log('\n=== WS-1 Phase 5 — Automated Sign-Off ===\n', 'cyan');
  log('Rollout order: backend → frontend → optional catalogue seed.', 'yellow');
  log('Manual QA matrix: docs/qa-reports/ws-1-manual-qa-matrix.md\n', 'yellow');

  const results = {};

  log('Running backend WS-1 suite...\n', 'cyan');
  const backendOk = runJest(JEST_BIN, ROOT, BACKEND_PATTERNS);
  results.W1 = backendOk;
  results.W2 = backendOk;
  results.W3 = backendOk;
  results.W4 = backendOk;
  results.W5 = backendOk;
  results.W6 = backendOk;
  results.W7 = backendOk;
  results.W8 = backendOk;

  log('\nRunning frontend WS-1 suite...\n', 'cyan');
  results.W9 = runJest(FRONTEND_JEST_BIN, FRONTEND_ROOT, FRONTEND_PATTERNS);

  log('\n=== Checklist ===\n', 'cyan');
  let failed = 0;
  for (const item of CHECKLIST) {
    const ok = !!results[item.id];
    if (!ok) failed += 1;
    log(`${ok ? '✅' : '❌'} ${item.id} — ${item.label}`, ok ? 'green' : 'red');
  }

  if (failed > 0) {
    log(`\n❌ WS-1 Phase 5 sign-off FAILED (${failed} item(s))\n`, 'red');
    process.exit(1);
  }

  log('\n✅ WS-1 Phase 5 automated sign-off PASSED', 'green');
  log('Complete manual QA matrix before production cutover.\n', 'yellow');
  process.exit(0);
}

main();
