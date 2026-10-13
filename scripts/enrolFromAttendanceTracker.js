// Enrol the students listed in a KIOT-style attendance tracker (.xlsx) into one
// phase of a course by writing to MongoDB DIRECTLY — no API, no welcome emails,
// no notifications (built for loading test cohorts).
//
//   node scripts/enrolFromAttendanceTracker.js "<tracker.xlsx>"            dry run: prints the plan, changes nothing
//   node scripts/enrolFromAttendanceTracker.js "<tracker.xlsx>" --apply    writes it
//
// Connects with MONGOURI from Server/.env. Settings (environment variables;
// the defaults are the KIOT PRT I Phase III load):
//   COURSE_ID     6ac878fa82f86c20f025618d   (must carry COURSE_CODE — checked first)
//   COURSE_CODE   KC-BTI-PT-002
//   PHASE         Phase III                  (matched against the course's stored batch phases)
//   SHEET         Attendance                 (the sheet whose batch split to use)
//   NEW_PASSWORD  Student@123                (NEW accounts only — existing accounts keep theirs)
//
// Tracker layout: a header row with RegisterNo / Name / Dept/Section / Track /
// Emailid / Phone Number; Track says "Batch - I" / "Batch - II" on the first
// row of each batch block and is blank below it (filled down here).
//
// Per student:
//   • an existing account is found by email, else register number, else phone,
//     and used as it is (password untouched) — never a second account;
//   • a missing account is created with the fields the admin "Add user" form
//     saves (institution userId, default student permissions, default avatar,
//     client / service scope copied from a student already in the course) and
//     password NEW_PASSWORD (hashed by the User model);
//   • the student is put into PHASE ▸ their tracker batch with the same batch
//     entry the Enrollment screen writes; someone in another batch of that
//     phase is moved. Batches of OTHER phases are never touched.
// Safe to re-run: done steps are skipped.

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const XLSX = require("xlsx");

const User = require("../models/UserModel");
const Role = require("../models/RoleModel");
const CourseStructure = require("../models/Courses/courseStructureModal");
const InstitutionModal = require("../models/InstitutionModal");

const COURSE_ID = process.env.COURSE_ID || "6ac878fa82f86c20f025618d";
const COURSE_CODE = process.env.COURSE_CODE || "KC-BTI-PT-002";
const PHASE = process.env.PHASE || "Phase III";
const SHEET = process.env.SHEET || "Attendance";
const NEW_PASSWORD = process.env.NEW_PASSWORD || "Student@123";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const file = args.find((a) => !a.startsWith("--"));

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const digits = (s) => String(s ?? "").replace(/\D/g, "");
// "Batch - I", "batch 1", "BATCH II" all compare equal; "Phase III" = "phase 3".
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
const batchKey = (s) => norm(s).replace(/[-_]/g, " ").replace(/\s+/g, " ")
  .replace(/\b(i{1,3}|iv|v|vi)$/, (r) => String(ROMAN[r])).trim();
const phaseKey = (s) => norm(s).replace(/\b(i{1,3}|iv|v|vi)\b/, (r) => String(ROMAN[r]));

// Same as controllers/userAuth.js — what "Add user" gives a student.
const STUDENT_PERMISSIONS = [{
  permissionName: "Student Dashboard",
  permissionKey: "studentdashboard",
  permissionFunctionality: ["view_courses", "view_grades", "submit_assignments"],
  icon: "Home", color: "green", description: "Student Dashboard Access", isActive: true, order: 0,
}];
const buildInstitutionPrefix = (instName) => {
  if (!instName || typeof instName !== "string") return "INS";
  const cleaned = instName.replace(/[^A-Za-z\s]/g, "").trim();
  if (!cleaned) return "INS";
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.map((w) => w[0].toUpperCase()).join("").slice(0, 4);
  return words[0].slice(0, 3).toUpperCase();
};
const nextUserId = async (institutionId) => {
  if (!institutionId) return null;
  const updated = await InstitutionModal.findOneAndUpdate(
    { _id: institutionId }, { $inc: { userIdCounter: 1 } }, { new: true });
  if (!updated) return null;
  return `${buildInstitutionPrefix(updated.inst_name)}${String(updated.userIdCounter).padStart(4, "0")}`;
};

