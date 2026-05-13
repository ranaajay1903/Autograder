#!/usr/bin/env node

/**
 * Script to add viewMarks column to submissions table if it doesn't exist
 */

const sequelize = require('./database');
const Submission = require('../models/submission');

const fixViewMarksColumn = async () => {
  try {
    console.log('🔄 Checking submissions table...');
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Sync with alter: true to add missing columns
    console.log('📝 Syncing Submission model with alter: true...');
    await Submission.sync({ alter: true });
    console.log('✅ Submission table updated successfully');

    // Verify column exists
    const tableInfo = await sequelize.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'submissions' AND column_name = 'viewMarks'
    `);

    if (tableInfo[0].length > 0) {
      const col = tableInfo[0][0];
      console.log('✅ viewMarks column exists:');
      console.log(`   Type: ${col.data_type}`);
      console.log(`   Nullable: ${col.is_nullable}`);
      console.log(`   Default: ${col.column_default}`);
    } else {
      console.log('⚠️  viewMarks column not found - attempting to add it manually');
      await sequelize.query(`
        ALTER TABLE submissions 
        ADD COLUMN IF NOT EXISTS "viewMarks" BOOLEAN DEFAULT false
      `);
      console.log('✅ viewMarks column added');
    }

    console.log('');
    console.log('🎉 Database schema fixed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

fixViewMarksColumn();
