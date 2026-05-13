// CourseUser Model - Maps users to courses with their role in that course
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CourseUser = sequelize.define('CourseUser', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  courseId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM('student', 'grader', 'admin'),
    defaultValue: 'student',
    comment: 'Role of user in this specific course',
  },
  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'course_users',
  timestamps: false,
});

module.exports = CourseUser;
