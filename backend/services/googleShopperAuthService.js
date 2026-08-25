/**
 * Google Sign-In for Shoppers — reuses existing Shopper JWT (id, role, name).
 *
 * Password strategy for Google-only accounts:
 *   Always store a random bcrypt hash so `password` remains required and
 *   password-login cannot succeed without a known credential.
 *
 * Linking: never silent-link. Existing email without googleId → 409 GOOGLE_LINK_REQUIRED;
 * client proves password via POST /google/link with a fresh idToken.
 */
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const Shopper = require("../models/Shopper");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getGoogleClientId() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !String(clientId).trim()) {
    const err = new Error("Google Sign-In is not configured");
    err.status = 503;
    err.code = "GOOGLE_AUTH_NOT_CONFIGURED";
    throw err;
  }
  return String(clientId).trim();
}

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const err = new Error("Server auth configuration error");
    err.status = 500;
    err.code = "JWT_SECRET_MISSING";
    throw err;
  }
  return secret;
}

/**
 * Verify Google ID token. Fail-closed when GOOGLE_CLIENT_ID is missing or token is invalid.
 * Exported for unit tests (mock instead of calling Google).
 */
async function verifyGoogleIdToken(idToken) {
  const clientId = getGoogleClientId();
  const client = new OAuth2Client(clientId);
  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });
  } catch {
    const err = new Error("Invalid Google token");
    err.status = 401;
    err.code = "INVALID_GOOGLE_TOKEN";
    throw err;
  }

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    const err = new Error("Invalid Google token");
    err.status = 401;
    err.code = "INVALID_GOOGLE_TOKEN";
    throw err;
  }

  if (payload.email_verified !== true) {
    const err = new Error("Google email is not verified");
    err.status = 401;
    err.code = "GOOGLE_EMAIL_UNVERIFIED";
    throw err;
  }

  return {
    googleId: String(payload.sub),
    email: String(payload.email).trim().toLowerCase(),
    name: payload.name || "",
    givenName: payload.given_name || "",
    familyName: payload.family_name || "",
    picture: payload.picture || "",
  };
}

function issueShopperJwt(shopper) {
  return jwt.sign(
    {
      id: shopper._id,
      role: shopper.role || "shopper",
      name: shopper.firstName || shopper.username,
    },
    requireJwtSecret(),
    { expiresIn: "7d" }
  );
}

function formatAuthSuccess(shopper, message = "✅ Login successful") {
  return {
    message,
    token: issueShopperJwt(shopper),
    shopper: {
      id: shopper._id,
      firstName: shopper.firstName,
      lastName: shopper.lastName,
      username: shopper.username,
      email: shopper.email,
      phone: shopper.phone,
      profileImage: shopper.profileImage,
    },
  };
}

function splitDisplayName({ name, givenName, familyName }) {
  if (givenName || familyName) {
    return {
      firstName: (givenName || "Shopper").trim() || "Shopper",
      lastName: (familyName || "User").trim() || "User",
    };
  }
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "Shopper", lastName: "User" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "User" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

async function generateUniqueUsername(email) {
  const localPart = String(email).split("@")[0] || "user";
  const base =
    localPart.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20).toLowerCase() ||
    "user";

  let candidate = base;
  let attempt = 0;
  while (await Shopper.findOne({ username: candidate }).select("_id").lean()) {
    attempt += 1;
    const suffix = attempt < 1000 ? String(attempt) : crypto.randomBytes(3).toString("hex");
    candidate = `${base.slice(0, 20 - String(suffix).length)}${suffix}`;
  }
  return candidate;
}

async function findShopperByEmail(email) {
  const normalized = String(email).trim().toLowerCase();
  return Shopper.findOne({
    email: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, "i") },
  });
}

async function findShopperByIdentifier(identifier) {
  const value = String(identifier || "").trim();
  if (!value) return null;
  return Shopper.findOne({
    $or: [
      { email: { $regex: new RegExp(`^${escapeRegex(value)}$`, "i") } },
      { username: value },
    ],
    role: "shopper",
  });
}

/**
 * POST /api/shopper/google — verify idToken and login / register / 409 link required.
 */
