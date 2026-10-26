// When each user first signed in, kept on the user as `firstLoginAt` so User
// Management can show, filter, sort and export it. Every sign-in also writes a
// `login` ActivityLog record (never pruned), which is where the value comes
// from for accounts that signed in before the field existed.
const ActivityLog = require("../models/ActivityLog");
const User = require("../models/UserModel");

// The value to store for a user signing in now: their earliest recorded
// sign-in, or now when there is none (this is their first).
const firstLoginTimeFor = async (userId) => {
  const first = await ActivityLog.findOne({ userId, action: "login" })
    .sort({ createdAt: 1 })
    .select("createdAt")
    .lean();
  return first?.createdAt || new Date();
};

// Store it for a user who has none yet. `firstLoginAt: null` in the filter
// keeps a concurrent sign-in from overwriting a value already set.
const recordFirstLogin = async (userId) => {
  const at = await firstLoginTimeFor(userId);
  await User.updateOne({ _id: userId, firstLoginAt: null }, { $set: { firstLoginAt: at } });
};

// Fill `firstLoginAt` for every user who has signed in but has no stored value
// — the accounts from before this field. Idempotent; run once at startup.
const backfillFirstLoginAt = async () => {
  const firsts = await ActivityLog.aggregate([
    { $match: { action: "login" } },
    { $group: { _id: "$userId", first: { $min: "$createdAt" } } },
  ]);
  if (!firsts.length) return 0;
  const missing = new Set(
    (await User.find({ _id: { $in: firsts.map((f) => f._id) }, firstLoginAt: null }).select("_id").lean())
      .map((u) => String(u._id))
  );
  const ops = firsts
    .filter((f) => missing.has(String(f._id)))
    .map((f) => ({
      updateOne: { filter: { _id: f._id, firstLoginAt: null }, update: { $set: { firstLoginAt: f.first } } },
    }));
  if (ops.length) await User.bulkWrite(ops, { ordered: false });
  return ops.length;
};

module.exports = { firstLoginTimeFor, recordFirstLogin, backfillFirstLoginAt };
