const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/user");
const Course = require("../models/course");
const CourseUser = require("../models/courseUser");
const Assignment = require("../models/assignment");
const Submission = require("../models/submission");
const CodeFile = require("../models/codeFile");
const TestCase = require("../models/testCase");
const TestResult = require("../models/testResult");
const GraderSolution = require("../models/graderSolution");
const GraderSolutionFile = require("../models/graderSolutionFile");
const StudentInvite = require("../models/studentInvite");
const sequelize = require("../config/database");
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";
const REFRESH_SECRET = process.env.REFRESH_SECRET || "dev_refresh_secret_change_me";

// Sign up a new course admin with course creation
exports.signupCourseAdmin = async (req, res) => {
  try {
    const { email, password, name, courseName, courseCode, courseDescription } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    // Validate inputs
    if (!normalizedEmail || !password || !name || !courseName) {
      return res.status(400).json({
        message: "Email, password, name, and course name are required",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with admin role
    const user = await User.create({
      email: normalizedEmail,
      password: hashedPassword,
      name,
      role: "admin", // Course admins are admins of their course
    });

    // Create course
    const course = await Course.create({
      name: courseName,
      code: courseCode || null,
      description: courseDescription || null,
      adminId: user.id,
    });

    // Add user to course as admin
    await CourseUser.create({
      courseId: course.id,
      userId: user.id,
      role: "admin",
    });

    // Generate tokens
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "Course and admin created successfully",
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      course: {
        id: course.id,
        name: course.name,
        code: course.code,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Signup failed: " + error.message });
  }
};

// Create a new course for an existing admin
exports.createCourse = async (req, res) => {
  try {
    const { name, code, description } = req.body;
    const adminId = req.user.id;

    // Validate inputs
    if (!name) {
      return res.status(400).json({
        message: "Course name is required",
      });
    }

    // Create course
    const course = await Course.create({
      name,
      code: code || null,
      description: description || null,
      adminId,
    });

    // Add admin to course
    await CourseUser.create({
      courseId: course.id,
      userId: adminId,
      role: "admin",
    });

    res.status(201).json({
      message: "Course created successfully",
      course: {
        id: course.id,
        name: course.name,
        code: course.code,
        description: course.description,
      },
    });
  } catch (error) {
    console.error("Create course error:", error);
    res.status(500).json({ message: "Failed to create course: " + error.message });
  }
};

// Get all courses for a user
exports.getUserCourses = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get courses created by this user (admin)
    const createdCourses = await Course.findAll({
      where: { adminId: userId },
      attributes: ["id", "name", "code", "description", "createdAt"],
    });

    // Backfill course_users rows for admin-owned courses if missing.
    for (const course of createdCourses) {
      const existingAdminLink = await CourseUser.findOne({
        where: { courseId: course.id, userId, role: "admin" },
      });
      if (!existingAdminLink) {
        await CourseUser.create({
          courseId: course.id,
          userId,
          role: "admin",
        });
      }
    }

    // Get courses where user is enrolled (admin, grader, or student)
    const enrolledCourses = await CourseUser.findAll({
      where: { userId },
      include: [
        {
          model: Course,
          as: "course",
          attributes: ["id", "name", "code", "description", "createdAt"],
        },
      ],
      attributes: ["role", "joinedAt"],
    });

    const enrolledCoursesFormatted = enrolledCourses
      .filter((cu) => cu.course)
      .map((cu) => ({
        ...cu.course.dataValues,
        userRole: cu.role,
        joinedAt: cu.joinedAt,
      }));

    // Legacy compatibility: if an admin user has no course at all, create one.
    if (
      req.user.role === "admin" &&
      createdCourses.length === 0 &&
      enrolledCoursesFormatted.length === 0
    ) {
      const legacyCourse = await Course.create({
        name: "Legacy Course",
        code: `LEGACY-${userId}`,
        description: "Auto-created course for legacy data compatibility.",
        adminId: userId,
      });

      await CourseUser.create({
        courseId: legacyCourse.id,
        userId,
        role: "admin",
      });

      return res.json({
        createdCourses: [legacyCourse],
        enrolledCourses: [{ ...legacyCourse.dataValues, userRole: "admin" }],
        courses: [{ ...legacyCourse.dataValues, userRole: "admin" }],
      });
    }

    // Merge while removing duplicates (admins are often both creator + enrolled).
    const byCourseId = new Map();
    for (const course of createdCourses) {
      byCourseId.set(course.id, { ...course.dataValues, userRole: "admin" });
    }
    for (const course of enrolledCoursesFormatted) {
      if (!byCourseId.has(course.id)) {
        byCourseId.set(course.id, course);
      }
    }

    res.json({
      createdCourses,
      enrolledCourses: enrolledCoursesFormatted,
      courses: Array.from(byCourseId.values()),
    });
  } catch (error) {
    console.error("Error fetching courses:", error);
    res
      .status(500)
      .json({ message: "Error fetching courses: " + error.message });
  }
};

// Get course details
exports.getCourseDetails = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    const course = await Course.findByPk(courseId, {
      include: [
        {
          model: CourseUser,
          as: "courseUsers",
          include: [
            {
              model: User,
              as: "user",
              attributes: ["id", "name", "email"],
            },
          ],
        },
        {
          model: User,
          as: "admin",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Check if user has access to this course
    const userInCourse = course.courseUsers.some((cu) => cu.userId === userId);
    const isAdmin = course.adminId === userId;

    if (!userInCourse && !isAdmin) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(course);
  } catch (error) {
    console.error("Error fetching course details:", error);
    res
      .status(500)
      .json({ message: "Error fetching course details: " + error.message });
  }
};

// Update course
exports.updateCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { name, code, description } = req.body;
    const userId = req.user.id;

    const course = await Course.findByPk(courseId);

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Check if user is admin of this course
    if (course.adminId !== userId) {
      return res
        .status(403)
        .json({ message: "Only course admin can update course details" });
    }

    if (name) course.name = name;
    if (code) course.code = code;
    if (description !== undefined) course.description = description;

    await course.save();

    res.json({
      message: "Course updated successfully",
      course,
    });
  } catch (error) {
    console.error("Error updating course:", error);
    res
      .status(500)
      .json({ message: "Error updating course: " + error.message });
  }
};

// Delete course (admin only)
exports.deleteCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    const course = await Course.findByPk(courseId);

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Check if user is admin of this course
    if (course.adminId !== userId) {
      return res
        .status(403)
        .json({ message: "Only course admin can delete course" });
    }

    await sequelize.transaction(async (t) => {
      const assignments = await Assignment.findAll({
        where: { courseId },
        attributes: ["id"],
        transaction: t,
      });
      const assignmentIds = assignments.map((a) => a.id);

      if (assignmentIds.length > 0) {
        const submissions = await Submission.findAll({
          where: { assignmentId: assignmentIds },
          attributes: ["id"],
          transaction: t,
        });
        const submissionIds = submissions.map((s) => s.id);

        const testCases = await TestCase.findAll({
          where: { assignmentId: assignmentIds },
          attributes: ["id"],
          transaction: t,
        });
        const testCaseIds = testCases.map((tc) => tc.id);

        if (submissionIds.length > 0) {
          await CodeFile.destroy({ where: { submissionId: submissionIds }, transaction: t });
          await TestResult.destroy({ where: { submissionId: submissionIds }, transaction: t });
        }

        if (testCaseIds.length > 0) {
          await TestResult.destroy({ where: { testCaseId: testCaseIds }, transaction: t });
        }

        const graderSolutions = await GraderSolution.findAll({
          where: { assignmentId: assignmentIds },
          attributes: ["id"],
          transaction: t,
        });
        const graderSolutionIds = graderSolutions.map((gs) => gs.id);

        if (graderSolutionIds.length > 0) {
          await GraderSolutionFile.destroy({ where: { solutionId: graderSolutionIds }, transaction: t });
        }
        await GraderSolution.destroy({ where: { assignmentId: assignmentIds }, transaction: t });
        await Submission.destroy({ where: { assignmentId: assignmentIds }, transaction: t });
        await TestCase.destroy({ where: { assignmentId: assignmentIds }, transaction: t });
        await Assignment.destroy({ where: { id: assignmentIds }, transaction: t });
      }

      await StudentInvite.destroy({ where: { courseId }, transaction: t });
      await CourseUser.destroy({ where: { courseId }, transaction: t });
      await Course.destroy({ where: { id: courseId }, transaction: t });
    });

    res.json({ message: "Course deleted successfully" });
  } catch (error) {
    console.error("Error deleting course:", error);
    res
      .status(500)
      .json({ message: "Error deleting course: " + error.message });
  }
};
