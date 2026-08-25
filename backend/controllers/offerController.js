// backend/controllers/offerController.js

const Offer = require("../models/offer");

exports.getOffers = async (req, res) => {
  try {
    const offers = await Offer.find().sort({ createdAt: -1 });
    res.json(offers);
  } catch (err) {
    console.error("❌ Error fetching offers:", err);
    res.status(500).json({ message: "Failed to fetch offers" });
  }
};

exports.createOffer = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: "Offer text is required" });

    const offer = new Offer({ text });
    await offer.save();
    res.status(201).json({ message: "✅ Offer added", offer });
  } catch (err) {
    console.error("❌ Error adding offer:", err);
    res.status(500).json({ message: "Failed to add offer" });
  }
};

exports.deleteOffer = async (req, res) => {
  try {
    const offer = await Offer.findByIdAndDelete(req.params.id);
    if (!offer) return res.status(404).json({ message: "Offer not found" });

    res.status(200).json({ message: "✅ Offer deleted" });
  } catch (err) {
    console.error("❌ Error deleting offer:", err);
    res.status(500).json({ message: "Failed to delete offer" });
  }
};
