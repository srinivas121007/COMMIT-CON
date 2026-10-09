/**
 * Knowledge Repair Tool - Browser Utility Helpers
 */

/**
 * Downloads data as a formatted JSON file
 */
export function downloadJsonFile(filename, data) {
  if (typeof document === 'undefined') return;
  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Downloads string content as a CSV file
 */
export function downloadCsvFile(filename, csvContent) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parses user-uploaded JSON file
 */
export async function parseJsonUpload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse JSON file: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('File reading error'));
    reader.readAsText(file);
  });
}

/**
 * Parses user-uploaded CSV file
 */
export async function parseCsvUpload(file) {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.Papa) {
      window.Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (err) => reject(new Error(`PapaParse error: ${err.message}`))
      });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length < 2) return resolve([]);
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const records = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          const row = {};
          headers.forEach((h, idx) => {
            row[h] = values[idx] || null;
          });
          records.push(row);
        }
        resolve(records);
      };
      reader.onerror = () => reject(new Error('File reading error'));
      reader.readAsText(file);
    }
  });
}
