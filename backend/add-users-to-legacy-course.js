#!/usr/bin/env node

// Script to create legacy course and add all users to it
require('dotenv').config();

const sequelize = require('./src/config/database');
const User = require('./src/models/user');
const Course = require('./src/models/course');
const CourseUser = require('./src/models/courseUser');
const bcrypt = require('bcryptjs');

const run = async () => {
  try {
    console.log('🔍 Looking for or creating legacy course...\n');

    // Get or create admin user
    let adminUser = await User.findOne({ where: { role: 'admin' }, order: [['id', 'ASC']] });
    
    if (!adminUser) {
      console.log('👤 Admin user not found, creating one...');
      const tempPasswordHash = await bcrypt.hash('TempPass123!', 10);
      adminUser = await User.create({
        email: 'legacy-admin@autograder.local',
        password: tempPasswordHash,
        name: 'Legacy Admin',
        role: 'admin',
      });
      console.log(`✅ Created admin user: ID=${adminUser.id}, Email=${adminUser.email}\n`);
    } else {
      console.log(`✅ Found existing admin user: ID=${adminUser.id}, Email=${adminUser.email}\n`);
    }

    // Get or create legacy course
    let legacyCourse = await Course.findOne({
      where: { name: 'Legacy Course' }
    });

    if (!legacyCourse) {
      console.log('📚 Legacy course not found, creating one...');
      legacyCourse = await Course.create({
        name: 'Legacy Course',
        code: `LEGACY-${adminUser.id}`,
        description: 'Auto-created course for legacy assignments.',
        adminId: adminUser.id,
      });
      console.log(`✅ Created legacy course: ID=${legacyCourse.id}, Name="${legacyCourse.name}"\n`);
    } else {
      console.log(`✅ Found existing legacy course: ID=${legacyCourse.id}, Name="${legacyCourse.name}"\n`);
    }

    // Ensure admin is in the course with admin role
    let adminCourseUser = await CourseUser.findOne({
      where: { courseId: legacyCourse.id, userId: adminUser.id }
    });

    if (!adminCourseUser) {
      await CourseUser.create({
        courseId: legacyCourse.id,
        userId: adminUser.id,
        role: 'admin'
      });
      console.log(`✅ Added admin to legacy course with admin role\n`);
    } else if (adminCourseUser.role !== 'admin') {
      await adminCourseUser.update({ role: 'admin' });
      console.log(`✅ Updated admin's role in legacy course to admin\n`);
    }

    // Get all users
    const allUsers = await User.findAll();
    console.log(`📊 Total users in database: ${allUsers.length}\n`);
    console.log('Adding users to legacy course...\n');

    let addedCount = 0;
    let skippedCount = 0;

    for (const user of allUsers) {
      // Skip the admin user (already added above)
      if (user.id === adminUser.id) {
        console.log(`⏭️  User ${user.id} (${user.email}) is the admin - already added`);
        skippedCount++;
        continue;
      }

      const existing = await CourseUser.findOne({
        where: { courseId: legacyCourse.id, userId: user.id }
      });

      // Determine the role based on the user's role
      // Preserve their original role from the User table
      const roleMapping = {
        'admin': 'admin',
        'grader': 'grader',
        'student': 'student',
        'ta': 'grader' // Map TA to grader
      };
      const userRole = roleMapping[user.role] || 'student';

      if (existing) {
        // If role doesn't match, update it
        if (existing.role !== userRole) {
          await existing.update({ role: userRole });
          console.log(`✏️  Updated user ${user.id} (${user.email}) role from ${existing.role} to ${userRole}`);
          addedCount++;
        } else {
          console.log(`⏭️  User ${user.id} (${user.email}) already in legacy course as ${existing.role}`);
          skippedCount++;
        }
      } else {
        await CourseUser.create({
          courseId: legacyCourse.id,
          userId: user.id,
          role: userRole
        });
        console.log(`✨ Added user ${user.id} (${user.email}) as ${userRole} to legacy course`);
        addedCount++;
      }
    }

    console.log(`\n📈 Summary:`);
    console.log(`   ✅ Added: ${addedCount}`);
    console.log(`   ⏭️  Already present: ${skippedCount}`);
    console.log(`   📊 Total in course: ${addedCount + skippedCount}`);

    // Verify final state
    const finalCount = await CourseUser.count({
      where: { courseId: legacyCourse.id }
    });
    console.log(`\n✅ Final count in legacy course: ${finalCount}`);

    // Show breakdown
    const studentCount = await CourseUser.count({
      where: { courseId: legacyCourse.id, role: 'student' }
    });
    const graderCount = await CourseUser.count({
      where: { courseId: legacyCourse.id, role: 'grader' }
    });
    const adminCount = await CourseUser.count({
      where: { courseId: legacyCourse.id, role: 'admin' }
    });

    console.log(`   - Admin: ${adminCount}`);
    console.log(`   - Graders: ${graderCount}`);
    console.log(`   - Students: ${studentCount}`);

    console.log('\n✅ All done! Users can now access legacy course.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
    process.exit(1);
  }
};

run();
