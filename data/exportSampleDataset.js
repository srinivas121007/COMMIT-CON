import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDatasetPackage } from './generateDataset.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkg = createDatasetPackage(42);

const outputPath = path.join(__dirname, 'sample-dataset.json');
fs.writeFileSync(outputPath, JSON.stringify(pkg, null, 2), 'utf-8');

console.log('Successfully generated sample dataset:');
console.log(`- Clean records: ${pkg.clean.records.length} (${pkg.clean.counts.people} people, ${pkg.clean.counts.places} places, ${pkg.clean.counts.events} events)`);
console.log(`- Corrupted records: ${pkg.corrupted.records.length} (${pkg.corrupted.counts.people} people, ${pkg.corrupted.counts.places} places, ${pkg.corrupted.counts.events} events)`);
console.log(`- Injected ground truth mutations: ${pkg.corrupted.groundTruthMutations.length}`);
console.log(`- Written to: ${outputPath}`);
