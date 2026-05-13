import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import initSqlJs from "sql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../data/tracker.db");

const notes = [
  "Heute war ein guter Tag. Training war intensiv, aber das Gefühl danach unbezahlbar.",
  "Morgens schwer aufgestanden, aber dann doch noch gelesen. Kleine Siege zählen.",
  "Kaltakquise gemacht — drei Gespräche, eines vielversprechend. Dranbleiben.",
  "Spaziergang im Regen. Seltsam befreiend. Kein Alkohol heute, fühlt sich klar an.",
  "Schwacher Tag. YT vor dem Schlafen — aber ich habe es zumindest bemerkt.",
  "Ernährung sauber gehalten. Gelesen bis 22 Uhr. Das Netz wächst langsam.",
  "Training ausgefallen wegen Termin. Morgen nachholen. Notiz an mich: nicht kompensieren, einfach weitermachen.",
  "Heute alles grün. Solche Tage sind der Grund warum man anfängt.",
  "Müde aber stabil. Spazieren hat geholfen, den Kopf freizubekommen.",
  "Woche endet gut. Rückblick: mehr neue Fäden als alte. Das zählt.",
];

const SQL = await initSqlJs({
  locateFile: (file) => path.join(__dirname, "../node_modules/sql.js/dist", file),
});

const db = new SQL.Database(fs.readFileSync(dbPath));

const habits = db.exec("SELECT id, type, label FROM habits ORDER BY type, position")[0];
if (!habits) {
  console.error("Keine Habits gefunden. Erst die App einmal starten.");
  process.exit(1);
}

const rows = habits.values.map(([id, type, label]) => ({ id, type, label }));
const newHabits = rows.filter((h) => h.type === "new");
const oldHabits = rows.filter((h) => h.type === "old");

for (let i = 1; i <= 10; i++) {
  const date = new Date();
  date.setDate(date.getDate() - i);
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  // Check if entries already exist for this date
  const existing = db.exec(`SELECT COUNT(*) as c FROM entries WHERE entry_date = '${dateKey}'`);
  if (existing[0]?.values[0][0] > 0) continue;

  // Random selection of new habits (3-5)
  const shuffledNew = [...newHabits].sort(() => Math.random() - 0.5);
  const selectedNew = shuffledNew.slice(0, 3 + Math.floor(Math.random() * 3));

  // Random selection of old habits (0-2)
  const shuffledOld = [...oldHabits].sort(() => Math.random() - 0.5);
  const selectedOld = shuffledOld.slice(0, Math.floor(Math.random() * 3));

  [...selectedNew, ...selectedOld].forEach(({ id }) => {
    const time = `${String(8 + Math.floor(Math.random() * 14)).padStart(2, "0")}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}:00`;
    db.run("INSERT INTO entries (habit_id, entry_date, entry_time) VALUES (?, ?, ?)", [id, dateKey, time]);
  });

  // Insert note
  const note = notes[i - 1];
  db.run(
    `INSERT INTO notes (note_date, content, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(note_date) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    [dateKey, note, new Date().toISOString()]
  );

  console.log(`✓ ${dateKey} — ${selectedNew.length} neu, ${selectedOld.length} alt`);
}

const tempPath = `${dbPath}.tmp`;
fs.writeFileSync(tempPath, Buffer.from(db.export()));
fs.renameSync(tempPath, dbPath);
console.log("Fertig.");
