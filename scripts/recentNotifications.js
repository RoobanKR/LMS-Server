// Read-only: print the newest in-app notifications (last 24 h) across users —
// title, message, kind — to see what a given action actually sent.
//   node scripts/recentNotifications.js [hours=24]
require("dotenv").config();
const mongoose = require("mongoose");

(async () => {
  const hours = Number(process.argv[2]) || 24;
  await mongoose.connect(process.env.MONGOURI);
  const since = new Date(Date.now() - hours * 3600 * 1000);
  const rows = await mongoose.connection.db.collection("lms-users").aggregate([
    { $match: { "notifications.createdAt": { $gte: since } } },
    { $unwind: "$notifications" },
    { $match: { "notifications.createdAt": { $gte: since } } },
    { $sort: { "notifications.createdAt": -1 } },
    { $limit: 40 },
    { $project: { _id: 0, role: "$role.originalRole", at: "$notifications.createdAt", title: "$notifications.title", message: "$notifications.message", entity: "$notifications.relatedEntity", kind: "$notifications.metadata.kind" } },
  ]).toArray();
  const seen = new Set();
  for (const r of rows) {
    const key = `${r.title}|${r.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`${new Date(r.at).toISOString()} [${r.entity || ""}/${r.kind || ""}] ${r.title}\n    ${String(r.message || "").replace(/\n/g, " | ")}`);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
