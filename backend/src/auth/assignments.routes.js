const express = require("express");
const router = express.Router();
const {
  getAllAssignments,
  getAssignmentById,
} = require("./assignments.controller");

router.get("/", getAllAssignments);
router.get("/:id", getAssignmentById);

module.exports = router;
