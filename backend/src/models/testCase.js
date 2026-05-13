// Test Case Model - Store test cases for assignments
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TestCase = sequelize.define('TestCase', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  courseId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'The course this test case belongs to',
  },
  assignmentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  testName: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  testCode: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Test code with assertions (e.g., assertEquals, assertTrue)'
  },
  marks: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 1,
  },
}, {
  tableName: 'test_cases',
  timestamps: false,
});

module.exports = TestCase;