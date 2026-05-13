#!/usr/bin/env node

/**
 * Safe Database Migration Script
 * Handles test case schema changes safely
 * Changes: input/expectedOutput → testCode (single field for assertions)
 */

require('dotenv').config();
const sequelize = require('./src/config/database');

const safelyMigrateTestCases = async () => {
  try {
    console.log('🔄 Starting safe migration...');
    
    // Check if testCode column exists
    const testCodeResult = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'test_cases' 
        AND column_name = 'testcode'
      );
    `);
    
    const testCodeExists = testCodeResult[0][0].exists;
    
    if (!testCodeExists) {
      console.log('➕ Adding testCode column...');
      await sequelize.query(`
        ALTER TABLE test_cases 
        ADD COLUMN testcode TEXT;
        
        COMMENT ON COLUMN test_cases.testcode IS 'Test code with assertions (e.g., assertEquals, assertTrue)';
      `);
      console.log('✅ testCode column added');
    } else {
      console.log('✓ testCode column already exists');
    }
    
    // Check if input column exists and remove if present
    const inputResult = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'test_cases' 
        AND column_name = 'input'
      );
    `);
    
    const inputExists = inputResult[0][0].exists;
    
    if (inputExists) {
      console.log('➖ Removing input column (no longer needed)...');
      try {
        await sequelize.query(`ALTER TABLE test_cases DROP COLUMN IF EXISTS input;`);
        console.log('✅ input column removed');
      } catch (e) {
        console.log('⚠️  Could not drop input column:', e.message);
      }
    } else {
      console.log('✓ input column does not exist');
    }
    
    // Check if expectedoutput column exists and remove if present
    const expectedOutputResult = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'test_cases' 
        AND column_name = 'expectedoutput'
      );
    `);
    
    const expectedOutputExists = expectedOutputResult[0][0].exists;
    
    if (expectedOutputExists) {
      console.log('➖ Removing expectedOutput column (no longer needed)...');
      try {
        await sequelize.query(`ALTER TABLE test_cases DROP COLUMN IF EXISTS expectedoutput;`);
        console.log('✅ expectedOutput column removed');
      } catch (e) {
        console.log('⚠️  Could not drop expectedOutput column:', e.message);
      }
    } else {
      console.log('✓ expectedOutput column does not exist');
    }
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    throw error;
  }
};

const runMigration = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established\n');
    
    await safelyMigrateTestCases();
    
    console.log('\n🎉 All migrations complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  }
};

runMigration();

