#!/usr/bin/env node

/**
 * Staging sign-off runner for backend-native taxonomy rich-text conversion.
 *
 * Usage:
 *   node backend/scripts/taxonomy-rich-text-staging-signoff.js
 *
 * Pre-deploy checklist:
 *   1. Backend unit + integration tests pass (no frontend CLI dependency)
 *   2. No spawnSync / frontend CLI references in taxonomy conversion path
 *   3. Optional: migration dry-run against staging DB
 *
 * Post-deploy monitoring:
 *   - Cloud Run logs: no spawnSync, ENOENT, or TAXONOMY_CLI errors
 *   - Category import/export endpoint latency on first request
 *   - Import error rate on /import endpoints
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

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

const JEST_BIN = path.join(ROOT, 'node_modules', 'jest', 'bin', 'jest.js');

function runJest(patterns) {
  const result = spawnSync(
    process.execPath,
    [JEST_BIN, ...patterns, '--runInBand'],
    {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: 'inherit',
    }
  );
  return result.status === 0;
}

function checkNoCliBridge() {
  const formatPath = path.join(ROOT, 'utils', 'taxonomyDescriptionFormat.js');
  const content = fs.readFileSync(formatPath, 'utf8');
  const issues = [];

  if (content.includes('spawnSync')) issues.push('taxonomyDescriptionFormat.js still uses spawnSync');
  if (content.includes('taxonomy-description-cli')) issues.push('taxonomyDescriptionFormat.js still references CLI script');
  if (content.includes('../../frontend/')) issues.push('taxonomyDescriptionFormat.js still references frontend path');

  const cliPath = path.join(ROOT, '..', 'frontend', 'scripts', 'taxonomy-description-cli.mjs');
  if (fs.existsSync(cliPath)) issues.push('frontend/scripts/taxonomy-description-cli.mjs still exists');

  return issues;
}

function main() {
  log('\n=== Taxonomy Rich Text — Backend Staging Sign-Off ===\n', 'cyan');

  const results = {
    tests: false,
    noCliBridge: false,
  };

  log('Running taxonomyDescriptionFormat unit tests...', 'cyan');
  results.tests = runJest(['tests/utils/taxonomyDescriptionFormat.test.js']);

  log('\nRunning categoryImportExport integration tests...', 'cyan');
  results.tests = runJest(['tests/utils/categoryImportExport.test.js']) && results.tests;

  const bridgeIssues = checkNoCliBridge();
  results.noCliBridge = bridgeIssues.length === 0;

  log('\n--- Checklist ---\n', 'cyan');

  log(`${results.tests ? '✓' : '✗'} Backend conversion tests pass`, results.tests ? 'green' : 'red');
  log(`${results.noCliBridge ? '✓' : '✗'} No CLI bridge in taxonomy conversion path`, results.noCliBridge ? 'green' : 'red');

  if (!results.noCliBridge) {
    bridgeIssues.forEach((issue) => log(`  - ${issue}`, 'red'));
  }

  log('\n--- Deployment (backend only) ---\n', 'cyan');
  log('1. Deploy backend Cloud Run revision (frontend deploy not required)', 'yellow');
  log('2. Smoke test: category CSV export + import on staging', 'yellow');
  log('3. If legacy HTML descriptions exist:', 'yellow');
  log('   node backend/scripts/verify-taxonomy-descriptions-migration.js', 'yellow');
  log('   node backend/scripts/migrate-taxonomy-descriptions-to-tiptap.js --dry-run --limit=10', 'yellow');
  log('   node backend/scripts/migrate-taxonomy-descriptions-to-tiptap.js --force', 'yellow');
  log('4. Monitor Cloud Run logs for import/export errors', 'yellow');

  const allPass = results.tests && results.noCliBridge;
  log(allPass ? '\nSIGN-OFF: READY FOR BACKEND DEPLOY\n' : '\nSIGN-OFF: BLOCKED — fix failures above\n', allPass ? 'green' : 'red');
  process.exit(allPass ? 0 : 1);
}

main();
