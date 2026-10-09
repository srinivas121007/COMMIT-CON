/**
 * Knowledge Repair Tool - Audit Trail & Provenance Engine
 * 
 * Manages immutable change records, traceability to original source records,
 * and 1-click field rollback/reversion logic.
 */

let changeCounter = 1;

/**
 * Resets the change counter (useful for test runs)
 */
export function resetChangeCounter(start = 1) {
  changeCounter = start;
}

/**
 * Creates a standardized change log record
 */
export function createChangeLogEntry({
  recordId,
  targetField,
  oldValue,
  newValue,
  rule,
  confidence = 1.0,
  sourceIds = [],
  description = ''
}) {
  const changeId = `chg_${Date.now()}_${String(changeCounter++).padStart(4, '0')}`;
  return {
    changeId,
    recordId,
    targetField,
    oldValue,
    newValue,
    rule,
    confidence: Number(confidence.toFixed(2)),
    sourceIds: Array.isArray(sourceIds) ? [...sourceIds] : [sourceIds],
    description,
    timestamp: Date.now(),
    status: 'applied' // 'applied' | 'reverted'
  };
}

/**
 * Helper to safely get nested property by path (e.g., 'attributes.name')
 */
export function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Helper to safely set nested property by path
 */
export function setNestedValue(obj, path, value) {
  if (!obj || !path) return;
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] == null || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Reverts an applied change on a record in-place, restoring the oldValue
 */
export function revertChangeOnRecord(record, change) {
  if (!record || !change) return false;
  if (change.status === 'reverted') return false;

  setNestedValue(record, change.targetField, change.oldValue);
  change.status = 'reverted';
  change.revertedAt = Date.now();
  return true;
}

/**
 * Reapplies a previously reverted change on a record in-place
 */
export function reapplyChangeOnRecord(record, change) {
  if (!record || !change) return false;
  if (change.status === 'applied') return false;

  setNestedValue(record, change.targetField, change.newValue);
  change.status = 'applied';
  change.reappliedAt = Date.now();
  return true;
}

/**
 * Resolves the full provenance of a repaired record
 */
export function getRecordProvenance(repairedRecord, originalRecords = [], changeLogs = []) {
  const sourceIds = repairedRecord.sourceIds || [repairedRecord.id];
  const origMap = new Map(originalRecords.map(r => [r.id, r]));
  
  const sources = sourceIds.map(id => origMap.get(id)).filter(Boolean);
  const targetId = repairedRecord.canonicalId || repairedRecord.id;
  const relatedChanges = changeLogs.filter(c => c.recordId === targetId || sourceIds.includes(c.recordId));

  return {
    recordId: targetId,
    canonicalRecord: repairedRecord,
    sourceRecords: sources,
    transformations: relatedChanges,
    confidence: repairedRecord.confidence ?? 1.0
  };
}
