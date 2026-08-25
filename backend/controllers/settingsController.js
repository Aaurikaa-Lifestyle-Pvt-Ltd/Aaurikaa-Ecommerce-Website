// controllers/settingsController.js
const mongoose = require("mongoose");
const SiteSettings = require("../models/SiteSettings");
const Translation = require("../models/Translation");
const cache = require("../utils/cache");

const SETTINGS_CACHE_TTL = 300; // seconds for site, header, footer, maintenance

// 🔧 Utility to get the single settings doc (or create if not exists) - for updates, returns Mongoose doc
const getSettings = async () => {
  let settings = await SiteSettings.findOne().sort({ createdAt: 1 });
  if (!settings) {
    settings = new SiteSettings();
    await settings.save();
  }
  return settings;
};

// 🔧 Get settings as plain object (for read-only GET handlers) with optional cache
const getSettingsLean = async () => {
  const doc = await SiteSettings.findOne().sort({ createdAt: 1 }).lean();
  return doc || {};
};

// ==============================
// 📞 Contact Info
// ==============================
exports.getContactInfo = async (req, res) => {
  const settings = await getSettings();
  res.json(settings.contactInfo || {});
};

exports.updateContactInfo = async (req, res) => {
  const settings = await getSettings();
  settings.contactInfo = req.body;
  await settings.save();
  res.json({ message: "✅ Contact info updated" });
};

// ==============================
// 🌐 Favicon
// ==============================
exports.getFavicon = async (req, res) => {
  const settings = await getSettings();
  res.json({ favicon: settings.favicon || "" });
};

exports.updateFavicon = async (req, res) => {
  const settings = await getSettings();
  settings.favicon = req.file?.filename || settings.favicon;
  await settings.save();
  res.json({ message: "✅ Favicon updated" });
};

// ==============================
// 🔗 Social Links
// ==============================
exports.getSocialLinks = async (req, res) => {
  const settings = await getSettings();
  res.json(settings.socialLinks || {});
};

exports.updateSocialLinks = async (req, res) => {
  const settings = await getSettings();
  settings.socialLinks = req.body;
  await settings.save();
  res.json({ message: "✅ Social links updated" });
};

// ==============================
// 🔍 SEO Meta Tags
// ==============================
exports.getSeoTags = async (req, res) => {
  const settings = await getSettings();
  res.json(settings.seo || {});
};

exports.updateSeoTags = async (req, res) => {
  const settings = await getSettings();
  settings.seo = req.body;
  await settings.save();
  res.json({ message: "✅ SEO tags updated" });
};

// ==============================
// 🧠 Header/Footer Scripts
// ==============================
const DEFAULT_SCRIPTS = { header: "", footer: "" };

exports.getScripts = async (req, res) => {
  const cacheKey = "settings-scripts";
  const cached = cache.get(cacheKey);
  if (cached) {
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    return res.json(cached);
  }
  const settings = await getSettingsLean();
  const raw = settings.scripts || {};
  const data = {
    header: raw.header || DEFAULT_SCRIPTS.header,
    footer: raw.footer || DEFAULT_SCRIPTS.footer,
  };
  cache.set(cacheKey, data, SETTINGS_CACHE_TTL);
  res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.json(data);
};

exports.updateScripts = async (req, res) => {
  const settings = await getSettings();
  settings.scripts = req.body;
  await settings.save();
  cache.del("settings-scripts");
  res.json({ message: "✅ Scripts updated" });
};

// ==============================
// 🎨 Color Settings
// ==============================
const DEFAULT_COLORS = {
  primary: "#6b46c1",
  secondary: "#2b6cb0",
  accent: "#d69e2e",
  background: "#ffffff",
};

exports.getColors = async (req, res) => {
  const cacheKey = "settings-colors";
  const cached = cache.get(cacheKey);
  if (cached) {
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    return res.json(cached);
  }
  const settings = await getSettingsLean();
  const raw = settings.colors || {};
  const data = {
    primary: raw.primary || DEFAULT_COLORS.primary,
    secondary: raw.secondary || DEFAULT_COLORS.secondary,
    accent: raw.accent || DEFAULT_COLORS.accent,
    background: raw.background || DEFAULT_COLORS.background,
  };
  cache.set(cacheKey, data, SETTINGS_CACHE_TTL);
  res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.json(data);
};

