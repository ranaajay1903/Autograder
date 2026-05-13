
const Submission = require('../models/submission');
const CodeFile = require('../models/codeFile');
const Assignment = require('../models/assignment');
const CourseUser = require('../models/courseUser');
const FileService = require('../services/fileService');
const sequelize = require('../config/database');

const parseCourseId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeSubmissionPath = (rawPath, fallbackName = 'uploaded-file') => {
  const originalValue = String(rawPath || fallbackName).trim();
  const normalizedParts = originalValue
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);

  if (normalizedParts.length === 0) {
    throw new Error('Uploaded file path is empty');
  }

  if (normalizedParts.some(segment => segment === '.' || segment === '..')) {
    throw new Error(`Invalid uploaded file path: ${originalValue}`);
  }

  return normalizedParts.join('/');
};

const getUploadedFiles = (req) => {
  if (Array.isArray(req.files) && req.files.length > 0) {
    return req.files;
  }

  if (req.file) {
    return [req.file];
  }

  return [];
};

exports.uploadSubmission = async (req, res) => {
  try {
    const assignmentId = req.params.assignmentId;

    const studentId = req.user.id;
    const studentEmail = req.user.email;
    const uploadedFiles = getUploadedFiles(req);

    if (uploadedFiles.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    if (!assignmentId) {
      return res.status(400).json({ message: 'Assignment ID required' });
    }

    // Get assignment to check due date and fetch totalMarks
    const assignment = await Assignment.findByPk(parseInt(assignmentId));
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const enrollment = await CourseUser.findOne({
      where: { courseId: assignment.courseId, userId: studentId },
    });
    if (!enrollment) {
      return res.status(403).json({ message: "You are not enrolled in this course" });
    }

    // Check if submission is past due date
    const now = new Date();
    const dueDate = new Date(assignment.dueDate);
    if (now > dueDate) {
      return res.status(403).json({ 
        message: `Submission closed. Due date was ${dueDate.toLocaleString()}`,
        isLate: true
      });
    }

    // Check if submission exists
    let submission = await Submission.findOne({
      where: {
        studentId,
        assignmentId: parseInt(assignmentId),
      },
    });

    if (!submission) {
      // Create new submission with assignment's totalMarks
      submission = await Submission.create({
        studentId,
        studentEmail,
        assignmentId: parseInt(assignmentId),
        marks: 0,
        totalMarks: assignment.totalMarks,
        status: 'pending',
        viewTestResults: false,
        submittedAt: new Date(),
      });
    } else {
      // Update submission time
      submission.submittedAt = new Date();
      await submission.save();
    }

    const uploadedPaths = Array.isArray(req.body?.paths)
      ? req.body.paths
      : req.body?.paths
        ? [req.body.paths]
        : [];

    for (let index = 0; index < uploadedFiles.length; index++) {
      const file = uploadedFiles[index];
      let fileContent;
      try {
        fileContent = file.buffer.toString('utf-8');
      } catch (err) {
        fileContent = file.buffer.toString('binary');
      }

      const relativePath = normalizeSubmissionPath(uploadedPaths[index] || file.originalname, file.originalname);
      await FileService.saveCodeFile(submission.id, relativePath, fileContent);
    }

    // Fetch all files for this submission
    const files = await CodeFile.findAll({
      where: { submissionId: submission.id },
      attributes: ['id', 'fileName', 'uploadedAt'],
    });

    res.json({
      message: 'Files uploaded successfully',
      submission: {
        id: submission.id,
        assignmentId: submission.assignmentId,
        studentId: submission.studentId,
        studentEmail: submission.studentEmail,
        files: files,
        marks: submission.marks,
        totalMarks: submission.totalMarks,
        status: submission.status,
        viewTestResults: submission.viewTestResults,
        submittedAt: submission.submittedAt,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: error.message || 'Error uploading submission' });
  }
};

exports.getStudentSubmissions = async (req, res) => {
  try {
    const studentId = req.user.id;
    const requestedCourseId = parseCourseId(req.query.courseId);
    const tableDescription = await sequelize.getQueryInterface().describeTable('submissions');
    const baseAttrs = ['id', 'assignmentId', 'studentId', 'marks', 'totalMarks', 'status'];
    const optionalAttrs = ['studentEmail', 'viewMarks', 'viewTestResults', 'submittedAt'];
    const attributes = [...baseAttrs, ...optionalAttrs.filter((attr) => tableDescription[attr])];

    const assignmentTable = await sequelize.getQueryInterface().describeTable("assignments");
    const supportsCourseId = Boolean(assignmentTable.courseId);
    let assignmentFilterIds = null;
    if (supportsCourseId) {
      const enrollments = await CourseUser.findAll({
        where: { userId: studentId },
        attributes: ["courseId"],
      });
      const enrolledCourseIds = enrollments.map((e) => e.courseId);

      if (requestedCourseId) {
        if (!enrolledCourseIds.includes(requestedCourseId)) {
          return res.status(403).json({ message: "You are not enrolled in this course" });
        }
        const assignments = await Assignment.findAll({
          where: { courseId: requestedCourseId },
          attributes: ["id"],
        });
        assignmentFilterIds = assignments.map((a) => a.id);
      } else if (enrolledCourseIds.length > 0) {
        const assignments = await Assignment.findAll({
          where: { courseId: enrolledCourseIds },
          attributes: ["id"],
        });
        assignmentFilterIds = assignments.map((a) => a.id);
      } else {
        assignmentFilterIds = [];
      }
    }

    // Fetch submissions for this student
    const submissions = await Submission.findAll({
      where: assignmentFilterIds
        ? { studentId, assignmentId: assignmentFilterIds }
        : { studentId },
      attributes,
    });

    // For each submission, fetch all files
    const submissionsWithFiles = await Promise.all(
      submissions.map(async (submission) => {
        const files = await CodeFile.findAll({
          where: { submissionId: submission.id },
          attributes: ['id', 'fileName'],
        });

        return {
          id: submission.id,
          assignmentId: submission.assignmentId,
          studentId: submission.studentId,
          studentEmail: submission.studentEmail,
          files: files,
          marks: submission.marks,
          totalMarks: submission.totalMarks,
          status: submission.status,
          viewMarks: Boolean(submission.viewMarks),
        };
      })
    );

    res.json(submissionsWithFiles);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ message: 'Error fetching submissions' });
  }
};

