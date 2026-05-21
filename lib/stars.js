import { ensureDb, selectAll, selectOne, persistDb, todayKey } from "./tracker.js";

function _loadStarHabitsWithType(db, starId) {
  return selectAll(db, `
    SELECT sh.habit_id, sh.is_required, h.type
    FROM star_habits sh
    JOIN habits h ON h.id = sh.habit_id
    WHERE sh.star_id = ? AND sh.active = 1
  `, [starId]);
}

function _isDayComplete(db, starHabits, dateStr) {
  const newHabits = starHabits.filter((sh) => sh.type === "new");
  const oldHabits = starHabits.filter((sh) => sh.type === "old");

  if (newHabits.length > 0) {
    const ph = newHabits.map(() => "?").join(",");
    const ids = newHabits.map((sh) => sh.habit_id);
    const row = selectOne(db, `
      SELECT COUNT(DISTINCT habit_id) AS count FROM entries
      WHERE entry_date = ? AND habit_id IN (${ph})
    `, [dateStr, ...ids]);
    if ((row?.count || 0) < newHabits.length) return false;
  }

  if (oldHabits.length > 0) {
    const ph = oldHabits.map(() => "?").join(",");
    const ids = oldHabits.map((sh) => sh.habit_id);
    const row = selectOne(db, `
      SELECT COUNT(*) AS count FROM entries
      WHERE entry_date = ? AND habit_id IN (${ph})
    `, [dateStr, ...ids]);
    if ((row?.count || 0) > 0) return false;
  }

  return true;
}

function _calcStreak(db, starId, todayStr) {
  const starHabits = _loadStarHabitsWithType(db, starId);
  if (!starHabits.length) return 0;

  const today = new Date(`${todayStr}T00:00:00`);
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  for (let offset = 0; offset < 365; offset++) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    const dateStr = todayKey(d);
    const complete = _isDayComplete(db, starHabits, dateStr);
    if (complete) {
      streak++;
    } else if (offset === 0) {
      // heute noch nicht vollständig — gestern prüfen
    } else {
      break;
    }
  }
  return streak;
}

function _calcCompletedDays(db, starId, unlockedDateStr, todayStr) {
  const starHabits = _loadStarHabitsWithType(db, starId);
  if (!starHabits.length) return 0;

  const newHabits = starHabits.filter((sh) => sh.type === "new");
  const oldHabits = starHabits.filter((sh) => sh.type === "old");

  // Tage ermitteln an denen alle new Fäden erledigt wurden
  let goodDays;
  if (newHabits.length > 0) {
    const ph = newHabits.map(() => "?").join(",");
    const ids = newHabits.map((sh) => sh.habit_id);
    goodDays = new Set(selectAll(db, `
      SELECT entry_date FROM entries
      WHERE entry_date >= ? AND entry_date <= ? AND habit_id IN (${ph})
      GROUP BY entry_date HAVING COUNT(DISTINCT habit_id) = ?
    `, [unlockedDateStr, todayStr, ...ids, ids.length]).map((r) => r.entry_date));
  } else {
    // Nur old Fäden: alle Tage im Zeitraum als Kandidaten
    const start = new Date(`${unlockedDateStr}T00:00:00`);
    start.setHours(0, 0, 0, 0);
    const end = new Date(`${todayStr}T00:00:00`);
    end.setHours(0, 0, 0, 0);
    goodDays = new Set();
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      goodDays.add(todayKey(new Date(cursor)));
    }
  }

  // Tage entfernen an denen ein old Faden getriggert wurde
  if (oldHabits.length > 0 && goodDays.size > 0) {
    const ph = oldHabits.map(() => "?").join(",");
    const ids = oldHabits.map((sh) => sh.habit_id);
    selectAll(db, `
      SELECT DISTINCT entry_date FROM entries
      WHERE entry_date >= ? AND entry_date <= ? AND habit_id IN (${ph})
    `, [unlockedDateStr, todayStr, ...ids]).forEach((r) => goodDays.delete(r.entry_date));
  }

  return goodDays.size;
}

