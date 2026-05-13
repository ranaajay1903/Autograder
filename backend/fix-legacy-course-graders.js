#!/usr/bin/env node

/**
 * Fix script to correct grader roles in Legacy Course
 * Graders were previously added as 'student' instead of 'grader'
 * This script fixes that issue
 */

require('dotenv').config();

const sequelize = require('./src/config/database');
const Course = require('./src/models/course');
const CourseUser = require('./src/models/courseUser');
const User = require('./src/models/user');

const fixLegacyCourseGraders = async () => {
  try {
    console.log('🔄 Fixing grader roles in Legacy Course...\n');

    // Find the Legacy Course
    const legacyCourse = await Course.findOne({
      where: { name: 'Legacy Course' }
    });

    if (!legacyCourse) {
      console.log('❌ Legacy Course not found!');
      process.exit(1);
    }

    console.log(`Found Legacy Course: ID=${legacyCourse.id}, Name="${legacyCourse.name}"\n`);

    // Get all graders in the database
    const graders = await User.findAll({
      where: { role: 'grader' }
    });

    console.log(`Found ${graders.length} graders total\n`);

    let fixedCount = 0;
    let alreadyCorrect = 0;
    let addedCount = 0;

    // For each grader, ensure they have the correct role in legacy course
    for (const grader of graders) {
      const courseUser = await CourseUser.findOne({
        where: {
          courseId: legacyCourse.id,
          userId: grader.id
        }
      });

      if (courseUser) {
        if (courseUser.role !== 'grader') {
          // Fix the role
          await courseUser.update({ role: 'grader' });
          console.log(`✏️  Fixed grader "${grader.email}" - changed role from "${courseUser.role}" to "grader"`);
          fixedCount++;
        } else {
          console.log(`✅ Grader "${grader.email}" already has correct role`);
          alreadyCorrect++;
        }
      } else {
        // Add the grader if not present
        await CourseUser.create({
          courseId: legacyCourse.id,
          userId: grader.id,
          role: 'grader'
        });
        console.log(`✨ Added grader "${grader.email}" to Legacy Course`);
        addedCount++;
      }
    }

    console.log(`\n✨ Fix complete!`);
    console.log(`   Fixed roles: ${fixedCount}`);
    console.log(`   Already correct: ${alreadyCorrect}`);
    console.log(`   Newly added: ${addedCount}`);

    const graderCountInCourse = await CourseUser.count({
      where: { courseId: legacyCourse.id, role: 'grader' }
    });

    console.log(`\n📊 Graders in Legacy Course: ${graderCountInCourse}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

fixLegacyCourseGraders();
