import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";

const DEFAULT_NEW = ["Training", "Lesen", "Ernährung", "Spazieren", "Kaltakquise", "Kein Alkohol"];
const DEFAULT_OLD = ["Masturbiert", "YT vor Schlaf", "Anruf vermieden"];
const LABEL_MIGRATIONS = {
  Ernaehrung: "Ernährung",
};

let databasePromise;
let sqlPromise;

function isDevModeEnabled() {
  return process.env.NEXT_PUBLIC_TRACKER_DEV_MODE === "true";
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getDbPath() {
  if (process.env.TRACKER_DB_PATH) {
    return process.env.TRACKER_DB_PATH;
  }

  return path.join(process.cwd(), "data", "tracker.db");
}

function getSqlModule() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: (file) => path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
    });
  }

  return sqlPromise;
}

function selectAll(db, sql, params = []) {
  const statement = db.prepare(sql);
  statement.bind(params);
  const rows = [];

  while (statement.step()) {
    rows.push(statement.getAsObject());
  }

  statement.free();
  return rows;
}

function selectOne(db, sql, params = []) {
  return selectAll(db, sql, params)[0] || null;
}

function persistDb(db) {
  const dbPath = getDbPath();
  const tempPath = `${dbPath}.tmp`;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(tempPath, Buffer.from(db.export()));
  fs.renameSync(tempPath, dbPath);
}

async function ensureDb() {
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = (async () => {
    const SQL = await getSqlModule();
    const dbPath = getDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const database = fs.existsSync(dbPath)
      ? new SQL.Database(fs.readFileSync(dbPath))
      : new SQL.Database();

    database.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('new', 'old')),
      label TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      entry_date TEXT NOT NULL,
      entry_time TEXT NOT NULL,
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(entry_date);
    CREATE INDEX IF NOT EXISTS idx_entries_habit ON entries(habit_id);

    CREATE TABLE IF NOT EXISTS notes (
      note_date TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

    const existingStartDate = selectOne(database, "SELECT value FROM settings WHERE key = ?", ["start_date"]);
    const habitCountRow = selectOne(database, "SELECT COUNT(*) AS count FROM habits");
    let changed = false;

    if (!existingStartDate) {
      database.run("INSERT INTO settings (key, value) VALUES (?, ?)", ["start_date", todayKey()]);
      changed = true;
    }

    if (!habitCountRow || !habitCountRow.count) {
      const createdAt = new Date().toISOString();
      DEFAULT_NEW.forEach((label, index) => {
        database.run("INSERT INTO habits (type, label, position, created_at) VALUES (?, ?, ?, ?)", [
          "new",
          label,
          index,
          createdAt,
        ]);
      });

      DEFAULT_OLD.forEach((label, index) => {
        database.run("INSERT INTO habits (type, label, position, created_at) VALUES (?, ?, ?, ?)", [
          "old",
          label,
          index,
          createdAt,
        ]);
      });
      changed = true;
    }

    Object.entries(LABEL_MIGRATIONS).forEach(([from, to]) => {
      const existing = selectOne(database, "SELECT id FROM habits WHERE label = ?", [from]);
      if (existing) {
        database.run("UPDATE habits SET label = ? WHERE label = ?", [to, from]);
        changed = true;
      }
    });

    if (changed) {
      persistDb(database);
    }

    return database;
  })();

  return databasePromise;
}

async function getStartDate() {
  const db = await ensureDb();
  return selectOne(db, "SELECT value FROM settings WHERE key = ?", ["start_date"]).value;
}

async function getHabits() {
  const db = await ensureDb();
  const rows = selectAll(db, "SELECT id, type, label, position FROM habits ORDER BY type, position, id");

  return {
    new: rows.filter((row) => row.type === "new"),
    old: rows.filter((row) => row.type === "old"),
  };
}

async function getTotals() {
  const db = await ensureDb();
  const rows = selectAll(
    db,
    `SELECT habits.id, COUNT(entries.id) AS count
     FROM habits
     LEFT JOIN entries ON entries.habit_id = habits.id
     GROUP BY habits.id`
  );

  return rows.reduce((accumulator, row) => {
    accumulator[row.id] = row.count;
    return accumulator;
  }, {});
}

async function getTodayEntries() {
  const db = await ensureDb();
  const today = todayKey();
  return selectAll(
    db,
    `SELECT entries.id, entries.entry_date AS date, entries.entry_time AS time, habits.label, habits.type, habits.id AS habitId
     FROM entries
     JOIN habits ON habits.id = entries.habit_id
     WHERE entries.entry_date = ?
     ORDER BY entries.id DESC`,
    [today]
  );
}

async function getRecentEntries(limit = 20) {
  const db = await ensureDb();
  return selectAll(
    db,
    `SELECT entries.id, entries.entry_date AS date, entries.entry_time AS time, habits.label, habits.type, habits.id AS habitId
     FROM entries
     JOIN habits ON habits.id = entries.habit_id
     ORDER BY entries.id DESC
     LIMIT ?`,
    [limit]
  );
}

