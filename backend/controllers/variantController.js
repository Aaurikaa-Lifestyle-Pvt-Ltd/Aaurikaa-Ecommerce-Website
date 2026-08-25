const Variant = require("../models/Variant");

// ✅ Get all variants
exports.getAllVariants = async (req, res) => {
  try {
    const variants = await Variant.find();
    res.json(variants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Create new variant
exports.createVariant = async (req, res) => {
  try {
    const { name, values } = req.body;
    const variant = new Variant({ name, values });
    await variant.save();
    res.status(201).json(variant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Update existing variant
exports.updateVariant = async (req, res) => {
  try {
    const { name, values } = req.body;
    const updated = await Variant.findByIdAndUpdate(
      req.params.id,
      { name, values },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: "Variant not found" });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Delete a variant
exports.deleteVariant = async (req, res) => {
  try {
    const deleted = await Variant.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Variant not found" });
    }
    res.json({ message: "Variant deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
