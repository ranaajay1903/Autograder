// Grader Solution Model - Store solutions uploaded by graders for testing
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GraderSolution = sequelize.define('GraderSolution', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  assignmentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  graderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  uploadedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'grader_solutions',
  timestamps: false,
});

module.exports = GraderSolution;
