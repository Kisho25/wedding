#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Usage:
// node scripts/generate_public_links.js [guestCsvPath|guestName] [publicHost] [outFile]
// Example:
// node scripts/generate_public_links.js
// node scripts/generate_public_links.js data/guest-list.csv https://my-wedding-invite.loca.lt public-links.csv
// node scripts/generate_public_links.js "Rima Haddad" https://my-wedding-invite.loca.lt

const defaultGuestCsvPath = path.join(__dirname, '..', 'data', 'guest-list.csv');
const rawGuestCsvPath = process.argv[2];
const publicHost = process.argv[3] || process.env.PUBLIC_HOST || 'https://sergio-marine-wedding.onrender.com';
const outFile = process.argv[4] || process.env.PUBLIC_LINKS_OUT_FILE || path.join(__dirname, '..', 'public-links.csv');

function slugify(value) {
  return value
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'guest';
}

function buildLinkRow(guestId, inviteeName, host) {
  const safeGuestId = (guestId || '').trim();
  const safeInviteeName = (inviteeName || '').trim();
  if (!safeGuestId) return null;
  const link = `${host.replace(/\/$/, '')}/?guest=${encodeURIComponent(safeInviteeName)}&id=${encodeURIComponent(safeGuestId)}`;
  return `${safeGuestId},"${safeInviteeName}",${link}`;
}

let guestCsvPath = defaultGuestCsvPath;
let singleGuest = null;

if (rawGuestCsvPath) {
  if (fs.existsSync(rawGuestCsvPath) || path.extname(rawGuestCsvPath) === '.csv') {
    guestCsvPath = rawGuestCsvPath;
  } else {
    singleGuest = {
      guestId: slugify(rawGuestCsvPath),
      inviteeName: rawGuestCsvPath.trim(),
    };
  }
}

if (!publicHost) {
  console.error('Usage:');
  console.error('  node scripts/generate_public_links.js [guestCsvPath|guestName] [publicHost] [outFile]');
  console.error('Example:');
  console.error('  node scripts/generate_public_links.js');
  console.error('  node scripts/generate_public_links.js data/guest-list.csv https://my-wedding-invite.loca.lt public-links.csv');
  console.error('  node scripts/generate_public_links.js "Rima Haddad" https://my-wedding-invite.loca.lt');
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
  let output;

  if (singleGuest) {
    const row = buildLinkRow(singleGuest.guestId, singleGuest.inviteeName, publicHost);
    output = `guestId,inviteeName,link\n${row}\n`;
  } else {
    const content = fs.readFileSync(guestCsvPath, 'utf8');
    const rows = parseCsv(content);
    const out = [];
    out.push('guestId,inviteeName,link');
    rows.forEach(r => {
      const guestId = (r.guestId || r.id || '').trim();
      const inviteeName = (r.inviteeName || r.name || '').trim();
      if (!guestId) return;
      const row = buildLinkRow(guestId, inviteeName, publicHost);
      if (row) out.push(row);
    });

    output = out.join('\n') + '\n';
  }

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
