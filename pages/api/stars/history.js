import { getStarCompletionsByDates } from "../../../lib/stars";
import { todayKey } from "../../../lib/tracker";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

  const days = Number(req.query.days) || 30;
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    dates.push(todayKey(d));
  }

  try {
    return res.status(200).json(await getStarCompletionsByDates(dates));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}
