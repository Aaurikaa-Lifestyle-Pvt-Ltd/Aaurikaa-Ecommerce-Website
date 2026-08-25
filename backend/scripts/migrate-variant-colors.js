#!/usr/bin/env node

/**
 * Variant Color Migration Script
 * Migrates existing variants and products to include color codes
 * 
 * Usage:
 *   node migrate-variant-colors.js --dry-run    # Preview changes
 *   node migrate-variant-colors.js               # Apply changes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Variant = require('../models/Variant');
const Product = require('../models/Product');

// Database connection
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

// Color name to hex code mapping
const COLOR_MAP = {
  // Basic colors
  'red': '#FF0000',
  'green': '#008000',
  'blue': '#0000FF',
  'yellow': '#FFFF00',
  'orange': '#FFA500',
  'purple': '#800080',
  'pink': '#FFC0CB',
  'brown': '#A52A2A',
  'black': '#000000',
  'white': '#FFFFFF',
  'gray': '#808080',
  'grey': '#808080',
  'cyan': '#00FFFF',
  'magenta': '#FF00FF',
  'lime': '#00FF00',
  'navy': '#000080',
  'maroon': '#800000',
  'olive': '#808000',
  'teal': '#008080',
  'silver': '#C0C0C0',
  'gold': '#FFD700',
  'beige': '#F5F5DC',
  'ivory': '#FFFFF0',
  'tan': '#D2B48C',
  'coral': '#FF7F50',
  'salmon': '#FA8072',
  'turquoise': '#40E0D0',
  'violet': '#EE82EE',
  'indigo': '#4B0082',
  'khaki': '#F0E68C',
  'lavender': '#E6E6FA',
  'plum': '#DDA0DD',
  'peach': '#FFE5B4',
  'mint': '#98FB98',
  'cream': '#FFFDD0',
  'charcoal': '#36454F',
  'burgundy': '#800020',
  'crimson': '#DC143C',
  'emerald': '#50C878',
  'amber': '#FFBF00',
  'bronze': '#CD7F32',
  'copper': '#B87333',
  'rose': '#FF007F',
  'coral': '#FF7F50',
  'aqua': '#00FFFF',
  'azure': '#007FFF',
  'bisque': '#FFE4C4',
  'chocolate': '#7B3F00',
  'coral': '#FF7F50',
  'crimson': '#DC143C',
  'fuchsia': '#FF00FF',
  'honeydew': '#F0FFF0',
  'hotpink': '#FF69B4',
  'lightblue': '#ADD8E6',
  'lightgreen': '#90EE90',
  'lightgrey': '#D3D3D3',
  'lightpink': '#FFB6C1',
  'lightsalmon': '#FFA07A',
  'lightyellow': '#FFFFE0',
  'mediumblue': '#0000CD',
  'mediumseagreen': '#3CB371',
  'mediumslateblue': '#7B68EE',
  'mediumspringgreen': '#00FA9A',
  'mediumturquoise': '#48D1CC',
  'mediumvioletred': '#C71585',
  'midnightblue': '#191970',
  'mistyrose': '#FFE4E1',
  'moccasin': '#FFE4B5',
  'navajowhite': '#FFDEAD',
  'oldlace': '#FDF5E6',
  'olivedrab': '#6B8E23',
  'orangered': '#FF4500',
  'orchid': '#DA70D6',
  'palegoldenrod': '#EEE8AA',
  'palegreen': '#98FB98',
  'paleturquoise': '#AFEEEE',
  'palevioletred': '#DB7093',
  'papayawhip': '#FFEFD5',
  'peachpuff': '#FFDAB9',
  'peru': '#CD853F',
  'powderblue': '#B0E0E6',
  'rosybrown': '#BC8F8F',
  'royalblue': '#4169E1',
  'saddlebrown': '#8B4513',
  'sandybrown': '#F4A460',
  'seagreen': '#2E8B57',
  'seashell': '#FFF5EE',
  'sienna': '#A0522D',
  'skyblue': '#87CEEB',
  'slateblue': '#6A5ACD',
  'slategray': '#708090',
  'snow': '#FFFAFA',
  'springgreen': '#00FF7F',
  'steelblue': '#4682B4',
  'thistle': '#D8BFD8',
  'tomato': '#FF6347',
  'wheat': '#F5DEB3',
  'whitesmoke': '#F5F5F5',
  'yellowgreen': '#9ACD32'
};

/**
 * Normalize color name for lookup
 */