function _checkUnlocks(db) {
  const now = new Date().toISOString();
  const todayStr = todayKey();
  const stars = selectAll(db, "SELECT * FROM stars ORDER BY number");

  for (let i = 1; i < stars.length; i++) {
    const star = stars[i];
    if (star.unlocked_at) continue;

    const prev = stars[i - 1];
    if (!prev.unlocked_at) break;

    const unlockedDateStr = prev.unlocked_at.slice(0, 10);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstHabitRow = selectOne(db,
      "SELECT MIN(added_at) AS first FROM star_habits WHERE star_id = ? AND active = 1",
      [prev.id]
    );
    const firstHabitDate = firstHabitRow?.first?.slice(0, 10);
    const effectiveStart = (firstHabitDate && firstHabitDate > unlockedDateStr) ? firstHabitDate : unlockedDateStr;
    const effectiveDate = new Date(`${effectiveStart}T00:00:00`);
    effectiveDate.setHours(0, 0, 0, 0);
    const totalDays = Math.max(Math.floor((today - effectiveDate) / 86400000) + 1, 1);
    const completedDays = _calcCompletedDays(db, prev.id, effectiveStart, todayStr);

    if ((completedDays / totalDays) * 100 >= 90) {
      db.run("UPDATE stars SET unlocked_at = ? WHERE id = ?", [now, star.id]);
    } else {
      break;
    }
  }
}

export async function getStarsStatus() {
  const db = await ensureDb();
  const todayStr = todayKey();
  const stars = selectAll(db, "SELECT * FROM stars ORDER BY number");

  return stars.map((star) => {
    if (!star.unlocked_at) {
      return {
        star_id: star.id,
        number: star.number,
        name: star.name,
        unlocked: false,
        unlocked_at: null,
        fill_percent: 0,
        active: false,
        total_days: 0,
        completed_days: 0,
        habits: [],
      };
    }

    const unlockedDateStr = star.unlocked_at.slice(0, 10);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Effektiver Start = späteres Datum von (Freischaltung, erstes Habit zugewiesen)
    // Verhindert riesigen Nenner wenn der Stern schon lange offen war aber erst jetzt konfiguriert wird
    const firstHabitRow = selectOne(db,
      "SELECT MIN(added_at) AS first FROM star_habits WHERE star_id = ? AND active = 1",
      [star.id]
    );
    const firstHabitDate = firstHabitRow?.first?.slice(0, 10);
    const effectiveStart = (firstHabitDate && firstHabitDate > unlockedDateStr)
      ? firstHabitDate
      : unlockedDateStr;

    const effectiveDate = new Date(`${effectiveStart}T00:00:00`);
    effectiveDate.setHours(0, 0, 0, 0);
    const totalDays = Math.max(Math.floor((today - effectiveDate) / 86400000) + 1, 1);

    const habits = selectAll(db, `
      SELECT sh.id AS star_habit_id, sh.habit_id, sh.is_required,
             h.label, h.type,
             (CASE
               WHEN h.type = 'old' AND NOT EXISTS(
                 SELECT 1 FROM entries WHERE habit_id = sh.habit_id AND entry_date = ?
               ) THEN 1
               WHEN h.type = 'new' AND EXISTS(
                 SELECT 1 FROM entries WHERE habit_id = sh.habit_id AND entry_date = ?
               ) THEN 1
               ELSE 0
             END) AS done_today
      FROM star_habits sh
      JOIN habits h ON h.id = sh.habit_id
      WHERE sh.star_id = ? AND sh.active = 1
      ORDER BY sh.is_required DESC, sh.added_at
    `, [todayStr, todayStr, star.id]);

    const completedDays = _calcCompletedDays(db, star.id, effectiveStart, todayStr);
    const fillPercent = Math.round((completedDays / totalDays) * 100);
    const streak = _calcStreak(db, star.id, todayStr);

    return {
      star_id: star.id,
      number: star.number,
      name: star.name,
      unlocked: true,
      unlocked_at: unlockedDateStr,
      fill_percent: fillPercent,
      active: fillPercent >= 90,
      total_days: totalDays,
      completed_days: completedDays,
      streak,
      habits: habits.map((h) => ({
        star_habit_id: h.star_habit_id,
        id: h.habit_id,
        label: h.label,
        type: h.type,
        is_required: !!h.is_required,
        done_today: !!h.done_today,
      })),
    };
  });
}

