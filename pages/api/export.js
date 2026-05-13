import { exportData } from "../../lib/tracker";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const payload = await exportData();
  const stamp = payload.exportedAt.slice(0, 10);

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="tracker-export-${stamp}.json"`);
  return res.status(200).send(JSON.stringify(payload, null, 2));
}