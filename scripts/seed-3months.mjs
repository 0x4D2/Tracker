import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import initSqlJs from "sql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../data/tracker.db");

const notePool = [
  "Guter Start in den Tag. Fokus war da.",
  "Heute war es schwer, aber ich habe es durchgezogen.",
  "Training war intensiv. Das Gefühl danach unbezahlbar.",
  "Gelesen bis spät. Zeit gut genutzt.",
  "Kaltakquise gemacht — ein Gespräch war vielversprechend.",
  "Spaziergang hat den Kopf freigemacht.",
  "Kein Alkohol. Fühlt sich klar an.",
  "Schwacher Tag, aber morgen ist neu.",
  "Ernährung sauber gehalten. Stolz darauf.",
  "Das Netz wächst. Langsam, aber stetig.",
  "Heute alles grün. Solche Tage sind der Grund warum man anfängt.",
  "Müde aber stabil. Weiter.",
  "Woche war gut. Mehr neue Fäden als alte.",
  "Fokus auf das Wesentliche. Nebensächliches ignoriert.",
  "Morgens meditiert, abends reflektiert.",
  "Ein Tag ohne großes Drama. Genau das.",
  "Rückblick: Ich bin nicht derselbe wie vor 30 Tagen.",
  "Gewohnheiten sind Entscheidungen die man einmal trifft.",
  "Heute war ein Testtag. Bestanden.",
  "",
  "",
  "",
];

const SQL = await initSqlJs({
  locateFile: (f) => path.join(__dirname, "../node_modules/sql.js/dist", f),
});

const db = new SQL.Database(fs.readFileSync(dbPath));
const habits = db.exec("SELECT id, type FROM habits ORDER BY type, position")[0];
if (!habits) { console.error("Keine Habits."); process.exit(1); }

const rows = habits.values.map(([id, type]) => ({ id, type }));
const newH = rows.filter((h) => h.type === "new");
const oldH = rows.filter((h) => h.type === "old");

let added = 0;

for (let i = 11; i <= 92; i++) {
  const date = new Date();
  date.setDate(date.getDate() - i);
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const existing = db.exec(`SELECT COUNT(*) as c FROM entries WHERE entry_date = '${dateKey}'`);
  if (existing[0]?.values[0][0] > 0) continue;

  const skipDay = Math.random() < 0.12;
  if (skipDay) continue;

  const selectedNew = [...newH].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * (newH.length - 1)));
  const selectedOld = [...oldH].sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * 3));

  [...selectedNew, ...selectedOld].forEach(({ id }) => {
    const h = String(8 + Math.floor(Math.random() * 14)).padStart(2, "0");
    const m = String(Math.floor(Math.random() * 60)).padStart(2, "0");
    db.run("INSERT INTO entries (habit_id, entry_date, entry_time) VALUES (?, ?, ?)", [id, dateKey, `${h}:${m}:00`]);
  });

  const note = notePool[Math.floor(Math.random() * notePool.length)];
  if (note) {
    db.run(
      `INSERT INTO notes (note_date, content, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(note_date) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
      [dateKey, note, new Date().toISOString()]
    );
  }

  added++;
}

const tmp = `${dbPath}.tmp`;
fs.writeFileSync(tmp, Buffer.from(db.export()));
fs.renameSync(tmp, dbPath);
console.log(`${added} Tage hinzugefügt.`);