// ── Tracker ──────────────────────────────────────────────────────────────────
function readTracker(p) {
  const wb = XLSX.readFile(p);
  const ws = wb.Sheets[SHEET];
  if (!ws) throw new Error(`Sheet "${SHEET}" not found. Sheets: ${wb.SheetNames.join(", ")}`);
  // raw values: a 12-digit register number's display text can be "6.11224E+11".
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" })
    .map((r) => r.map((v) => (typeof v === "number" ? String(Math.round(v)) : String(v ?? ""))));
  const h = rows.findIndex((r) => r.some((c) => norm(c) === "registerno") && r.some((c) => norm(c) === "name"));
  if (h < 0) throw new Error(`No header row with RegisterNo + Name in sheet "${SHEET}"`);
  const col = (name) => rows[h].findIndex((c) => norm(c) === norm(name));
  const C = { reg: col("RegisterNo"), name: col("Name"), dept: col("Dept/Section"), track: col("Track"), email: col("Emailid"), phone: col("Phone Number") };
  for (const [k, v] of Object.entries(C)) if (v < 0) throw new Error(`Column for "${k}" not found in the header row`);
  const out = [];
  let batch = "";
  for (const r of rows.slice(h + 1)) {
    const reg = digits(r[C.reg]);
    if (reg.length < 6) continue; // blank / total rows
    if (String(r[C.track]).trim()) batch = String(r[C.track]).trim();
    const [department, section = ""] = String(r[C.dept]).split("/").map((x) => x.trim());
    out.push({
      regNo: reg, name: String(r[C.name]).replace(/\s+/g, " ").trim(), department, section, batch,
      email: String(r[C.email]).trim().toLowerCase(), phone: digits(r[C.phone]),
    });
  }
  return out;
}

// "SURUTHI K.S" → SURUTHI / "K S"; "RAJ VENKADAM" → RAJ / VENKADAM.
function splitName(full) {
  const t = full.replace(/\./g, " ").split(/\s+/).filter(Boolean);
  const initials = [];
  while (t.length > 1 && /^[A-Za-z]$/.test(t[t.length - 1])) initials.unshift(t.pop());
  if (initials.length) return { firstName: t.join(" "), lastName: initials.join(" ") };
  if (t.length > 1) return { firstName: t.slice(0, -1).join(" "), lastName: t[t.length - 1] };
  return { firstName: t[0] || full, lastName: "." };
}

