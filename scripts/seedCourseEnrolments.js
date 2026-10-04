// Seed one trainer + several students for each L&D course and enrol them
// through the EXISTING REST API — the same calls the admin UI makes, so every
// side effect (userId counter, default permissions, auto-enrolment into
// degree/placement courses, user.courses link, enrolment notifications) runs
// exactly as it would from User Management + Course Enrollment.
//
//   POST /user/login                         → token
//   GET  /roles/getAll                       → Trainer / Student role ids
//   POST /add/users                          → create each user (409 = already there)
//   GET  /courses/:courseId/batches          → materialises the course's batches
//   POST /add-participants/:courseId         → enrol into a batch (trainer: every batch)
//   DELETE /delete/participant/:c/:u?batchId → move: auto-enrol landed them in another batch
//
// Idempotent: re-running skips users / enrolments that already exist.
//
// Run from the Server folder (API must be running):
//   LOGIN_EMAIL=<admin or L&D email> LOGIN_PASSWORD=<pw> node scripts/seedCourseEnrolments.js
// Optional: API_URL (default http://localhost:5533)
//
// New users log in with the same default password the Bulk Add modal uses
// (client/.../usermanagement/components/BulkUserModal.tsx DEFAULT_PASSWORD).

const API = process.env.API_URL || "http://localhost:5533";
const PASSWORD = "Changeme@123";

const CLIENTS = {
  synergech: { id: "6ab3717388d2b80592aad5f9", name: "Synergech" },
  kiot: { id: "6ab666e89c8edd9db4fc1fcf", name: "KIOT College" },
  techvantage: { id: "6abb2cb327a1a9baaa8dc02e", name: "Techvantage Solutions" },
};

// batch: the course batch the student must end up in (matched by name).
// Degree students also carry their degree ▸ department ▸ section ▸ semester so
// auto-enrolment and the participants list see the full hierarchy.
const PLAN = [
  {
    courseId: "6ab3790a9d164343d7d70634", course: ".NET Full Stack",
    client: CLIENTS.synergech, serviceModel: "HTD", mappingId: "6ab373c69d164343d7d6deab",
    studentType: "skilling", domain: "synergech-demo.test",
    trainer: ["Karthik", "Raman"],
    students: [
      ["Aravind", "Selvam", "Default"], ["Bhavya", "Nair", "Default"], ["Charan", "Reddy", "Default"],
      ["Dharani", "Murugan", "Default"], ["Eswar", "Prasad", "Default"],
    ],
  },
  {
    courseId: "6aba41e08a42eb4404de2a3a", course: "Backend Development",
    client: CLIENTS.kiot, serviceModel: "Degree Program", mappingId: "6ab9ed477109bdb83618601f",
    studentType: "degree-program", domain: "kiot-demo.test",
    degree: { degree: "BE", department: "Civil", semester: "1" },
    trainer: ["Senthil", "Kumar"],
    students: [
      ["Gokul", "Raj", "Section A · Batch 1", "A", "Batch 1"], ["Harini", "Devi", "Section A · Batch 1", "A", "Batch 1"],
      ["Ilakkiya", "Sekar", "Section A · Batch 2", "A", "Batch 2"], ["Jagan", "Mohan", "Section A · Batch 2", "A", "Batch 2"],
      ["Kavin", "Arasu", "Section B · Batch 1", "B", "Batch 1"], ["Lavanya", "Shankar", "Section B · Batch 1", "B", "Batch 1"],
      ["Madhan", "Kumar", "Section B · Batch 2", "B", "Batch 2"], ["Nandhini", "Bala", "Section B · Batch 2", "B", "Batch 2"],
    ],
  },
  {
    courseId: "6abb2a4ef3e28c8c78bb26bb", course: "Placement Readiness",
    client: CLIENTS.kiot, serviceModel: "placement training", mappingId: "6abb279af3e28c8c78bb183a",
    studentType: "skilling", domain: "kiot-demo.test",
    trainer: ["Priya", "Venkatesh"],
    students: [
      ["Pradeep", "Anand", "Batch 1"], ["Ramya", "Krishnan", "Batch 1"], ["Sathish", "Kannan", "Batch 1"],
      ["Tharun", "Vel", "Batch 2"], ["Uma", "Maheswari", "Batch 2"], ["Vignesh", "Babu", "Batch 2"],
    ],
  },
  {
    courseId: "6abb59d7b3183861924b9b03", course: "Frontend Devlopment",
    client: CLIENTS.techvantage, serviceModel: "HTD", mappingId: "6abb5758b3183861924b824c",
    studentType: "skilling", domain: "techvantage-demo.test",
    trainer: ["Rahul", "Menon"],
    students: [
      ["Abinaya", "Ravi", "Batch I"], ["Balaji", "Natarajan", "Batch I"], ["Deepika", "Suresh", "Batch I"],
      ["Ganesh", "Pandian", "bATCH 2"], ["Janani", "Raghu", "bATCH 2"], ["Kishore", "Mani", "bATCH 2"],
    ],
  },
  {
    courseId: "6abcf0f3b896f64771673dda", course: "Python full Stack",
    client: CLIENTS.kiot, serviceModel: "skilling", mappingId: "6abcf0a7b896f647716738ee",
    studentType: "skilling", domain: "kiot-demo.test",
    trainer: ["Divakar", "Subramani"],
    students: [
      ["Monika", "Elango", "Default"], ["Naveen", "Chandran", "Default"], ["Oviya", "Thangaraj", "Default"],
      ["Prakash", "Durai", "Default"], ["Revathi", "Ganesan", "Default"],
    ],
  },
];

