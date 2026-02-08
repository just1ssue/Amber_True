import { existsSync, readFileSync, writeFileSync } from "node:fs";
import initSqlJs from "sql.js";

const DB_PATH = process.env.PROMPTS_DB_PATH || "data/prompts.db";
const CSV_PATH = process.env.PROMPTS_SOURCE_CSV || "data/prompts.bulk.csv";
const ALLOWED_CATEGORIES = new Set(["modifier", "situation", "content"]);

function parseCsv(text) {
  const rows = [];
  const normalized = text.replace(/^\uFEFF/, "");
  let i = 0;
  let field = "";
  let row = [];
  let inQuotes = false;

  while (i < normalized.length) {
    const ch = normalized[i];
    const next = normalized[i + 1];

    if (inQuotes) {
      if (ch === "\"" && next === "\"") {
        field += "\"";
        i += 2;
        continue;
      }
      if (ch === "\"") {
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((v) => String(v).trim().length > 0));
}

function normalizeEnabled(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "" || raw === "1" || raw === "true") return 1;
  if (raw === "0" || raw === "false") return 0;
  throw new Error(`Invalid enabled value: ${value}`);
}

function normalizeWeight(value) {
  if (value == null || String(value).trim() === "") return 1;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`Invalid weight value: ${value}`);
  }
  return num;
}

function toRecords(csvRows) {
  if (csvRows.length === 0) return [];
  const [header, ...body] = csvRows;
  const expected = ["id", "category", "text", "enabled", "weight"];
  const normalizedHeader = header.map((h) => String(h).trim());
  if (normalizedHeader.join(",") !== expected.join(",")) {
    throw new Error(`Invalid CSV header. Expected: ${expected.join(",")}`);
  }

  return body.map((r, index) => {
    const line = index + 2;
    const [idRaw, categoryRaw, textRaw, enabledRaw, weightRaw] = r;
    const id = String(idRaw ?? "").trim();
    const category = String(categoryRaw ?? "").trim();
    const text = String(textRaw ?? "").trim();
    if (!id) throw new Error(`Line ${line}: id is required.`);
    if (!ALLOWED_CATEGORIES.has(category)) {
      throw new Error(`Line ${line}: invalid category "${category}".`);
    }
    if (!text) throw new Error(`Line ${line}: text is required.`);

    return {
      id,
      category,
      text,
      enabled: normalizeEnabled(enabledRaw),
      weight: normalizeWeight(weightRaw),
    };
  });
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL CHECK (category IN ('modifier', 'situation', 'content')),
      text TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      weight REAL NOT NULL DEFAULT 1 CHECK (weight > 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

async function main() {
  if (!existsSync(CSV_PATH)) {
    throw new Error(`CSV not found: ${CSV_PATH}`);
  }

  const SQL = await initSqlJs({
    locateFile: (file) => `node_modules/sql.js/dist/${file}`,
  });
  const db = existsSync(DB_PATH) ? new SQL.Database(readFileSync(DB_PATH)) : new SQL.Database();
  ensureSchema(db);

  const csvText = readFileSync(CSV_PATH, "utf8");
  const records = toRecords(parseCsv(csvText));
  if (records.length === 0) {
    console.log(`No rows to import in ${CSV_PATH}`);
    db.close();
    return;
  }

  const upsert = db.prepare(`
    INSERT INTO prompts (id, category, text, enabled, weight)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      category=excluded.category,
      text=excluded.text,
      enabled=excluded.enabled,
      weight=excluded.weight
  `);

  db.run("BEGIN");
  for (const r of records) {
    upsert.run([r.id, r.category, r.text, r.enabled, r.weight]);
  }
  db.run("COMMIT");
  upsert.free();

  writeFileSync(DB_PATH, Buffer.from(db.export()));
  db.close();
  console.log(`Imported ${records.length} rows from ${CSV_PATH} into ${DB_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
