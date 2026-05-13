const express = require("express");
const multer = require("multer");
const verify = require("../middlewares/verify.middleware");
const {
  uploadSubmission,
  getStudentSubmissions,
  getSubmissionResults,
  getSubmissionCode,
  deleteSubmissionFile,
} = require("./submissions.controller");
const {
  getAllAssignments,
  getAssignmentById,
} = require("./assignments.controller");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// All student routes are protected and require authentication
router.use(verify);

// ==================== STUDENT DASHBOARD PAGE ====================
// View all assignments
router.get("/dashboard", getAllAssignments);

// Get student submissions
router.get("/dashboard/submissions", getStudentSubmissions);

// ==================== SUBMIT ASSIGNMENT PAGE ====================
// Get assignment details
router.get("/submit-assignment/:assignmentId", getAssignmentById);

// Upload solution files
router.post("/submit-assignment/:assignmentId/upload", upload.any(), uploadSubmission);

// Delete specific file from submission
router.delete("/submit-assignment/:submissionId/file/:fileId/delete", deleteSubmissionFile);

// ==================== VIEW RESULTS PAGE ====================
// Get submission results (test results)
router.get("/view-results/:submissionId", getSubmissionResults);

// Get code file content
router.get("/view-results/:submissionId/code/:fileId", getSubmissionCode);

module.exports = router;
