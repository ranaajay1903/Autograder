const Assignment = require("../models/assignment");
const TestCase = require("../models/testCase");
const CourseUser = require("../models/courseUser");
const sequelize = require("../config/database");
const { Op } = require("sequelize");

const parseCourseId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

exports.getAllAssignments = async (req, res) => {
  try {
    const requestedCourseId = parseCourseId(req.query.courseId);
    const assignmentTable = await sequelize.getQueryInterface().describeTable("assignments");
    const supportsCourseId = Boolean(assignmentTable.courseId);

    let where = {};
    if (supportsCourseId) {
      const userCourses = await CourseUser.findAll({
        where: { userId: req.user.id },
        attributes: ["courseId"],
      });
      const enrolledCourseIds = userCourses.map((c) => c.courseId);

      if (requestedCourseId) {
        if (!enrolledCourseIds.includes(requestedCourseId)) {
          return res.status(403).json({ message: "You are not enrolled in this course" });
        }
        where.courseId = requestedCourseId;
      } else if (enrolledCourseIds.length > 0) {
        where.courseId = { [Op.in]: enrolledCourseIds };
      }
    }

    const assignments = await Assignment.findAll({
      where,
      include: [{ model: TestCase, as: "testCases" }],
      order: [["id", "DESC"]]
    });
    const visibleAssignments = assignments.filter((a) => a.isHidden !== true);
    res.json(visibleAssignments);
  } catch (error) {
    console.error("Error fetching assignments:", error);
    // Backward compatibility: older DBs may not have isHidden yet.
    if (error?.original?.code === "42703" || String(error?.message || "").includes("isHidden")) {
      try {
        const assignments = await Assignment.findAll({
          include: [{ model: TestCase, as: "testCases" }],
          order: [["id", "DESC"]]
        });
        return res.json(assignments);
      } catch (fallbackError) {
        console.error("Fallback assignment fetch failed:", fallbackError);
      }
    }
    res.status(500).json({ message: "Error fetching assignments" });
  }
};

exports.getAssignmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await Assignment.findByPk(id, {
      include: [{ model: TestCase, as: "testCases" }]
    });
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    
    // Check if assignment is hidden
    if (assignment.isHidden) {
      return res.status(403).json({ message: "This assignment is not available to students" });
    }
    
    res.json(assignment);
  } catch (error) {
    console.error("Error fetching assignment:", error);
    res.status(500).json({ message: "Error fetching assignment" });
  }
};