async function getWeekData() {
  const db = await ensureDb();
  const days = [];
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const dateKey = todayKey(date);
    const rows = selectAll(
      db,
      `SELECT habits.type, COUNT(entries.id) AS count
       FROM entries
       JOIN habits ON habits.id = entries.habit_id
       WHERE entries.entry_date = ?
       GROUP BY habits.type`,
      [dateKey]
    );
    const day = { date: dateKey, new: 0, old: 0 };
    rows.forEach((row) => {
      if (row.type === "new") day.new = row.count;
      if (row.type === "old") day.old = row.count;
    });
    days.push(day);
  }
  return days;
}

async function getLastSeen() {
  const db = await ensureDb();
  const rows = selectAll(
    db,
    `SELECT habits.id, MAX(entries.entry_date) AS lastDate
     FROM habits
     LEFT JOIN entries ON entries.habit_id = habits.id
     WHERE habits.type = 'old'
     GROUP BY habits.id`
  );

  return rows.reduce((accumulator, row) => {
    accumulator[row.id] = row.lastDate || null;
    return accumulator;
  }, {});
}

async function getStats() {
  const db = await ensureDb();
  const startDate = await getStartDate();

  const start = new Date(startDate);
  const today = new Date();
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const daysElapsed = Math.floor((today - start) / 86400000);
  const daysLeft = Math.max(365 - daysElapsed, 0);

  let streak = 0;
  for (let offset = 0; offset < 3650; offset += 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const dateKey = todayKey(date);
    const countRow = selectOne(
      db,
      `SELECT COUNT(*) AS count
       FROM entries
       JOIN habits ON habits.id = entries.habit_id
       WHERE entries.entry_date = ? AND habits.type = 'new'`,
      [dateKey]
    );
    const count = countRow ? countRow.count : 0;

    if (count > 0) {
      streak += 1;
      continue;
    }

    if (offset === 0) {
      continue;
    }

    break;
  }

  let sumNew = 0;
  let sumOld = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const dateKey = todayKey(date);
    const rows = selectAll(
      db,
      `SELECT habits.type, COUNT(entries.id) AS count
       FROM entries
       JOIN habits ON habits.id = entries.habit_id
       WHERE entries.entry_date = ?
       GROUP BY habits.type`,
      [dateKey]
    );

    rows.forEach((row) => {
      if (row.type === "new") {
        sumNew += row.count;
      }
      if (row.type === "old") {
        sumOld += row.count;
      }
    });
  }

  let direction = { symbol: "-", tone: "dim", text: "noch keine Daten" };
  if (sumNew > sumOld) {
    direction = {
      symbol: "↗",
      tone: "gold",
      text: `+${sumNew - sumOld} Richtung neues Ich`,
    };
  } else if (sumOld > sumNew) {
    direction = {
      symbol: "↘",
      tone: "red",
      text: `+${sumOld - sumNew} Richtung altes Ich`,
    };
  } else if (sumNew !== 0 || sumOld !== 0) {
    direction = { symbol: "→", tone: "dim", text: "gleichauf" };
  }

  return {
    daysLeft,
    daysTotal: 365,
    streak,
    direction,
  };
}

async function getAllEntries() {
  const db = await ensureDb();
  return selectAll(
    db,
    `SELECT entries.id, entries.entry_date AS date, entries.entry_time AS time, habits.label, habits.type, habits.id AS habitId
     FROM entries
     JOIN habits ON habits.id = entries.habit_id
     ORDER BY entries.entry_date DESC, entries.id DESC`
  );
}

export async function getTodayNote() {
  const db = await ensureDb();
  const row = selectOne(db, "SELECT content FROM notes WHERE note_date = ?", [todayKey()]);
  return row ? row.content : "";
}

export async function saveNote(content) {
  const db = await ensureDb();
  const trimmed = String(content || "").slice(0, 2000);
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO notes (note_date, content, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(note_date) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    [todayKey(), trimmed, now]
  );
  persistDb(db);
  return trimmed;
}

