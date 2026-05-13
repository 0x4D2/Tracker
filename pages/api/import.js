import { importData } from "../../lib/tracker";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const nextState = await importData(req.body);
    return res.status(200).json(nextState);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}
