const express = require("express");
const checkRole = require("../middlewares/role.middleware");
const verify = require("../middlewares/verify.middleware");
const adminController = require("./admin.controller");

const router = express.Router();

// Verify token for all routes
router.use(verify);

// ==================== USER MANAGEMENT ====================
router.get("/users", checkRole("admin"), adminController.getAllUsers);
router.post("/users", checkRole("admin"), adminController.createUser);
router.get("/users/role/:role", checkRole("admin"), adminController.getUsersByRole);
router.patch("/users/:userId/role", checkRole("admin"), adminController.updateUserRole);
router.delete("/users/:userId", checkRole("admin"), adminController.deleteUser);

// ==================== ASSIGNMENT MANAGEMENT ====================
router.get("/assignments", checkRole("admin"), adminController.getAssignments);
router.post("/assignments", checkRole("admin"), adminController.createAssignment);
router.patch("/assignments/:assignmentId", checkRole("admin"), adminController.updateAssignment);
router.patch("/assignments/:assignmentId/view-marks", checkRole("admin"), adminController.toggleCanViewMarks);
router.patch("/assignments/:assignmentId/visibility", checkRole("admin"), adminController.toggleAssignmentVisibility);
router.delete("/assignments/:assignmentId", checkRole("admin"), adminController.deleteAssignment);

// ==================== TEST CASE MANAGEMENT ====================
// Allow both admin and grader to manage test cases
router.get("/assignments/:assignmentId/test-cases", checkRole("admin", "grader"), adminController.getTestCases);
router.post("/assignments/:assignmentId/test-cases", checkRole("admin", "grader"), adminController.createTestCase);
router.patch("/test-cases/:testCaseId", checkRole("admin", "grader"), adminController.updateTestCase);
router.delete("/test-cases/:testCaseId", checkRole("admin", "grader"), adminController.deleteTestCase);

// ==================== GRADING & SUBMISSIONS ====================
router.get("/submissions", checkRole("admin"), adminController.getAllSubmissions);
router.get("/submissions/assignment/:assignmentId", checkRole("admin"), adminController.getSubmissionsByAssignment);
router.patch("/submissions/:submissionId/view-marks", checkRole("admin"), adminController.toggleViewMarks);
router.get("/submissions/:submissionId/code-files", checkRole("admin", "grader"), adminController.getSubmissionCodeFiles);
router.patch("/submissions/:submissionId/marks", checkRole("admin", "grader"), adminController.updateSubmissionMarks);
router.post("/submissions/:submissionId/run-tests", checkRole("admin", "grader"), adminController.runTestCases);
router.post("/submissions/:submissionId/run-single-test", checkRole("admin", "grader"), adminController.runSingleTest);
router.post("/assignments/:assignmentId/run-all-tests", checkRole("admin"), adminController.runBulkTests);
router.post("/assignments/:assignmentId/run-tests", checkRole("admin"), adminController.runTestCasesForAll);

// ==================== REPORTING & DOWNLOADS ====================
router.get("/assignments/:assignmentId/marks-report", checkRole("admin"), adminController.getMarksReport);
router.get("/assignments/:assignmentId/export-csv", checkRole("admin"), adminController.downloadMarksCSV);

// ==================== DASHBOARD ====================
router.get("/stats", checkRole("admin"), adminController.getDashboardStats);

module.exports = router;
