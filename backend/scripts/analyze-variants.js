#!/usr/bin/env node

/**
 * Variant Analysis Script
 * Analyzes existing variants and products to understand current data structure
 * Run this BEFORE running the migration script
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Variant = require('../models/Variant');
const Product = require('../models/Product');

// Database connection
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function analyzeVariants() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    // ============ ANALYZE VARIANTS ============
    console.log('='.repeat(60));
    console.log('📊 VARIANT ANALYSIS');
    console.log('='.repeat(60));

    const allVariants = await Variant.find({});
    console.log(`\nTotal Variants: ${allVariants.length}`);

    // Group by variant name
    const variantGroups = {};
    allVariants.forEach(v => {
      const name = v.name || 'Unknown';
      if (!variantGroups[name]) {
        variantGroups[name] = [];
      }
      variantGroups[name].push(v);
    });

    console.log(`\nVariant Types Found: ${Object.keys(variantGroups).length}`);
    Object.keys(variantGroups).forEach(name => {
      console.log(`  - ${name}: ${variantGroups[name].length} variant(s)`);
    });

    // Analyze color variants specifically
    const colorVariants = allVariants.filter(v => 
      v.name && v.name.toLowerCase().includes('color')
    );

    console.log(`\n🎨 Color Variants: ${colorVariants.length}`);
    
    if (colorVariants.length > 0) {
      console.log('\nColor Variant Details:');
      colorVariants.forEach((variant, idx) => {
        console.log(`\n  ${idx + 1}. Variant: "${variant.name}" (ID: ${variant._id})`);
        console.log(`     Values: ${variant.values.length}`);
        
        variant.values.forEach((val, vIdx) => {
          const valueStr = typeof val === 'object' ? val.value : val;
          const displayName = typeof val === 'object' ? (val.displayName || 'N/A') : 'N/A';
          const code = typeof val === 'object' ? (val.code || '❌ Missing') : '❌ Missing';
          const hasCode = typeof val === 'object' && val.code;
          
          console.log(`       ${vIdx + 1}. Value: "${valueStr}"`);
          console.log(`          Display Name: "${displayName}"`);
          console.log(`          Code: ${code} ${hasCode ? '✅' : '⚠️'}`);
        });
      });
    }

    // Statistics
    let totalValues = 0;
    let valuesWithCode = 0;
    let valuesWithoutCode = 0;

    colorVariants.forEach(variant => {
      variant.values.forEach(val => {
        totalValues++;
        if (typeof val === 'object' && val.code) {
          valuesWithCode++;
        } else {
          valuesWithoutCode++;
        }
      });
    });

    console.log('\n📈 Color Variant Statistics:');
    console.log(`  Total color values: ${totalValues}`);
    console.log(`  Values with code: ${valuesWithCode} (${((valuesWithCode/totalValues)*100).toFixed(1)}%)`);
    console.log(`  Values without code: ${valuesWithoutCode} (${((valuesWithoutCode/totalValues)*100).toFixed(1)}%)`);

    // ============ ANALYZE PRODUCTS ============
    console.log('\n' + '='.repeat(60));
    console.log('📦 PRODUCT VARIANT ANALYSIS');
    console.log('='.repeat(60));

    const allProducts = await Product.find({});
    console.log(`\nTotal Products: ${allProducts.length}`);

    let productsWithVariants = 0;
    let productsWithColorVariants = 0;
    let colorVariantFormats = {
      withPipe: 0,      // "Red|#FF0000"
      withoutPipe: 0,   // "Red"
      malformed: 0,     // Invalid format
      empty: 0
    };

    const productIssues = [];

    allProducts.forEach(product => {
      if (!product.variants || !Array.isArray(product.variants) || product.variants.length === 0) {
        return;
      }

      productsWithVariants++;
      
      const colorVariant = product.variants.find(v => 
        v && v.type && v.type.toLowerCase().includes('color')
      );

      if (colorVariant && colorVariant.values) {
        productsWithColorVariants++;
        
        colorVariant.values.forEach(val => {
          if (!val || typeof val !== 'string') {
            colorVariantFormats.empty++;
            return;
          }

          if (val.includes('|')) {
            const parts = val.split('|');
            if (parts.length === 2 && parts[1].trim().startsWith('#')) {
              colorVariantFormats.withPipe++;
            } else {
              colorVariantFormats.malformed++;
              productIssues.push({
                productId: product._id,
                sku: product.sku,
                name: product.name,
                issue: `Malformed color format: "${val}"`
              });
            }
          } else {
            colorVariantFormats.withoutPipe++;
            productIssues.push({
              productId: product._id,
              sku: product.sku,
              name: product.name,
              issue: `Color value without hex code: "${val}"`
            });
          }
        });
      }
    });

    console.log(`\nProducts with variants: ${productsWithVariants}`);
    console.log(`Products with color variants: ${productsWithColorVariants}`);

    console.log('\n📊 Product Color Variant Format Statistics:');
    console.log(`  Values in "label|hex" format: ${colorVariantFormats.withPipe}`);
    console.log(`  Values without hex (just label): ${colorVariantFormats.withoutPipe}`);
    console.log(`  Malformed values: ${colorVariantFormats.malformed}`);
    console.log(`  Empty values: ${colorVariantFormats.empty}`);

    if (productIssues.length > 0) {
      console.log(`\n⚠️  Products with Issues: ${productIssues.length}`);
      console.log('\nFirst 10 issues:');
      productIssues.slice(0, 10).forEach((issue, idx) => {
        console.log(`  ${idx + 1}. ${issue.sku || issue.name || issue.productId}: ${issue.issue}`);
      });
      if (productIssues.length > 10) {
        console.log(`  ... and ${productIssues.length - 10} more`);
      }
    }

    // ============ SUMMARY ============
    console.log('\n' + '='.repeat(60));
    console.log('📋 SUMMARY');
    console.log('='.repeat(60));
    console.log(`
Migration Needs:
  1. Variant Values: ${valuesWithoutCode} color values need codes added
  2. Product Variants: ${colorVariantFormats.withoutPipe + colorVariantFormats.malformed} values need formatting
  3. Total Issues: ${productIssues.length} products need attention

Recommended Actions:
  - Run migration script to add color codes to variants
  - Run migration script to fix product variant formats
  - Review and manually fix any malformed entries
    `);

    await mongoose.connection.close();
    console.log('\n✅ Analysis complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error during analysis:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run analysis
analyzeVariants();

