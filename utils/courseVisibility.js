// Courses hidden from trainers and students: `hiddenFromLearners: true` on the
// course. Every course list a student or trainer reads skips them — the Courses
// page, the student dashboard, a trainer's enrolled scope — while admins, POC
// and L&D still see them. Enrollments are left exactly as they are, so
// clearing the flag brings the course straight back.
const mongoose = require("mongoose");
const Role = require("../models/RoleModel");

const HIDDEN_FOR = ["student", "trainer"];

// The caller's platform role, whether req.user.role is populated or an id.
const roleNameOf = async (user) => {
  const role = user?.role;
  if (role && typeof role === "object" && (role.originalRole || role.renameRole)) {
    return String(role.originalRole || role.renameRole).toLowerCase();
  }
  if (role && mongoose.Types.ObjectId.isValid(String(role))) {
    const doc = await Role.findById(role).select("originalRole renameRole").lean();
    return String(doc?.originalRole || doc?.renameRole || "").toLowerCase();
  }
  return String(role || "").toLowerCase();
};

// Filter to spread into a course query for this caller: hidden courses drop out
// for students and trainers; anyone else gets {} (no change).
const hiddenCourseFilter = async (user) =>
  HIDDEN_FOR.includes(await roleNameOf(user)) ? { hiddenFromLearners: { $ne: true } } : {};

module.exports = { hiddenCourseFilter };
