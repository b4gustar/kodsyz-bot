import { run } from "../lib/core.js";
import { allowed } from "./_auth.js";

// POST /api/run — один проход автоответа (по расписанию или кнопкой из панели)
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST" });
  if (!allowed(req, { run: true })) return res.status(401).json({ error: "нет доступа" });
  const dry = req.query?.dry === "1";
  try {
    res.status(200).json({ dry, ...(await run({ send: !dry })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
