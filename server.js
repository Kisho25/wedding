const http = require("http");
const path = require("path");
const { URL } = require("url");
const fs = require("fs/promises");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const guestListCsvPath = path.join(dataDir, "guest-list.csv");
const guestStatusCsvPath = path.join(dataDir, "guest-status.csv");
const guestStatusXlsPath = path.join(dataDir, "guest-status.xls");
const responsesCsvPath = path.join(dataDir, "responses.csv");
const googleSheetsWebhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL || "";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".csv", "text/csv; charset=utf-8"],
  [".xls", "application/vnd.ms-excel"],
]);

const guestColumns = [
  "guestId",
  "inviteeName",
  "attendance",
  "lastUpdated",
  "pageUrl",
];

async function ensureDataFiles() {
  await fs.mkdir(dataDir, { recursive: true });
  await ensureFile(responsesCsvPath, "timestamp,guestId,inviteeName,attendance,pageUrl\n");
  await ensureFile(guestStatusCsvPath, `${guestColumns.join(",")}\n`);
  await migrateLegacyCsvFiles();
  const rows = await readGuestStatusRows();
  await fs.writeFile(guestStatusXlsPath, buildGuestExcelXml(rows), "utf8");
}

async function migrateLegacyCsvFiles() {
  const expectedResponsesHeader = "timestamp,guestId,inviteeName,attendance,pageUrl";
  const expectedGuestHeader = guestColumns.join(",");

  async function rewriteFile(filePath, expectedHeader, mapRow) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const lines = content.trim().split("\n").filter(Boolean);
      if (lines.length === 0) {
        return;
      }

      const header = lines[0].replace(/"/g, "").trim();
      if (header === expectedHeader) {
        return;
      }

      const mappedRows = lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        return mapRow(values);
      });

      const nextContent = [expectedHeader, ...mappedRows].join("\n") + "\n";
      await fs.writeFile(filePath, nextContent, "utf8");
    } catch {
      // Ignore migration failures and fall back to the existing file.
    }
  }

  await rewriteFile(responsesCsvPath, expectedResponsesHeader, (values) => {
    return [
      values[0] || "",
      values[1] || "",
      values[2] || "",
      values[4] || values[3] || "",
      values[7] || values[6] || "",
    ]
      .map((value) => csvEscape(value))
      .join(",");
  });

  await rewriteFile(guestStatusCsvPath, expectedGuestHeader, (values) => {
    return [
      values[0] || "",
      values[1] || "",
      values[3] || "",
      values[6] || values[4] || "",
      values[7] || values[5] || "",
    ]
      .map((value) => csvEscape(value))
      .join(",");
  });
}

async function ensureFile(filePath, initialContent) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, initialContent, "utf8");
  }
}

