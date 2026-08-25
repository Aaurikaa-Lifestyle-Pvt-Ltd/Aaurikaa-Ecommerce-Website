// backend/utils/productUtils.js
const fs = require("fs");
const path = require("path");

// ---------------------------
// 🔹 Safe JSON Parse
// ---------------------------
const safeParse = (val, fallback = []) => {
  try {
    return JSON.parse(val || "[]");
  } catch {
    return fallback;
  }
};

// ---------------------------
// 🔹 String → Boolean
// ---------------------------
const toBool = (val) =>
  ["true", "yes", "1"].includes(String(val).toLowerCase());

// ---------------------------
// 🔹 Delete File
// ---------------------------
const deleteFile = (filePath) => {
  fs.unlink(filePath, (err) => {
    if (err) console.warn("⚠️ File delete error:", err.message);
  });
};

// ---------------------------
// 🔹 Get Upload Folder Based on Role
// ---------------------------
// Rule:
// - Seller নিজের প্রোডাক্ট → sellers/
// - Admin নিজের প্রোডাক্ট → admins/
// - Admin যদি Seller এর প্রোডাক্ট এড/এডিট/আপলোড করে → sellers/
const getRoleFolder = (req, existingProduct = null) => {
  if (req.user?.role === "seller") {
    return "sellers"; // 🟢 Seller সবসময় sellers ফোল্ডার
  }

  if (req.user?.role === "admin") {
    // যদি sellerId দেওয়া থাকে অথবা existingProduct এর সাথে seller যুক্ত থাকে
    if (req.body.sellerId || existingProduct?.seller) {
      return "sellers"; // 🟢 Admin → Seller এর প্রোডাক্ট = sellers ফোল্ডার
    }
    return "admins"; // 🟢 Admin এর নিজের প্রোডাক্ট = admins ফোল্ডার
  }

  // fallback
  return "admins";
};

module.exports = {
  safeParse,
  toBool,
  deleteFile,
  getRoleFolder,
};