function normalizeColorName(name) {
  if (!name || typeof name !== 'string') return null;
  
  // Remove extra spaces, convert to lowercase
  let normalized = name.trim().toLowerCase();
  
  // Remove common prefixes/suffixes
  normalized = normalized.replace(/^(color|colour|col)$/i, '').trim();
  
  // Remove special characters except spaces and hyphens
  normalized = normalized.replace(/[^a-z0-9\s-]/g, '');
  
  // Replace multiple spaces with single space
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Remove spaces and hyphens for lookup
  const lookupKey = normalized.replace(/[\s-]/g, '');
  
  return lookupKey || normalized;
}

/**
 * Get hex code for a color name
 */
function getColorCode(colorName) {
  if (!colorName) return null;
  
  const normalized = normalizeColorName(colorName);
  
  // Direct lookup
  if (COLOR_MAP[normalized]) {
    return COLOR_MAP[normalized];
  }
  
  // Try partial matches (e.g., "light blue" -> "lightblue")
  for (const [key, value] of Object.entries(COLOR_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }
  
  return null;
}

/**
 * Extract label from "label|hex" format
 */
function extractLabel(value) {
  if (typeof value !== 'string') return value;
  if (value.includes('|')) {
    return value.split('|')[0].trim();
  }
  return value.trim();
}

/**
 * Extract hex from "label|hex" format
 */
function extractHex(value) {
  if (typeof value !== 'string') return null;
  if (value.includes('|')) {
    const parts = value.split('|');
    if (parts.length === 2) {
      const hex = parts[1].trim();
      if (hex.startsWith('#') && /^#[0-9A-F]{6}$/i.test(hex)) {
        return hex.toUpperCase();
      }
    }
  }
  return null;
}

/**
 * Format variant value as "label|hex"
 */
function formatVariantValue(label, hex) {
  if (!hex) return label;
  const cleanHex = hex.startsWith('#') ? hex : `#${hex}`;
  return `${label}|${cleanHex.toUpperCase()}`;
}

async function migrateVariants(dryRun = true) {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be saved\n');
    } else {
      console.log('⚠️  LIVE MODE - Changes will be saved to database\n');
    }

    // ============ MIGRATE VARIANTS ============
    console.log('='.repeat(60));
    console.log('🎨 MIGRATING VARIANT COLOR CODES');
    console.log('='.repeat(60));

    const colorVariants = await Variant.find({
      name: { $regex: /color/i }
    });

    console.log(`\nFound ${colorVariants.length} color variant(s)\n`);

    let variantsUpdated = 0;
    let valuesUpdated = 0;
    let valuesSkipped = 0;

    for (const variant of colorVariants) {
      let variantModified = false;
      const updates = [];

      variant.values.forEach((val, index) => {
        const valueObj = typeof val === 'object' ? val : { value: val };
        const valueName = valueObj.value || val;
        const existingCode = valueObj.code;

        // Skip if already has a valid code
        if (existingCode && /^#[0-9A-F]{6}$/i.test(existingCode)) {
          valuesSkipped++;
          return;
        }

        // Try to get color code
        const colorCode = getColorCode(valueName);

        if (colorCode) {
          updates.push({
            index,
            value: valueObj.value || valueName,
            displayName: valueObj.displayName || valueName,
            code: colorCode,
            oldCode: existingCode || 'none'
          });
          valuesUpdated++;
          variantModified = true;
        } else {
          console.log(`  ⚠️  Could not find color code for: "${valueName}"`);
          valuesSkipped++;
        }
      });

      if (variantModified && updates.length > 0) {
        console.log(`\n📝 Variant: "${variant.name}" (${variant._id})`);
        updates.forEach(update => {
          console.log(`  - "${update.value}": ${update.oldCode} → ${update.code}`);
        });

        if (!dryRun) {
          // Update variant values
          updates.forEach(update => {
            const valueObj = variant.values[update.index];
            if (typeof valueObj === 'object') {
              valueObj.code = update.code;
              if (!valueObj.displayName) {
                valueObj.displayName = update.value;
              }
            } else {
              // Convert string to object
              variant.values[update.index] = {
                value: update.value,
                displayName: update.displayName,
                code: update.code,
                isActive: true,
                sortOrder: update.index
              };
            }
          });

          await variant.save();
          variantsUpdated++;
        } else {
          variantsUpdated++;
        }
      }
    }

    console.log(`\n✅ Variant Migration Summary:`);
    console.log(`  Variants to update: ${variantsUpdated}`);
    console.log(`  Values to update: ${valuesUpdated}`);
    console.log(`  Values skipped: ${valuesSkipped}`);

    // ============ MIGRATE PRODUCTS ============
    console.log('\n' + '='.repeat(60));
    console.log('📦 MIGRATING PRODUCT COLOR VARIANTS');
    console.log('='.repeat(60));

    const productsWithColorVariants = await Product.find({
      'variants.type': { $regex: /color/i }
    });

    console.log(`\nFound ${productsWithColorVariants.length} product(s) with color variants\n`);

    let productsUpdated = 0;
    let productValuesUpdated = 0;
    let productValuesSkipped = 0;

    for (const product of productsWithColorVariants) {
      let productModified = false;
      const productUpdates = [];

      product.variants.forEach((variant, vIdx) => {
        if (!variant.type || !variant.type.toLowerCase().includes('color')) {
          return;
        }

        if (!Array.isArray(variant.values)) {
          return;
        }

        variant.values.forEach((val, valIdx) => {
          if (typeof val !== 'string') {
            return;
          }

          const label = extractLabel(val);
          const existingHex = extractHex(val);
          const fullPath = `${product.sku || product._id}.variants[${vIdx}].values[${valIdx}]`;

          // If already in correct format, skip
          if (existingHex && /^#[0-9A-F]{6}$/i.test(existingHex)) {
            productValuesSkipped++;
            return;
          }

          // Try to get color code
          let colorCode = existingHex;
          if (!colorCode) {
            colorCode = getColorCode(label);
          }

          if (colorCode) {
            const newValue = formatVariantValue(label, colorCode);
            productUpdates.push({
              path: fullPath,
              variantIndex: vIdx,
              valueIndex: valIdx,
              oldValue: val,
              newValue: newValue,
              label: label,
              hex: colorCode
            });
            productValuesUpdated++;
            productModified = true;
          } else {
            console.log(`  ⚠️  Could not find color code for: "${label}" in ${product.sku || product._id}`);
            productValuesSkipped++;
          }
        });
      });

      if (productModified && productUpdates.length > 0) {
        console.log(`\n📝 Product: ${product.name} (${product.sku || product._id})`);
        productUpdates.forEach(update => {
          console.log(`  - ${update.label}: "${update.oldValue}" → "${update.newValue}"`);
        });

        if (!dryRun) {
          // Apply updates - use the stored indices directly
          productUpdates.forEach(update => {
            if (product.variants[update.variantIndex] && 
                product.variants[update.variantIndex].values[update.valueIndex]) {
              product.variants[update.variantIndex].values[update.valueIndex] = update.newValue;
            }
          });

          await product.save();
          productsUpdated++;
        } else {
          productsUpdated++;
        }
      }
    }

    console.log(`\n✅ Product Migration Summary:`);
    console.log(`  Products to update: ${productsUpdated}`);
    console.log(`  Values to update: ${productValuesUpdated}`);
    console.log(`  Values skipped: ${productValuesSkipped}`);

    // ============ FINAL SUMMARY ============
    console.log('\n' + '='.repeat(60));
    console.log('📋 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`
Variants:
  - Updated: ${variantsUpdated}
  - Values updated: ${valuesUpdated}
  - Values skipped: ${valuesSkipped}

Products:
  - Updated: ${productsUpdated}
  - Values updated: ${productValuesUpdated}
  - Values skipped: ${productValuesSkipped}

Total Changes:
  - Variants: ${variantsUpdated}
  - Products: ${productsUpdated}
  - Total values: ${valuesUpdated + productValuesUpdated}
    `);

    if (dryRun) {
      console.log('\n💡 This was a DRY RUN. No changes were saved.');
      console.log('   Run without --dry-run to apply changes.\n');
    } else {
      console.log('\n✅ Migration complete! All changes have been saved.\n');
    }

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error during migration:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-d');

// Run migration
migrateVariants(dryRun);

