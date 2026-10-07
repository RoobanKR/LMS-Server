// ─── Staff access check ─────────────────────────────────────────────────────
// Who may act on ANOTHER user's assessment state: unlock a retest
// (POST /retest/unlock) or read a student's exercise status
// (GET /exercise/status?targetUserId=…). Rule: any assigned role that is not a
// student. That is the Manage Users audience — admins and coordinators, and
// the trainers / faculty / POCs who open it from an assessment's menu — and
// the same rule its Live Screens and Message controls already enforce.
//
// Not isProctorUser: it reads only the FIRST role name it finds (renameRole
// first) and needs an exact "student", so a Student role an institution
// relabelled "Learner" or "Students" passes as staff. Every name is checked
// here, as batchResources.isStudentUser does — a relabel keeps originalRole.
//
// Fails CLOSED: no role, an unknown role id or a lookup error is never staff.

const { roleNamesOf } = require("./pocScope");

async function isStaffUser(user) {
  try {
    const names = await roleNamesOf(user);
    if (!names.length) return false;
    return !names.some((name) => String(name).toLowerCase().includes("student"));
  } catch (e) {
    console.error("isStaffUser error:", e.message);
    return false;
  }
}

module.exports = { isStaffUser };