exports.getSubmissionCode = async (req, res) => {
  try {
    const { submissionId, fileId } = req.params;

    // Verify submission exists and belongs to user
    const submission = await Submission.findByPk(submissionId);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Verify ownership
    if (submission.studentId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Fetch file with content from database
    const file = await FileService.getFileWithContent(fileId);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.json({
      fileName: file.fileName,
      fileContent: file.fileContent,
    });
  } catch (error) {
    console.error('Error fetching code:', error);
    res.status(500).json({ message: 'Error fetching code' });
  }
};

exports.getSubmissionResults = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const submission = await Submission.findByPk(submissionId);

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Verify ownership
    if (submission.studentId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Allow viewing if either test results or marks visibility is enabled,
    // or if the assignment-level canViewMarks is enabled
    const assignment = await Assignment.findByPk(submission.assignmentId);
    const allowed = submission.viewTestResults || submission.viewMarks || (assignment && assignment.canViewMarks);
    if (!allowed) {
      return res.status(403).json({ message: 'Test results not available yet' });
    }

    // Fetch test results joined with test case names
    const TestResult = require('../models/testResult');
    const TestCase = require('../models/testCase');

    const results = await TestResult.findAll({
      where: { submissionId },
      include: [{ model: TestCase, as: 'testCase', attributes: ['id', 'testName'] }],
      order: [['id', 'ASC']]
    });

    const files = await CodeFile.findAll({
      where: { submissionId },
      attributes: ['id', 'fileName'],
    });

    // Map to simple structure for frontend
    const mapped = results.map(r => ({
      id: r.id,
      testCaseId: r.testCaseId,
      testName: r.testCase ? r.testCase.testName : `Test ${r.testCaseId}`,
      passed: Boolean(r.passed),
    }));

    res.json({
      submission: {
        id: submission.id,
        assignmentId: submission.assignmentId,
        marks: submission.marks,
        totalMarks: submission.totalMarks,
        status: submission.status,
        files: files,
      },
      testResults: mapped,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching results' });
  }
};

exports.deleteSubmissionFile = async (req, res) => {
  try {
    const { submissionId, fileId } = req.params;
    const submission = await Submission.findByPk(submissionId);

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Verify ownership
    if (submission.studentId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Delete file from database
    const deleted = await FileService.deleteCodeFile(fileId);
    if (!deleted) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Fetch remaining files
    const remainingFiles = await CodeFile.findAll({
      where: { submissionId },
      attributes: ['id', 'fileName'],
    });

    res.json({
      message: 'File deleted successfully',
      submission: {
        id: submission.id,
        assignmentId: submission.assignmentId,
        studentId: submission.studentId,
        studentEmail: submission.studentEmail,
        files: remainingFiles,
        marks: submission.marks,
        totalMarks: submission.totalMarks,
        status: submission.status,
        viewTestResults: submission.viewTestResults,
      },
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Error deleting file' });
  }
};
