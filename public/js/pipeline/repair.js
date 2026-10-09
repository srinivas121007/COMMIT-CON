/**
 * Knowledge Repair Tool - Repair & Imputation Engine
 * 
 * Performs explainable, conservative repairs:
 * - Unifies duplicate clusters into canonical records
 * - Imputes missing attributes only when supported by co-reference evidence
 * - Re-maps relationships pointing to merged duplicate records
 * - Fixes deterministic contradictions (e.g. cycles, invalid chronology)
 * - Emits audit log entries with traceable source IDs and confidence scores
 */

import { createChangeLogEntry } from './audit.js';

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Selects the best canonical record representative from a cluster of duplicate records
 */
function chooseCanonicalRecord(cluster) {
  // Prefer records without '_dup' in their ID
  const nonDup = cluster.filter(r => !r.id.includes('_dup'));
  const candidates = nonDup.length > 0 ? nonDup : cluster;

  // Choose candidate with most non-null attributes
  let best = candidates[0];
  let maxFields = countNonNullAttributes(best);

  for (let i = 1; i < candidates.length; i++) {
    const count = countNonNullAttributes(candidates[i]);
    if (count > maxFields) {
      best = candidates[i];
      maxFields = count;
    }
  }

  return best;
}

function countNonNullAttributes(rec) {
  if (!rec || !rec.attributes) return 0;
  return Object.values(rec.attributes).filter(v => v !== null && v !== undefined && v !== '').length;
}

/**
 * Runs the repair and reconciliation pipeline
 */
export function repairDataset({
  records = [],
  autoMergeGroups = [],
  contradictions = []
}) {
  const changes = [];
  const repairedRecordsMap = new Map();
  const mergedIdToCanonicalId = new Map();

  // 1. Initialize map with cloned records
  for (const r of records) {
    repairedRecordsMap.set(r.id, clone(r));
  }

  // 2. Process Auto-Merge Duplicate Clusters
  for (const cluster of autoMergeGroups) {
    if (!cluster || cluster.length < 2) continue;

    const canonicalOriginal = chooseCanonicalRecord(cluster);
    const canonicalId = canonicalOriginal.id;
    const canonicalRecord = repairedRecordsMap.get(canonicalId);

    const clusterIds = cluster.map(c => c.id);
    canonicalRecord.sourceIds = clusterIds;
    canonicalRecord.canonicalId = canonicalId;

    // Track merged IDs
    for (const member of cluster) {
      if (member.id !== canonicalId) {
        mergedIdToCanonicalId.set(member.id, canonicalId);
        // Remove redundant duplicate record from active repaired dataset
        repairedRecordsMap.delete(member.id);
      }
    }

    // Conservative Imputation across duplicates
    for (const member of cluster) {
      if (member.id === canonicalId) continue;
      const memAttrs = member.attributes || {};

      for (const [key, value] of Object.entries(memAttrs)) {
        if (value !== null && value !== undefined && value !== '') {
          const currentVal = canonicalRecord.attributes[key];
          if (currentVal === null || currentVal === undefined || currentVal === '') {
            // Impute from duplicate evidence!
            changes.push(createChangeLogEntry({
              recordId: canonicalId,
              targetField: `attributes.${key}`,
              oldValue: currentVal,
              newValue: value,
              rule: 'DUPLICATE_IMPUTATION',
              confidence: 0.95,
              sourceIds: [canonicalId, member.id],
              description: `Imputed missing '${key}' from duplicate co-reference '${member.id}'`
            }));
            canonicalRecord.attributes[key] = value;
          }
        }
      }

      // Merge unique relationships
      const existingRels = canonicalRecord.relationships || [];
      const memRels = member.relationships || [];

      for (const mRel of memRels) {
        const alreadyExists = existingRels.some(
          er => er.type === mRel.type && er.targetId === mRel.targetId
        );
        if (!alreadyExists) {
          existingRels.push(clone(mRel));
        }
      }
      canonicalRecord.relationships = existingRels;
    }

    // Log the merge action
    changes.push(createChangeLogEntry({
      recordId: canonicalId,
      targetField: 'entity_resolution',
      oldValue: clusterIds.join(', '),
      newValue: canonicalId,
      rule: 'CANONICAL_ENTITY_MERGE',
      confidence: 0.94,
      sourceIds: clusterIds,
      description: `Merged duplicate entities (${clusterIds.join(', ')}) into canonical record ${canonicalId}`
    }));
  }

  // 3. Re-map relationship target IDs that pointed to merged duplicates
  for (const record of repairedRecordsMap.values()) {
    if (!record.relationships) continue;
    let relsModified = false;

    for (const rel of record.relationships) {
      if (mergedIdToCanonicalId.has(rel.targetId)) {
        const newTarget = mergedIdToCanonicalId.get(rel.targetId);
        rel.targetId = newTarget;
        relsModified = true;
      }
    }

    // Deduplicate relationships if any became redundant
    if (relsModified) {
      const seen = new Set();
      record.relationships = record.relationships.filter(rel => {
        const key = `${rel.type}::${rel.targetId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  }

  // 4. Resolve Contradictions
  for (const contra of contradictions) {
    const record = repairedRecordsMap.get(contra.recordId);
    if (!record) continue;

    // Rule: DEATH_BEFORE_BIRTH -> Clear invalid death date
    if (contra.rule === 'DEATH_BEFORE_BIRTH') {
      const oldDeath = record.attributes?.death_date;
      if (oldDeath) {
        changes.push(createChangeLogEntry({
          recordId: record.id,
          targetField: 'attributes.death_date',
          oldValue: oldDeath,
          newValue: null,
          rule: 'RESOLVE_DEATH_BEFORE_BIRTH',
          confidence: 0.95,
          sourceIds: [record.id],
          description: `Cleared invalid death date (${oldDeath}) that preceded birth date (${record.attributes?.birth_date})`
        }));
        record.attributes.death_date = null;
      }
    }

    // Rule: CIRCULAR_PARENTAGE -> Break the cycle
    if (contra.rule === 'CIRCULAR_PARENTAGE' && contra.relatedRecordId) {
      const prevRels = record.relationships || [];
      const filteredRels = prevRels.filter(r => !(r.type === 'parent_of' && r.targetId === contra.relatedRecordId));
      if (filteredRels.length < prevRels.length) {
        changes.push(createChangeLogEntry({
          recordId: record.id,
          targetField: 'relationships',
          oldValue: `parent_of -> ${contra.relatedRecordId}`,
          newValue: 'removed',
          rule: 'BREAK_GENEALOGICAL_CYCLE',
          confidence: 0.92,
          sourceIds: [record.id, contra.relatedRecordId],
          description: `Removed contradictory parent_of edge between ${record.id} and ${contra.relatedRecordId} to resolve cycle`
        }));
        record.relationships = filteredRels;
      }
    }
  }

  const repairedRecords = Array.from(repairedRecordsMap.values());

  return {
    repairedRecords,
    changes,
    repairStats: {
      totalOriginal: records.length,
      totalRepaired: repairedRecords.length,
      duplicatesMerged: mergedIdToCanonicalId.size,
      repairsApplied: changes.length
    }
  };
}
