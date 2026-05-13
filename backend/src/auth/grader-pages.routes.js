const express = require("express");
const multer = require("multer");
const verify = require("../middlewares/verify.middleware");
const checkRole = require("../middlewares/role.middleware");
const graderController = require("./grader.controller");
const adminController = require("./admin.controller");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// All grader routes are protected and require grader role
router.use(verify, checkRole("grader"));

// ==================== GRADER DASHBOARD PAGE ====================
// Main assignments list
router.get("/dashboard", graderController.getAssignments);

// ==================== TEST SOLUTIONS PAGE ====================
// Upload solution files for testing
router.post("/test-solutions/:assignmentId/upload", upload.any(), graderController.uploadGraderSolution);

// Get uploaded solutions for assignment
router.get("/test-solutions/:assignmentId/list", graderController.getGraderSolutions);

// Get solution detail
router.get("/test-solutions/:solutionId/detail", graderController.getGraderSolution);

// Get specific file from solution
router.get("/test-solutions/:solutionId/file/:fileId", graderController.getGraderSolutionFile);

// Delete all files from solution
router.delete("/test-solutions/:solutionId/delete-all", graderController.deleteGraderSolution);

// Delete specific file from solution
router.delete("/test-solutions/:solutionId/file/:fileId/delete", graderController.deleteGraderSolutionFile);

// Run tests on uploaded solution
router.post("/test-solutions/:assignmentId/run-tests", graderController.runGraderTests);

// ==================== GRADE SUBMISSIONS PAGE ====================
// Get all submissions (across all assignments)
router.get("/grade-submissions/list", graderController.getAllSubmissions);

// Get submissions for specific assignment
router.get("/grade-submissions/:assignmentId/list", graderController.getSubmissionsByAssignment);

// Get submission details for grading
router.get("/grade-submissions/:submissionId", graderController.getSubmissionForGrading);

// Get submission code files
router.get("/grade-submissions/:submissionId/code", graderController.getSubmissionCode);

// Get specific code file from submission
router.get("/grade-submissions/:submissionId/code/:fileId", graderController.getSubmissionCode);

// Get submission feedback
router.get("/grade-submissions/:submissionId/feedback", graderController.getSubmissionFeedback);

// Run tests on submission
router.post("/grade-submissions/:submissionId/run-tests", graderController.runTestCases);

// Submit feedback and marks for submission
router.post("/grade-submissions/:submissionId/feedback", graderController.provideFeedback);

// Update submission status
router.patch("/grade-submissions/:submissionId/status", graderController.updateSubmissionStatus);

// ==================== TEST CASES MANAGEMENT PAGE ====================
// Get test cases for assignment
router.get("/manage-test-cases/:assignmentId/list", adminController.getTestCases);

// Create test case
router.post("/manage-test-cases/:assignmentId", adminController.createTestCase);

// Update test case
router.patch("/manage-test-cases/:testCaseId", adminController.updateTestCase);

// Delete test case
router.delete("/manage-test-cases/:testCaseId/delete", adminController.deleteTestCase);

module.exports = router;
