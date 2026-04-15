const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const app = express();
const path = require("path");
const cookieParser = require("cookie-parser");
const http = require('http');
const socketIO = require('./utils/socket');   // ← shared utility only; NO second socketIo import
const jwt = require('jsonwebtoken');

const fileUpload = require("express-fileupload");
const userAuth = require("./routes/userAuth");
const institutionRoutes = require("./routes/institutionRoutes");
const dynamicContentRoutes = require("./routes/dynamicContent/courseStructureDynamicRoutes");
const pedagogyStructureRoutes = require("./routes/dynamicContent/pedagogyStructureRoutes");
const courseStructureRoutes = require("./routes/courses/courseStructureRoutes");
const moduleStructureRoutes = require("./routes/courses/moduleStructureRoutes");
const moduleRoutes = require("./routes/courses/moduleStructure/moduleRoutes");
const topicRoutes = require("./routes/courses/moduleStructure/topicRoutes");
const subTopicRoutes = require("./routes/courses/moduleStructure/subTopicRoutes");
const subModuleRoutes = require("./routes/courses/moduleStructure/subModuleRoutes");
const pedagogViewyRoutes = require("./routes/courses/moduleStructure/pedagogyViewRoutes");
const CalendarScheduleRoutes = require("./routes/courses/calendarScheduleRoutes");
const levelRoutes = require("./routes/courses/moduleStructure/levelsRoutes");
const printSettingRoutes = require("./routes/dynamicContent/printSettingRoutes");
const compilerRoutes = require("./routes/compilerRoutes");
const documentExtractionRoutes = require("./routes/documentExtractionRoutes");
const videoTranscriptionRoutes = require("./routes/videoTranscriptionRoutes");
const roleRoutes = require("./routes/roleRoutes");
const NoteRoutes = require("./routes/noteRoutes");
const chatHistoryRoutes = require('./routes/chatHistoryRoutes');
const GroupParticipantsRoutes = require("./routes/courses/groupParticipantsRoutes");
const AnswerRoutes = require("./routes/courses/moduleStructure/answerRoutes");
const notificationRoutes = require('./routes/notificationRoutes');
const exceriseandQuestionRoutes = require('./routes/courses/moduleStructure/exerciseAndQuestionRoutes');
const QuestionbankRoutes = require('./routes/courses/questionBankRoutes');
const liveQuestionRoutes = require('./routes/courses/moduleStructure/liveQuestionRoutes');

// Connect Database
connectDB();
app.use('/Developers Backup/LMS', express.static('\\\\192.168.1.4\\Developers Backup\\LMS'));

// Init Middleware
app.use(express.json({ extended: false }));
app.use(cors({
  origin: ["https://lms-client-jade-three.vercel.app"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
  exposedHeaders: ["Content-Length", "Authorization"],
}));
app.use(cookieParser());
app.use(express.json());
app.use(fileUpload({
  limits: { fileSize: 100 * 1024 * 1024 },
  abortOnLimit: true,
  createParentPath: true,
  useTempFiles: false,
  safeFileNames: true,
  preserveExtension: true,
}));
app.use(express.urlencoded({ extended: true }));

// ─── Create HTTP server ───────────────────────────────────────────────────────
const server = http.createServer(app);

// ─── Init socket utility (ONE instance, used everywhere) ─────────────────────
socketIO.init(server);

// ─── Attach auth middleware + room handlers to the SAME io instance ───────────
const io = socketIO.getIO();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    socket.userId = null;
    socket.userName = 'Anonymous';
    return next(); // allow unauthenticated (students via public link)
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    socket.userName = decoded.name || decoded.firstName || 'User';
    socket.userEmail = decoded.email;
    next();
  } catch {
    socket.userId = null;
    socket.userName = 'Anonymous';
    next(); // still allow, just not authenticated
  }
});

io.on('connection', (socket) => {
  if (socket.userId) {
    console.log(`User connected: ${socket.userId}`);
    socket.join(`user-${socket.userId}`);
  }

  // ── Live MCQ room — teacher joins to receive real-time student events ──────
  socket.on('join-liveq', (liveQuestionId) => {
    if (!liveQuestionId) return;
    socket.join(`liveq-${liveQuestionId}`);
    console.log(`Socket ${socket.id} joined liveq-${liveQuestionId}`);
  });

  socket.on('leave-liveq', (liveQuestionId) => {
    if (!liveQuestionId) return;
    socket.leave(`liveq-${liveQuestionId}`);
    console.log(`Socket ${socket.id} left liveq-${liveQuestionId}`);
  });

  // ── Existing events ───────────────────────────────────────────────────────
  socket.on('join-user-room', () => {
    if (socket.userId) {
      socket.join(`user-${socket.userId}`);
      socket.emit('room-joined', { room: `user-${socket.userId}` });
    }
  });

  socket.on('user-added', (data) => {
    io.emit('user-added', {
      newUserId: data.userId,
      addedBy: { id: socket.userId, name: socket.userName, email: socket.userEmail },
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('enrollment-created', (data) => {
    io.to('admin-room').emit('enrollment-created', {
      enrollmentId: data.enrollmentId,
      userId: data.userId,
      courseId: data.courseId,
      enrolledBy: { id: socket.userId, name: socket.userName, email: socket.userEmail },
      enrollmentDate: new Date().toISOString(),
    });
    io.to(`user-${data.userId}`).emit('new-notification', {
      _id: `enrollment-${data.enrollmentId}`,
      title: 'Course Enrollment',
      message: `You have been enrolled in a new course by ${socket.userName}`,
      type: 'success',
      relatedEntity: 'enrollment',
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id} (user: ${socket.userId || 'anonymous'})`);
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("API Running"));

app.use("/", institutionRoutes);
app.use("/", userAuth);
app.use("/", dynamicContentRoutes);
app.use("/", pedagogyStructureRoutes);
app.use("/", courseStructureRoutes);
app.use("/", moduleStructureRoutes);
app.use("/", moduleRoutes);
app.use("/", topicRoutes);
app.use("/", subTopicRoutes);
app.use("/", subModuleRoutes);
app.use("/", pedagogViewyRoutes);
app.use("/", CalendarScheduleRoutes);
app.use("/", levelRoutes);
app.use("/", printSettingRoutes);
app.use("/", compilerRoutes);
app.use("/", roleRoutes);
app.use('/', NoteRoutes);
app.use('/', GroupParticipantsRoutes);
app.use('/', AnswerRoutes);
app.use('/', notificationRoutes);
app.use('/', exceriseandQuestionRoutes);
app.use('/', QuestionbankRoutes);
app.use('/', liveQuestionRoutes);

app.use("/api/chat", chatHistoryRoutes);
app.use("/api/extract-doc", documentExtractionRoutes);
app.use("/api/video", videoTranscriptionRoutes);

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5533;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));