import { configureStarHabit, renameStar } from "../../../lib/stars";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
  const { star_id, habit_id, is_required, action, name } = req.body || {};
  if (!star_id) return res.status(400).json({ message: "star_id erforderlich." });

  try {
    if (action === "rename") {
      if (name === undefined) return res.status(400).json({ message: "name erforderlich." });
      await renameStar(star_id, name);
    } else {
      if (!habit_id) return res.status(400).json({ message: "habit_id erforderlich." });
      await configureStarHabit(star_id, habit_id, !!is_required, action);
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
}