async function authenticateWithGoogle(idToken) {
  if (!idToken || typeof idToken !== "string" || !idToken.trim()) {
    const err = new Error("idToken is required");
    err.status = 400;
    err.code = "INVALID_INPUT";
    throw err;
  }

  // Use exports so tests can mock verifyGoogleIdToken without hitting Google.
  const identity = await module.exports.verifyGoogleIdToken(idToken.trim());

  const byGoogleId = await Shopper.findOne({ googleId: identity.googleId });
  if (byGoogleId) {
    return formatAuthSuccess(byGoogleId);
  }

  const byEmail = await findShopperByEmail(identity.email);
  if (byEmail) {
    if (!byEmail.googleId) {
      const err = new Error(
        "An account with this email already exists. Sign in with password to link Google."
      );
      err.status = 409;
      err.code = "GOOGLE_LINK_REQUIRED";
      err.email = identity.email;
      throw err;
    }

    const err = new Error("Email is linked to a different Google account");
    err.status = 409;
    err.code = "GOOGLE_ACCOUNT_CONFLICT";
    throw err;
  }

  const { firstName, lastName } = splitDisplayName(identity);
  const username = await generateUniqueUsername(identity.email);
  const randomPasswordHash = await bcrypt.hash(
    crypto.randomBytes(32).toString("hex"),
    10
  );

  const shopper = await Shopper.create({
    firstName,
    lastName,
    username,
    email: identity.email,
    phone: "",
    password: randomPasswordHash,
    googleId: identity.googleId,
    profileImage: identity.picture || "",
    role: "shopper",
  });

  return formatAuthSuccess(shopper);
}

/**
 * POST /api/shopper/google/link — password-confirm link of Google to existing email account.
 * Body: { idToken, password } or { idToken, password, identifier }.
 */
async function linkGoogleAccount({ idToken, password, identifier }) {
  if (!idToken || typeof idToken !== "string" || !idToken.trim()) {
    const err = new Error("idToken is required");
    err.status = 400;
    err.code = "INVALID_INPUT";
    throw err;
  }
  if (!password || typeof password !== "string") {
    const err = new Error("password is required");
    err.status = 400;
    err.code = "INVALID_INPUT";
    throw err;
  }

  const identity = await module.exports.verifyGoogleIdToken(idToken.trim());

  let shopper = null;
  if (identifier && String(identifier).trim()) {
    shopper = await findShopperByIdentifier(identifier);
    if (shopper) {
      const shopperEmail = String(shopper.email || "").trim().toLowerCase();
      if (shopperEmail !== identity.email) {
        const err = new Error("Google email does not match this account");
        err.status = 400;
        err.code = "EMAIL_MISMATCH";
        throw err;
      }
    }
  } else {
    shopper = await findShopperByEmail(identity.email);
  }

  if (!shopper) {
    const err = new Error("Shopper not found");
    err.status = 404;
    err.code = "SHOPPER_NOT_FOUND";
    throw err;
  }

  if (shopper.googleId) {
    if (shopper.googleId === identity.googleId) {
      return formatAuthSuccess(shopper, "✅ Google account already linked");
    }
    const err = new Error("Google account already linked");
    err.status = 409;
    err.code = "GOOGLE_ALREADY_LINKED";
    throw err;
  }

  const passwordOk = await bcrypt.compare(password, shopper.password);
  if (!passwordOk) {
    const err = new Error("Invalid credentials");
    err.status = 400;
    err.code = "INVALID_CREDENTIALS";
    throw err;
  }

  const existingGoogle = await Shopper.findOne({ googleId: identity.googleId })
    .select("_id")
    .lean();
  if (existingGoogle) {
    const err = new Error("This Google account is already linked to another shopper");
    err.status = 409;
    err.code = "GOOGLE_ACCOUNT_CONFLICT";
    throw err;
  }

  shopper.googleId = identity.googleId;
  if (identity.picture && !shopper.profileImage) {
    shopper.profileImage = identity.picture;
  }
  await shopper.save();

  return formatAuthSuccess(shopper, "✅ Google account linked successfully");
}

module.exports = {
  verifyGoogleIdToken,
  authenticateWithGoogle,
  linkGoogleAccount,
  issueShopperJwt,
  formatAuthSuccess,
};
