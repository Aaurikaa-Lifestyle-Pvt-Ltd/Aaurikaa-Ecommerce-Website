const {
  DOMAIN_ROLLOUT_ORDER,
  isPermissionEnforcementActive,
  getEnforcedDomains,
  isDomainEnforced,
  resetEnforcementCache,
} = require("../../config/permissionEnforcement");

describe("permissionEnforcement config", () => {
  const originalEnforcement = process.env.PERMISSION_ENFORCEMENT;
  const originalDomains = process.env.PERMISSION_ENFORCED_DOMAINS;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.PERMISSION_ENFORCEMENT = originalEnforcement;
    process.env.PERMISSION_ENFORCED_DOMAINS = originalDomains;
    process.env.NODE_ENV = originalNodeEnv;
    resetEnforcementCache();
  });

  it("returns false when master switch is off", () => {
    process.env.NODE_ENV = "development";
    process.env.PERMISSION_ENFORCEMENT = "false";
    process.env.PERMISSION_ENFORCED_DOMAINS = "*";
    resetEnforcementCache();

    expect(isPermissionEnforcementActive()).toBe(false);
    expect(isDomainEnforced("finance")).toBe(false);
  });

  it("always enforces order_returns in production even when master switch is off", () => {
    process.env.NODE_ENV = "production";
    process.env.PERMISSION_ENFORCEMENT = "false";
    process.env.PERMISSION_ENFORCED_DOMAINS = "*";
    resetEnforcementCache();

    expect(isPermissionEnforcementActive()).toBe(false);
    expect(isDomainEnforced("order_returns")).toBe(true);
    expect(isDomainEnforced("finance")).toBe(false);
  });

  it("assertProductionPermissionEnforcement fails when production lacks flag", () => {
    const {
      assertProductionPermissionEnforcement,
    } = require("../../config/permissionEnforcement");
    process.env.NODE_ENV = "production";
    process.env.PERMISSION_ENFORCEMENT = "false";
    expect(assertProductionPermissionEnforcement().ok).toBe(false);

    process.env.PERMISSION_ENFORCEMENT = "true";
    expect(assertProductionPermissionEnforcement().ok).toBe(true);
  });

  it("enforces all rollout domains when switch is on and domains is *", () => {
    process.env.NODE_ENV = "development";
    process.env.PERMISSION_ENFORCEMENT = "true";
    process.env.PERMISSION_ENFORCED_DOMAINS = "*";
    resetEnforcementCache();

    expect(isPermissionEnforcementActive()).toBe(true);
    expect(getEnforcedDomains().size).toBe(DOMAIN_ROLLOUT_ORDER.length);
    DOMAIN_ROLLOUT_ORDER.forEach((domain) => {
      expect(isDomainEnforced(domain)).toBe(true);
    });
  });

  it("supports gradual rollout via comma-separated domain list", () => {
    process.env.NODE_ENV = "development";
    process.env.PERMISSION_ENFORCEMENT = "true";
    process.env.PERMISSION_ENFORCED_DOMAINS = "finance,sellers";
    resetEnforcementCache();

    expect(isDomainEnforced("finance")).toBe(true);
    expect(isDomainEnforced("sellers")).toBe(true);
    expect(isDomainEnforced("catalog")).toBe(false);
  });
});
