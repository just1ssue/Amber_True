import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import initSqlJs from "sql.js";

const DB_PATH = process.env.PROMPTS_DB_PATH || "data/prompts.db";
const OUTPUT_PATH = process.env.PROMPTS_OUTPUT_JSON || "public/prompts.json";

function toPromptsJson(rows) {
  const out = {
    version: new Date().toISOString(),
    modifier: [],
    situation: [],
    content: [],
  };

  for (const row of rows) {
    const category = String(row.category);
    if (!["modifier", "situation", "content"].includes(category)) continue;
    if (Number(row.enabled) !== 1) continue;
    const card = {
      id: String(row.id),
      text: String(row.text),
      weight: Number.isFinite(Number(row.weight)) && Number(row.weight) > 0 ? Number(row.weight) : 1,
    };
    out[category].push(card);
  }

  for (const key of ["modifier", "situation", "content"]) {
    if (out[key].length === 0) {
      throw new Error(`No enabled prompts in category: ${key}`);
    }
  }
  return out;
}

async function main() {
  if (!existsSync(DB_PATH)) {
    throw new Error(`DB not found: ${DB_PATH}. Run npm run prompts:init first.`);
  }
  const SQL = await initSqlJs({
    locateFile: (file) => `node_modules/sql.js/dist/${file}`,
  });
  const db = new SQL.Database(readFileSync(DB_PATH));
  const rows = [];
  const stmt = db.prepare(
    "SELECT id, category, text, enabled, weight FROM prompts ORDER BY created_at ASC, id ASC",
  );
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  const prompts = toPromptsJson(rows);
  db.close();

  mkdirSync("public", { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(prompts, null, 2)}\n`, "utf8");
  console.log(`Updated ${OUTPUT_PATH} from ${DB_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
