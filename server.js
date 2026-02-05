const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const app = express();
const path = require("path");
const cookieParser = require("cookie-parser");
const http = require('http');
const socketIo = require('socket.io');
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

// Connect Database
connectDB();
app.use('/Developers Backup/LMS', express.static('\\\\192.168.1.4\\Developers Backup\\LMS'));

// Init Middleware
app.use(express.json({ extended: false }));
app.use(
  cors({
    origin: ["http://localhost:3000","http://localhost:3001","http://localhost:3002"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    exposedHeaders: ["Content-Length", "Authorization"],
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(fileUpload({
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  abortOnLimit: true,
  createParentPath: true,
  useTempFiles: false, // Store in memory (better for Cloudinary)
  safeFileNames: true,
  preserveExtension: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true
  }
});

// Socket.io middleware for authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication error'));
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    socket.userName = decoded.name;
    socket.userEmail = decoded.email;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.userId}`);
  
  // Join user-specific room
  socket.join(`user-${socket.userId}`);
  
  // Handle user joining their room
  socket.on('join-user-room', () => {
    socket.join(`user-${socket.userId}`);
    socket.emit('room-joined', { room: `user-${socket.userId}` });
  });
  
  // Handle user added event
  socket.on('user-added', (data) => {
    // Broadcast to all relevant users
    io.emit('user-added', {
      newUserId: data.userId,
      addedBy: {
        id: socket.userId,
        name: socket.userName,
        email: socket.userEmail
      },
      timestamp: new Date().toISOString()
    });
    
    // Also create a notification in database
    createNotificationForUserAdded(data, socket);
  });
  
  // Handle enrollment created event
  socket.on('enrollment-created', (data) => {
    // Broadcast to admin users
    io.to('admin-room').emit('enrollment-created', {
      enrollmentId: data.enrollmentId,
      userId: data.userId,
      courseId: data.courseId,
      enrolledBy: {
        id: socket.userId,
        name: socket.userName,
        email: socket.userEmail
      },
      enrollmentDate: new Date().toISOString()
    });
    
    // Also notify the enrolled user
    io.to(`user-${data.userId}`).emit('new-notification', {
      _id: `enrollment-${data.enrollmentId}`,
      title: 'Course Enrollment',
      message: `You have been enrolled in a new course by ${socket.userName}`,
      type: 'success',
      relatedEntity: 'enrollment',
      isRead: false,
      createdAt: new Date().toISOString()
    });
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.userId}`);
  });
});

// Home route
app.get("/", (req, res) => res.send("API Running"));

// Define Routes
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
app.use('/',NoteRoutes)
app.use('/',GroupParticipantsRoutes)
app.use('/',AnswerRoutes)
app.use('/', notificationRoutes);
app.use('/', exceriseandQuestionRoutes);


// Add this to your server.js imports

// Add this to your routes section
app.use("/api/chat", chatHistoryRoutes);
app.use("/api/extract-doc", documentExtractionRoutes);  // Changed from /api/pdf
app.use("/api/video", videoTranscriptionRoutes);


const PORT = process.env.PORT || 5533;

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));