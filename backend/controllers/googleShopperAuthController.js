const googleShopperAuthService = require("../services/googleShopperAuthService");

/**
 * POST /api/shopper/google
 * Body: { idToken: string }
 */
exports.googleAuth = async (req, res) => {
  try {
    const result = await googleShopperAuthService.authenticateWithGoogle(
      req.body?.idToken
    );
    return res.status(200).json(result);
  } catch (err) {
    if (err.code === "GOOGLE_LINK_REQUIRED") {
      return res.status(409).json({
        code: "GOOGLE_LINK_REQUIRED",
        message: err.message,
        email: err.email,
      });
    }

    const status = err.status || 500;
    return res.status(status).json({
      message: err.message || "Server error",
      ...(err.code ? { code: err.code } : {}),
    });
  }
};

/**
 * POST /api/shopper/google/link
 * Body: { idToken: string, password: string, identifier?: string }
 */
exports.linkGoogleAccount = async (req, res) => {
  try {
    const result = await googleShopperAuthService.linkGoogleAccount({
      idToken: req.body?.idToken,
      password: req.body?.password,
      identifier: req.body?.identifier,
    });
    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      message: err.message || "Server error",
      ...(err.code ? { code: err.code } : {}),
    });
  }
};
