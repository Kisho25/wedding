const SHEET_NAME = "Guest List";

function doPost(e) {
  const payload = JSON.parse(e.postData.contents || "{}");
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);

  ensureHeaderRow(sheet);

  // Only record the invitee name and attendance in the sheet
  const inviteeName = payload.inviteeName || payload.name || "Guest";
  const attendance = payload.attendance || "pending";
  const row = [inviteeName, attendance];

  // Use the invitee name as the upsert key (case-insensitive)
  upsertRow(sheet, inviteeName, row);

  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

function ensureHeaderRow(sheet) {
  const headers = [
    "Invitee Name",
    "Attendance",
  ];

  const lastCol = Math.max(1, sheet.getLastColumn());
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];

  // If the sheet is empty, append the header. Otherwise, overwrite the header row
  // to ensure the sheet stores only the two desired columns.
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    // Overwrite first row to the new header length
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}
function upsertRow(sheet, key, rowValues) {
  const lastRow = sheet.getLastRow();

  const normalizedKey = String(key || '').trim().toLowerCase();

  // If there are no body rows yet, just append
  if (lastRow < 2) {
    const fullRow = buildFullRow(sheet, rowValues);
    sheet.appendRow(fullRow);
    return;
  }

  // Search for the invitee name in the first column (Invitee Name)
  const body = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let foundRowIndex = -1;
  for (let i = 0; i < body.length; i++) {
    const cell = String(body[i][0] || '').trim().toLowerCase();
    if (cell && cell === normalizedKey) {
      foundRowIndex = i; // zero-based within body
      break;
    }
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