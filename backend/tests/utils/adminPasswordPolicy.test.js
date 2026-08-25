const {
  isValidAdminPassword,
  ADMIN_PASSWORD_MESSAGE,
} = require("../../utils/adminPasswordPolicy");

describe("adminPasswordPolicy", () => {
  it("accepts passwords that meet the admin policy", () => {
    expect(isValidAdminPassword("Password1!")).toBe(true);
    expect(isValidAdminPassword("Staff@Pass123")).toBe(true);
  });

  it("rejects weak passwords", () => {
    expect(isValidAdminPassword("password1")).toBe(false);
    expect(isValidAdminPassword("12345678")).toBe(false);
    expect(isValidAdminPassword("Password1")).toBe(false);
    expect(isValidAdminPassword("short1!")).toBe(false);
  });

  it("exposes a stable validation message", () => {
    expect(ADMIN_PASSWORD_MESSAGE).toContain("uppercase");
    expect(ADMIN_PASSWORD_MESSAGE).toContain("special character");
  });
});
