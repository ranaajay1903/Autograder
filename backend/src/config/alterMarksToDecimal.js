// Migration to convert marks columns from INTEGER to DECIMAL
const sequelize = require('./database');
const { DataTypes } = require('sequelize');

const alterMarksColumns = async () => {
  try {
    const queryInterface = sequelize.getQueryInterface();
    
    console.log('Starting migration to convert marks columns to DECIMAL...');

    // Alter submissions table
    console.log('Altering submissions table...');
    await queryInterface.changeColumn('submissions', 'marks', {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false
    });
    
    await queryInterface.changeColumn('submissions', 'totalMarks', {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 100,
      allowNull: false
    });
    console.log('✓ submissions table updated');

    // Alter assignments table
    console.log('Altering assignments table...');
    await queryInterface.changeColumn('assignments', 'totalMarks', {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 100,
      allowNull: false
    });
    console.log('✓ assignments table updated');

    // Alter test_cases table
    console.log('Altering test_cases table...');
    await queryInterface.changeColumn('test_cases', 'marks', {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 1,
      allowNull: false
    });
    console.log('✓ test_cases table updated');

    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Run migration
alterMarksColumns();