exports.updateColors = async (req, res) => {
  const settings = await getSettings();
  settings.colors = req.body;
  await settings.save();
  cache.del("settings-colors");
  res.json({ message: "✅ Colors updated" });
};

// Set a value on obj by path (e.g. "columns.0.title")
function setByPath(obj, path, value) {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const nextKey = parts[i + 1];
    const isArrayIndex = /^\d+$/.test(nextKey);
    if (current[key] == null) current[key] = isArrayIndex ? [] : {};
    current = current[key];
  }
  if (parts.length) current[parts[parts.length - 1]] = value;
}

// ==============================
// 🦶 Footer Settings
// ==============================
exports.getFooter = async (req, res) => {
  try {
    const locale = req.query.locale || "en";
    const cacheKey = `settings-footer-${locale}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      res.set("Cache-Control", "public, max-age=300, s-maxage=600");
      return res.json(cached);
    }
    const settings = await getSettingsLean();
    let footer = settings.footer
      ? (typeof settings.footer === "object" ? { ...settings.footer } : { columns: [], socialLinks: [], paymentIcons: [], copyright: "", text: "" })
      : { columns: [], socialLinks: [], paymentIcons: [], copyright: "", text: "" };
    if (!footer.columns) footer.columns = [];
    if (!footer.socialLinks) footer.socialLinks = [];
    if (!footer.paymentIcons) footer.paymentIcons = [];
    if (footer.copyright == null) footer.copyright = "";
    if (footer.text == null) footer.text = "";
    if (locale && locale !== "en" && settings._id) {
      const tr = await Translation.findOne({ model: "SiteSettings", documentId: settings._id, locale }).lean();
      if (tr && tr.fields) {
        const fields = tr.fields instanceof Map ? Object.fromEntries(tr.fields) : tr.fields;
        for (const [key, value] of Object.entries(fields)) {
          if (typeof value !== "string" || !key.startsWith("footer.")) continue;
          const path = key.slice("footer.".length);
          setByPath(footer, path, value);
        }
      }
    }
    cache.set(cacheKey, footer, SETTINGS_CACHE_TTL);
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.json(footer);
  } catch (error) {
    console.error("❌ Get footer settings error:", error);
    res.status(500).json({ error: "Failed to get footer settings" });
  }
};

exports.updateFooter = async (req, res) => {
  try {
    const settings = await getSettings();

    // Basic structural validation
    const { columns, socialLinks, paymentIcons, copyright, text, companyName, gstin, address, phone, email, workingHours1, workingHours2 } = req.body;

    settings.footer = {
      columns: Array.isArray(columns) ? columns : [],
      socialLinks: Array.isArray(socialLinks) ? socialLinks : [],
      paymentIcons: Array.isArray(paymentIcons) ? paymentIcons : [],
      copyright: copyright || "",
      text: text || "",
      companyName: companyName || "",
      gstin: gstin || "",
      address: address || "",
      phone: phone || "",
      email: email || "",
      workingHours1: workingHours1 || "",
      workingHours2: workingHours2 || ""
    };

    await settings.save();
    // Invalidate footer cache for all locales (keys are settings-footer-en, settings-footer-bn, etc.)
    const keys = cache.keys();
    keys.filter((k) => k.startsWith("settings-footer-")).forEach((k) => cache.del(k));
    res.json({ message: "✅ Footer updated successfully", footer: settings.footer });
  } catch (error) {
    console.error("❌ Update footer settings error:", error);
    res.status(500).json({ error: "Failed to update footer settings" });
  }
};

// ==============================
// 🧢 Header Settings
// ==============================
exports.getHeader = async (req, res) => {
  const cacheKey = "settings-header";
  const cached = cache.get(cacheKey);
  if (cached) {
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    return res.json(cached);
  }
  const settings = await getSettingsLean();
  const data = settings.header || {};
  cache.set(cacheKey, data, SETTINGS_CACHE_TTL);
  res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.json(data);
};

exports.updateHeader = async (req, res) => {
  const settings = await getSettings();
  settings.header = req.body;
  await settings.save();
  cache.del("settings-header");
  res.json({ message: "✅ Header updated" });
};

// ==============================
// 🌐 Site Settings (Title, Tagline, Logo, Favicon)
// ==============================
exports.getSite = async (req, res) => {
  try {
    const cacheKey = "settings-site";
    const cached = cache.get(cacheKey);
    if (cached) {
      res.set("Cache-Control", "public, max-age=300, s-maxage=600");
      return res.json(cached);
    }
    const settings = await getSettingsLean();
    const data = {
      title: settings.title || "",
      tagline: settings.tagline || "",
      logo: settings.logo || "",
      favicon: settings.favicon || "",
      recentlyViewedVisibleCount: Math.min(8, Math.max(4, Number(settings.recentlyViewedVisibleCount) || 6)),
      bestSellerSellerId: settings.bestSellerSellerId || null,
      bestSellerCategoryId: settings.bestSellerCategoryId || null,
    };
    cache.set(cacheKey, data, SETTINGS_CACHE_TTL);
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.json(data);
  } catch (error) {
    console.error("❌ Get site settings error:", error);
    res.status(500).json({ error: "Failed to get site settings" });
  }
};

exports.updateSite = async (req, res) => {
  try {
    const settings = await getSettings();

    // Update text fields
    if (req.body.title !== undefined) settings.title = req.body.title;
    if (req.body.tagline !== undefined) settings.tagline = req.body.tagline;
    if (req.body.recentlyViewedVisibleCount !== undefined) {
      const v = Math.min(8, Math.max(4, parseInt(req.body.recentlyViewedVisibleCount, 10) || 6));
      settings.recentlyViewedVisibleCount = v;
    }

    // Update file fields if files were uploaded
    if (req.files) {
      if (req.files.logo && req.files.logo[0]) {
        settings.logo = req.files.logo[0].filename;
      }
      if (req.files.favicon && req.files.favicon[0]) {
        settings.favicon = req.files.favicon[0].filename;
      }
    }

    // Best Sellers section config (optional seller or category filter)
    if (req.body.bestSellerSellerId !== undefined) {
      const v = req.body.bestSellerSellerId;
      settings.bestSellerSellerId =
        v && String(v).trim() && mongoose.Types.ObjectId.isValid(String(v).trim())
          ? v
          : null;
    }
    if (req.body.bestSellerCategoryId !== undefined) {
      const v = req.body.bestSellerCategoryId;
      settings.bestSellerCategoryId =
        v && String(v).trim() && mongoose.Types.ObjectId.isValid(String(v).trim())
          ? v
          : null;
    }

    await settings.save();
    cache.del("settings-site");
    // Invalidate homepage bundle cache so next load uses new best-seller config
    const keys = cache.keys();
    const bundleKeys = keys.filter((k) => k.startsWith("homepage-bundle-"));
    bundleKeys.forEach((k) => cache.del(k));
    res.json({ message: "✅ Site settings updated" });
  } catch (error) {
    console.error("❌ Update site settings error:", error);
    res.status(500).json({ error: "Failed to update site settings" });
  }
};

// ==============================
// 🔧 Maintenance Mode
// ==============================
exports.getMaintenanceMode = async (req, res) => {
  try {
    const cacheKey = "settings-maintenance";
    const cached = cache.get(cacheKey);
    if (cached) {
      res.set("Cache-Control", "public, max-age=300, s-maxage=600");
      return res.json(cached);
    }
    const settings = await getSettingsLean();
    const data = {
      enabled: settings.maintenance?.enabled || false,
      message: settings.maintenance?.message || "We're currently performing scheduled maintenance. We'll be back shortly. Thank you for your patience."
    };
    cache.set(cacheKey, data, SETTINGS_CACHE_TTL);
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.json(data);
  } catch (error) {
    console.error("❌ Get maintenance mode error:", error);
    res.status(500).json({ error: "Failed to get maintenance mode settings" });
  }
};

exports.updateMaintenanceMode = async (req, res) => {
  try {
    const settings = await getSettings();

    if (req.body.enabled !== undefined) {
      settings.maintenance = settings.maintenance || {};
      settings.maintenance.enabled = req.body.enabled === true;
    }

    if (req.body.message !== undefined) {
      settings.maintenance = settings.maintenance || {};
      settings.maintenance.message = req.body.message || "We're currently performing scheduled maintenance. We'll be back shortly. Thank you for your patience.";
    }

    await settings.save();
    cache.del("settings-maintenance");
    res.json({
      message: `✅ Maintenance mode ${settings.maintenance.enabled ? 'enabled' : 'disabled'}`,
      maintenance: {
        enabled: settings.maintenance.enabled,
        message: settings.maintenance.message
      }
    });
  } catch (error) {
    console.error("❌ Update maintenance mode error:", error);
    res.status(500).json({ error: "Failed to update maintenance mode" });
  }
};

// ==============================
// 📨 Newsletter Settings
// ==============================
exports.getNewsletterSettings = async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({
      notificationEmail: settings.subscriptionNotificationEmail || ""
    });
  } catch (error) {
    console.error("❌ Get newsletter settings error:", error);
    res.status(500).json({ error: "Failed to get newsletter settings" });
  }
};

exports.updateNewsletterSettings = async (req, res) => {
  try {
    const settings = await getSettings();
    if (req.body.notificationEmail !== undefined) {
      settings.subscriptionNotificationEmail = req.body.notificationEmail;
    }
    await settings.save();
    res.json({ message: "✅ Newsletter settings updated" });
  } catch (error) {
    console.error("❌ Update newsletter settings error:", error);
    res.status(500).json({ error: "Failed to update newsletter settings" });
  }
};

// ==============================
// 📨 Enquiry Notification Settings
// ==============================
exports.getEnquiryNotificationEmail = async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({
      notificationEmail: settings.enquiryNotificationEmail || ""
    });
  } catch (error) {
    console.error("❌ Get enquiry notification settings error:", error);
    res.status(500).json({ error: "Failed to get enquiry notification settings" });
  }
};

exports.updateEnquiryNotificationEmail = async (req, res) => {
  try {
    const settings = await getSettings();
    if (req.body.notificationEmail !== undefined) {
      settings.enquiryNotificationEmail = req.body.notificationEmail;
    }
    await settings.save();
    res.json({ message: "✅ Enquiry notification settings updated" });
  } catch (error) {
    console.error("❌ Update enquiry notification settings error:", error);
    res.status(500).json({ error: "Failed to update enquiry notification settings" });
  }
};

// ==============================
// 📨 Career Notification Settings
// ==============================
exports.getCareerNotificationEmail = async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({
      notificationEmail: settings.careerNotificationEmail || ""
    });
  } catch (error) {
    console.error("❌ Get career notification settings error:", error);
    res.status(500).json({ error: "Failed to get career notification settings" });
  }
};

exports.updateCareerNotificationEmail = async (req, res) => {
  try {
    const settings = await getSettings();
    if (req.body.notificationEmail !== undefined) {
      settings.careerNotificationEmail = req.body.notificationEmail;
    }
    await settings.save();
    res.json({ message: "✅ Career notification settings updated" });
  } catch (error) {
    console.error("❌ Update career notification settings error:", error);
    res.status(500).json({ error: "Failed to update career notification settings" });
  }
};

// ==============================
// 🎞 Homepage Media Settings
// ==============================
exports.getHomepageMedia = async (req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings.homepageMedia || {});
  } catch (error) {
    console.error("❌ Get homepage media error:", error);
    res.status(500).json({ error: "Failed to get homepage media settings" });
  }
};

exports.updateHomepageMedia = async (req, res) => {
  try {
    const settings = await getSettings();
    settings.homepageMedia = {
      youtubeVideoUrl: req.body.youtubeVideoUrl || "",
      youtubeLinkText: req.body.youtubeLinkText || "",
      youtubeLinkUrl: req.body.youtubeLinkUrl || "",
    };
    await settings.save();
    // Invalidate homepage bundle cache so the front page reflects changes immediately
    const keys = cache.keys();
    keys.filter((k) => k.startsWith("homepage-bundle-")).forEach((k) => cache.del(k));
    res.json({ message: "✅ Homepage media settings updated", homepageMedia: settings.homepageMedia });
  } catch (error) {
    console.error("❌ Update homepage media error:", error);
    res.status(500).json({ error: "Failed to update homepage media settings" });
  }
};
