import { getVerlauf } from "../../lib/tracker";
import { getStarCompletionsByDates } from "../../lib/stars";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const days = await getVerlauf();
  const dates = days.map((d) => d.date);
  const starMap = await getStarCompletionsByDates(dates);
  return res.status(200).json(
    days.map((d) => ({ ...d, completedStars: starMap[d.date] || [] }))
  );
}
