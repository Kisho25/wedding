const SHEET_NAME = "Guest List";

function doPost(e) {
  const payload = JSON.parse(e.postData.contents || "{}");
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);

  ensureHeaderRow(sheet);

  const row = [
    payload.guestId || "",
    payload.inviteeName || "",
    payload.attendance || "pending",
    payload.pageUrl || "",
  ];

  upsertRow(sheet, payload.guestId || payload.inviteeName || "guest", row);

  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

function ensureHeaderRow(sheet) {
  const headers = [
    "Guest ID",
    "Invitee Name",
    "Attendance",
    "Page URL",
  ];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
}
function upsertRow(sheet, key, rowValues) {
  const lastRow = sheet.getLastRow();

  const normalizedKey = String(key || '').trim().toLowerCase();

  if (lastRow < 2) {
    const fullRow = buildFullRow(sheet, rowValues);
    sheet.appendRow(fullRow);
    return;
  }

  // Read the body of the sheet and search for the key in any column (case-insensitive)
  const body = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  let foundRowIndex = -1;
  for (let i = 0; i < body.length; i++) {
    const row = body[i];
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || '').trim().toLowerCase();
      if (cell && cell === normalizedKey) {
        foundRowIndex = i; // zero-based within body
        break;
      }
    }
    if (foundRowIndex !== -1) break;
  }

  const fullRow = buildFullRow(sheet, rowValues);
  if (foundRowIndex === -1) {
    sheet.appendRow(fullRow);
  } else {
    sheet.getRange(foundRowIndex + 2, 1, 1, fullRow.length).setValues([fullRow]);
  }
}

function buildFullRow(sheet, rowValues) {
  const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] || [];
  const totalCols = Math.max(headerRange.length, rowValues.length);
  const fullRow = new Array(totalCols).fill('');

  // Place values into the first columns in order
  for (let i = 0; i < rowValues.length; i++) {
    fullRow[i] = rowValues[i];
  }

  return fullRow;
}