// One-off: create the given accounts directly in MongoDB (no API, NO emails)
// and enrol them into PRT I (KC-BTI-PT-002) ▸ Phase III ▸ Batch I / Batch II.
//   node scripts/enrolPrtPhase3Staff.js            dry run
//   node scripts/enrolPrtPhase3Staff.js --apply    write; prints email / password table
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const User = require("../models/UserModel");
const Role = require("../models/RoleModel");
const CourseStructure = require("../models/Courses/courseStructureModal");
const InstitutionModal = require("../models/InstitutionModal");

const APPLY = process.argv.includes("--apply");
const COURSE_CODE = "KC-BTI-PT-002";
const PHASE = "Phase III";

const PEOPLE = [
  // email, firstName, lastName, role, batches
  ["chitra.palanimuthu@smartcliff.in", "Chitra", "Palanimuthu", "Trainer", ["Batch I"]],
  ["suryatrainer1@gmail.com", "Surya", "Trainer 1", "Trainer", ["Batch I"]],
  ["roobantrainer1@gmail.com", "Rooban", "Trainer 1", "Trainer", ["Batch I"]],
  ["manikandan.ramasamy@gmail.com", "Manikandan", "Ramasamy", "Trainer", ["Batch I"]],
  ["vlajusha@gmail.com", "Vlajusha", ".", "Trainer", ["Batch II"]],
  ["suryatrainer2@gmail.com", "Surya", "Trainer 2", "Trainer", ["Batch II"]],
  ["roobantrainer2@gmail.com", "Rooban", "Trainer 2", "Trainer", ["Batch II"]],
  ["manikandan@gmail.com", "Manikandan", ".", "Trainer", ["Batch II"]],
  ["suryastudent1@gmail.com", "Surya", "Student 1", "Student", ["Batch I", "Batch II"]],
  ["roobanstudent1@gmail.com", "Rooban", "Student 1", "Student", ["Batch I", "Batch II"]],
];

const PERMS = {
  Student: [{ permissionName: "Student Dashboard", permissionKey: "studentdashboard",
    permissionFunctionality: ["view_courses", "view_grades", "submit_assignments"],
    icon: "Home", color: "green", description: "Student Dashboard Access", isActive: true, order: 0 }],
  Trainer: [{ permissionName: "Staff Dashboard", permissionKey: "dashboard",
    permissionFunctionality: ["view_users", "add_users", "edit_users", "delete_users"],
    icon: "Home", color: "green", description: "Staff Dashboard Management", isActive: true, order: 0 }],
};

const simplePassword = (first) => {
  const name = first.replace(/[^A-Za-z]/g, "") || "User";
  return `${name[0].toUpperCase()}${name.slice(1).toLowerCase()}@${1000 + Math.floor(Math.random() * 9000)}`;
};
const randomPhone = () => "9" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
const prefix = (n) => {
  const w = String(n || "").replace(/[^A-Za-z\s]/g, "").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "INS";
  return w.length >= 2 ? w.map((x) => x[0].toUpperCase()).join("").slice(0, 4) : w[0].slice(0, 3).toUpperCase();
};
const nextUserId = async (inst) => {
  const u = await InstitutionModal.findOneAndUpdate({ _id: inst }, { $inc: { userIdCounter: 1 } }, { new: true });
  return u ? `${prefix(u.inst_name)}${String(u.userIdCounter).padStart(4, "0")}` : null;
};

