const mongoose = require('mongoose');

const gridItemSchema = new mongoose.Schema({
  image: { type: String, default: '' },
  caption: { type: String, default: '' },
  link: { type: String, default: '' },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
});

const groupSchema = new mongoose.Schema({
  heading: { type: String, default: '' },
  items: {
    type: [gridItemSchema],
    default: [],
    validate: {
      validator(v) {
        return v.length <= 4;
      },
      message: 'Each group cannot exceed 4 items',
    },
  },
}, { _id: false });

const homepageGrid4x4Schema = new mongoose.Schema({
  heading: { type: String, default: '' },
  items: {
    type: [gridItemSchema],
    default: [],
    validate: {
      validator(v) {
        return v.length <= 16;
      },
      message: 'Items cannot exceed 16',
    },
  },
  groups: {
    type: [groupSchema],
    default: [],
    validate: {
      validator(v) {
        return v.length <= 4 && v.every((g) => (g.items && g.items.length) <= 4);
      },
      message: 'Max 4 groups, 4 items per group',
    },
  },
}, { timestamps: true });

module.exports = mongoose.model('HomepageGrid4x4', homepageGrid4x4Schema);
