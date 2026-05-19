import { ensureDb, selectAll, selectOne, persistDb, todayKey } from "./tracker.js";

function _checkUnlocks(db) {
  const now = new Date().toISOString();
  const stars = selectAll(db, "SELECT * FROM stars ORDER BY number");

  for (let i = 1; i < stars.length; i++) {
    const star = stars[i];
    if (star.unlocked_at) continue;

    const prev = stars[i - 1];
    if (!prev.unlocked_at) break;

    const unlockedDateStr = prev.unlocked_at.slice(0, 10);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const unlockedDate = new Date(`${unlockedDateStr}T00:00:00`);
    unlockedDate.setHours(0, 0, 0, 0);
    const totalDays = Math.max(Math.floor((today - unlockedDate) / 86400000) + 1, 1);

    const row = selectOne(db,
      "SELECT COUNT(*) AS count FROM star_days WHERE star_id = ? AND completed = 1 AND date >= ?",
      [prev.id, unlockedDateStr]
    );
    const fillPercent = ((row?.count || 0) / totalDays) * 100;

    if (fillPercent >= 90) {
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
    const unlockedDate = new Date(`${unlockedDateStr}T00:00:00`);
    unlockedDate.setHours(0, 0, 0, 0);
    const totalDays = Math.max(Math.floor((today - unlockedDate) / 86400000) + 1, 1);

    const completedRow = selectOne(db,
      "SELECT COUNT(*) AS count FROM star_days WHERE star_id = ? AND completed = 1 AND date >= ?",
      [star.id, unlockedDateStr]
    );
    const completedDays = completedRow?.count || 0;
    const fillPercent = Math.round((completedDays / totalDays) * 100);

    const habits = selectAll(db, `
      SELECT sh.id AS star_habit_id, sh.habit_id, sh.is_required,
             h.label, h.type,
             (CASE WHEN EXISTS(
               SELECT 1 FROM entries WHERE habit_id = sh.habit_id AND entry_date = ?
             ) THEN 1 ELSE 0 END) AS done_today
      FROM star_habits sh
      JOIN habits h ON h.id = sh.habit_id
      WHERE sh.star_id = ? AND sh.active = 1
      ORDER BY sh.is_required DESC, sh.added_at
    `, [todayStr, star.id]);

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

    const starHabits = selectAll(db,
      "SELECT habit_id, is_required FROM star_habits WHERE star_id = ? AND active = 1",
      [star.id]
    );

    if (!starHabits.length) {
      db.run(
        `INSERT INTO star_days (star_id, date, completed) VALUES (?, ?, 0)
         ON CONFLICT(star_id, date) DO UPDATE SET completed = 0`,
        [star.id, dateStr]
      );
      changed = true;
      continue;
    }

    const allHabitIds = starHabits.map((sh) => sh.habit_id);
    const placeholders = allHabitIds.map(() => "?").join(",");

    const doneRows = selectAll(db,
      `SELECT DISTINCT habit_id FROM entries WHERE entry_date = ? AND habit_id IN (${placeholders})`,
      [dateStr, ...allHabitIds]
    );
    const doneIds = new Set(doneRows.map((r) => r.habit_id));

    const allDone = starHabits.every((sh) => doneIds.has(sh.habit_id));
    const requiredDone = starHabits.filter((sh) => sh.is_required).every((sh) => doneIds.has(sh.habit_id));
    const completed = allDone && requiredDone ? 1 : 0;

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
