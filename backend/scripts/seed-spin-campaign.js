// backend/scripts/seed-spin-campaign.js
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const SpinCampaign = require("../models/SpinCampaign");
const { validateCampaignPayload } = require("../services/spinCampaignService");

const SEED_CAMPAIGN = {
  name: "AAURIKAA Welcome Spin & Win",
  slug: "welcome-spin-win",
  status: "active",
  startDate: null,
  endDate: null,
  headline: "Spin & Win Exclusive AAURIKAA Rewards",
  description: "Spin the wheel of fortune to unlock exclusive coupons for your handcrafted jewellery collection.",
  couponCodePrefix: "AAURIKAA",
  segments: [
    {
      label: "10% OFF",
      type: "coupon",
      weight: 25,
      displayMessage: "10% OFF on your jewellery order",
      couponTemplate: {
        discountType: "percentage",
        discountValue: 10,
        minOrder: 999,
        freeShipping: false,
        validityDays: 7,
      },
    },
    {
      label: "Flat ₹250 OFF",
      type: "coupon",
      weight: 20,
      displayMessage: "Flat ₹250 discount on orders above ₹1,999",
      couponTemplate: {
        discountType: "fixed",
        discountValue: 250,
        minOrder: 1999,
        freeShipping: false,
        validityDays: 7,
      },
    },
    {
      label: "15% OFF",
      type: "coupon",
      weight: 15,
      displayMessage: "15% OFF on luxury jewellery",
      couponTemplate: {
        discountType: "percentage",
        discountValue: 15,
        minOrder: 2499,
        freeShipping: false,
        validityDays: 7,
      },
    },
    {
      label: "Better Luck",
      type: "lose",
      weight: 15,
      displayMessage: "Thank you for participating! Check back soon for new rewards.",
      couponTemplate: null,
    },
    {
      label: "Flat ₹500 OFF",
      type: "coupon",
      weight: 15,
      displayMessage: "Flat ₹500 discount on orders above ₹3,999",
      couponTemplate: {
        discountType: "fixed",
        discountValue: 500,
        minOrder: 3999,
        freeShipping: false,
        validityDays: 7,
      },
    },
    {
      label: "20% OFF",
      type: "coupon",
      weight: 10,
      displayMessage: "Mega 20% OFF on all jewellery!",
      couponTemplate: {
        discountType: "percentage",
        discountValue: 20,
        minOrder: 4999,
        freeShipping: false,
        validityDays: 7,
      },
    },
  ],
};

async function seedSpinCampaign() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/aaurikaa";
  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  console.log("Connected successfully.");

  const validationErrors = validateCampaignPayload(SEED_CAMPAIGN);
  if (validationErrors.length > 0) {
    console.error("Validation failed:", validationErrors);
    process.exit(1);
  }

  let campaign = await SpinCampaign.findOne({ slug: SEED_CAMPAIGN.slug });
  if (campaign) {
    console.log(`Updating existing campaign: "${campaign.name}" (${campaign._id})`);
    Object.assign(campaign, SEED_CAMPAIGN);
    await campaign.save();
  } else {
    console.log(`Creating new active campaign: "${SEED_CAMPAIGN.name}"`);
    campaign = await SpinCampaign.create(SEED_CAMPAIGN);
  }

  // Also make sure any other conflicting campaigns are not overriding if only one active campaign is previewed
  const totalActive = await SpinCampaign.countDocuments({ status: "active" });

  console.log("--------------------------------------------------");
  console.log("🎉 Spin Campaign Seeded Successfully!");
  console.log(`- Campaign ID: ${campaign._id}`);
  console.log(`- Name: ${campaign.name}`);
  console.log(`- Slug: ${campaign.slug}`);
  console.log(`- Status: ${campaign.status}`);
  console.log(`- Total Segments: ${campaign.segments.length}`);
  console.log(`- Total Active Campaigns in DB: ${totalActive}`);
  console.log("--------------------------------------------------");
  console.log("👉 Storefront URL: http://localhost:3000/spin-to-win");
  console.log(`👉 Admin Campaign URL: http://localhost:3001/admin/spin-campaigns/${campaign._id}`);
  console.log("--------------------------------------------------");

  await mongoose.disconnect();
}

seedSpinCampaign().catch((err) => {
  console.error("Failed to seed spin campaign:", err);
  process.exit(1);
});
