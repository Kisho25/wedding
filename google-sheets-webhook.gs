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

  // Determine which column holds the guest key by inspecting the header.
  const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] || [];
  const guestIdColIndex = headerRange.findIndex((h) => String(h).toLowerCase().includes('guest id')) + 1 || 1;

  if (lastRow < 2) {
    // Ensure we write a full row matching header length
    const fullRow = buildFullRow(sheet, rowValues);
    sheet.appendRow(fullRow);
    return;
  }

  // Read existing keys from the detected guestId column
  const keys = sheet.getRange(2, guestIdColIndex, lastRow - 1, 1).getValues().flat();
  const existingIndex = keys.findIndex((value) => String(value) === String(key));

  if (existingIndex === -1) {
    const fullRow = buildFullRow(sheet, rowValues);
    sheet.appendRow(fullRow);
    return;
  }

  const fullRow = buildFullRow(sheet, rowValues);
  sheet.getRange(existingIndex + 2, 1, 1, fullRow.length).setValues([fullRow]);
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