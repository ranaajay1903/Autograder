#!/usr/bin/env node

// Script to check all users and add them to legacy course
require('dotenv').config();

const sequelize = require('./src/config/database');

// Import all models and associations from app.js
require('./src/app');

const User = require('./src/models/user');
const Course = require('./src/models/course');
const CourseUser = require('./src/models/courseUser');

const run = async () => {
  try {
    console.log('Checking student users in database...\n');

    // Get all learner users from users table (student + ta)
    const allUsers = await User.findAll({
      where: { role: ['student', 'ta'] },
      order: [['id', 'ASC']]
    });

    console.log(`Total learner users (student/ta): ${allUsers.length}\n`);

    console.log('Sample learner users from users table:');
    allUsers.slice(0, 10).forEach(u => {
      console.log(`  - ID: ${u.id}, Email: ${u.email}, Name: ${u.name}, Created: ${u.createdAt}`);
    });
    if (allUsers.length > 10) {
      console.log(`  ... and ${allUsers.length - 10} more learner users\n`);
    } else {
      console.log();
    }

    // Get legacy course
    console.log('Looking for legacy course...\n');
    const legacyCourse = await Course.findOne({ where: { name: 'Legacy Course' } });

    if (!legacyCourse) {
      console.log('Legacy course not found!');
      process.exit(1);
    }

    console.log(`Found legacy course: ID=${legacyCourse.id}\n`);

    // Add/sync all learner users to legacy course as student role
    console.log('Adding all learner users to legacy course as students...\n');

    let addedOrUpdatedCount = 0;
    let skippedCount = 0;

    for (const user of allUsers) {
      const existing = await CourseUser.findOne({
        where: { courseId: legacyCourse.id, userId: user.id }
      });

      const desiredCourseRole = 'student';

      if (existing) {
        if (existing.role !== desiredCourseRole) {
          const oldRole = existing.role;
          await existing.update({ role: desiredCourseRole });
          console.log(`Updated user ${user.id} (${user.email}) role ${oldRole} -> ${desiredCourseRole}`);
          addedOrUpdatedCount++;
        } else {
          console.log(`User ${user.id} already in course as ${existing.role}`);
          skippedCount++;
        }
      } else {
        await CourseUser.create({
          courseId: legacyCourse.id,
          userId: user.id,
          role: desiredCourseRole
        });
        console.log(`Added user ${user.id} (${user.email}) as ${desiredCourseRole}`);
        addedOrUpdatedCount++;
      }
    }

    console.log(`\nSummary:`);
    console.log(`   Added/Updated: ${addedOrUpdatedCount}`);
    console.log(`   Unchanged: ${skippedCount}`);
    console.log(`   Total learner users processed from users table: ${allUsers.length}`);

    // Verify final state with full user details
    const finalUsers = await CourseUser.findAll({
      where: { courseId: legacyCourse.id },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'name', 'role', 'createdAt']
      }],
      order: [['userId', 'ASC']]
    });

    console.log(`\nFinal count in legacy course: ${finalUsers.length}\n`);
    console.log('Users in legacy course (joined with users table):');
    finalUsers.forEach(cu => {
      const user = cu.user;
      if (user) {
        console.log(`  - ID: ${cu.userId}, Email: ${user.email}, Name: ${user.name}, Global Role: ${user.role}, Course Role: ${cu.role}, Created: ${user.createdAt}`);
      }
    });

    console.log('\nAll done! All learner users from users table are now synced to legacy course students.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err);
    process.exit(1);
  }
};

run();
