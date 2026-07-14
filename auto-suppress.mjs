import fs from 'fs';
import { execSync } from 'child_process';

console.log('Running eslint...');
let lintOutput = '';
try {
  lintOutput = execSync('npx eslint -f json .', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
} catch (e) {
  lintOutput = e.stdout;
}

const results = JSON.parse(lintOutput);

// Sort results by file to process them one by one
for (const result of results) {
  if (result.errorCount === 0 && result.warningCount === 0) continue;
  
  const filePath = result.filePath;
  let contentLines = fs.readFileSync(filePath, 'utf8').split('\n');
  
  // Sort messages by line number descending so insertions don't mess up earlier line numbers
  const messages = result.messages.sort((a, b) => b.line - a.line);
  
  // To avoid duplicate disable lines on the same line, track processed lines
  const processedLines = new Set();
  
  for (const msg of messages) {
    if (!msg.ruleId) continue;
    // Skip if it's already suppressed (sometimes eslint reports it anyway? No, if it's suppressed it shouldn't report)
    
    // We insert above msg.line - 1 (since array is 0-indexed)
    const targetLineIndex = msg.line - 1;
    const ruleId = msg.ruleId;
    
    if (processedLines.has(targetLineIndex + '_' + ruleId)) continue;
    processedLines.add(targetLineIndex + '_' + ruleId);
    
    const existingLine = contentLines[targetLineIndex - 1];
    if (existingLine && existingLine.includes(`eslint-disable-next-line ${ruleId}`)) {
      continue;
    }
    
    // Check indentation of the target line
    const match = contentLines[targetLineIndex].match(/^(\s*)/);
    const indent = match ? match[1] : '';
    
    contentLines.splice(targetLineIndex, 0, `${indent}// eslint-disable-next-line ${ruleId}`);
  }
  
  fs.writeFileSync(filePath, contentLines.join('\n'));
}

console.log('Suppression complete.');
