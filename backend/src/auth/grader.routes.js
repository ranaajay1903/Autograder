const express = require("express");
const multer = require("multer");
const checkRole = require("../middlewares/role.middleware");
const verify = require("../middlewares/verify.middleware");
const graderController = require("./grader.controller");
const adminController = require("./admin.controller");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// All grader routes are protected and require grader role
router.use(verify, checkRole("grader"));

// Assignments
router.get("/assignments", graderController.getAssignments);

// Submission viewing
router.get("/submissions", graderController.getAllSubmissions);
router.get("/submissions/assignment/:assignmentId", graderController.getSubmissionsByAssignment);
router.get("/submissions/:submissionId", graderController.getSubmissionForGrading);
router.get("/submissions/:submissionId/code", graderController.getSubmissionCode);
router.get("/submissions/:submissionId/code/:fileId", graderController.getSubmissionCode);
router.get("/submissions/:submissionId/feedback", graderController.getSubmissionFeedback);

// Test case running
router.post("/submissions/:submissionId/run-tests", graderController.runTestCases);

// Grader solution upload and testing - now accepts multiple files
router.post("/solutions/:assignmentId", upload.array("files", 10), graderController.uploadGraderSolution);
router.get("/solutions/:assignmentId", graderController.getGraderSolutions);
router.get("/solutions/:solutionId/detail", graderController.getGraderSolution);
router.get("/solutions/:solutionId/file/:fileId", graderController.getGraderSolutionFile);
router.delete("/solutions/:solutionId", graderController.deleteGraderSolution);
router.delete("/solutions/:solutionId/file/:fileId", graderController.deleteGraderSolutionFile);
router.post("/solutions/:assignmentId/run-tests", graderController.runGraderTests);

// Feedback provision
router.post("/submissions/:submissionId/feedback", graderController.provideFeedback);

// Submission status management
router.patch("/submissions/:submissionId/status", graderController.updateSubmissionStatus);

// ==================== TEST CASE MANAGEMENT ====================
// Graders can manage test cases for assignments they grade
router.get("/assignments/:assignmentId/test-cases", adminController.getTestCases);
router.post("/assignments/:assignmentId/test-cases", adminController.createTestCase);
router.patch("/test-cases/:testCaseId", adminController.updateTestCase);
router.delete("/test-cases/:testCaseId", adminController.deleteTestCase);

module.exports = router;
