const mongoose = require('mongoose');

const translationSchema = new mongoose.Schema(
  {
    model: { type: String, required: true, index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    locale: { type: String, required: true, enum: ['bn', 'hi'] },
    fields: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

translationSchema.index({ model: 1, documentId: 1, locale: 1 }, { unique: true });

module.exports = mongoose.model('Translation', translationSchema);
