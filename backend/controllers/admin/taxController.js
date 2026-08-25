const Tax = require("../../models/Tax");

// ➕ Create new tax
exports.createTax = async (req, res) => {
  try {
    const { name, percentage, description } = req.body;
    if (!name || !percentage) {
      return res.status(400).json({ success: false, message: "Name and percentage required" });
    }

    const newTax = await Tax.create({ name, percentage, description });
    return res.json({ success: true, tax: newTax });
  } catch (err) {
    console.error("❌ Tax create error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// 📋 Get all taxes
exports.getTaxes = async (req, res) => {
  try {
    const taxes = await Tax.find();
    return res.json({ success: true, taxes });
  } catch (err) {
    console.error("❌ Tax fetch error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✏️ Update tax
exports.updateTax = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, percentage, description } = req.body;

    const updatedTax = await Tax.findByIdAndUpdate(
      id,
      { name, percentage, description },
      { new: true }
    );

    if (!updatedTax) {
      return res.status(404).json({ success: false, message: "Tax not found" });
    }

    return res.json({ success: true, tax: updatedTax });
  } catch (err) {
    console.error("❌ Tax update error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// 🗑 Delete tax
exports.deleteTax = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Tax.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Tax not found" });
    }
    return res.json({ success: true, message: "Tax deleted" });
  } catch (err) {
    console.error("❌ Tax delete error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
