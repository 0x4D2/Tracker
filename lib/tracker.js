import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";
import { berechneScore } from "./scoring.js";

const DEFAULT_NEW = ["Training", "Lesen", "Ernährung", "Spazieren", "Kaltakquise", "Kein Alkohol"];
const DEFAULT_OLD = ["Masturbiert", "YT vor Schlaf", "Anruf vermieden"];
const LABEL_MIGRATIONS = {
  Ernaehrung: "Ernährung",
};
const VALID_CATEGORIES = ["AKQUISE", "HYGIENE", "SABOTAGE", null];

const CATEGORY_MAP = {
  Kaltakquise: "AKQUISE",
  Training: "HYGIENE",
  Lesen: "HYGIENE",
  Ernährung: "HYGIENE",
  Spazieren: "HYGIENE",
  Masturbiert: "SABOTAGE",
  "YT vor Schlaf": "SABOTAGE",
};

let databasePromise;
let sqlPromise;

function isDevModeEnabled() {
  return process.env.NEXT_PUBLIC_TRACKER_DEV_MODE === "true";
}

export function todayKey(date = new Date()) {
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

export function selectAll(db, sql, params = []) {
  const statement = db.prepare(sql);
  statement.bind(params);
  const rows = [];

  while (statement.step()) {
    rows.push(statement.getAsObject());
  }

  statement.free();
  return rows;
}

export function selectOne(db, sql, params = []) {
  return selectAll(db, sql, params)[0] || null;
}

export function persistDb(db) {
  const dbPath = getDbPath();
  const tempPath = `${dbPath}.tmp`;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(tempPath, Buffer.from(db.export()));
  fs.renameSync(tempPath, dbPath);
}

export async function ensureDb() {
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
      created_at TEXT NOT NULL,
      category TEXT
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

    CREATE TABLE IF NOT EXISTS stars (
      id INTEGER PRIMARY KEY,
      number INTEGER NOT NULL UNIQUE,
      name TEXT,
      unlocked_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS star_habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      star_id INTEGER NOT NULL REFERENCES stars(id),
      habit_id INTEGER NOT NULL REFERENCES habits(id),
      is_required INTEGER DEFAULT 0,
      added_at TEXT DEFAULT (datetime('now')),
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS star_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      star_id INTEGER NOT NULL REFERENCES stars(id),
      date TEXT NOT NULL,
      completed INTEGER NOT NULL,
      UNIQUE(star_id, date)
    );
  `);

    // migration: add category column if missing
    try { database.run("ALTER TABLE habits ADD COLUMN category TEXT"); } catch (_) {}

    // map existing habits to categories
    Object.entries(CATEGORY_MAP).forEach(([label, category]) => {
      database.run("UPDATE habits SET category = ? WHERE label = ? AND (category IS NULL OR category = '')", [category, label]);
    });

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

    const starCountRow = selectOne(database, "SELECT COUNT(*) AS count FROM stars");
    if (!starCountRow || !starCountRow.count) {
      const sdRow = selectOne(database, "SELECT value FROM settings WHERE key = ?", ["start_date"]);
      const unlockedAt = sdRow ? new Date(`${sdRow.value}T00:00:00`).toISOString() : new Date().toISOString();
      database.run("INSERT INTO stars (id, number, unlocked_at) VALUES (1, 1, ?)", [unlockedAt]);
      for (let i = 2; i <= 7; i++) {
        database.run("INSERT INTO stars (id, number) VALUES (?, ?)", [i, i]);
      }
      changed = true;
    }

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
  const rows = selectAll(db, "SELECT id, type, label, position, category FROM habits ORDER BY type, position, id");

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

async function getCallStreak() {
  const db = await ensureDb();
  const akquise = selectOne(db, "SELECT id FROM habits WHERE category = 'AKQUISE' LIMIT 1");
  if (!akquise) return 0;

  let streak = 0;
  const check = new Date();
  check.setHours(0, 0, 0, 0);

  for (let i = 0; i < 365; i++) {
    const day = check.getDay();
    if (day === 0 || day === 6) {
      check.setDate(check.getDate() - 1);
      continue;
    }
    const dateKey = todayKey(check);
    const entry = selectOne(db, "SELECT id FROM entries WHERE habit_id = ? AND entry_date = ?", [akquise.id, dateKey]);
    if (entry) {
      streak++;
    } else if (i === 0 || check >= new Date(new Date().setHours(0,0,0,0))) {
      // heute noch kein Anruf → noch nicht brechen
      check.setDate(check.getDate() - 1);
      continue;
    } else {
      break;
    }
    check.setDate(check.getDate() - 1);
  }

  return streak;
}

async function getWeekData(limit = 14) {
  const db = await ensureDb();
  const days = [];
  for (let offset = limit - 1; offset >= 0; offset--) {
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

async function getHistoryDays(limit = 30) {
  const db = await ensureDb();
  const days = [];

  for (let offset = limit - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const dateKey = todayKey(date);

    const entries = selectAll(
      db,
      `SELECT entries.id, entries.entry_time AS time, habits.label, habits.type, habits.id AS habitId
       FROM entries
       JOIN habits ON habits.id = entries.habit_id
       WHERE entries.entry_date = ?
       ORDER BY entries.id`,
      [dateKey]
    );

    const noteRow = selectOne(db, "SELECT content, updated_at FROM notes WHERE note_date = ?", [dateKey]);
    const summary = entries.reduce(
      (accumulator, entry) => {
        if (entry.type === "new") {
          accumulator.new += 1;
        }
        if (entry.type === "old") {
          accumulator.old += 1;
        }
        return accumulator;
      },
      { new: 0, old: 0 }
    );

    days.push({
      date: dateKey,
      new: summary.new,
      old: summary.old,
      total: summary.new + summary.old,
      note: noteRow?.content || "",
      noteTime: noteRow?.updated_at
        ? new Date(noteRow.updated_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
        : null,
      entries,
    });
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
  const [habits, totals, todayEntries, recentEntries, weekData, historyDays, lastSeen, stats, note] = await Promise.all([
    getHabits(),
    getTotals(),
    getTodayEntries(),
    getRecentEntries(),
    getWeekData(14),
    getHistoryDays(30),
    getLastSeen(),
    getStats(),
    getTodayNote(),
  ]);

  const [score, callStreak] = await Promise.all([
    Promise.resolve(berechneScore(habits, todayEntries, todayKey())),
    getCallStreak(),
  ]);

  return {
    startDate: await getStartDate(),
    habits,
    totals,
    todayEntries,
    recentEntries,
    weekData,
    historyDays,
    lastSeen,
    stats,
    note,
    score,
    callStreak,
  };
}

export async function addHabit(type, label, category = null) {
  const normalized = String(label || "").trim();
  if (!normalized) {
    throw new Error("Bitte einen Namen für den Strang angeben.");
  }

  if (!["new", "old"].includes(type)) {
    throw new Error("Ungültiger Strang-Typ.");
  }

  const cat = VALID_CATEGORIES.includes(category) ? category : null;

  const db = await ensureDb();
  const nextPositionRow = selectOne(
    db,
    "SELECT COALESCE(MAX(position), -1) + 1 AS nextPosition FROM habits WHERE type = ?",
    [type]
  );

  db.run("INSERT INTO habits (type, label, position, created_at, category) VALUES (?, ?, ?, ?, ?)", [
    type,
    normalized.slice(0, 40),
    nextPositionRow.nextPosition,
    new Date().toISOString(),
    cat,
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
  const habit = selectOne(db, "SELECT id, category FROM habits WHERE id = ?", [numericHabitId]);

  if (!habit) {
    throw new Error("Strang nicht gefunden.");
  }

  const now = new Date();
  const entryDate = todayKey(now);

  if (habit.category !== "AKQUISE" && !isDevModeEnabled()) {
    const existingEntry = selectOne(
      db,
      "SELECT id FROM entries WHERE habit_id = ? AND entry_date = ?",
      [numericHabitId, entryDate]
    );
    if (existingEntry) {
      throw new Error("Für heute bereits eingetragen.");
    }
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

  const starRows = selectAll(db, `
    SELECT s.number, s.name, s.unlocked_at,
           sh.is_required, h.label AS habit_label
    FROM stars s
    LEFT JOIN star_habits sh ON sh.star_id = s.id AND sh.active = 1
    LEFT JOIN habits h ON h.id = sh.habit_id
    ORDER BY s.number, sh.id
  `);
  const starsMap = new Map();
  for (const row of starRows) {
    if (!starsMap.has(row.number)) {
      starsMap.set(row.number, { number: row.number, name: row.name, unlocked_at: row.unlocked_at, habits: [] });
    }
    if (row.habit_label) {
      starsMap.get(row.number).habits.push({ habit_label: row.habit_label, is_required: row.is_required ? true : false });
    }
  }

  return {
    exportedAt: new Date().toISOString(),
    startDate: await getStartDate(),
    habits: await getHabits(),
    entries: await getAllEntries(),
    notes,
    stats: await getStats(),
    stars: Array.from(starsMap.values()),
  };
}

function normalizeImportPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Ungültiges Importformat.");
  }

  const habitGroups = payload.habits || {};
  const newHabits = Array.isArray(habitGroups.new) ? habitGroups.new : [];
  const oldHabits = Array.isArray(habitGroups.old) ? habitGroups.old : [];
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  const startDate = typeof payload.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.startDate)
    ? payload.startDate
    : todayKey();

  const sourceHabits = [
    ...newHabits.map((habit) => ({ ...habit, __expectedType: "new" })),
    ...oldHabits.map((habit) => ({ ...habit, __expectedType: "old" })),
  ];

  const seenHabitIds = new Set();
  const normalizedHabits = sourceHabits.map((habit, index) => {
    const sourceId = Number(habit.id);
    const type = habit.type || habit.__expectedType;
    const label = String(habit.label || "").trim();
    const position = Number.isFinite(Number(habit.position)) ? Number(habit.position) : index;
    const category = VALID_CATEGORIES.includes(habit.category ?? null) ? habit.category ?? null : null;
    const createdAt = typeof habit.created_at === "string"
      ? habit.created_at
      : typeof habit.createdAt === "string"
      ? habit.createdAt
      : new Date().toISOString();

    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      throw new Error("Import enthält einen ungültigen Habit.");
    }

    if (seenHabitIds.has(sourceId)) {
      throw new Error("Import enthält doppelte Habit-IDs.");
    }

    if (!["new", "old"].includes(type) || type !== habit.__expectedType) {
      throw new Error("Import enthält einen Habit mit ungültigem Typ.");
    }

    if (!label) {
      throw new Error("Import enthält einen Habit ohne Namen.");
    }

    seenHabitIds.add(sourceId);

    return {
      sourceId,
      type,
      label: label.slice(0, 40),
      position,
      category,
      createdAt,
    };
  });

  const knownHabitIds = new Set(normalizedHabits.map((habit) => habit.sourceId));
  const normalizedEntries = entries.map((entry) => {
    const sourceHabitId = Number(entry.habitId);
    if (!knownHabitIds.has(sourceHabitId)) {
      throw new Error("Import enthält einen Eintrag mit unbekanntem Habit.");
    }

    if (typeof entry.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      throw new Error("Import enthält einen Eintrag mit ungültigem Datum.");
    }

    return {
      sourceHabitId,
      date: entry.date,
      time: typeof entry.time === "string" && entry.time.trim() ? entry.time : "00:00:00",
    };
  });

  const normalizedNotes = notes
    .filter((note) => note && typeof note === "object")
    .map((note) => {
      if (typeof note.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(note.date)) {
        throw new Error("Import enthält eine Notiz mit ungültigem Datum.");
      }

      return {
        date: note.date,
        content: String(note.content || "").slice(0, 2000),
        updatedAt: typeof note.updatedAt === "string" ? note.updatedAt : new Date().toISOString(),
      };
    });

  const normalizedStars = Array.isArray(payload.stars)
    ? payload.stars
        .filter((s) => s && typeof s === "object" && Number.isInteger(s.number) && s.number >= 1 && s.number <= 7)
        .map((s) => ({
          number: s.number,
          name: typeof s.name === "string" ? s.name.trim().slice(0, 40) || null : null,
          unlocked_at: typeof s.unlocked_at === "string" ? s.unlocked_at : null,
          habits: Array.isArray(s.habits)
            ? s.habits
                .filter((h) => h && typeof h.habit_label === "string" && h.habit_label.trim())
                .map((h) => ({ habit_label: h.habit_label.trim(), is_required: !!h.is_required }))
            : [],
        }))
    : null;

  return {
    startDate,
    habits: normalizedHabits,
    entries: normalizedEntries,
    notes: normalizedNotes,
    stars: normalizedStars,
  };
}

export async function importData(payload) {
  const normalized = normalizeImportPayload(payload);
  const db = await ensureDb();

  db.run("BEGIN TRANSACTION");

  try {
    db.run("DELETE FROM entries");
    db.run("DELETE FROM habits");
    db.run("DELETE FROM notes");
    db.run("DELETE FROM settings");
    db.run("DELETE FROM star_habits");
    db.run("DELETE FROM star_days");
    db.run("DELETE FROM sqlite_sequence WHERE name IN ('habits', 'entries', 'star_habits', 'star_days')");

    // Reset all stars to locked (star 1 gets unlocked below or from import)
    db.run("UPDATE stars SET name = NULL, unlocked_at = NULL");

    db.run("INSERT INTO settings (key, value) VALUES (?, ?)", ["start_date", normalized.startDate]);

    const idMap = {};
    const labelToNewId = {};
    for (const habit of normalized.habits) {
      db.run("INSERT INTO habits (type, label, position, created_at, category) VALUES (?, ?, ?, ?, ?)", [
        habit.type,
        habit.label,
        habit.position,
        habit.createdAt,
        habit.category,
      ]);
      const row = db.exec("SELECT last_insert_rowid() AS id")[0];
      const newId = row?.values?.[0]?.[0];
      idMap[habit.sourceId] = newId;
      labelToNewId[habit.label] = newId;
    }

    for (const entry of normalized.entries) {
      db.run("INSERT INTO entries (habit_id, entry_date, entry_time) VALUES (?, ?, ?)", [
        idMap[entry.sourceHabitId],
        entry.date,
        entry.time,
      ]);
    }

    for (const note of normalized.notes) {
      db.run("INSERT INTO notes (note_date, content, updated_at) VALUES (?, ?, ?)", [
        note.date,
        note.content,
        note.updatedAt,
      ]);
    }

    if (normalized.stars) {
      for (const star of normalized.stars) {
        const unlockedAt = star.number === 1 && !star.unlocked_at
          ? new Date(`${normalized.startDate}T00:00:00`).toISOString()
          : star.unlocked_at;
        db.run("UPDATE stars SET name = ?, unlocked_at = ? WHERE number = ?",
          [star.name, unlockedAt, star.number]);
        for (const sh of star.habits) {
          const newHabitId = labelToNewId[sh.habit_label];
          if (newHabitId) {
            db.run("INSERT INTO star_habits (star_id, habit_id, is_required) VALUES ((SELECT id FROM stars WHERE number = ?), ?, ?)",
              [star.number, newHabitId, sh.is_required ? 1 : 0]);
          }
        }
      }
    } else {
      // Kein Star-Payload (alter Export) → Star 1 mit Startdatum entsperren
      db.run("UPDATE stars SET unlocked_at = ? WHERE number = 1",
        [new Date(`${normalized.startDate}T00:00:00`).toISOString()]);
    }

    db.run("COMMIT");
    persistDb(db);
  } catch (error) {
    try {
      db.run("ROLLBACK");
    } catch (_) {}
    throw error;
  }

  return getState();
}
