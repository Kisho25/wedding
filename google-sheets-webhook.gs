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

  if (lastRow < 2) {
    sheet.appendRow(rowValues);
    return;
  }

  const keys = sheet.getRange(2, 3, lastRow - 1, 1).getValues().flat();
  const existingIndex = keys.findIndex((value) => String(value) === String(key));

  if (existingIndex === -1) {
    sheet.appendRow(rowValues);
    return;
  }

  sheet.getRange(existingIndex + 2, 1, 1, rowValues.length).setValues([rowValues]);
}