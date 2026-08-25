const HomepageGrid4x4 = require('../models/HomepageGrid4x4');
const Translation = require('../models/Translation');
const { sendErrorResponse, sendSuccessResponse, HTTP_STATUS, ERROR_CODES } = require('../utils/errorHandler');

const MAX_ITEMS = 16;
const MAX_GROUPS = 4;
const ITEMS_PER_GROUP = 4;

function itemsToGroups(doc) {
  if (doc.groups && Array.isArray(doc.groups) && doc.groups.length > 0) {
    return doc.groups.slice(0, MAX_GROUPS).map((g) => ({
      heading: g.heading || '',
      items: (g.items || []).slice(0, ITEMS_PER_GROUP),
    }));
  }
  const items = (doc.items || []).slice(0, MAX_ITEMS);
  const groups = [];
  for (let g = 0; g < MAX_GROUPS; g++) {
    groups.push({
      heading: '',
      items: items.slice(g * ITEMS_PER_GROUP, (g + 1) * ITEMS_PER_GROUP),
    });
  }
  return groups;
}

exports.getGrid4x4 = async (req, res) => {
  try {
    const doc = await HomepageGrid4x4.findOne().lean();
    if (!doc) {
      return sendSuccessResponse(res, HTTP_STATUS.OK, 'Grid 4x4 settings', { groups: [] });
    }
    let groups = itemsToGroups(doc).map((g) => ({
      heading: g.heading,
      items: (g.items || [])
        .filter((item) => item.isActive !== false && item.image && item.link)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    }));
    const locale = req.query.locale;
    if (locale && locale !== 'en' && doc._id) {
      const tr = await Translation.findOne({ model: 'HomepageGrid4x4', documentId: doc._id, locale }).lean();
      if (tr && tr.fields) {
        const fields = tr.fields instanceof Map ? Object.fromEntries(tr.fields) : tr.fields;
        const trGroups = Array.isArray(fields.groups) ? fields.groups : null;
        groups.forEach((g, gi) => {
          if (trGroups && trGroups[gi]) {
            if (trGroups[gi].heading != null) g.heading = trGroups[gi].heading;
            const trItems = Array.isArray(trGroups[gi].items) ? trGroups[gi].items : [];
            (g.items || []).forEach((item, ii) => {
              if (trItems[ii] && trItems[ii].caption != null) item.caption = trItems[ii].caption;
            });
          } else {
            if (fields[`${gi}_heading`] != null) g.heading = fields[`${gi}_heading`];
            (g.items || []).forEach((item, ii) => {
              if (fields[`${gi}_items_${ii}_caption`] != null) item.caption = fields[`${gi}_items_${ii}_caption`];
            });
          }
        });
      }
    }
    const hasAny = groups.some((g) => g.items.length > 0);
    if (!hasAny) {
      return sendSuccessResponse(res, HTTP_STATUS.OK, 'Grid 4x4 settings', { groups: [] });
    }
    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Grid 4x4 settings', { groups });
  } catch (error) {
    console.error('Error fetching grid 4x4:', error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Error fetching grid 4x4', ERROR_CODES.INTERNAL_SERVER_ERROR, { error: error.message });
  }
};

exports.getGrid4x4Admin = async (req, res) => {
  try {
    const doc = await HomepageGrid4x4.findOne().lean();
    if (!doc) {
      return sendSuccessResponse(res, HTTP_STATUS.OK, 'Grid 4x4 admin', { groups: [] });
    }
    const groups = itemsToGroups(doc);
    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Grid 4x4 admin', { groups });
  } catch (error) {
    console.error('Error fetching grid 4x4 admin:', error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Error fetching grid 4x4', ERROR_CODES.INTERNAL_SERVER_ERROR, { error: error.message });
  }
};

exports.updateGrid4x4 = async (req, res) => {
  try {
    let doc = await HomepageGrid4x4.findOne();
    if (!doc) {
      doc = new HomepageGrid4x4({ heading: '', items: [], groups: [] });
    }

    const existingGroups = itemsToGroups(doc);
    const groups = [];

    for (let g = 0; g < MAX_GROUPS; g++) {
      const groupHeading = (req.body[`group_heading_${g}`] !== undefined ? req.body[`group_heading_${g}`] : existingGroups[g]?.heading || '').trim();
      const groupItems = [];
      for (let i = 0; i < ITEMS_PER_GROUP; i++) {
        const flatIndex = g * ITEMS_PER_GROUP + i;
        const existing = (existingGroups[g] && existingGroups[g].items && existingGroups[g].items[i]) || {};
        const item = {
          image: existing.image || '',
          caption: (req.body[`item_caption_${flatIndex}`] !== undefined ? req.body[`item_caption_${flatIndex}`] : existing.caption || '').trim(),
          link: (req.body[`item_link_${flatIndex}`] !== undefined ? req.body[`item_link_${flatIndex}`] : existing.link || '').trim(),
          order: parseInt(req.body[`item_order_${flatIndex}`], 10) || flatIndex,
          isActive: req.body[`item_isActive_${flatIndex}`] === 'true' || req.body[`item_isActive_${flatIndex}`] === true,
        };

        if (req.files?.[`item_image_${flatIndex}`]?.[0]) {
          item.image = req.files[`item_image_${flatIndex}`][0].filename;
        } else if (req.body[`item_clearImage_${flatIndex}`] === 'true') {
          item.image = '';
        } else if (req.body[`item_currentImageUrl_${flatIndex}`]) {
          item.image = req.body[`item_currentImageUrl_${flatIndex}`];
        } else if (existing.image) {
          item.image = existing.image;
        }

        if (item.isActive && (!item.image || !item.link)) {
          item.isActive = false;
        }
        groupItems.push(item);
      }
      groups.push({ heading: groupHeading, items: groupItems });
    }

    doc.groups = groups;
    doc.items = groups.flatMap((gr) => gr.items);
    await doc.save();
    sendSuccessResponse(res, HTTP_STATUS.OK, 'Grid 4x4 updated successfully', doc);
  } catch (error) {
    console.error('Error updating grid 4x4:', error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Error updating grid 4x4', ERROR_CODES.INTERNAL_SERVER_ERROR, { error: error.message });
  }
};