(async () => {
  if (!file || !fs.existsSync(file)) {
    console.error('Usage: node scripts/enrolFromAttendanceTracker.js "<tracker.xlsx>" [--apply]');
    process.exit(1);
  }
  const students = readTracker(file);
  const problems = [];
  const seen = new Set();
  for (const s of students) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)) problems.push(`${s.name}: bad email "${s.email}"`);
    if (s.phone.length !== 10) problems.push(`${s.name}: phone "${s.phone}" is not 10 digits`);
    if (!s.batch) problems.push(`${s.name}: no batch`);
    if (seen.has(s.regNo)) problems.push(`${s.name}: duplicate register number ${s.regNo}`);
    seen.add(s.regNo);
  }
  const perBatch = students.reduce((m, s) => ((m[s.batch] = (m[s.batch] || 0) + 1), m), {});
  console.log(`Tracker: ${students.length} students in sheet "${SHEET}" — ${Object.entries(perBatch).map(([b, n]) => `${b}: ${n}`).join(", ")}`);
  if (problems.length) { console.error("Fix the tracker first:\n  " + problems.join("\n  ")); process.exit(1); }

  if (!process.env.MONGOURI) throw new Error("MONGOURI is not set in Server/.env");
  const dbHost = (process.env.MONGOURI.match(/@([^/?]+)/) || [])[1] || "(local)";
  await mongoose.connect(process.env.MONGOURI);
  console.log(`DB: ${dbHost}/${mongoose.connection.name}   (${APPLY ? "APPLY — writing" : "DRY RUN — nothing will be changed"})`);

  // Course + the PHASE batches the tracker's labels map to.
  const course = await CourseStructure.findById(COURSE_ID);
  if (!course) throw new Error(`Course ${COURSE_ID} not found in this database`);
  if (norm(course.courseCode) !== norm(COURSE_CODE)) {
    throw new Error(`Course ${COURSE_ID} is "${course.courseName}" (${course.courseCode}), not ${COURSE_CODE} — stopping.`);
  }
  console.log(`Course: ${course.courseName} (${course.courseCode}) · ${course.clientName || ""}`);
  const batches = (course.batchAndParticipants || []).filter((b) => !b.archivedBySync);
  const phaseBatches = batches.filter((b) => phaseKey(b.phase) === phaseKey(PHASE));
  if (!phaseBatches.length) {
    throw new Error(`No batches stored for "${PHASE}". Phases on this course: ${[...new Set(batches.map((b) => b.phase || "(no phase)"))].join(", ")}`);
  }
  const targetOf = {};
  for (const label of Object.keys(perBatch)) {
    const b = phaseBatches.find((x) => batchKey(x.batchName) === batchKey(label));
    if (!b) throw new Error(`"${PHASE}" has no batch matching "${label}". It has: ${phaseBatches.map((x) => x.batchName).join(", ")}`);
    targetOf[label] = b;
  }
  console.log(`Target: ${Object.entries(targetOf).map(([l, b]) => `${l} → ${b.phase} ▸ ${b.batchName} (${(b.users || []).length} now)`).join(", ")}`);

  // Roles are per institution — take the course institution's Student role.
  const studentRole = await Role.findOne({
    ...(course.institution ? { institution: course.institution } : {}),
    $or: [{ originalRole: /^student$/i }, { renameRole: /^student$/i }],
  }).lean();
  if (!studentRole) throw new Error(`Student role not found for institution ${course.institution}`);

  // Existing accounts (any institution — emails are global).
  const found = await User.find({
    $or: [
      { email: { $in: students.map((s) => s.email) } },
      { rollNumber: { $in: students.map((s) => s.regNo) } },
      { phone: { $in: students.map((s) => s.phone) } },
    ],
  }).select("email rollNumber phone firstName lastName role institution degree department section semester").lean();
  const byEmail = new Map(found.map((u) => [norm(u.email), u]));
  const byRoll = new Map(found.filter((u) => u.rollNumber).map((u) => [digits(u.rollNumber), u]));
  const byPhone = new Map(found.filter((u) => u.phone).map((u) => [digits(u.phone).slice(-10), u]));

  // Scope + avatar for new accounts: copied from a student already in the course.
  const memberIds = [...new Set(batches.flatMap((b) => (b.users || []).map((x) => String(x.user?._id || x.user))))];
  const peer = await User.findOne({ _id: { $in: memberIds }, role: studentRole._id, clientId: { $exists: true, $ne: null } })
    .select("clientId clientName serviceModel serviceMappingId studentType phase profile institution").lean();
  const scope = peer
    ? { clientId: peer.clientId, clientName: peer.clientName, serviceModel: peer.serviceModel, serviceMappingId: peer.serviceMappingId, studentType: peer.studentType, phase: peer.phase }
    : { clientId: course.clientId, clientName: course.clientName, serviceModel: course.serviceModal, serviceMappingId: course.mappingId };
  for (const k of Object.keys(scope)) if (scope[k] === undefined || scope[k] === null || scope[k] === "") delete scope[k];
  const institution = course.institution || peer?.institution;

  // Plan
  const where = (id) => batches.filter((b) => (b.users || []).some((x) => String(x.user?._id || x.user) === id));
  const plan = students.map((s) => {
    const target = targetOf[s.batch];
    const u = byEmail.get(norm(s.email)) || byRoll.get(s.regNo) || byPhone.get(s.phone);
    const matchedBy = !u ? "" : byEmail.get(norm(s.email)) === u ? "email" : byRoll.get(s.regNo) === u ? "register no" : "phone";
    const id = u ? String(u._id) : "";
    const cur = id ? where(id) : [];
    return {
      s, target, u, matchedBy, id,
      inTarget: cur.some((b) => b === target),
      samePhaseOther: cur.filter((b) => b !== target && phaseKey(b.phase) === phaseKey(PHASE)),
    };
  });
  const toCreate = plan.filter((p) => !p.u);
  const toMove = plan.filter((p) => p.u && p.samePhaseOther.length);
  const toEnrol = plan.filter((p) => !p.inTarget);
  const done = plan.filter((p) => p.u && p.inTarget && !p.samePhaseOther.length);
  const notByEmail = plan.filter((p) => p.u && p.matchedBy !== "email");

  console.log(`\nPLAN for ${course.courseName} ▸ ${PHASE}`);
  console.log(`  existing accounts : ${plan.length - toCreate.length}  (keep their current password)`);
  console.log(`  new accounts      : ${toCreate.length}  (password ${NEW_PASSWORD}; no email is sent)`);
  console.log(`  to enrol          : ${toEnrol.length}`);
  console.log(`  to move           : ${toMove.length}  (from another ${PHASE} batch)`);
  console.log(`  already correct   : ${done.length}`);
  if (toCreate.length) console.log(`  new-account scope : ${JSON.stringify(scope)} · institution ${institution}`);
  if (notByEmail.length) {
    console.log("\n  Found by register no / phone, NOT by the tracker email (their account is used as it is):");
    for (const p of notByEmail) console.log(`    ${p.s.name} ${p.s.regNo}: account ${p.u.email} (matched by ${p.matchedBy})`);
  }
  for (const [label, b] of Object.entries(targetOf)) {
    console.log(`\n  ${b.phase} ▸ ${b.batchName}`);
    for (const p of plan.filter((x) => x.s.batch === label)) {
      const what = !p.u ? "create + enrol"
        : p.samePhaseOther.length ? `move from ${p.samePhaseOther.map((x) => x.batchName).join(", ")}`
        : p.inTarget ? "already enrolled" : "enrol";
      console.log(`    ${p.s.regNo}  ${p.s.name.padEnd(26)} ${(p.s.department + (p.s.section ? "/" + p.s.section : "")).padEnd(7)} ${what}`);
    }
  }

  if (!APPLY) {
    console.log("\nDry run only — nothing was changed. Re-run with --apply to write it.");
    await mongoose.disconnect();
    return;
  }

  // Create accounts
  let avatar = peer?.profile && /default_profile_image\.svg$/.test(peer.profile) ? peer.profile : null;
  if (!avatar && toCreate.length) {
    const { getDefaultProfileImageUrl } = require("../utils/profileImageStorage");
    avatar = await getDefaultProfileImageUrl();
  }
  for (const p of toCreate) {
    const { firstName, lastName } = splitName(p.s.name);
    const u = await User.create({
      email: p.s.email, firstName, lastName, phone: p.s.phone, password: NEW_PASSWORD,
      profile: avatar, role: studentRole._id, department: p.s.department, section: p.s.section,
      rollNumber: p.s.regNo, ...scope, status: "active", permissions: STUDENT_PERMISSIONS,
      institution, userId: await nextUserId(institution), createdBy: "script:enrolFromAttendanceTracker",
    });
    p.u = u.toObject(); p.id = String(u._id);
    console.log(`  created ${p.s.name} (${u.userId})`);
  }

  // Enrol / move — one save of the course.
  const now = new Date();
  for (const p of plan) {
    for (const b of p.samePhaseOther) {
      b.users = b.users.filter((x) => String(x.user?._id || x.user) !== p.id);
      console.log(`  ${p.s.name}: out of ${b.phase} ▸ ${b.batchName}`);
    }
    if (!p.target.users.some((x) => String(x.user?._id || x.user) === p.id)) {
      p.target.users.push({
        user: p.u._id, status: "active",
        degree: p.u.degree || "", department: p.u.department || p.s.department || "",
        section: p.u.section || p.s.section || "", semester: p.u.semester || "",
        joinedAt: now, updatedAt: now,
      });
    }
  }
  for (const b of Object.values(targetOf)) b.updatedAt = now;
  course.updatedAt = now;
  course.markModified("batchAndParticipants");
  await course.save();

  // Verify from the stored course
  const v = await CourseStructure.findById(COURSE_ID).lean();
  const inPlace = plan.filter((p) => (v.batchAndParticipants || []).some((b) =>
    String(b._id) === String(p.target._id) && (b.users || []).some((x) => String(x.user) === p.id)));
  console.log(`\nVERIFY: ${inPlace.length} of ${plan.length} students are in their ${PHASE} batch.`);
  for (const b of Object.values(targetOf)) {
    const sb = (v.batchAndParticipants || []).find((x) => String(x._id) === String(b._id));
    console.log(`  ${b.phase} ▸ ${b.batchName}: ${(sb?.users || []).length} participants`);
  }
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error("\nFAILED:", e.message);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
