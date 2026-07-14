import fs from 'fs';

const results = JSON.parse(fs.readFileSync('./lint-results.json', 'utf8'));

const summary = {
  totalErrors: 0,
  totalWarnings: 0,
  rules: {},
  files: {}
};

for (const result of results) {
  if (result.errorCount === 0 && result.warningCount === 0) continue;
  
  const filePath = result.filePath.replace(process.cwd() + '/', '');
  
  for (const msg of result.messages) {
    if (msg.severity === 2) summary.totalErrors++;
    if (msg.severity === 1) summary.totalWarnings++;
    
    const ruleId = msg.ruleId || 'unknown';
    if (!summary.rules[ruleId]) {
      summary.rules[ruleId] = { count: 0, files: new Set() };
    }
    summary.rules[ruleId].count++;
    summary.rules[ruleId].files.add(filePath);
    
    if (!summary.files[filePath]) {
      summary.files[filePath] = { errors: 0, warnings: 0 };
    }
    if (msg.severity === 2) summary.files[filePath].errors++;
    if (msg.severity === 1) summary.files[filePath].warnings++;
  }
}

// Convert Sets to array lengths for rules
for (const rule of Object.keys(summary.rules)) {
  summary.rules[rule].filesCount = summary.rules[rule].files.size;
  delete summary.rules[rule].files;
}

// Sort files by number of problems
const sortedFiles = Object.entries(summary.files)
  .sort((a, b) => (b[1].errors + b[1].warnings) - (a[1].errors + a[1].warnings))
  .slice(0, 15); // top 15

console.log(JSON.stringify({
  totals: { errors: summary.totalErrors, warnings: summary.totalWarnings },
  rules: summary.rules,
  topFiles: sortedFiles
}, null, 2));
