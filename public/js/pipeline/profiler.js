/**
 * Knowledge Repair Tool - Dataset Profiler
 * 
 * Computes deep field statistics, null rates, format validity,
 * and identifies baseline anomalies before normalization and repair.
 */

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SLASH_DATE_REGEX = /^\d{4}\/\d{2}\/\d{2}$/;
const DMY_DATE_REGEX = /^\d{2}-\d{2}-\d{4}$/;

const KNOWN_PLACE_ALIASES = new Set([
  'NYC', 'N.Y.C.', 'New York City', 'Lon, UK', 'London, UK',
  'Paris, FR', 'Wien', 'Tokyo-to', 'Edin.'
]);

/**
 * Profiles an array of raw or processed records
 */
export function profileDataset(records = []) {
  const total = records.length;
  const typeCounts = { person: 0, place: 0, event: 0, other: 0 };
  const fieldNullCounts = {};
  const fieldTotalCounts = {};
  const anomalies = [];

  for (const record of records) {
    const type = record.type || 'other';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
    const attrs = record.attributes || {};

    // Analyze each attribute
    for (const [key, value] of Object.entries(attrs)) {
      const fieldKey = `${type}.${key}`;
      fieldTotalCounts[fieldKey] = (fieldTotalCounts[fieldKey] || 0) + 1;

      // Null or empty check
      if (value === null || value === undefined || value === '') {
        fieldNullCounts[fieldKey] = (fieldNullCounts[fieldKey] || 0) + 1;
        continue;
      }

      // String-specific checks
      if (typeof value === 'string') {
        // Whitespace padding
        if (value.trim() !== value) {
          anomalies.push({
            recordId: record.id,
            field: `attributes.${key}`,
            value,
            anomalyType: 'WHITESPACE_PADDING',
            description: `Field '${key}' has leading or trailing whitespace`
          });
        }

        // Name casing checks (for person names)
        if (key === 'name' && type === 'person') {
          const trimmed = value.trim();
          if (trimmed.length > 2 && (trimmed === trimmed.toUpperCase() || trimmed === trimmed.toLowerCase())) {
            anomalies.push({
              recordId: record.id,
              field: 'attributes.name',
              value,
              anomalyType: 'INCONSISTENT_CASING',
              description: `Person name '${value}' has non-standard all-${trimmed === trimmed.toUpperCase() ? 'upper' : 'lower'} casing`
            });
          }
        }

        // Date format checks
        if (key.includes('date')) {
          const trimmed = value.trim();
          if (!ISO_DATE_REGEX.test(trimmed)) {
            let formatGuess = 'UNKNOWN_DATE';
            if (SLASH_DATE_REGEX.test(trimmed)) formatGuess = 'SLASH_DATE';
            else if (DMY_DATE_REGEX.test(trimmed)) formatGuess = 'DMY_DATE';

            anomalies.push({
              recordId: record.id,
              field: `attributes.${key}`,
              value,
              anomalyType: 'NON_STANDARD_DATE',
              formatGuess,
              description: `Date '${value}' does not adhere to ISO-8601 (YYYY-MM-DD)`
            });
          }
        }

        // Place alias checks
        if ((key === 'birth_place' || key === 'location' || (key === 'name' && type === 'place')) && KNOWN_PLACE_ALIASES.has(value.trim())) {
          anomalies.push({
            recordId: record.id,
            field: `attributes.${key}`,
            value,
            anomalyType: 'PLACE_ALIAS',
            description: `Place name '${value}' uses an informal abbreviation or regional alias`
          });
        }
      }
    }
  }

  // Calculate completeness rates per field
  const completenessByField = {};
  for (const fieldKey of Object.keys(fieldTotalCounts)) {
    const totalField = fieldTotalCounts[fieldKey];
    const nullCount = fieldNullCounts[fieldKey] || 0;
    completenessByField[fieldKey] = Number(((totalField - nullCount) / totalField).toFixed(4));
  }

  // Calculate overall completeness rate across all observed attributes
  const totalObserved = Object.values(fieldTotalCounts).reduce((a, b) => a + b, 0);
  const totalNulls = Object.values(fieldNullCounts).reduce((a, b) => a + b, 0);
  const overallCompleteness = totalObserved > 0 ? Number(((totalObserved - totalNulls) / totalObserved).toFixed(4)) : 1.0;

  return {
    totalRecords: total,
    typeCounts,
    completenessByField,
    overallCompleteness,
    fieldNullCounts,
    fieldTotalCounts,
    anomaliesCount: anomalies.length,
    anomalies
  };
}
