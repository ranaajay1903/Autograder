const express = require("express");
const multer = require("multer");
const router = express.Router();
const {
  uploadSubmission,
  getStudentSubmissions,
  getSubmissionResults,
  getSubmissionCode,
  deleteSubmissionFile,
} = require("./submissions.controller");

// Configure multer for file uploads (store in memory for MVP)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

router.post("/", upload.any(), uploadSubmission);
router.get("/", getStudentSubmissions);
router.get("/:submissionId/results", getSubmissionResults);
router.get("/:submissionId/code/:fileId", getSubmissionCode);
router.delete("/:submissionId/file/:fileId", deleteSubmissionFile);

module.exports = router;
