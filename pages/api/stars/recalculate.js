import { recalculateStarDays } from "../../../lib/stars";
import { todayKey } from "../../../lib/tracker";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
  const date = req.body?.date || todayKey();
  try {
    await recalculateStarDays(date);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}
