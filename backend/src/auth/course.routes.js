const express = require("express");
const checkRole = require("../middlewares/role.middleware");
const courseController = require("./course.controller");
const verifyToken = require("../middlewares/verify.middleware");

const router = express.Router();

// Public routes
router.post("/signup", courseController.signupCourseAdmin);

// Protected routes
router.post("/", verifyToken, courseController.createCourse);
router.get("/my-courses", verifyToken, courseController.getUserCourses);
router.get("/:courseId", verifyToken, courseController.getCourseDetails);
router.patch("/:courseId", verifyToken, courseController.updateCourse);
router.delete("/:courseId", verifyToken, courseController.deleteCourse);

module.exports = router;
