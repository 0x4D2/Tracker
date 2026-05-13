import { getTodayNote, saveNote } from "../../lib/tracker";

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ content: await getTodayNote() });
  }

  if (req.method === "POST") {
    try {
      const content = await saveNote(req.body?.content);
      return res.status(200).json({ content });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
