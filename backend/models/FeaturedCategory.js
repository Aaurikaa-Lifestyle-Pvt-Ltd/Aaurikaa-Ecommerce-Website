const mongoose = require('mongoose');

const FeaturedCategorySchema = new mongoose.Schema({
  categoryIds: {
    type: [String],
    default: [],
  },
});

module.exports = mongoose.model('FeaturedCategory', FeaturedCategorySchema);