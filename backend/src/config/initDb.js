#!/usr/bin/env node

/**
 * Database Initialization Script
 * Run this once after setting up PostgreSQL to create tables and seed initial data
 * 
 * Usage: node src/config/initDb.js
 */

const sequelize = require('./database');
const User = require('../models/user');
const Course = require('../models/course');
const CourseUser = require('../models/courseUser');
const Assignment = require('../models/assignment');
const Submission = require('../models/submission');
const CodeFile = require('../models/codeFile');
const TestCase = require('../models/testCase');
const TestResult = require('../models/testResult');
const GraderSolution = require('../models/graderSolution');
const GraderSolutionFile = require('../models/graderSolutionFile');
const StudentInvite = require('../models/studentInvite');
const PasswordResetToken = require('../models/passwordResetToken');
const bcrypt = require('bcryptjs');

const initializeDatabase = async () => {
  try {
    console.log('🔄 Testing database connection...');
    await sequelize.authenticate();
    console.log('✅ Database connection successful');

    // Setup associations

    // Course associations
    Course.hasMany(CourseUser, { foreignKey: 'courseId', as: 'courseUsers' });
    Course.hasMany(Assignment, { foreignKey: 'courseId', as: 'assignments' });
    Course.belongsTo(User, { foreignKey: 'adminId', as: 'admin' });

    CourseUser.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
    CourseUser.belongsTo(User, { foreignKey: 'userId', as: 'user' });

    User.hasMany(Course, { foreignKey: 'adminId', as: 'createdCourses' });
    User.hasMany(CourseUser, { foreignKey: 'userId', as: 'enrolledCourses' });

    // Assignment associations
    Assignment.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
    Assignment.hasMany(TestCase, { foreignKey: 'assignmentId' });
    Assignment.hasMany(Submission, { foreignKey: 'assignmentId', as: 'submissions' });
    Assignment.hasMany(GraderSolution, { foreignKey: 'assignmentId', as: 'graderSolutions' });

    // Submission associations
    Submission.belongsTo(Assignment, { foreignKey: 'assignmentId', as: 'assignment' });
    Submission.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
    Submission.hasMany(CodeFile, { foreignKey: 'submissionId', as: 'codeFiles' });
    Submission.hasMany(TestResult, { foreignKey: 'submissionId', as: 'testResults' });
    
    CodeFile.belongsTo(Submission, { foreignKey: 'submissionId' });
    
    // TestCase associations
    TestCase.belongsTo(Assignment, { foreignKey: 'assignmentId' });
    TestCase.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

    // TestResult associations
    TestResult.belongsTo(Submission, { foreignKey: 'submissionId' });
    TestResult.belongsTo(TestCase, { foreignKey: 'testCaseId', as: 'testCase' });
    
    // Grader Solution associations
    GraderSolution.belongsTo(Assignment, { foreignKey: 'assignmentId', as: 'assignment' });
    GraderSolution.belongsTo(User, { foreignKey: 'graderId', as: 'grader' });
    GraderSolution.hasMany(GraderSolutionFile, { foreignKey: 'solutionId', as: 'files' });
    
    GraderSolutionFile.belongsTo(GraderSolution, { foreignKey: 'solutionId' });
    
    Assignment.hasMany(GraderSolution, { foreignKey: 'assignmentId', as: 'graderSolutions' });
    
    console.log('🔄 Syncing database models...');
    await sequelize.sync();
    console.log('✅ All tables created/updated');

    // Check if data already exists
    const userCount = await User.count();
    
    if (userCount === 0) {
      console.log('📝 Seeding initial data...');

      // Hash admin password
      const adminPassword = await bcrypt.hash('admin123', 10);

      // Create only admin user
      const adminUser = await User.create({
        email: 'admin@uni.edu',
        password: adminPassword,
        name: 'Admin User',
        role: 'admin',
      });

      // Create sample course
      const course = await Course.create({
        name: 'Introduction to Programming',
        code: 'CS101',
        description: 'Learn programming basics with Java and JavaScript',
        adminId: adminUser.id,
      });

      // Add admin to course
      await CourseUser.create({
        courseId: course.id,
        userId: adminUser.id,
        role: 'admin',
      });

      // Create sample assignments for the course
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7); // Due in 7 days

      await Assignment.create({
        courseId: course.id,
        title: 'Assignment 1: Sum Function',
        description: 'Write a JavaScript function that takes two numbers and returns their sum.',
        dueDate: dueDate,
        totalMarks: 100,
      });

      await Assignment.create({
        courseId: course.id,
        title: 'Assignment 2: Array Operations',
        description: 'Implement functions to manipulate arrays.',
        dueDate: dueDate,
        totalMarks: 100,
      });

      console.log('✅ Sample data seeded successfully');
      console.log('');
      console.log('📋 Admin Credentials:');
      console.log('   Email:    admin@uni.edu');
      console.log('   Password: admin123');
      console.log('');
      console.log('💡 Create new courses from the home page');
    } else {
      console.log(`✅ Database already has ${userCount} users`);
    }

    console.log('');
    console.log('🎉 Database initialization complete!');
    console.log('✨ You can now start the server with: npm start');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    console.error('');
    console.error('Troubleshooting tips:');
    console.error('1. Make sure PostgreSQL is running');
    console.error('2. Check your .env file for correct database credentials');
    console.error('3. Verify database exists: psql -U postgres -c "CREATE DATABASE autograder_db;"');
    process.exit(1);
  }
};

// Run initialization
initializeDatabase();
