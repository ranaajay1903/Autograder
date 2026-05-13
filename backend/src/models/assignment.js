// Assignment Model
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Assignment = sequelize.define('Assignment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  courseId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'The course this assignment belongs to',
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  totalMarks: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 10,
  },
  canViewMarks: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  isHidden: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'assignments',
  timestamps: false,
});

module.exports = Assignment;