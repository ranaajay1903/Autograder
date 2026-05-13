const express = require("express");
const cors = require("cors");
const path = require("path");
const authRoutes = require("./auth/auth.routes");
const assignmentRoutes = require("./auth/assignments.routes");
const submissionRoutes = require("./auth/submissions.routes");
const graderRoutes = require("./auth/grader.routes");
const adminRoutes = require("./auth/admin.routes");
const adminPagesRoutes = require("./auth/admin-pages.routes");
const graderPagesRoutes = require("./auth/grader-pages.routes");
const studentPagesRoutes = require("./auth/student-pages.routes");
const inviteRoutes = require("./auth/invite.routes");
const passwordResetRoutes = require("./auth/passwordReset.routes");
const courseRoutes = require("./auth/course.routes");
const verifyToken = require("./middlewares/verify.middleware");

const User = require("./models/user");
const Assignment = require("./models/assignment");
const Submission = require("./models/submission");
const CodeFile = require("./models/codeFile");
const TestCase = require("./models/testCase");
const TestResult = require("./models/testResult");
const GraderSolution = require("./models/graderSolution");
const GraderSolutionFile = require("./models/graderSolutionFile");
const StudentInvite = require("./models/studentInvite");
const PasswordResetToken = require("./models/passwordResetToken");
const Course = require("./models/course");
const CourseUser = require("./models/courseUser");

const app = express();

Submission.belongsTo(Assignment, { foreignKey: 'assignmentId', as: 'assignment' });
Submission.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
Submission.hasMany(CodeFile, { foreignKey: 'submissionId', as: 'codeFiles' });
Submission.hasMany(TestResult, { foreignKey: 'submissionId', as: 'testResults' });

CodeFile.belongsTo(Submission, { foreignKey: 'submissionId' });

TestCase.belongsTo(Assignment, { foreignKey: 'assignmentId' });
TestResult.belongsTo(Submission, { foreignKey: 'submissionId' });
TestResult.belongsTo(TestCase, { foreignKey: 'testCaseId', as: 'testCase' });

Assignment.hasMany(TestCase, { foreignKey: 'assignmentId', as: 'testCases' });
Assignment.hasMany(Submission, { foreignKey: 'assignmentId', as: 'submissions' });

GraderSolution.hasMany(GraderSolutionFile, { foreignKey: 'solutionId', as: 'files' });
GraderSolutionFile.belongsTo(GraderSolution, { foreignKey: 'solutionId' });
GraderSolution.belongsTo(Assignment, { foreignKey: 'assignmentId', as: 'assignment' });
GraderSolution.belongsTo(User, { foreignKey: 'graderId', as: 'grader' });
Assignment.hasMany(GraderSolution, { foreignKey: 'assignmentId', as: 'graderSolutions' });

// Course relationships
Course.hasMany(Assignment, { foreignKey: 'courseId', as: 'assignments' });
Course.hasMany(CourseUser, { foreignKey: 'courseId', as: 'courseUsers' });
Assignment.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
CourseUser.belongsTo(User, { foreignKey: 'userId', as: 'user' });
CourseUser.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
User.hasMany(CourseUser, { foreignKey: 'userId', as: 'courseUsers' });

// Middleware
app.use(cors()); //frontend can call backend APIs
app.use(express.json());

// Lightweight public health endpoint used for keep-alive pings
app.get("/api/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/auth/password-reset", passwordResetRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/invite", inviteRoutes);
app.use("/api/assignments", verifyToken, assignmentRoutes);
app.use("/api/submissions", verifyToken, submissionRoutes);
app.use("/api/grader", graderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/page", verifyToken, adminPagesRoutes);
app.use("/api/grader/page", verifyToken, graderPagesRoutes);
app.use("/api/student/page", verifyToken, studentPagesRoutes);

// --- SERVE REACT FRONTEND ---
// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, "../../frontend/dist")));

// The "catch-all" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../../frontend/dist", "index.html"));
});

module.exports = app;
