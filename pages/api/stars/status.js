import { getStarsStatus } from "../../../lib/stars";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });
  try {
    return res.status(200).json(await getStarsStatus());
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}
