/**
 * Point L — Resolved open decisions (locked before Phase 3/4).
 * Source of truth for authorization rollout; do not edit the plan file.
 */

/** @typedef {'manual_password'|'temp_password_email'|'invite_link'} AdminCreationFlow */

const RBAC_DECISIONS = {
  permissionCatalog: {
    /** Final domain:action keys live in adminPermissionCatalog.js (20 domains). */
    source: "adminPermissionCatalog.js",
    /** Domains excluded from staff checkbox assignment (Super Admin exclusive). */
    nonAssignableDomains: ["admin_users"],
    /** Group domains in the permission UI by section label. */
    uiGroups: [
      {
        id: "commerce",
        label: "Commerce",
        domains: [
          "catalog",
          "taxonomy",
          "catalog_config",
          "media",
          "orders",
          "order_confirmations",
          "order_returns",
          "promotions",
        ],
      },
      {
        id: "users",
        label: "Users & Vendors",
        domains: ["shoppers", "sellers"],
      },
      {
        id: "finance",
        label: "Finance",
        domains: ["finance"],
      },
      {
        id: "content",
        label: "Content & Storefront",
        domains: ["content", "reviews", "cms", "homepage"],
      },
      {
        id: "platform",
        label: "Platform Settings",
        domains: ["site_settings", "localization", "locations", "newsletter", "support"],
      },
    ],
  },

  tokenVersion: {
    /** Bump on permission, activation, and password changes (forces re-login). */
    bumpOnPermissionChange: true,
    bumpOnActivationChange: true,
    bumpOnPasswordChange: true,
  },

  frontendPermissionRefresh: {
    /** No periodic polling; refresh via login and explicit /api/admin/me calls. */
    strategy: "on_login_and_me",
    pollIntervalMs: null,
  },

  adminCreationFlow: {
    /** Super Admin sets initial password in the staff form; share credentials out-of-band. */
    method: "manual_password",
    emailInvite: false,
    tempPasswordEmail: false,
  },

  displayLabel: {
    /** Optional free-text label; suggestions only — never used for authorization. */
    required: false,
    inputType: "free_text_with_suggestions",
    suggestedLabels: [
      "Editor",
      "Order Confirmation Staff",
      "Catalog Manager",
      "Content Moderator",
      "Finance Staff",
      "Support Staff",
    ],
  },

  orphanPages: {
    transactions: "hide_from_nav",
    changePassword: "implement_api",
    stockNotifications: "api_only_protect",
    pickupLocations: "api_only_protect",
    commissions: "api_only_protect",
  },

  doubleBcryptHashing: {
    /** Pre-existing bug in legacy password paths; tracked separately from Point L. */
    scope: "deferred_separate_ticket",
  },
};

module.exports = RBAC_DECISIONS;
