#!/usr/bin/env node

/**
 * Migration script to link all existing graders to courses
 * Run this to fix graders who can't see assignments after the course system was added
 */

require('dotenv').config();

const sequelize = require('./src/config/database');
const User = require('./src/models/user');
const Course = require('./src/models/course');
const CourseUser = require('./src/models/courseUser');
const Assignment = require('./src/models/assignment');

const migrate = async () => {
  try {
    console.log('🔄 Migrating graders to courses...\n');

    // Get all graders (role = 'grader')
    const graders = await User.findAll({
      where: { role: 'grader' }
    });

    console.log(`Found ${graders.length} graders\n`);

    // Get all courses
    const courses = await Course.findAll();

    console.log(`Found ${courses.length} courses\n`);

    let addedCount = 0;
    let updatedCount = 0;

    // For each grader, ensure they're linked to all courses
    for (const grader of graders) {
      for (const course of courses) {
        // Check if already linked as grader
        const existing = await CourseUser.findOne({
          where: {
            courseId: course.id,
            userId: grader.id
          }
        });

        if (existing && existing.role !== 'grader') {
          // Update existing link to grader role
          await existing.update({ role: 'grader' });
          console.log(`✏️  Updated grader "${grader.email}" role in course "${course.name}" to 'grader'`);
          updatedCount++;
        } else if (!existing) {
          // Create new link
          await CourseUser.create({
            courseId: course.id,
            userId: grader.id,
            role: 'grader'
          });
          console.log(`✅ Added grader "${grader.email}" to course "${course.name}"`);
          addedCount++;
        }
      }
    }

    console.log(`\n✨ Migration complete!`);
    console.log(`   Added: ${addedCount} new grader-course links`);
    console.log(`   Updated: ${updatedCount} incorrect role assignments`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    process.exit(1);
  }
};

migrate();