(async () => {
  await mongoose.connect(process.env.MONGOURI);
  console.log(`DB ${mongoose.connection.name} — ${APPLY ? "APPLY" : "DRY RUN"}`);
  const course = await CourseStructure.findOne({ courseCode: COURSE_CODE });
  const batchOf = (name) => course.batchAndParticipants.find((b) => b.phase === PHASE && b.batchName === name && !b.archivedBySync);
  for (const n of ["Batch I", "Batch II"]) if (!batchOf(n)) throw new Error(`${PHASE} ▸ ${n} missing`);

  const roles = {};
  for (const r of ["Trainer", "Student"]) {
    roles[r] = await Role.findOne({ institution: course.institution, $or: [{ originalRole: new RegExp(`^${r}$`, "i") }, { renameRole: new RegExp(`^${r}$`, "i") }] }).lean();
    if (!roles[r]) throw new Error(`Role ${r} not found`);
  }
  // Client / service scope + avatar copied from someone of the same role already in Phase III.
  const memberIds = course.batchAndParticipants.filter((b) => b.phase === PHASE).flatMap((b) => b.users.map((u) => u.user));
  const scopeOf = {};
  for (const r of ["Trainer", "Student"]) {
    const peer = await User.findOne({ _id: { $in: memberIds }, role: roles[r]._id })
      .select("email clientId clientName serviceModel serviceMappingId studentType phase profile permissions").lean();
    const s = peer ? { clientId: peer.clientId, clientName: peer.clientName, serviceModel: peer.serviceModel,
      serviceMappingId: peer.serviceMappingId, studentType: peer.studentType, phase: peer.phase }
      : { clientId: course.clientId, clientName: course.clientName, serviceModel: course.serviceModal, serviceMappingId: course.mappingId };
    for (const k of Object.keys(s)) if (s[k] == null || s[k] === "") delete s[k];
    scopeOf[r] = { scope: s, profile: peer?.profile };
    console.log(`${r} scope from ${peer?.email || "course"}: ${JSON.stringify(s)}`);
  }

  const existing = await User.find({ email: { $in: PEOPLE.map((p) => p[0]) } }).select("email").lean();
  if (existing.length) console.log("Already exist (will be reused, password untouched):", existing.map((u) => u.email).join(", "));
  const exMap = new Map(existing.map((u) => [u.email.toLowerCase(), u]));

  const out = [];
  const now = new Date();
  for (const [email, firstName, lastName, role, batches] of PEOPLE) {
    let u = exMap.get(email);
    let password = "(existing — unchanged)";
    if (!u) {
      password = simplePassword(firstName);
      if (APPLY) {
        let profile = scopeOf[role].profile;
        if (!profile) profile = await require("../utils/profileImageStorage").getDefaultProfileImageUrl();
        u = (await User.create({
          email, firstName, lastName, phone: randomPhone(), password, profile, role: roles[role]._id,
          ...scopeOf[role].scope, status: "active", permissions: PERMS[role],
          institution: course.institution, userId: await nextUserId(course.institution),
          createdBy: "script:enrolPrtPhase3Staff",
        })).toObject();
      }
    }
    for (const bn of batches) {
      const b = batchOf(bn);
      if (u && !b.users.some((x) => String(x.user) === String(u._id))) {
        b.users.push({ user: u._id, status: "active", degree: "", department: "", section: "", semester: "", joinedAt: now, updatedAt: now });
        b.updatedAt = now;
      }
    }
    out.push({ email, role, batches: batches.join(" + "), password });
  }
  if (APPLY) {
    course.updatedAt = now;
    course.markModified("batchAndParticipants");
    await course.save();
    const v = await CourseStructure.findById(course._id).lean();
    const users = await User.find({ email: { $in: PEOPLE.map((p) => p[0]) } }).select("email").lean();
    const id = new Map(users.map((u) => [u.email, String(u._id)]));
    for (const p of PEOPLE) for (const bn of p[4]) {
      const b = v.batchAndParticipants.find((x) => x.phase === PHASE && x.batchName === bn);
      if (!b.users.some((x) => String(x.user) === id.get(p[0]))) console.log(`VERIFY FAIL ${p[0]} not in ${bn}`);
    }
    for (const bn of ["Batch I", "Batch II"]) console.log(`${PHASE} ▸ ${bn}: ${v.batchAndParticipants.find((x) => x.phase === PHASE && x.batchName === bn).users.length} participants`);
  }
  console.table(out);
  await mongoose.disconnect();
})().catch(async (e) => { console.error("FAILED:", e.message); await mongoose.disconnect(); process.exit(1); });