let token = "";
const call = async (method, path, body) => {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
};
const fail = (what, r) => { throw new Error(`${what} → HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 400)}`); };
const norm = (s) => String(s || "").trim().toLowerCase();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

(async () => {
  const { LOGIN_EMAIL, LOGIN_PASSWORD } = process.env;
  if (!LOGIN_EMAIL || !LOGIN_PASSWORD) throw new Error("Set LOGIN_EMAIL and LOGIN_PASSWORD");

  const login = await call("POST", "/user/login", { email: LOGIN_EMAIL, password: LOGIN_PASSWORD });
  if (!login.data?.token) fail("login", login);
  token = login.data.token;
  const institutionId = String(login.data.user?.institution?._id || login.data.user?.institution || login.data.institution);
  console.log(`Logged in as ${LOGIN_EMAIL} (institution ${institutionId})`);

  const rolesRes = await call("GET", "/roles/getAll");
  if (rolesRes.status !== 200) fail("roles", rolesRes);
  const roles = rolesRes.data.roles || rolesRes.data.getAllRoles || [];
  const roleId = (name) => {
    const r = roles.find((x) => norm(x.originalRole) === name || norm(x.renameRole) === name);
    if (!r) throw new Error(`Role "${name}" not found`);
    return r._id;
  };
  const TRAINER = roleId("trainer");
  const STUDENT = roleId("student");

  // Existing users by email — lets a re-run pick up ids instead of failing on 409.
  const allRes = await call("GET", `/getAll/userAccess/${institutionId}`);
  const allUsers = allRes.data?.Users || allRes.data?.users || allRes.data?.data || (Array.isArray(allRes.data) ? allRes.data : []);
  const byEmail = new Map(allUsers.map((u) => [norm(u.email), u]));

  let phoneSeq = 9700001000;
  const ensureUser = async (payload) => {
    const existing = byEmail.get(norm(payload.email));
    if (existing) return { id: String(existing._id), created: false };
    const r = await call("POST", "/add/users", { ...payload, password: PASSWORD, status: "active", gender: payload.gender || "Male" });
    if (r.status !== 201 && r.status !== 200) fail(`create ${payload.email}`, r);
    const u = r.data.user;
    byEmail.set(norm(payload.email), u);
    return { id: String(u._id), created: true, userId: u.userId };
  };

  const summary = [];
  for (const c of PLAN) {
    console.log(`\n=== ${c.course} (${c.client.name}) ===`);

    // Same call the Enrollment tab makes on open — creates any batch the
    // service mapping declares but the course has not stored yet.
    const bRes = await call("GET", `/courses/${c.courseId}/batches`);
    if (bRes.status !== 200) fail(`batches ${c.course}`, bRes);
    const batches = bRes.data?.data?.batches || bRes.data?.batches || [];
    const batchByName = new Map(batches.map((b) => [norm(b.batchName), b]));
    const targetNames = [...new Set(c.students.map((s) => s[2]))];
    // A course with no stored batch yet gets the one the students name
    // ("Default") — add-participants creates it on first use.
    for (const n of targetNames) if (!batchByName.has(norm(n))) console.log(`  batch "${n}" not stored yet — add-participants will create it`);

    const scope = {
      clientId: c.client.id, clientName: c.client.name,
      serviceModel: c.serviceModel, serviceMappingId: c.mappingId,
    };

    // ── Trainer ──
    const [tf, tl] = c.trainer;
    const trainer = await ensureUser({
      email: `${slug(tf)}.${slug(tl)}.trainer@${c.domain}`, firstName: tf, lastName: tl,
      phone: String(++phoneSeq), role: TRAINER, ...scope,
    });
    console.log(`  trainer ${tf} ${tl} ${trainer.created ? "created " + trainer.userId : "exists"}`);

    // ── Students ──
    const students = [];
    for (const [i, s] of c.students.entries()) {
      const [fn, ln, batchName, section, batchLevel] = s;
      const payload = {
        email: `${slug(fn)}.${slug(ln)}@${c.domain}`, firstName: fn, lastName: ln,
        phone: String(++phoneSeq), role: STUDENT, studentType: c.studentType,
        gender: i % 2 ? "Female" : "Male", ...scope,
      };
      if (c.degree) Object.assign(payload, c.degree, { section, batch: batchLevel, year: "2026" });
      else if (batchByName.has(norm(batchName))) payload.batch = batchName;
      const u = await ensureUser(payload);
      students.push({ ...u, name: `${fn} ${ln}`, batchName, section });
      console.log(`  student ${fn} ${ln} ${u.created ? "created " + u.userId : "exists"}`);
    }

    // Where did auto-enrolment (degree / placement) already put them?
    const cRes = await call("GET", `/courses-structure/getById/${c.courseId}`);
    const course = cRes.data?.data || cRes.data?.course || cRes.data;
    const placed = new Map(); // userId -> batch
    for (const b of course?.batchAndParticipants || []) {
      for (const bu of b.users || []) placed.set(String(bu.user?._id || bu.user), b);
    }

    // Move anyone auto-enrolled into a different batch than planned
    // (auto-enrolment always picks the first batch of the section/course).
    for (const s of students) {
      const cur = placed.get(s.id);
      if (cur && norm(cur.batchName) !== norm(s.batchName)) {
        const r = await call("DELETE", `/delete/participant/${c.courseId}/${s.id}?batchId=${cur._id}`);
        if (r.status !== 200) fail(`move ${s.name} out of ${cur.batchName}`, r);
        console.log(`  moved ${s.name}: ${cur.batchName} → ${s.batchName}`);
      }
    }

    // ── Enrol: per batch, its students + the trainer ──
    const allTargets = [...new Set([...targetNames, ...batches.filter((b) => !b.archivedBySync).map((b) => b.batchName)])];
    for (const bName of allTargets) {
      const b = batchByName.get(norm(bName));
      const ids = students.filter((s) => norm(s.batchName) === norm(bName)).map((s) => s.id);
      ids.push(trainer.id);
      const body = {
        participantIds: ids, batchName: b ? b.batchName : bName, phase: b?.phase || "", status: "active",
        degree: c.degree?.degree || "", department: c.degree?.department || "",
        section: b?.section || "", semester: c.degree?.semester || "",
      };
      const r = await call("POST", `/add-participants/${c.courseId}`, body);
      if (r.status !== 200 && r.status !== 201) fail(`enrol into ${bName}`, r);
      console.log(`  "${body.batchName}": ${r.data?.message}`);
    }

    // ── Verify from the stored course ──
    const vRes = await call("GET", `/courses-structure/getById/${c.courseId}`);
    const v = vRes.data?.data || vRes.data?.course || vRes.data;
    const mine = new Set([trainer.id, ...students.map((s) => s.id)]);
    for (const b of v?.batchAndParticipants || []) {
      const ours = (b.users || []).filter((bu) => mine.has(String(bu.user?._id || bu.user)));
      if (ours.length) console.log(`  ✓ ${b.batchName}: ${ours.length} of our users (${(b.users || []).length} total)`);
    }
    const missing = students.filter((s) => !(v?.batchAndParticipants || []).some(
      (b) => norm(b.batchName) === norm(s.batchName) && (b.users || []).some((bu) => String(bu.user?._id || bu.user) === s.id)));
    if (missing.length) console.log(`  ✗ NOT in planned batch: ${missing.map((m) => m.name).join(", ")}`);
    summary.push({ course: c.course, trainer: `${tf} ${tl}`, students: students.length, missing: missing.length });
  }

  console.log("\nSUMMARY");
  console.table(summary);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
