// Grader Solution File Model - Store code files uploaded by graders
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GraderSolutionFile = sequelize.define('GraderSolutionFile', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  solutionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  fileName: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  fileContent: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
}, {
  tableName: 'grader_solution_files',
  timestamps: false,
});

module.exports = GraderSolutionFile;
