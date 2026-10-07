const mongoose = require("mongoose");
const User = require("../../../models/UserModel");
const Role = require("../../../models/RoleModel");
const RetestRequest = require("../../../models/Courses/RetestRequestModel");
const ExamSession = require("../../../models/Courses/moduleStructure/ExamSessionModel");
const { isStaffUser } = require("../../../utils/staffAccess");

// ── Helper: find all coordinator/admin user ids (to notify on new requests) ──
async function findCoordinatorUserIds() {
  try {
    const roles = await Role.find({
      $or: [
        { originalRole: { $regex: /admin|coordinator/i } },
        { roleValue: { $regex: /admin|coordinator/i } },
        { renameRole: { $regex: /admin|coordinator/i } },
      ],
    })
      .select("_id")
      .lean();

    const roleIds = roles.map((r) => r._id);
    if (!roleIds.length) return [];

    const users = await User.find({ role: { $in: roleIds } })
      .select("_id")
      .lean();
    return users.map((u) => u._id);
  } catch (e) {
    console.error("findCoordinatorUserIds error:", e.message);
    return [];
  }
}

// ── POST /retest/request — student submits a retest request ──────────────────
exports.createRetestRequest = async (req, res) => {
  try {
    const studentId = req.user._id || req.user.id;
    const {
      courseId,
      exerciseId,
      exerciseName,
      subcategory,
      nodeId,
      nodeType,
      message,
    } = req.body;

    if (!courseId || !exerciseId || !message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "courseId, exerciseId and a non-empty message are required",
      });
    }

    // Block duplicate while a request is still pending for this student+exercise
    const existing = await RetestRequest.findOne({
      courseId,
      exerciseId,
      studentId,
      status: "Pending",
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "You already have a pending retest request for this assessment.",
        data: existing,
      });
    }

    const student = await User.findById(studentId)
      .select("firstName lastName email")
      .lean();
    const studentName = student
      ? `${student.firstName || ""} ${student.lastName || ""}`.trim()
      : req.body.studentName || "";
    const studentEmail = student?.email || req.body.studentEmail || "";

    const request = await RetestRequest.create({
      courseId,
      exerciseId,
      exerciseName: exerciseName || "",
      subcategory: subcategory || "",
      nodeId: nodeId || "",
      nodeType: nodeType || "",
      studentId,
      studentName,
      studentEmail,
      message: message.trim(),
      status: "Pending",
    });

    // Notify all coordinator/admin users (best-effort — never fails the request)
    const coordinatorIds = await findCoordinatorUserIds();
    await Promise.all(
      coordinatorIds.map(async (cid) => {
        try {
          const coord = await User.findById(cid);
          if (!coord || typeof coord.addNotification !== "function") return;
          await coord.addNotification({
            title: "New Retest Request",
            message: `${studentName || "A student"} requested a retest for "${
              exerciseName || "an assessment"
            }": ${message.trim()}`,
            type: "info",
            relatedEntity: "assignment",
            relatedEntityId: mongoose.Types.ObjectId.isValid(exerciseId)
              ? new mongoose.Types.ObjectId(exerciseId)
              : undefined,
            metadata: {
              kind: "retest_request",
              studentName,
              studentEmail,
              exerciseName: exerciseName || "",
              courseId: String(courseId),
              exerciseId: String(exerciseId),
              subcategory: subcategory || "",
              nodeId: nodeId || "",
              nodeType: nodeType || "",
              requestId: String(request._id),
            },
          });
        } catch (e) {
          console.error("notify coordinator failed:", e.message);
        }
      })
    );

    return res.status(201).json({
      success: true,
      message: "Retest request submitted successfully",
      data: request,
    });
  } catch (error) {
    console.error("createRetestRequest error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET /retest/requests/:courseId/:exerciseId — coordinator Request List ────
exports.getRetestRequests = async (req, res) => {
  try {
    const { courseId, exerciseId } = req.params;
    const { status } = req.query;

    if (!courseId || !exerciseId) {
      return res.status(400).json({
        success: false,
        message: "courseId and exerciseId are required",
      });
    }

    const query = { courseId, exerciseId };
    if (status) query.status = status;

    const requests = await RetestRequest.find(query).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, data: requests });
  } catch (error) {
    console.error("getRetestRequests error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET /retest/my-requests/:courseId — student's own requests (pending state) ──
exports.getStudentRetestRequests = async (req, res) => {
  try {
    const studentId = req.user._id || req.user.id;
    const { courseId } = req.params;
    const { exerciseId } = req.query;

    const query = { courseId, studentId };
    if (exerciseId) query.exerciseId = exerciseId;

    const requests = await RetestRequest.find(query).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, data: requests });
  } catch (error) {
    console.error("getStudentRetestRequests error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── POST /retest/unlock — coordinator resets a student's submission + grants window ──
exports.unlockAssessment = async (req, res) => {
  try {
    // Staff only: this resets ANY student's attempt and deletes their exam
    // session, and targetUserId comes straight from the body.
    if (!(await isStaffUser(req.user))) {
      return res.status(403).json({
        success: false,
        message: "Only staff can unlock an assessment",
      });
    }

    const coordinatorId = req.user._id || req.user.id;
    const {
      targetUserId,
      courseId,
      exerciseId,
      subcategory,
      category = "You_Do",
      exerciseName,
      retestStart,
      retestEnd,
      requestId,
    } = req.body;

    if (!targetUserId || !courseId || !exerciseId || !subcategory) {
      return res.status(400).json({
        success: false,
        message: "targetUserId, courseId, exerciseId and subcategory are required",
      });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const courseIndex = user.courses.findIndex(
      (c) => c.courseId && c.courseId.toString() === courseId
    );
    if (courseIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Student is not enrolled in this course" });
    }

    const userCourse = user.courses[courseIndex];
    if (!userCourse.answers) {
      userCourse.answers = { I_Do: new Map(), We_Do: new Map(), You_Do: new Map() };
    }
    if (!userCourse.answers[category]) userCourse.answers[category] = new Map();
    const categoryMap = userCourse.answers[category];

    // Unlock the student's REAL attempt. Manage Users sends the subcategory
    // LABEL ("Assesment") while the student's player filed the attempt under
    // the pedagogy map key ("assesment"); a lookup by the label alone missed
    // it and pushed a second, empty record beside it — the real attempt
    // stayed submitted and the student never got Start back. Find the bucket
    // already holding this exercise, preferring the one with answers in it.
    let bucketKey = subcategory;
    if (typeof categoryMap.entries === "function") {
      let best = null;
      for (const [key, arr] of categoryMap.entries()) {
        if (!Array.isArray(arr)) continue;
        const ex = arr.find((e) => e?.exerciseId && e.exerciseId.toString() === exerciseId);
        if (ex && (!best || (ex.questions || []).length > best.count)) {
          best = { key, count: (ex.questions || []).length };
        }
      }
      if (best) bucketKey = best.key;
    }

    let exercisesArray = categoryMap.get(bucketKey) || [];
    if (exercisesArray.toObject) exercisesArray = exercisesArray.toObject();

    const start = retestStart ? new Date(retestStart) : null;
    const end = retestEnd ? new Date(retestEnd) : null;
    // Stamped on EVERY unlock, dates or not: `unlockedAt` is how the student's
    // list tells the kept answers of the previous attempt (pre-filled for the
    // retake) from a fresh submission, so it can show Start again. Without
    // start/end it opens no extra window — the assessment's own schedule
    // still applies.
    const retestWindow = { startDate: start, endDate: end, unlockedAt: new Date(), unlockedBy: coordinatorId };

    const idx = exercisesArray.findIndex(
      (ex) => ex.exerciseId && ex.exerciseId.toString() === exerciseId
    );

    if (idx > -1) {
      // Reset the COUNTERS/state so it's a fresh attempt, but KEEP the previous
      // answers (questions[]) so the retest can pre-fill them — editable, and
      // overwritten on resubmit. (Previously this did `questions = []`, which
      // deleted every stored answer and made the retest start blank.)
      exercisesArray[idx].testSubmissions = 0;
      exercisesArray[idx].userAttempts = 0;
      exercisesArray[idx].status = "in-progress";
      exercisesArray[idx].isLocked = false;
      exercisesArray[idx].lastTestSubmittedAt = null;
      exercisesArray[idx].lateSubmission = false;
      exercisesArray[idx].retestWindow = retestWindow;
    } else {
      // No prior submission (e.g. missed the test entirely) — create a fresh entry
      exercisesArray.push({
        exerciseId: new mongoose.Types.ObjectId(exerciseId),
        exerciseName: exerciseName || "",
        questions: [],
        status: "in-progress",
        isLocked: false,
        testSubmissions: 0,
        userAttempts: 0,
        subcategory: bucketKey,
        retestWindow,
      });
    }

    categoryMap.set(bucketKey, exercisesArray);
    user.markModified(`courses.${courseIndex}.answers.${category}`);
    await user.save();

    // The previous attempt's exam SESSION (timer + submitted/terminated state)
    // outlives the answer reset, and every You_Do write checks it: while it
    // says "terminated", each save is refused with `attempt_terminal`, so the
    // retake can't keep a line of code. One session exists per student per
    // assessment — removing it makes the retake's Start open a fresh attempt
    // with a full timer.
    try {
      await ExamSession.deleteOne({ assessmentId: String(exerciseId), studentId: String(targetUserId) });
    } catch (e) {
      console.error("reset exam session failed:", e.message);
    }

    // Mark the related request Approved (by id if given, else any pending one)
    let updatedRequest = null;
    const requestPatch = {
      status: "Approved",
      retestStart: start,
      retestEnd: end,
      resolvedAt: new Date(),
      resolvedBy: coordinatorId,
    };
    if (requestId) {
      updatedRequest = await RetestRequest.findByIdAndUpdate(requestId, requestPatch, {
        new: true,
      });
    } else {
      updatedRequest = await RetestRequest.findOneAndUpdate(
        { courseId, exerciseId, studentId: targetUserId, status: "Pending" },
        requestPatch,
        { new: true }
      );
    }

    // Notify the student (best-effort)
    try {
      const windowText =
        start && end
          ? ` Available from ${start.toLocaleString()} to ${end.toLocaleString()}.`
          : "";
      await user.addNotification({
        title: "Assessment Unlocked",
        message: `Your retest for "${exerciseName || "an assessment"}" has been unlocked.${windowText}`,
        type: "success",
        relatedEntity: "assignment",
        relatedEntityId: mongoose.Types.ObjectId.isValid(exerciseId)
          ? new mongoose.Types.ObjectId(exerciseId)
          : undefined,
        metadata: {
          exerciseName: exerciseName || "",
          courseId: String(courseId),
          exerciseId: String(exerciseId),
        },
      });
    } catch (e) {
      console.error("notify student failed:", e.message);
    }

    return res.status(200).json({
      success: true,
      message: "Assessment unlocked for the student",
      data: { request: updatedRequest, retestWindow },
    });
  } catch (error) {
    console.error("unlockAssessment error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
