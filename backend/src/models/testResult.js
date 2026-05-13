
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TestResult = sequelize.define('TestResult', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  submissionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  testCaseId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  passed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  actualOutput: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'testresults',
  timestamps: false,
});

module.exports = TestResult;