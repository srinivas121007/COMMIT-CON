/**
 * Knowledge Repair Tool - Contradiction & Logic Anomaly Detection
 * 
 * Identifies domain rule violations:
 * - Chronology violations (Death date before birth date)
 * - Biological impossibility (Lifespan > 125 years)
 * - Genealogical cycles (Circular parentage detected via directed graph DFS)
 * - Spatiotemporal teleportation (Attending distant events on the same day)
 * 
 * Suggests explainable resolutions based on source reliability rankings.
 */

const SOURCE_RELIABILITY = {
  'National_Biographical_Registry': 0.95,
  'Scientific_Conferences_Index': 0.90,
  'World_Gazetteer_1980': 0.90,
  'County_Census_Records_1910': 0.80,
  'Oral_History': 0.60
};

export function getSourceReliability(sourceName) {
  return SOURCE_RELIABILITY[sourceName] || 0.70;
}

/**
 * Parses year from ISO or partial date
 */
function parseYear(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10);
  return isNaN(y) ? null : y;
}

/**
 * Detects all domain contradictions across records
 */
export function detectContradictions(records = []) {
  const contradictions = [];
  const issues = [];
  let issueCounter = 1;

  const recordMap = new Map(records.map(r => [r.id, r]));
  const eventsMap = new Map(records.filter(r => r.type === 'event').map(e => [e.id, e]));

  // 1. Chronology and Age checks for People
  for (const record of records) {
    if (record.type !== 'person') continue;
    const attrs = record.attributes || {};
    const bDate = attrs.birth_date;
    const dDate = attrs.death_date;

    if (bDate && dDate) {
      const bYear = parseYear(bDate);
      const dYear = parseYear(dDate);

      // Rule 1: DEATH_BEFORE_BIRTH
      if (dDate < bDate || (bYear !== null && dYear !== null && dYear < bYear)) {
        const contra = {
          contraId: `contra_chron_${record.id}`,
          rule: 'DEATH_BEFORE_BIRTH',
          severity: 'critical',
          recordId: record.id,
          targetField: 'attributes.death_date',
          description: `Death date (${dDate}) occurs before birth date (${bDate})`,
          conflictingValues: { birth_date: bDate, death_date: dDate },
          suggestedAction: 'clear_or_invert_death_date',
          suggestedValue: null,
          confidence: 0.95
        };
        contradictions.push(contra);

        issues.push({
          issueId: `iss_contra_${String(issueCounter++).padStart(3, '0')}`,
          type: 'contradiction',
          severity: 'critical',
          recordsInvolved: [record.id],
          description: `Chronological violation: Death date (${dDate}) precedes birth date (${bDate}) in record ${record.id}`,
          status: 'open',
          contradiction: contra
        });
      }

      // Rule 2: IMPOSSIBLE_AGE (> 125 years lifespan)
      if (bYear !== null && dYear !== null && (dYear - bYear) > 125) {
        const lifespan = dYear - bYear;
        const contra = {
          contraId: `contra_age_${record.id}`,
          rule: 'IMPOSSIBLE_AGE',
          severity: 'critical',
          recordId: record.id,
          targetField: 'attributes.death_date',
          description: `Calculated lifespan of ${lifespan} years exceeds human biological maximum of 125 years`,
          conflictingValues: { birth_date: bDate, death_date: dDate, calculatedLifespan: lifespan },
          suggestedAction: 'correct_death_year_or_flag',
          suggestedValue: `${bYear + 80}-01-01`,
          confidence: 0.90
        };
        contradictions.push(contra);

        issues.push({
          issueId: `iss_contra_${String(issueCounter++).padStart(3, '0')}`,
          type: 'contradiction',
          severity: 'critical',
          recordsInvolved: [record.id],
          description: `Biological impossibility: ${record.attributes?.name || record.id} lived an impossible lifespan of ${lifespan} years`,
          status: 'open',
          contradiction: contra
        });
      }
    }
  }

  // 2. Genealogical Cycle Detection (Circular Parentage)
  // Build directed graph of parent_of edges: parent -> child
  const parentGraph = new Map();
  for (const record of records) {
    if (record.type !== 'person') continue;
    const parentOfTargets = (record.relationships || [])
      .filter(r => r.type === 'parent_of')
      .map(r => r.targetId);
    parentGraph.set(record.id, parentOfTargets);
  }

  const visited = new Set();
  const recursionStack = new Set();
  const reportedCycles = new Set();

  function detectCycleDFS(nodeId, path = []) {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const neighbors = parentGraph.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        detectCycleDFS(neighbor, [...path]);
      } else if (recursionStack.has(neighbor)) {
        // Cycle found: neighbor is already in current path!
        const cycleStartIndex = path.indexOf(neighbor);
        const cyclePath = path.slice(cycleStartIndex);
        cyclePath.push(neighbor);

        // Normalize cycle signature to prevent duplicate reporting
        const sortedSignature = [...cyclePath].sort().join('::');
        if (!reportedCycles.has(sortedSignature)) {
          reportedCycles.add(sortedSignature);

          const contra = {
            contraId: `contra_cycle_${neighbor}_${nodeId}`,
            rule: 'CIRCULAR_PARENTAGE',
            severity: 'critical',
            recordId: nodeId,
            relatedRecordId: neighbor,
            cyclePath,
            description: `Genealogical cycle detected: ${cyclePath.join(' -> ')}`,
            suggestedAction: 'break_cycle',
            edgeToRemove: { source: nodeId, type: 'parent_of', target: neighbor },
            confidence: 0.95
          };
          contradictions.push(contra);

          issues.push({
            issueId: `iss_contra_${String(issueCounter++).padStart(3, '0')}`,
            type: 'contradiction',
            severity: 'critical',
            recordsInvolved: [nodeId, neighbor],
            description: `Genealogical cycle: Circular lineage detected involving ${cyclePath.join(', ')}`,
            status: 'open',
            contradiction: contra
          });
        }
      }
    }

    recursionStack.delete(nodeId);
  }

  for (const nodeId of parentGraph.keys()) {
    if (!visited.has(nodeId)) {
      detectCycleDFS(nodeId, []);
    }
  }

  // 3. Spatiotemporal Collision (Person attending two distinct distant events on same date)
  for (const record of records) {
    if (record.type !== 'person') continue;
    const attendedEventIds = (record.relationships || [])
      .filter(r => r.type === 'attended')
      .map(r => r.targetId);

    if (attendedEventIds.length < 2) continue;

    // Check all pairs of attended events
    for (let i = 0; i < attendedEventIds.length; i++) {
      for (let j = i + 1; j < attendedEventIds.length; j++) {
        const ev1 = eventsMap.get(attendedEventIds[i]);
        const ev2 = eventsMap.get(attendedEventIds[j]);

        if (ev1 && ev2 && ev1.attributes?.date && ev2.attributes?.date) {
          if (ev1.attributes.date === ev2.attributes.date) {
            const loc1 = ev1.attributes.location || '';
            const loc2 = ev2.attributes.location || '';

            // If locations are different cities
            if (loc1 && loc2 && loc1.toLowerCase() !== loc2.toLowerCase()) {
              const contra = {
                contraId: `contra_spatio_${record.id}_${ev1.id}_${ev2.id}`,
                rule: 'SPATIOTEMPORAL_COLLISION',
                severity: 'critical',
                recordId: record.id,
                event1: ev1.id,
                event2: ev2.id,
                clashDate: ev1.attributes.date,
                locations: [loc1, loc2],
                description: `Person attended two distant events in ${loc1} and ${loc2} on the exact same date (${ev1.attributes.date})`,
                suggestedAction: 'manual_verification_required',
                confidence: 0.85
              };
              contradictions.push(contra);

              issues.push({
                issueId: `iss_contra_${String(issueCounter++).padStart(3, '0')}`,
                type: 'contradiction',
                severity: 'critical',
                recordsInvolved: [record.id, ev1.id, ev2.id],
                description: `Spatiotemporal collision: ${record.attributes?.name || record.id} simultaneously in ${loc1} and ${loc2} on ${ev1.attributes.date}`,
                status: 'open',
                contradiction: contra
              });
            }
          }
        }
      }
    }
  }

  return {
    contradictions,
    issues,
    summary: {
      totalContradictions: contradictions.length,
      chronologicalCount: contradictions.filter(c => c.rule === 'DEATH_BEFORE_BIRTH').length,
      ageAnomalyCount: contradictions.filter(c => c.rule === 'IMPOSSIBLE_AGE').length,
      cycleCount: contradictions.filter(c => c.rule === 'CIRCULAR_PARENTAGE').length,
      spatiotemporalCount: contradictions.filter(c => c.rule === 'SPATIOTEMPORAL_COLLISION').length
    }
  };
}
