#!/usr/bin/env node
/**
 * P0 — Shipping baseline audit + ensure "No Shipping Charge (₹0/-)" slab.
 *
 * Default: DRY RUN (no writes). Use --apply to create/update.
 *
 * Ensures:
 * - WeightClass named "No Shipping Charge (₹0/-)" exists (create if missing)
 * - Active FlatShippingRule with rateINR=0 for that slab in every active ShippingZone
 * - Audits full active zone × active slab matrix coverage
 * - Detects duplicate WeightClass names (case-insensitive trim)
 * - Records ops-chosen default WeightClass for P2 backfill
 *
 * Usage:
 *   node scripts/shipping-p0-baseline.js
 *   node scripts/shipping-p0-baseline.js --apply
 *   node scripts/shipping-p0-baseline.js --apply --default-weight-class-name "1–500g"
 *   node scripts/shipping-p0-baseline.js --apply --default-weight-class-id <ObjectId>
 *   node scripts/shipping-p0-baseline.js --apply --rename-duplicates
 *   node scripts/shipping-p0-baseline.js --out reports/shipping-p0-baseline.json
 *
 * Env: MONGODB_URI | MONGO_URI | MONGO_URL (backend/.env)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ShippingZone = require('../models/ShippingZone');
const WeightClass = require('../models/WeightClass');
const FlatShippingRule = require('../models/FlatShippingRule');

const NO_SHIPPING_CHARGE_NAME = 'No Shipping Charge (₹0/-)';

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getArg(flag, fallback = '') {
  const idx = process.argv.findIndex((a) => a === flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function normalizeNameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findWeightClassByName(name) {
  return WeightClass.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(String(name).trim())}$`, 'i') },
  });
}

async function ensureNoShippingChargeSlab({ apply }) {
  let slab = await findWeightClassByName(NO_SHIPPING_CHARGE_NAME);
  const created = !slab;

  if (!slab) {
    console.log(`[P0] Missing WeightClass "${NO_SHIPPING_CHARGE_NAME}"`);
    if (apply) {
      slab = await WeightClass.create({
        name: NO_SHIPPING_CHARGE_NAME,
        minWeightG: 0,
        maxWeightG: 0,
        active: true,
        sortOrder: -1,
      });
      console.log(`[P0] Created WeightClass ${slab._id}`);
    }
  } else {
    console.log(`[P0] Found WeightClass "${slab.name}" id=${slab._id} active=${slab.active}`);
    if (apply && !slab.active) {
      slab.active = true;
      await slab.save();
      console.log('[P0] Reactivated No Shipping Charge slab');
    }
    if (apply && slab.name !== NO_SHIPPING_CHARGE_NAME) {
      slab.name = NO_SHIPPING_CHARGE_NAME;
      await slab.save();
      console.log('[P0] Normalized No Shipping Charge slab name casing/punctuation');
    }
  }

  return { slab, created };
}

async function ensureZeroRulesForSlab(slab, zones, { apply }) {
  const actions = [];
  if (!slab) {
    return { actions, missingRuleCount: zones.length };
  }

  let missingRuleCount = 0;
  for (const zone of zones) {
    let rule = await FlatShippingRule.findOne({
      zone: zone._id,
      weightClass: slab._id,
    });

    if (!rule) {
      missingRuleCount += 1;
      actions.push({
        action: 'create',
        zoneId: String(zone._id),
        zoneName: zone.name,
        rateINR: 0,
      });
      if (apply) {
        rule = await FlatShippingRule.create({
          zone: zone._id,
          weightClass: slab._id,
          rateINR: 0,
          label: NO_SHIPPING_CHARGE_NAME,
          active: true,
        });
        console.log(`[P0] Created ₹0 rule zone=${zone.name} (${zone._id}) rule=${rule._id}`);
      }
      continue;
    }

    const needsFix = rule.rateINR !== 0 || rule.active !== true;
    if (needsFix) {
      actions.push({
        action: 'fix',
        zoneId: String(zone._id),
        zoneName: zone.name,
        previousRateINR: rule.rateINR,
        previousActive: rule.active,
        rateINR: 0,
      });
      if (apply) {
        rule.rateINR = 0;
        rule.active = true;
        if (!rule.label) rule.label = NO_SHIPPING_CHARGE_NAME;
        await rule.save();
        console.log(`[P0] Fixed ₹0 rule zone=${zone.name} (${zone._id})`);
      }
    }
  }

  return { actions, missingRuleCount };
}

function findDuplicateNameGroups(weightClasses) {
  const groups = new Map();
  for (const wc of weightClasses) {
    const key = normalizeNameKey(wc.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(wc);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      ids: list.map((w) => String(w._id)),
      names: list.map((w) => w.name),
    }));
}

async function renameDuplicates(duplicateGroups, { apply }) {
  const renames = [];
  for (const group of duplicateGroups) {
    const docs = await WeightClass.find({ _id: { $in: group.ids } }).sort({ createdAt: 1 });
    for (let i = 1; i < docs.length; i += 1) {
      const doc = docs[i];
      const nextName = `${doc.name} (${i + 1})`;
      renames.push({
        id: String(doc._id),
        from: doc.name,
        to: nextName,
      });
      if (apply) {
        doc.name = nextName;
        await doc.save();
        console.log(`[P0] Renamed duplicate WeightClass ${doc._id}: "${group.names[0]}" → "${nextName}"`);
      }
    }
  }
  return renames;
}

async function auditMatrix(activeZones, activeSlabs) {
  const rules = await FlatShippingRule.find({
    active: true,
    zone: { $in: activeZones.map((z) => z._id) },
    weightClass: { $in: activeSlabs.map((s) => s._id) },
  }).lean();

  const ruleSet = new Set(rules.map((r) => `${r.zone}::${r.weightClass}`));
  const matrix = [];
  const omissions = [];

  for (const zone of activeZones) {
    for (const slab of activeSlabs) {
      const key = `${zone._id}::${slab._id}`;
      const covered = ruleSet.has(key);
      const cell = {
        zoneId: String(zone._id),
        zoneName: zone.name,
        weightClassId: String(slab._id),
        weightClassName: slab.name,
        covered,
      };
      matrix.push(cell);
      if (!covered) omissions.push(cell);
    }
  }

  return {
    matrix,
    omissions,
    expected: activeZones.length * activeSlabs.length,
    covered: matrix.length - omissions.length,
  };
}

async function resolveDefaultWeightClass({ defaultId, defaultName }) {
  if (defaultId) {
    if (!mongoose.Types.ObjectId.isValid(defaultId)) {
      throw new Error(`Invalid --default-weight-class-id: ${defaultId}`);
    }
    const doc = await WeightClass.findById(defaultId);
    if (!doc) throw new Error(`Default WeightClass id not found: ${defaultId}`);
    if (!doc.active) throw new Error(`Default WeightClass is inactive: ${defaultId}`);
    return doc;
  }

  if (defaultName) {
    const doc = await findWeightClassByName(defaultName);
    if (!doc) throw new Error(`Default WeightClass name not found: ${defaultName}`);
    if (!doc.active) throw new Error(`Default WeightClass is inactive: ${defaultName}`);
    return doc;
  }

  return null;
}

async function main() {
  const apply = hasFlag('--apply');
  const renameDupes = hasFlag('--rename-duplicates');
  const outFile = getArg('--out', path.join(__dirname, '../reports/shipping-p0-baseline.json'));
  const defaultId = getArg('--default-weight-class-id', '');
  const defaultName = getArg('--default-weight-class-name', '');

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) {
    console.error('Missing MongoDB URI. Set MONGODB_URI (or MONGO_URI / MONGO_URL).');
    process.exit(1);
  }

  console.log('Shipping P0 Baseline');
  console.log(apply ? '*** APPLY MODE (writes enabled) ***' : '*** DRY RUN (no writes) ***');
  console.log('');

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
  });

  const zones = await ShippingZone.find({ active: true }).sort({ sortOrder: 1, name: 1 });
  const allClasses = await WeightClass.find({}).sort({ sortOrder: 1, minWeightG: 1, name: 1 });

  console.log(`[P0] Active ShippingZones: ${zones.length}`);
  console.log(`[P0] WeightClasses (all): ${allClasses.length}`);

  const duplicateGroups = findDuplicateNameGroups(allClasses);
  console.log(`[P0] Duplicate name groups: ${duplicateGroups.length}`);
  for (const g of duplicateGroups) {
    console.log(`  - "${g.key}": ${g.ids.join(', ')}`);
  }

  let renames = [];
  if (duplicateGroups.length) {
    renames = await renameDuplicates(duplicateGroups, { apply: apply && renameDupes });
    if (!renameDupes) {
      console.log('[P0] Pass --rename-duplicates with --apply to auto-suffix duplicate names.');
    }
  }

  const { slab: zeroSlab, created: zeroCreated } = await ensureNoShippingChargeSlab({ apply });
  const zeroRuleResult = await ensureZeroRulesForSlab(zeroSlab, zones, { apply });

  const activeSlabs = await WeightClass.find({ active: true }).sort({
    sortOrder: 1,
    minWeightG: 1,
    name: 1,
  });
  const matrixAudit = await auditMatrix(zones, activeSlabs);

  console.log('');
  console.log(`[P0] Matrix expected cells: ${matrixAudit.expected}`);
  console.log(`[P0] Matrix covered: ${matrixAudit.covered}`);
  console.log(`[P0] Matrix omissions: ${matrixAudit.omissions.length}`);
  if (matrixAudit.omissions.length) {
    for (const cell of matrixAudit.omissions.slice(0, 50)) {
      console.log(`  - missing rule: zone="${cell.zoneName}" slab="${cell.weightClassName}"`);
    }
    if (matrixAudit.omissions.length > 50) {
      console.log(`  ... and ${matrixAudit.omissions.length - 50} more`);
    }
  }

  let defaultWeightClass = null;
  try {
    defaultWeightClass = await resolveDefaultWeightClass({ defaultId, defaultName });
  } catch (err) {
    console.error(`[P0] ${err.message}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  if (!defaultWeightClass) {
    console.log(
      '[P0] No default WeightClass selected. Pass --default-weight-class-id or --default-weight-class-name.'
    );
    console.log('[P0] Active slabs available for default:');
    for (const s of activeSlabs) {
      console.log(`  - ${s._id}  "${s.name}"`);
    }
  } else {
    console.log(
      `[P0] Default WeightClass for backfill: ${defaultWeightClass._id} ("${defaultWeightClass.name}")`
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    noShippingChargeSlab: zeroSlab
      ? {
          id: String(zeroSlab._id),
          name: zeroSlab.name,
          active: zeroSlab.active,
          createdThisRun: Boolean(apply && zeroCreated),
        }
      : null,
    zeroRules: zeroRuleResult.actions,
    duplicateNameGroups: duplicateGroups,
    renames,
    defaultWeightClass: defaultWeightClass
      ? { id: String(defaultWeightClass._id), name: defaultWeightClass.name }
      : null,
    matrix: {
      activeZoneCount: zones.length,
      activeSlabCount: activeSlabs.length,
      expected: matrixAudit.expected,
      covered: matrixAudit.covered,
      omissionCount: matrixAudit.omissions.length,
      omissions: matrixAudit.omissions,
    },
    gates: {
      noShippingChargeExists: Boolean(zeroSlab),
      noShippingChargeZeroRulesComplete:
        Boolean(zeroSlab) &&
        zeroRuleResult.missingRuleCount === 0 &&
        zeroRuleResult.actions.every((a) => a.action !== 'fix' || apply),
      matrixComplete: matrixAudit.omissions.length === 0,
      zeroDuplicateNames: duplicateGroups.length === 0 || (apply && renameDupes && renames.length > 0),
      defaultWeightClassRecorded: Boolean(defaultWeightClass),
    },
  };

  if (zeroSlab) {
    const remainingZeroGaps = [];
    for (const zone of zones) {
      const rule = await FlatShippingRule.findOne({
        zone: zone._id,
        weightClass: zeroSlab._id,
        active: true,
        rateINR: 0,
      }).lean();
      if (!rule) remainingZeroGaps.push(String(zone._id));
    }
    report.gates.noShippingChargeZeroRulesComplete = remainingZeroGaps.length === 0;
  }

  if (apply && renameDupes) {
    const after = findDuplicateNameGroups(await WeightClass.find({}));
    report.gates.zeroDuplicateNames = after.length === 0;
    report.duplicateNameGroupsAfterRename = after;
  }

  const outDir = path.dirname(outFile);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`\n[P0] Report written: ${outFile}`);

  const gateFail =
    !report.gates.noShippingChargeExists ||
    !report.gates.noShippingChargeZeroRulesComplete ||
    !report.gates.matrixComplete ||
    !report.gates.zeroDuplicateNames ||
    !report.gates.defaultWeightClassRecorded;

  if (gateFail) {
    console.log('\n[P0] GATE INCOMPLETE — resolve omissions / duplicates / default before P2.');
    if (!apply) {
      console.log('[P0] Re-run with --apply (and flags) to fix creatable items.');
    }
    await mongoose.disconnect();
    process.exit(2);
  }

  console.log('\n[P0] GATE PASS — baseline ready for P1/P2.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
