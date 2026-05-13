require("dotenv").config();
const express = require("express");
const path = require("path");
const { DataTypes } = require("sequelize");
const bcrypt = require("bcryptjs");
const app = require("./app");
const sequelize = require("./config/database");
const User = require("./models/user");
const Course = require("./models/course");

const frontendPath = path.join(__dirname, "../../frontend/dist");
app.use(express.static(frontendPath));

app.get("/*path", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API route not found" });
  }
  res.sendFile(path.join(frontendPath, "index.html"));
});

const ensureColumn = async (tableName, columnName, definition) => {
  const queryInterface = sequelize.getQueryInterface();
  const table = await queryInterface.describeTable(tableName);
  if (!table[columnName]) {
    await queryInterface.addColumn(tableName, columnName, definition);
    console.log(`Added missing column ${tableName}.${columnName}`);
  }
};

const ensureLegacyCourseMapping = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const table = await queryInterface.describeTable("assignments");
  if (!table.courseId) {
    return;
  }

  // Get legacy admin user
  let adminUser = await User.findOne({ where: { role: "admin" }, order: [["id", "ASC"]] });
  if (!adminUser) {
    const tempPasswordHash = await bcrypt.hash("TempPass123!", 10);
    adminUser = await User.create({
      email: "legacy-admin@autograder.local",
      password: tempPasswordHash,
      name: "Legacy Admin",
      role: "admin",
    });
  }

  // Get or create legacy course
  let legacyCourse = await Course.findOne({
    where: { adminId: adminUser.id },
    order: [["id", "ASC"]],
  });

  if (!legacyCourse) {
    legacyCourse = await Course.create({
      name: "Legacy Course",
      code: `LEGACY-${adminUser.id}`,
      description: "Auto-created course for legacy assignments.",
      adminId: adminUser.id,
    });
  }

  // Check if there are legacy assignments
  const [legacyRows] = await sequelize.query(
    'SELECT id FROM "assignments" WHERE "courseId" IS NULL ORDER BY id ASC'
  );

  // Map legacy assignments to the course
  if (legacyRows.length > 0) {
    await sequelize.query(
      'UPDATE "assignments" SET "courseId" = :courseId WHERE "courseId" IS NULL',
      { replacements: { courseId: legacyCourse.id } }
    );
    console.log(`Mapped ${legacyRows.length} legacy assignments to course ${legacyCourse.id}`);
  }

  // Ensure admin is enrolled in the course
  await sequelize.query(
    `
    INSERT INTO "course_users" ("courseId", "userId", "role", "joinedAt")
    SELECT :courseId, :userId, 'admin', NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM "course_users"
      WHERE "courseId" = :courseId AND "userId" = :userId
    )
    `,
    { replacements: { courseId: legacyCourse.id, userId: adminUser.id } }
  );

  // Add ALL users as students to the legacy course (regardless of their global role)
  await sequelize.query(
    `
    INSERT INTO "course_users" ("courseId", "userId", "role", "joinedAt")
    SELECT :courseId, id, 'student', NOW()
    FROM "users"
    WHERE id != :adminId
    AND NOT EXISTS (
      SELECT 1 FROM "course_users"
      WHERE "courseId" = :courseId AND "userId" = "users".id
    )
    `,
    { replacements: { courseId: legacyCourse.id, adminId: adminUser.id } }
  );

  console.log(`Ensured all users are added to legacy course ${legacyCourse.id}`);
};

const runCompatibilityMigrations = async () => {
  await ensureColumn("assignments", "courseId", { type: DataTypes.INTEGER, allowNull: true });
  await ensureColumn("assignments", "canViewMarks", {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  });
  await ensureColumn("assignments", "isHidden", {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  });
  await ensureColumn("submissions", "viewMarks", {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  });
  await ensureColumn("submissions", "viewTestResults", {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  });
  await ensureColumn("student_invites", "courseId", {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await ensureColumn("test_cases", "courseId", {
    type: DataTypes.INTEGER,
    allowNull: true,
  });

  await ensureLegacyCourseMapping();
};

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log("Database connection established");

    // Create tables that don't exist yet.
    await sequelize.sync();
    console.log("Database tables synchronized (safe mode)");

    // Add required legacy-safe columns and data backfills.
    await runCompatibilityMigrations();

    const shouldAlterSchema = (process.env.DB_SYNC_ALTER || "false").toLowerCase() === "true";
    if (shouldAlterSchema) {
      try {
        await sequelize.sync({ alter: true });
        console.log("Database tables synchronized (alter mode)");
      } catch (alterError) {
        console.warn("Alter mode failed; continuing with compatibility-safe schema.");
        console.warn(alterError.message || alterError);
      }
    }

    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    server.on("error", (err) => {
      console.error("Server error:", err);
      process.exit(1);
    });
  } catch (error) {
    console.error("Server initialization error:", error.message);
    process.exit(1);
  }
};

startServer();
