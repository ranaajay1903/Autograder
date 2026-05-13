const express = require("express");
const verify = require("../middlewares/verify.middleware");
const checkRole = require("../middlewares/role.middleware");
const adminController = require("./admin.controller");

const router = express.Router();

// All admin routes are protected and require admin role
router.use(verify, checkRole("admin"));

// ==================== ADMIN DASHBOARD PAGE ====================
// Main dashboard with system statistics
router.get("/dashboard", adminController.getDashboardStats);

// ==================== ASSIGNMENTS MANAGEMENT PAGE ====================
// View all assignments
router.get("/assignments-list", adminController.getAssignments);

// Create new assignment
router.post("/assignments-list", adminController.createAssignment);

// Update assignment
router.patch("/assignments-list/:assignmentId", adminController.updateAssignment);

// Delete assignment
router.delete("/assignments-list/:assignmentId", adminController.deleteAssignment);

// Toggle marks visibility for all students in assignment
router.patch("/assignments-list/:assignmentId/toggle-visibility", adminController.toggleCanViewMarks);

// Toggle assignment hidden status (show/hide to students)
router.patch("/assignments-list/:assignmentId/hide", adminController.toggleAssignmentVisibility);

// Export marks as CSV
router.get("/assignments-list/:assignmentId/export", adminController.downloadMarksCSV);

// ==================== SUBMISSIONS LIST PAGE ====================
// Get all submissions (across all assignments)
router.get("/submissions-list", adminController.getAllSubmissions);

// Get submissions for specific assignment
router.get("/submissions-list/:assignmentId", adminController.getSubmissionsByAssignment);

// Get progress for bulk tests in an assignment
router.get("/submissions-list/:assignmentId/run-all-tests/status", adminController.getBulkTestProgress);

// Run tests for all submissions in an assignment
router.post("/submissions-list/:assignmentId/run-all-tests", adminController.runBulkTestsStandard);

// ==================== GRADE SUBMISSION PAGE ====================
// Get submission details for grading (includes code files)
router.get("/grade-submission/:submissionId", checkRole("admin", "grader"), adminController.getSubmissionCodeFiles);

// Update submission marks
router.patch("/grade-submission/:submissionId/marks", checkRole("admin", "grader"), adminController.updateSubmissionMarks);

// Toggle marks visibility for specific submission
router.patch("/grade-submission/:submissionId/visibility", adminController.toggleViewMarks);

// Run tests on submission
router.post("/grade-submission/:submissionId/run-tests", checkRole("admin", "grader"), adminController.runTestCases);

// Run single test on submission
router.post("/grade-submission/:submissionId/run-single-test", checkRole("admin", "grader"), adminController.runSingleTest);

// ==================== USER MANAGEMENT PAGE ====================
// Get all users
router.get("/users-management", adminController.getAllUsers);

// Get users by role
router.get("/users-management/role/:role", adminController.getUsersByRole);

// Create new user
router.post("/users-management", adminController.createUser);

// Update user role
router.patch("/users-management/:userId/role", adminController.updateUserRole);

// Delete user
router.delete("/users-management/:userId", adminController.deleteUser);

// ==================== TEST CASES MANAGEMENT PAGE ====================
// Get test cases for assignment
router.get("/test-cases-management/:assignmentId", checkRole("admin", "grader"), adminController.getTestCases);

// Create test case
router.post("/test-cases-management/:assignmentId", checkRole("admin", "grader"), adminController.createTestCase);

// Update test case
router.patch("/test-cases-management/:testCaseId", checkRole("admin", "grader"), adminController.updateTestCase);

// Delete test case
router.delete("/test-cases-management/:testCaseId", checkRole("admin", "grader"), adminController.deleteTestCase);

// ==================== REPORTS PAGE ====================
// Get marks report for assignment
router.get("/reports/:assignmentId/marks-report", adminController.getMarksReport);

// Export marks report as CSV
router.get("/reports/:assignmentId/export-csv", adminController.downloadMarksCSV);

module.exports = router;
