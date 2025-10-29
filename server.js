const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const app = express();
const path = require("path");
const cookieParser = require("cookie-parser");
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

// Connect Database
connectDB();
app.use('/Developers Backup/LMS', express.static('\\\\192.168.1.4\\Developers Backup\\LMS'));

// Init Middleware
app.use(express.json({ extended: false }));
app.use(
  cors({
    origin: ["http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    exposedHeaders: ["Content-Length", "Authorization"],
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(fileUpload());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//Home route
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

const PORT = process.env.PORT || 5533;

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