function csvEscape(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function csvLine(values) {
  return values.map(csvEscape).join(",") + "\n";
}

function toResponsesCsvLine(row) {
  return csvLine([
    row.timestamp,
    row.guestId,
    row.inviteeName,
    row.attendance,
    row.pageUrl,
  ]);
}

function toGuestCsvLine(row) {
  return csvLine([
    row.guestId,
    row.inviteeName,
    row.attendance,
    row.lastUpdated,
    row.pageUrl,
  ]);
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildGuestExcelXml(rows) {
  const rowXml = rows
    .map(
      (row) => `
      <Row>
        ${guestColumns.map((column) => `<Cell><Data ss:Type="String">${escapeXml(row[column])}</Data></Cell>`).join("")}
      </Row>`,
    )
    .join("");

  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Worksheet ss:Name="Guest Status">
    <Table>
      <Row>
        ${guestColumns.map((column) => `<Cell><Data ss:Type="String">${escapeXml(column)}</Data></Cell>`).join("")}
      </Row>
      ${rowXml}
    </Table>
  </Worksheet>
</Workbook>`;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, { "Content-Type": contentType });
  response.end(text);
}

function getStaticPath(requestPath) {
  if (requestPath === "/") {
    return path.join(rootDir, "index.html");
  }

  if (requestPath === "/api/guest-list.csv") {
    return guestListCsvPath;
  }

  if (requestPath === "/api/guest-status.csv") {
    return guestStatusCsvPath;
  }

  if (requestPath === "/api/guest-status.xls") {
    return guestStatusXlsPath;
  }

  if (requestPath === "/api/responses.csv") {
    return responsesCsvPath;
  }

  const resolvedPath = path.normalize(path.join(rootDir, requestPath));
  if (!resolvedPath.startsWith(rootDir)) {
    return null;
  }

  return resolvedPath;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (inQuotes) {
      if (character === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    if (character === ',') {
      cells.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current);
  return cells;
}

async function readGuestStatusRows() {
  try {
    const content = await fs.readFile(guestStatusCsvPath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    if (lines.length <= 1) {
      return [];
    }

    return lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      return {
        guestId: values[0] || "",
        inviteeName: values[1] || "",
        attendance: values[2] || "",
        lastUpdated: values[3] || "",
        pageUrl: values[4] || "",
      };
    });
  } catch {
    return [];
  }
}

async function writeGuestExports(rows) {
  const csv = [
    `${guestColumns.join(",")}\n`,
    ...rows.map(toGuestCsvLine),
  ].join("");

  await fs.writeFile(guestStatusCsvPath, csv, "utf8");
  await fs.writeFile(guestStatusXlsPath, buildGuestExcelXml(rows), "utf8");
}

async function upsertGuest(row) {
  const rows = await readGuestStatusRows();
  const nextRows = rows.filter((existing) => existing.guestId !== row.guestId);
  nextRows.push(row);
  await writeGuestExports(nextRows);
  return nextRows;
}

async function appendResponse(row) {
  await fs.appendFile(responsesCsvPath, toResponsesCsvLine(row), "utf8");
}

async function syncToGoogleSheets(action, row) {
  if (!googleSheetsWebhookUrl) {
    return;
  }

  await fetch(googleSheetsWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...row }),
  });
}

function normalizeAttendance(attendance) {
  if (attendance === "yes") {
    return "will attend";
  }

  if (attendance === "no") {
    return "will not attend";
  }

  return "pending";
}

async function handleInvite(payload) {
  const guestId = payload.guestId || "guest";
  const rows = await readGuestStatusRows();
  const existingRow = rows.find((row) => row.guestId === guestId);

  if (existingRow) {
    return { ok: true, totalGuests: rows.length };
  }

  const row = {
    guestId,
    inviteeName: payload.inviteeName || payload.name || "Guest",
    name: payload.name || payload.inviteeName || "Guest",
    attendance: "pending",
    guests: "0",
    message: "",
    lastUpdated: new Date().toISOString(),
    pageUrl: payload.pageUrl || "",
  };

  const nextRows = [...rows, row];
  await writeGuestExports(nextRows);
  await syncToGoogleSheets("invite", row);
  return { ok: true, totalGuests: nextRows.length };
}

async function handleRsvp(payload) {
  const attendance = normalizeAttendance(payload.attendance);
  const row = {
    guestId: payload.guestId || "guest",
    inviteeName: payload.inviteeName || payload.name || "Guest",
    name: payload.name || payload.inviteeName || "Guest",
    attendance,
    guests: String(Number.parseInt(payload.guests || "0", 10) || 0),
    message: payload.message || "",
    lastUpdated: new Date().toISOString(),
    pageUrl: payload.pageUrl || "",
  };

  await appendResponse({
    timestamp: row.lastUpdated,
    guestId: row.guestId,
    inviteeName: row.inviteeName,
    name: row.name,
    attendance: row.attendance,
    guests: row.guests,
    message: row.message,
    pageUrl: row.pageUrl,
  });

  const rows = await upsertGuest(row);
  await syncToGoogleSheets("rsvp", row);
  return { ok: true, totalResponses: rows.filter((existing) => existing.attendance !== "pending").length };
}

async function serveFile(response, filePath) {
  try {
    const extension = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes.get(extension) || "application/octet-stream";
    const content = await fs.readFile(filePath);
    response.writeHead(200, { "Content-Type": contentType });
    response.end(content);
  } catch {
    sendText(response, 404, "Not found");
  }
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, "http://localhost");

  if (request.method === "POST" && requestUrl.pathname === "/api/invite") {
    try {
      const payload = JSON.parse((await readBody(request)) || "{}");
      const result = await handleInvite(payload);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message || "Invalid invite payload" });
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/rsvp") {
    try {
      const payload = JSON.parse((await readBody(request)) || "{}");
      const result = await handleRsvp(payload);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message || "Invalid RSVP payload" });
    }
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/rsvp-summary") {
    const rows = await readGuestStatusRows();
    sendJson(response, 200, { ok: true, totalGuests: rows.length, responses: rows });
    return;
  }

  const staticPath = getStaticPath(decodeURIComponent(requestUrl.pathname));
  if (!staticPath) {
    sendText(response, 403, "Forbidden");
    return;
  }

  await serveFile(response, staticPath);
}

async function main() {
  await ensureDataFiles();

  const port = Number.parseInt(process.env.PORT || "8000", 10);
  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      sendText(response, 500, `Server error: ${error.message}`);
    });
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Wedding site running on http://0.0.0.0:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
