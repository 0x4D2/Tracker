import { ensureDb, persistDb, selectOne, todayKey } from "../../../lib/tracker";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  const db = await ensureDb();

  db.run("DELETE FROM star_habits");
  db.run("DELETE FROM star_days");
  db.run("UPDATE stars SET name = NULL, unlocked_at = NULL");

  const sd = selectOne(db, "SELECT value FROM settings WHERE key = ?", ["start_date"]);
  const unlockedAt = sd ? new Date(`${sd.value}T00:00:00`).toISOString() : new Date().toISOString();
  db.run("UPDATE stars SET unlocked_at = ? WHERE number = 1", [unlockedAt]);

  persistDb(db);

  return res.status(200).json({ ok: true });
}
