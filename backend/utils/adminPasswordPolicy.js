// Canonical backend admin password policy.
// Used by staff create/update, change-password controllers, and the Admin model.
// Update this file first when password rules change.
const ADMIN_PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

const ADMIN_PASSWORD_MESSAGE =
  "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character";

const isValidAdminPassword = (password) =>
  typeof password === "string" && ADMIN_PASSWORD_REGEX.test(password);

module.exports = {
  ADMIN_PASSWORD_REGEX,
  ADMIN_PASSWORD_MESSAGE,
  isValidAdminPassword,
};
