#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Usage:
// node scripts/generate_public_links.js [guestCsvPath] [publicHost] [outFile]
// Example:
// node scripts/generate_public_links.js data/guest-list.csv https://my-wedding-invite.loca.lt public-links.csv

const guestCsvPath = process.argv[2] || path.join(__dirname, '..', 'data', 'guest-list.csv');
const publicHost = process.argv[3];
const outFile = process.argv[4] || null;

if (!publicHost) {
  console.error('Usage: node scripts/generate_public_links.js [guestCsvPath] [publicHost] [outFile]');
  console.error('Example: node scripts/generate_public_links.js data/guest-list.csv https://my-wedding-invite.loca.lt public-links.csv');
  process.exit(1);
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => {
    // quick CSV parse for exported simple CSVs (we don't support embedded newlines)
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; continue; }
        if (ch === '"') { inQuotes = false; continue; }
        cur += ch; continue;
      }
      if (ch === '"') { inQuotes = true; continue; }
      if (ch === ',') { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    const obj = {};
    header.forEach((h, idx) => obj[h] = (cells[idx] || '').trim());
    return obj;
  });
  return rows;
}

try {
  const content = fs.readFileSync(guestCsvPath, 'utf8');
  const rows = parseCsv(content);
  const out = [];
  out.push('guestId,inviteeName,link');
  rows.forEach(r => {
    const guestId = (r.guestId || r.id || '').trim();
    const inviteeName = (r.inviteeName || r.name || '').trim();
    if (!guestId) return;
    const link = `${publicHost.replace(/\/$/, '')}/?guest=${encodeURIComponent(inviteeName)}&id=${encodeURIComponent(guestId)}#confirm`;
    out.push(`${guestId},"${inviteeName}",${link}`);
  });

  const output = out.join('\n') + '\n';
  if (outFile) {
    fs.writeFileSync(outFile, output, 'utf8');
    console.log(`Wrote ${outFile}`);
  } else {
    process.stdout.write(output);
  }
} catch (err) {
  console.error('Error reading CSV:', err.message);
  process.exit(1);
}