export async function recalculateStarDays(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    dateStr = todayKey();
  }

  const db = await ensureDb();
  const stars = selectAll(db, "SELECT * FROM stars WHERE unlocked_at IS NOT NULL ORDER BY number");
  let changed = false;

  for (const star of stars) {
    const unlockedDateStr = star.unlocked_at.slice(0, 10);
    if (dateStr < unlockedDateStr) continue;

    const starHabits = _loadStarHabitsWithType(db, star.id);

    if (!starHabits.length) {
      db.run(
        `INSERT INTO star_days (star_id, date, completed) VALUES (?, ?, 0)
         ON CONFLICT(star_id, date) DO UPDATE SET completed = 0`,
        [star.id, dateStr]
      );
      changed = true;
      continue;
    }

    const completed = _isDayComplete(db, starHabits, dateStr) ? 1 : 0;

    db.run(
      `INSERT INTO star_days (star_id, date, completed) VALUES (?, ?, ?)
       ON CONFLICT(star_id, date) DO UPDATE SET completed = excluded.completed`,
      [star.id, dateStr, completed]
    );
    changed = true;
  }

  if (changed) {
    _checkUnlocks(db);
    persistDb(db);
  }
}

export async function configureStarHabit(star_id, habit_id, is_required, action) {
  const db = await ensureDb();
  const numStarId = Number(star_id);
  const numHabitId = Number(habit_id);

  const star = selectOne(db, "SELECT unlocked_at FROM stars WHERE id = ?", [numStarId]);
  if (!star?.unlocked_at) throw new Error("Stern ist noch nicht freigeschaltet.");

  if (action === "add") {
    const existing = selectOne(db,
      "SELECT id FROM star_habits WHERE star_id = ? AND habit_id = ?",
      [numStarId, numHabitId]
    );

    if (existing) {
      db.run("UPDATE star_habits SET active = 1, is_required = ? WHERE id = ?",
        [is_required ? 1 : 0, existing.id]);
    } else {
      db.run("INSERT INTO star_habits (star_id, habit_id, is_required) VALUES (?, ?, ?)",
        [numStarId, numHabitId, is_required ? 1 : 0]);
    }

    if (is_required) {
      db.run(
        "UPDATE star_habits SET is_required = 0 WHERE star_id = ? AND habit_id != ? AND active = 1",
        [numStarId, numHabitId]
      );
    }
  } else if (action === "remove") {
    db.run("UPDATE star_habits SET active = 0 WHERE star_id = ? AND habit_id = ?",
      [numStarId, numHabitId]);
  } else {
    throw new Error("Ungültige Aktion.");
  }

  persistDb(db);
}

export async function getStarCompletionsByDates(dates) {
  if (!dates.length) return {};
  const db = await ensureDb();
  const placeholders = dates.map(() => "?").join(",");
  const rows = selectAll(db,
    `SELECT sd.date, s.number
     FROM star_days sd
     JOIN stars s ON s.id = sd.star_id
     WHERE sd.date IN (${placeholders}) AND sd.completed = 1
     ORDER BY sd.date, s.number`,
    dates
  );
  const result = {};
  for (const row of rows) {
    if (!result[row.date]) result[row.date] = [];
    result[row.date].push(row.number);
  }
  return result;
}

export async function renameStar(star_id, name) {
  const db = await ensureDb();
  const normalized = String(name || "").trim().slice(0, 40);
  db.run("UPDATE stars SET name = ? WHERE id = ?", [normalized || null, Number(star_id)]);
  persistDb(db);
}
