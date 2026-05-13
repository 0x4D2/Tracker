const path = require("path");
const fs = require("fs");
const initSqlJs = require("sql.js");

function dateKey(offsetDays) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

initSqlJs({
  locateFile: (file) => path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
}).then((SQL) => {
  const dbPath = path.join(process.cwd(), "data", "tracker.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = fs.existsSync(dbPath)
    ? new SQL.Database(fs.readFileSync(dbPath))
    : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS habits (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, label TEXT NOT NULL, position INTEGER NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY AUTOINCREMENT, habit_id INTEGER NOT NULL, entry_date TEXT NOT NULL, entry_time TEXT NOT NULL, FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS notes (note_date TEXT PRIMARY KEY, content TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(entry_date);
    CREATE INDEX IF NOT EXISTS idx_entries_habit ON entries(habit_id);
  `);

  db.run("DELETE FROM entries");
  db.run("DELETE FROM habits");
  db.run("DELETE FROM settings");

  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('start_date', ?)", [dateKey(90)]);

  const now = new Date().toISOString();

  const newHabits = [
    { label: "Training", pos: 0 },
    { label: "Lesen", pos: 1 },
    { label: "Ernährung", pos: 2 },
    { label: "Spazieren", pos: 3 },
    { label: "Kaltakquise", pos: 4 },
    { label: "Kein Alkohol", pos: 5 },
  ];

  // lastSeenOffset = Tage seit letztem Eintrag → zeigt Decay-Stufen
  const oldHabits = [
    { label: "YT vor Schlaf",    pos: 0, lastSeenOffset: 0,  count: 30 }, // heute → 100%
    { label: "Masturbiert",      pos: 1, lastSeenOffset: 2,  count: 22 }, // 2d → 82%
    { label: "Anruf vermieden",  pos: 2, lastSeenOffset: 6,  count: 15 }, // 6d → 60%
    { label: "Hausarbeit",       pos: 3, lastSeenOffset: 12, count: 18 }, // 12d → 40%
    { label: "Hausarbeit 2",     pos: 4, lastSeenOffset: 22, count: 10 }, // 22d → 22%
    { label: "Junk Food",        pos: 5, lastSeenOffset: 45, count: 25 }, // 45d → 10%
  ];

  const habitIds = {};

  for (const h of newHabits) {
    db.run("INSERT INTO habits (type, label, position, created_at) VALUES ('new', ?, ?, ?)", [h.label, h.pos, now]);
    habitIds[h.label] = db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
  }
  for (const h of oldHabits) {
    db.run("INSERT INTO habits (type, label, position, created_at) VALUES ('old', ?, ?, ?)", [h.label, h.pos, now]);
    habitIds[h.label] = db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
  }

  const newFreq = { Training: 0.7, Lesen: 0.9, Ernährung: 0.6, Spazieren: 0.8, Kaltakquise: 0.5, "Kein Alkohol": 0.85 };
  for (const h of newHabits) {
    for (let offset = 89; offset >= 0; offset--) {
      if (Math.random() < newFreq[h.label]) {
        db.run("INSERT INTO entries (habit_id, entry_date, entry_time) VALUES (?, ?, '10:00:00')", [habitIds[h.label], dateKey(offset)]);
      }
    }
  }

  for (const h of oldHabits) {
    const offsets = new Set([h.lastSeenOffset]);
    const spread = Math.max(h.count * 2, h.lastSeenOffset + 10);
    while (offsets.size < h.count) {
      offsets.add(h.lastSeenOffset + 1 + Math.floor(Math.random() * spread));
    }
    for (const offset of offsets) {
      db.run("INSERT INTO entries (habit_id, entry_date, entry_time) VALUES (?, ?, '23:00:00')", [habitIds[h.label], dateKey(offset)]);
    }
  }

  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  db.close();

  console.log("Testdaten OK:");
  for (const h of oldHabits) {
    console.log(`  ${h.label.padEnd(20)} letzter Eintrag vor ${String(h.lastSeenOffset).padStart(2)}d → Decay-Stufe sichtbar`);
  }
}).catch(console.error);
