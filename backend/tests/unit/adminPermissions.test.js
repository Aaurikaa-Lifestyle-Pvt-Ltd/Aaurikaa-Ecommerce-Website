const {
  hasPermission,
  validatePermissionKeys,
  formatAdminAuthPayload,
} = require("../../utils/adminPermissions");

describe("adminPermissions utilities", () => {
  describe("hasPermission", () => {
    it("grants all permissions to Super Admin", () => {
      const superAdmin = { isSuperAdmin: true, permissions: [] };
      expect(hasPermission(superAdmin, "finance", "approve")).toBe(true);
      expect(hasPermission(superAdmin, "catalog", "manage")).toBe(true);
    });

    it("checks staff permissions by domain:action key", () => {
      const editor = {
        isSuperAdmin: false,
        permissions: ["content:view", "content:manage", "cms:manage"],
      };

      expect(hasPermission(editor, "content", "view")).toBe(true);
      expect(hasPermission(editor, "content", "manage")).toBe(true);
      expect(hasPermission(editor, "cms", "manage")).toBe(true);
      expect(hasPermission(editor, "finance", "view")).toBe(false);
      expect(hasPermission(editor, "sellers", "approve")).toBe(false);
    });

    it("supports Order Confirmation Staff matrix", () => {
      const staff = {
        isSuperAdmin: false,
        permissions: ["orders:view", "order_confirmations:manage"],
      };

      expect(hasPermission(staff, "orders", "view")).toBe(true);
      expect(hasPermission(staff, "orders", "manage")).toBe(false);
      expect(hasPermission(staff, "order_confirmations", "manage")).toBe(true);
      expect(hasPermission(staff, "finance", "approve")).toBe(false);
    });
  });

  describe("validatePermissionKeys", () => {
    it("accepts valid catalog keys", () => {
      const result = validatePermissionKeys(["catalog:view", "catalog:manage"]);
      expect(result.valid).toBe(true);
      expect(result.invalid).toEqual([]);
    });

    it("rejects unknown permission keys", () => {
      const result = validatePermissionKeys(["catalog:view", "fake:manage"]);
      expect(result.valid).toBe(false);
      expect(result.invalid).toContain("fake:manage");
    });
  });

  describe("formatAdminAuthPayload", () => {
    it("returns empty permissions array for Super Admin", () => {
      const payload = formatAdminAuthPayload({
        _id: "507f1f77bcf86cd799439011",
        name: "Super",
        username: "super",
        email: "super@example.com",
        profileImage: "",
        isSuperAdmin: true,
        permissions: ["catalog:view"],
        displayLabel: null,
      });

      expect(payload.isSuperAdmin).toBe(true);
      expect(payload.permissions).toEqual([]);
    });

    it("returns staff permissions for non-Super Admin", () => {
      const payload = formatAdminAuthPayload({
        _id: "507f1f77bcf86cd799439012",
        name: "Editor",
        username: "editor",
        email: "editor@example.com",
        profileImage: "",
        isSuperAdmin: false,
        permissions: ["content:view", "content:manage"],
        displayLabel: "Editor",
      });

      expect(payload.permissions).toEqual(["content:view", "content:manage"]);
      expect(payload.displayLabel).toBe("Editor");
    });
  });
});
