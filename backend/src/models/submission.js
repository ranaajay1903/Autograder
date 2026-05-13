// Submission Model - Track student submissions
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Submission = sequelize.define('Submission', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  studentEmail: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  assignmentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  marks: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  totalMarks: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 100,
  },
  status: {
    type: DataTypes.ENUM('pending', 'grading', 'evaluated', 'graded', 'no-code', 'no-tests', 'compilation-error', 'error'),
    defaultValue: 'pending',
  },
  viewTestResults: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  viewMarks: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Toggle to show marks to student'
  },
  submittedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'submissions',
  timestamps: false,
});

module.exports = Submission;