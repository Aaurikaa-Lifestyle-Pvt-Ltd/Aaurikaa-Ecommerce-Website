const mongoose = require("mongoose");
const slugify = require("slugify");

const blogCategorySchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: [true, 'Category name is required'], 
      unique: true, 
      trim: true,
      minlength: [2, 'Category name must be at least 2 characters'],
      maxlength: [50, 'Category name cannot exceed 50 characters'],
      match: [/^[a-zA-Z0-9\s\-&.]+$/, 'Category name contains invalid characters']
    },
    slug: { 
      type: String, 
      unique: true, 
      index: true,
      match: [/^[a-z0-9\-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens']
    },
    description: { 
      type: String, 
      default: "",
      maxlength: [500, 'Description cannot exceed 500 characters']
    }
  },
  { timestamps: true }
);

// slug auto generate with conflict handling
blogCategorySchema.pre("save", async function (next) {
  if (!this.slug && this.name) {
    let baseSlug = slugify(this.name, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;
    
    // Check for slug conflicts and append number if needed
    while (await this.constructor.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    this.slug = slug;
  }
  next();
});

module.exports = mongoose.model("BlogCategory", blogCategorySchema);
