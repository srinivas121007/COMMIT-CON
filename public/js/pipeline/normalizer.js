/**
 * Knowledge Repair Tool - Data Normalizer
 * 
 * Performs deterministic, explainable data standardization:
 * - String trimming
 * - Name title-casing
 * - ISO-8601 date parsing & formatting
 * - Place name alias harmonization
 * 
 * Every modification creates an immutable audit trail entry.
 */

import { createChangeLogEntry } from './audit.js';

// Place alias lookup dictionary
const PLACE_ALIAS_MAP = {
  'NYC': 'New York',
  'N.Y.C.': 'New York',
  'New York City': 'New York',
  'Lon, UK': 'London',
  'London, UK': 'London',
  'Paris, FR': 'Paris',
  'Wien': 'Vienna',
  'Tokyo-to': 'Tokyo',
  'Edin.': 'Edinburgh'
};

/**
 * Capitalizes string words into Title Case, preserving initials (e.g., "J. R.")
 * and particles (e.g., "Von", "van", "de").
 */
export function titleCaseName(str) {
  if (!str || typeof str !== 'string') return str;
  const lowercaseParticles = new Set(['von', 'van', 'de', 'la', 'der', 'den', 'du']);

  const words = str.trim().split(/\s+/);
  return words.map((w, idx) => {
    // Preserve dotted initials like "A." or "J."
    if (/^[A-Za-z]\.?$/.test(w)) {
      return w.toUpperCase() + (w.endsWith('.') ? '' : '.');
    }
    const lower = w.toLowerCase();
    if (idx > 0 && lowercaseParticles.has(lower)) {
      return lower;
    }
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
}

/**
 * Converts varying date formats into strict ISO-8601 YYYY-MM-DD
 * Supports:
 * - YYYY/MM/DD
 * - DD-MM-YYYY
 * - YYYY-MM-DD (unchanged)
 */
export function normalizeIsoDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();

  // Already ISO-8601: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // YYYY/MM/DD
  const slashMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    const [, y, m, d] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Fallback native Date parse if applicable
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return trimmed;
}

/**
 * Standardizes place names using the alias map
 */
export function standardizePlaceName(placeStr) {
  if (!placeStr || typeof placeStr !== 'string') return placeStr;
  const trimmed = placeStr.trim();
  return PLACE_ALIAS_MAP[trimmed] || trimmed;
}

/**
 * Deep clones records to ensure non-destructive operations
 */
function cloneRecord(rec) {
  return JSON.parse(JSON.stringify(rec));
}

/**
 * Normalizes an array of records and logs all changes
 */
export function normalizeDataset(records = []) {
  const normalizedRecords = [];
  const changes = [];
  let normalizedCount = 0;

  for (const rawRecord of records) {
    const record = cloneRecord(rawRecord);
    const attrs = record.attributes || {};
    let recordModified = false;

    // 1. Attribute: Name
    if (attrs.name && typeof attrs.name === 'string') {
      const orig = attrs.name;
      let val = orig;

      // Whitespace trimming
      if (val.trim() !== val) {
        const trimmed = val.trim();
        changes.push(createChangeLogEntry({
          recordId: record.id,
          targetField: 'attributes.name',
          oldValue: val,
          newValue: trimmed,
          rule: 'TRIM_WHITESPACE',
          confidence: 1.0,
          sourceIds: [record.id],
          description: `Removed extraneous whitespace padding from name '${orig}'`
        }));
        val = trimmed;
        recordModified = true;
      }

      // Case Normalization
      if (record.type === 'person') {
        const titleCased = titleCaseName(val);
        if (titleCased !== val) {
          changes.push(createChangeLogEntry({
            recordId: record.id,
            targetField: 'attributes.name',
            oldValue: val,
            newValue: titleCased,
            rule: 'NORMALIZE_CASE',
            confidence: 1.0,
            sourceIds: [record.id],
            description: `Standardized person name casing from '${val}' to '${titleCased}'`
          }));
          val = titleCased;
          recordModified = true;
        }
      }

      attrs.name = val;
    }

    // 2. Attribute: Dates (birth_date, death_date, date)
    const dateFields = ['birth_date', 'death_date', 'date'];
    for (const dField of dateFields) {
      if (attrs[dField] && typeof attrs[dField] === 'string') {
        const orig = attrs[dField];
        const normalizedDate = normalizeIsoDate(orig);
        if (normalizedDate && normalizedDate !== orig) {
          changes.push(createChangeLogEntry({
            recordId: record.id,
            targetField: `attributes.${dField}`,
            oldValue: orig,
            newValue: normalizedDate,
            rule: 'ISO_DATE_FORMAT',
            confidence: 1.0,
            sourceIds: [record.id],
            description: `Formatted date from '${orig}' into standard ISO-8601 '${normalizedDate}'`
          }));
          attrs[dField] = normalizedDate;
          recordModified = true;
        }
      }
    }

    // 3. Attribute: Places (birth_place, location)
    const placeFields = ['birth_place', 'location'];
    for (const pField of placeFields) {
      if (attrs[pField] && typeof attrs[pField] === 'string') {
        const orig = attrs[pField];
        const trimmed = orig.trim();
        if (trimmed !== orig) {
          changes.push(createChangeLogEntry({
            recordId: record.id,
            targetField: `attributes.${pField}`,
            oldValue: orig,
            newValue: trimmed,
            rule: 'TRIM_WHITESPACE',
            confidence: 1.0,
            sourceIds: [record.id],
            description: `Trimmed whitespace from ${pField}`
          }));
          attrs[pField] = trimmed;
          recordModified = true;
        }

        const standard = standardizePlaceName(attrs[pField]);
        if (standard !== attrs[pField]) {
          changes.push(createChangeLogEntry({
            recordId: record.id,
            targetField: `attributes.${pField}`,
            oldValue: attrs[pField],
            newValue: standard,
            rule: 'STANDARDIZE_PLACE_NAME',
            confidence: 1.0,
            sourceIds: [record.id],
            description: `Standardized place alias '${attrs[pField]}' to canonical '${standard}'`
          }));
          attrs[pField] = standard;
          recordModified = true;
        }
      }
    }

    // Place entity itself name standardization if it's a place
    if (record.type === 'place' && attrs.name) {
      const orig = attrs.name;
      const standard = standardizePlaceName(orig);
      if (standard !== orig) {
        changes.push(createChangeLogEntry({
          recordId: record.id,
          targetField: 'attributes.name',
          oldValue: orig,
          newValue: standard,
          rule: 'STANDARDIZE_PLACE_NAME',
          confidence: 1.0,
          sourceIds: [record.id],
          description: `Standardized place name '${orig}' to canonical '${standard}'`
        }));
        attrs.name = standard;
        recordModified = true;
      }
    }

    if (recordModified) {
      normalizedCount++;
    }

    normalizedRecords.push(record);
  }

  return {
    normalizedRecords,
    changes,
    normalizedCount
  };
}
