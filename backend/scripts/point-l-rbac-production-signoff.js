#!/usr/bin/env node

/**
 * Point L RBAC — Phase 5 production sign-off runner.
 * Verifies enforcement flags and runs the full regression matrix.
 *
 * Usage:
 *   PERMISSION_ENFORCEMENT=true PERMISSION_ENFORCED_DOMAINS=* node scripts/point-l-rbac-production-signoff.js
 */

const { spawnSync } = require("child_process");
const path = require("path");
const {
  DOMAIN_ROLLOUT_ORDER,
  getEnforcedDomains,
  isPermissionEnforcementActive,
  resetEnforcementCache,
} = require("../config/permissionEnforcement");

const ROOT = path.join(__dirname, "..");

const CHECKLIST = [
  { id: "L1", label: "PERMISSION_ENFORCEMENT=true" },
  { id: "L2", label: "All RBAC domains enforced (PERMISSION_ENFORCED_DOMAINS=*)" },
  { id: "L3", label: "Permission enforcement unit tests pass" },
  { id: "L4", label: "Admin permissions unit tests pass" },
  { id: "L5", label: "Point L RBAC integration regression matrix passes" },
  { id: "L6", label: "Frontend admin navigation visibility tests pass" },
];

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

const JEST_BIN = path.join(ROOT, "node_modules", "jest", "bin", "jest.js");
const FRONTEND_ROOT = path.join(ROOT, "..", "frontend");
const FRONTEND_JEST_BIN = path.join(FRONTEND_ROOT, "node_modules", "jest", "bin", "jest.js");

function runJest(jestBin, cwd, patterns, { envOverrides = {} } = {}) {
  const result = spawnSync(
    process.execPath,
    [jestBin, ...patterns, "--runInBand"],
    {
      cwd,
      env: {
        ...process.env,
        NODE_ENV: "test",
        JWT_SECRET: process.env.JWT_SECRET || "test-jwt-secret",
        PERMISSION_ENFORCEMENT: "true",
        PERMISSION_ENFORCED_DOMAINS: "*",
        ...envOverrides,
      },
      stdio: "inherit",
    }
  );

  return result.status === 0;
}

function allDomainsEnforced() {
  resetEnforcementCache();
  const enforced = getEnforcedDomains();
  return DOMAIN_ROLLOUT_ORDER.every((domain) => enforced.has(domain));
}

function main() {
  log("\n=== Point L RBAC — Phase 5 Production Sign-Off ===\n", "cyan");

  const results = {
    L1: isPermissionEnforcementActive(),
    L2: allDomainsEnforced(),
    L3: false,
    L4: false,
    L5: false,
    L6: false,
  };

  if (!results.L1) {
    log("⚠️  PERMISSION_ENFORCEMENT is not true — enable before production.", "yellow");
  }
  if (!results.L2) {
    log(
      "⚠️  Not all domains are enforced — set PERMISSION_ENFORCED_DOMAINS=* before production.",
      "yellow"
    );
  }

  log("Running permission enforcement unit tests...\n", "cyan");
  results.L3 = runJest(JEST_BIN, ROOT, ["tests/unit/permissionEnforcement.test.js"]);

  log("\nRunning admin permissions unit tests...\n", "cyan");
  results.L4 = runJest(JEST_BIN, ROOT, ["tests/unit/adminPermissions.test.js"]);

  log("\nRunning Point L RBAC integration regression matrix...\n", "cyan");
  results.L5 = runJest(JEST_BIN, ROOT, [
    "tests/integration/point-l-rbac-regression.test.js",
  ]);

  log("\nRunning frontend admin navigation visibility tests...\n", "cyan");
  results.L6 = runJest(
    FRONTEND_JEST_BIN,
    FRONTEND_ROOT,
    ["tests/utils/adminNavigation.test.js"]
  );

  log("\n=== Sign-Off Checklist ===\n", "cyan");
  let allPassed = true;

  CHECKLIST.forEach(({ id, label }) => {
    const passed = results[id];
    allPassed = allPassed && passed;
    log(`${passed ? "✅" : "❌"} [${id}] ${label}`, passed ? "green" : "red");
  });

  log(
    allPassed
      ? "\n✅ Point L RBAC Phase 5 sign-off PASSED\n"
      : "\n❌ Point L RBAC Phase 5 sign-off FAILED\n",
    allPassed ? "green" : "red"
  );

  process.exit(allPassed ? 0 : 1);
}

main();
