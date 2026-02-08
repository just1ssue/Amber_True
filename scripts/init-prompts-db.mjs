import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import initSqlJs from "sql.js";

const DB_PATH = process.env.PROMPTS_DB_PATH || "data/prompts.db";
const SOURCE_JSON = process.env.PROMPTS_SOURCE_JSON || "public/prompts.json";

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

    CREATE VIEW IF NOT EXISTS prompts_modifier AS
      SELECT id, text, enabled, weight, created_at
      FROM prompts
      WHERE category = 'modifier';

    CREATE VIEW IF NOT EXISTS prompts_situation AS
      SELECT id, text, enabled, weight, created_at
      FROM prompts
      WHERE category = 'situation';

    CREATE VIEW IF NOT EXISTS prompts_content AS
      SELECT id, text, enabled, weight, created_at
      FROM prompts
      WHERE category = 'content';

    CREATE TRIGGER IF NOT EXISTS prompts_modifier_insert
    INSTEAD OF INSERT ON prompts_modifier
    BEGIN
      INSERT INTO prompts (id, category, text, enabled, weight, created_at)
      VALUES (
        NEW.id,
        'modifier',
        NEW.text,
        COALESCE(NEW.enabled, 1),
        COALESCE(NEW.weight, 1),
        COALESCE(NEW.created_at, datetime('now'))
      );
    END;

    CREATE TRIGGER IF NOT EXISTS prompts_modifier_update
    INSTEAD OF UPDATE ON prompts_modifier
    BEGIN
      UPDATE prompts
      SET
        id = NEW.id,
        text = NEW.text,
        enabled = COALESCE(NEW.enabled, enabled),
        weight = COALESCE(NEW.weight, weight),
        created_at = COALESCE(NEW.created_at, created_at)
      WHERE id = OLD.id AND category = 'modifier';
    END;

    CREATE TRIGGER IF NOT EXISTS prompts_modifier_delete
    INSTEAD OF DELETE ON prompts_modifier
    BEGIN
      DELETE FROM prompts
      WHERE id = OLD.id AND category = 'modifier';
    END;

    CREATE TRIGGER IF NOT EXISTS prompts_situation_insert
    INSTEAD OF INSERT ON prompts_situation
    BEGIN
      INSERT INTO prompts (id, category, text, enabled, weight, created_at)
      VALUES (
        NEW.id,
        'situation',
        NEW.text,
        COALESCE(NEW.enabled, 1),
        COALESCE(NEW.weight, 1),
        COALESCE(NEW.created_at, datetime('now'))
      );
    END;

    CREATE TRIGGER IF NOT EXISTS prompts_situation_update
    INSTEAD OF UPDATE ON prompts_situation
    BEGIN
      UPDATE prompts
      SET
        id = NEW.id,
        text = NEW.text,
        enabled = COALESCE(NEW.enabled, enabled),
        weight = COALESCE(NEW.weight, weight),
        created_at = COALESCE(NEW.created_at, created_at)
      WHERE id = OLD.id AND category = 'situation';
    END;

    CREATE TRIGGER IF NOT EXISTS prompts_situation_delete
    INSTEAD OF DELETE ON prompts_situation
    BEGIN
      DELETE FROM prompts
      WHERE id = OLD.id AND category = 'situation';
    END;

    CREATE TRIGGER IF NOT EXISTS prompts_content_insert
    INSTEAD OF INSERT ON prompts_content
    BEGIN
      INSERT INTO prompts (id, category, text, enabled, weight, created_at)
      VALUES (
        NEW.id,
        'content',
        NEW.text,
        COALESCE(NEW.enabled, 1),
        COALESCE(NEW.weight, 1),
        COALESCE(NEW.created_at, datetime('now'))
      );
    END;

    CREATE TRIGGER IF NOT EXISTS prompts_content_update
    INSTEAD OF UPDATE ON prompts_content
    BEGIN
      UPDATE prompts
      SET
        id = NEW.id,
        text = NEW.text,
        enabled = COALESCE(NEW.enabled, enabled),
        weight = COALESCE(NEW.weight, weight),
        created_at = COALESCE(NEW.created_at, created_at)
      WHERE id = OLD.id AND category = 'content';
    END;

    CREATE TRIGGER IF NOT EXISTS prompts_content_delete
    INSTEAD OF DELETE ON prompts_content
    BEGIN
      DELETE FROM prompts
      WHERE id = OLD.id AND category = 'content';
    END;
  `);
}

function loadSourceJson(path) {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const json = JSON.parse(raw);
  return json;
}

function rowsFromPromptsJson(json) {
  if (!json) return [];
  const rows = [];
  for (const category of ["modifier", "situation", "content"]) {
    const list = Array.isArray(json[category]) ? json[category] : [];
    for (const row of list) {
      if (!row?.id || !row?.text) continue;
      rows.push({
        id: String(row.id),
        category,
        text: String(row.text),
        enabled: 1,
        weight: Number.isFinite(Number(row.weight)) && Number(row.weight) > 0 ? Number(row.weight) : 1,
      });
    }
  }
  return rows;
}

function seedIfEmpty(db, rows) {
  const countStmt = db.prepare("SELECT COUNT(*) as c FROM prompts");
  countStmt.step();
  const count = countStmt.getAsObject().c;
  countStmt.free();
  if (count > 0) {
    console.log("prompts table already has rows. Skip seed.");
    return;
  }

  const insert = db.prepare(`
    INSERT INTO prompts (id, category, text, enabled, weight)
    VALUES (?, ?, ?, ?, ?)
  `);
  const runRows = (seedRows) => {
    db.run("BEGIN");
    for (const r of seedRows) {
      insert.run([r.id, r.category, r.text, r.enabled, r.weight]);
    }
    db.run("COMMIT");
  };

  if (rows.length > 0) {
    runRows(rows);
    insert.free();
    console.log(`Seeded ${rows.length} rows from ${SOURCE_JSON}`);
    return;
  }

  runRows([
    { id: "m_001", category: "modifier", text: "最高に", enabled: 1, weight: 1 },
    { id: "s_001", category: "situation", text: "修羅場の会議で", enabled: 1, weight: 1 },
    { id: "c_001", category: "content", text: "一言で笑わせて", enabled: 1, weight: 1 },
  ]);
  insert.free();
  console.log("Seeded default rows.");
}

async function main() {
  mkdirSync("data", { recursive: true });
  const SQL = await initSqlJs({
    locateFile: (file) => `node_modules/sql.js/dist/${file}`,
  });
  const db = existsSync(DB_PATH) ? new SQL.Database(readFileSync(DB_PATH)) : new SQL.Database();
  ensureSchema(db);
  const source = loadSourceJson(SOURCE_JSON);
  seedIfEmpty(db, rowsFromPromptsJson(source));
  writeFileSync(DB_PATH, Buffer.from(db.export()));
  db.close();
  console.log(`Initialized DB: ${DB_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
