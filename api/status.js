import { KEYWORDS, scan } from "../lib/core.js";
import { allowed } from "./_auth.js";

export default async function handler(req, res) {
  if (!allowed(req)) return res.status(401).json({ error: "нужен пароль" });
  try {
    const items = await scan();
    res.setHeader("cache-control", "no-store");
    res.status(200).json({ keywords: KEYWORDS, items, at: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
