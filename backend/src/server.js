require("dotenv").config();
const express = require("express");
const path = require("path");
const { DataTypes } = require("sequelize");
const app = require("./app");
const sequelize = require("./config/database");

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