export async function getVerlauf() {
  const db = await ensureDb();

  const dates = selectAll(
    db,
    `SELECT DISTINCT date FROM (
       SELECT note_date AS date FROM notes
       UNION
       SELECT entry_date AS date FROM entries
     ) ORDER BY date DESC`
  );

  return dates.map(({ date }) => {
    const noteRow = selectOne(db, "SELECT content, updated_at FROM notes WHERE note_date = ?", [date]);
    const entries = selectAll(
      db,
      `SELECT habits.label, habits.type
       FROM entries
       JOIN habits ON habits.id = entries.habit_id
       WHERE entries.entry_date = ?
       ORDER BY habits.type, entries.id`,
      [date]
    );

    const noteTime = noteRow?.updated_at
      ? new Date(noteRow.updated_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
      : null;

    return {
      date,
      note: noteRow ? noteRow.content : "",
      noteTime,
      entries,
    };
  });
}

export async function getState() {
  return {
    startDate: await getStartDate(),
    habits: await getHabits(),
    totals: await getTotals(),
    todayEntries: await getTodayEntries(),
    recentEntries: await getRecentEntries(),
    weekData: await getWeekData(),
    lastSeen: await getLastSeen(),
    stats: await getStats(),
    note: await getTodayNote(),
  };
}

export async function addHabit(type, label) {
  const normalized = String(label || "").trim();
  if (!normalized) {
    throw new Error("Bitte einen Namen für den Strang angeben.");
  }

  if (!["new", "old"].includes(type)) {
    throw new Error("Ungültiger Strang-Typ.");
  }

  const db = await ensureDb();
  const nextPositionRow = selectOne(
    db,
    "SELECT COALESCE(MAX(position), -1) + 1 AS nextPosition FROM habits WHERE type = ?",
    [type]
  );

  db.run("INSERT INTO habits (type, label, position, created_at) VALUES (?, ?, ?, ?)", [
    type,
    normalized.slice(0, 40),
    nextPositionRow.nextPosition,
    new Date().toISOString(),
  ]);
  persistDb(db);

  return getState();
}

export async function removeHabit(id) {
  const db = await ensureDb();
  db.run("DELETE FROM entries WHERE habit_id = ?", [Number(id)]);
  db.run("DELETE FROM habits WHERE id = ?", [Number(id)]);
  persistDb(db);
  return getState();
}

export async function addEntry(habitId) {
  const db = await ensureDb();
  const numericHabitId = Number(habitId);
  const habit = selectOne(db, "SELECT id FROM habits WHERE id = ?", [numericHabitId]);

  if (!habit) {
    throw new Error("Strang nicht gefunden.");
  }

  const now = new Date();
  const entryDate = todayKey(now);
  const existingEntry = selectOne(
    db,
    "SELECT id FROM entries WHERE habit_id = ? AND entry_date = ?",
    [numericHabitId, entryDate]
  );

  if (existingEntry && !isDevModeEnabled()) {
    throw new Error("Für heute bereits eingetragen.");
  }

  db.run("INSERT INTO entries (habit_id, entry_date, entry_time) VALUES (?, ?, ?)", [
    numericHabitId,
    entryDate,
    formatTime(now),
  ]);
  persistDb(db);

  return getState();
}

export async function deleteEntry(entryId) {
  const db = await ensureDb();
  const existingEntry = selectOne(db, "SELECT id FROM entries WHERE id = ?", [Number(entryId)]);

  if (!existingEntry) {
    throw new Error("Eintrag nicht gefunden.");
  }

  db.run("DELETE FROM entries WHERE id = ?", [Number(entryId)]);
  persistDb(db);
  return getState();
}

export async function resetDay(date = todayKey()) {
  const db = await ensureDb();
  db.run("DELETE FROM entries WHERE entry_date = ?", [date]);
  persistDb(db);
  return getState();
}

export async function resetAll() {
  const db = await ensureDb();
  db.close();
  databasePromise = null;

  const dbPath = getDbPath();
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  return getState();
}

export async function exportData() {
  const db = await ensureDb();
  const notes = selectAll(db, "SELECT note_date AS date, content, updated_at AS updatedAt FROM notes ORDER BY note_date DESC");
  return {
    exportedAt: new Date().toISOString(),
    startDate: await getStartDate(),
    habits: await getHabits(),
    entries: await getAllEntries(),
    notes,
    stats: await getStats(),
  };
}

export async function importData(payload) {
  const db = await ensureDb();

  db.run("DELETE FROM entries");
  db.run("DELETE FROM habits");
  db.run("DELETE FROM notes");
  db.run("DELETE FROM settings");
  db.run("DELETE FROM sqlite_sequence WHERE name IN ('habits', 'entries')");

  const startDate = payload.startDate || todayKey();
  db.run("INSERT INTO settings (key, value) VALUES (?, ?)", ["start_date", startDate]);

  const allHabits = [...(payload.habits?.new || []), ...(payload.habits?.old || [])];
  const idMap = {};
  for (const habit of allHabits) {
    db.run("INSERT INTO habits (type, label, position, created_at) VALUES (?, ?, ?, ?)", [
      habit.type,
      habit.label,
      habit.position ?? 0,
      habit.created_at || new Date().toISOString(),
    ]);
    const row = db.exec("SELECT last_insert_rowid() AS id")[0];
    idMap[habit.id] = row.values[0][0];
  }

  for (const entry of (payload.entries || [])) {
    const newHabitId = idMap[entry.habitId];
    if (!newHabitId) continue;
    db.run("INSERT INTO entries (habit_id, entry_date, entry_time) VALUES (?, ?, ?)", [
      newHabitId,
      entry.date,
      entry.time || "00:00:00",
    ]);
  }

  for (const note of (payload.notes || [])) {
    if (!note.date || !note.content) continue;
    db.run("INSERT INTO notes (note_date, content, updated_at) VALUES (?, ?, ?)", [
      note.date,
      note.content,
      note.updatedAt || new Date().toISOString(),
    ]);
  }

  persistDb(db);
  db.close();
  databasePromise = null;

  return getState();
}
