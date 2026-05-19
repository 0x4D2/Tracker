import { resetAll, resetDay, todayKey } from "../../lib/tracker";
import { recalculateStarDays } from "../../lib/stars";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    if (req.body?.scope === "all") {
      return res.status(200).json(await resetAll());
    }

    const nextState = await resetDay();
    await recalculateStarDays(todayKey());
    return res.status(200).json(nextState);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}
