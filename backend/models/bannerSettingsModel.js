const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  image: { type: String, default: '' },
  heading: { type: String, default: '' },
  text: { type: String, default: '' },
  buttonText: { type: String, default: '' },
  link: { type: String, default: '' },
});

const bannerSettingsSchema = new mongoose.Schema({
  sectionTitle: { type: String, default: '' },
  backgroundImage: { type: String, default: '' },
  offers: { type: [offerSchema], default: [] },
  gridLayout: { type: Number, enum: [1, 2, 4], default: 4 },
});

module.exports = mongoose.model('BannerSettings', bannerSettingsSchema);