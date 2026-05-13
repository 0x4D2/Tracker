import { addEntry, deleteEntry } from "../../lib/tracker";

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const nextState = await addEntry(req.body?.habitId);
      return res.status(200).json(nextState);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }

  if (req.method === "DELETE") {
    try {
      const nextState = await deleteEntry(req.body?.id);
      return res.status(200).json(nextState);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
