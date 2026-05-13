import { resetAll, resetDay } from "../../lib/tracker";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    if (req.body?.scope === "all") {
      return res.status(200).json(await resetAll());
    }

    return res.status(200).json(await resetDay());
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}
