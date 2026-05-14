import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import initSqlJs from "sql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../data/tracker.db");

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function prevWorkday(date, offset) {
  const d = new Date(date);
  let count = 0;
  while (count < offset) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return d;
}

const SQL = await initSqlJs({
  locateFile: (f) => path.join(__dirname, "../node_modules/sql.js/dist", f),
});

const db = new SQL.Database(fs.readFileSync(dbPath));

const akquise = db.exec("SELECT id, label FROM habits WHERE category = 'AKQUISE' LIMIT 1");
if (!akquise[0]?.values?.length) {
  console.log("Kein AKQUISE-Habit gefunden.");
  db.close();
  process.exit(1);
}

const [habitId, label] = akquise[0].values[0];
console.log(`Habit: "${label}" (id=${habitId})`);

const today = new Date();
today.setHours(0, 0, 0, 0);

// 5 Werktage rückwärts + heute = 6 Tage Streak
const days = [today];
for (let i = 1; i <= 5; i++) days.push(prevWorkday(today, i));

let added = 0;
for (const d of days) {
  const dateKey = todayKey(d);
  const existing = db.exec(
    `SELECT id FROM entries WHERE habit_id = ${habitId} AND entry_date = '${dateKey}'`
  );
  if (!existing[0]?.values?.length) {
    db.run("INSERT INTO entries (habit_id, entry_date, entry_time) VALUES (?, ?, '10:00:00')", [habitId, dateKey]);
    console.log(`  + ${dateKey}`);
    added++;
  } else {
    console.log(`  ~ ${dateKey} (bereits vorhanden)`);
  }
}

fs.writeFileSync(dbPath, Buffer.from(db.export()));
db.close();
console.log(`\nFertig — ${added} Einträge hinzugefügt. Streak: 6 Werktage.`);
