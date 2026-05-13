// Script to delete assignments and their related data
const sequelize = require('./database');
const Assignment = require('../models/assignment');
const TestCase = require('../models/testCase');
const Submission = require('../models/submission');
const CodeFile = require('../models/codeFile');
const TestResult = require('../models/testResult');

// Check if GraderSolution model exists, if not create reference
let GraderSolution;
try {
  GraderSolution = require('../models/graderSolution');
} catch (e) {
  console.warn('GraderSolution model not found, skipping...');
}

const deleteAssignments = async () => {
  try {
    console.log('Starting deletion of assignments...');

    const assignmentNames = ['Baad me', 'Abhi'];

    for (const name of assignmentNames) {
      console.log(`\nSearching for assignment: "${name}"`);
      
      const assignment = await Assignment.findOne({
        where: { title: name }
      });

      if (!assignment) {
        console.log(`  ⚠️  Assignment "${name}" not found`);
        continue;
      }

      console.log(`  Found: ${assignment.title} (ID: ${assignment.id})`);

      // Get all submissions for this assignment
      const submissions = await Submission.findAll({
        where: { assignmentId: assignment.id }
      });
      console.log(`  Found ${submissions.length} submissions`);

      // Delete in correct order (respecting foreign keys)
      let deletedCount = 0;

      // Delete grader solutions if model exists
      if (GraderSolution) {
        const graderSolutionsDeleted = await GraderSolution.destroy({
          where: { assignmentId: assignment.id }
        });
        console.log(`  Deleted ${graderSolutionsDeleted} grader solutions`);
      }

      // Delete test results
      for (const submission of submissions) {
        const testResults = await TestResult.destroy({
          where: { submissionId: submission.id }
        });
        deletedCount += testResults;
      }
      console.log(`  Deleted ${deletedCount} test results`);

      // Delete code files
      let codeFilesDeleted = 0;
      for (const submission of submissions) {
        codeFilesDeleted += await CodeFile.destroy({
          where: { submissionId: submission.id }
        });
      }
      console.log(`  Deleted ${codeFilesDeleted} code files`);

      // Delete submissions
      const submissionsDeleted = await Submission.destroy({
        where: { assignmentId: assignment.id }
      });
      console.log(`  Deleted ${submissionsDeleted} submissions`);

      // Delete test cases
      const testCasesDeleted = await TestCase.destroy({
        where: { assignmentId: assignment.id }
      });
      console.log(`  Deleted ${testCasesDeleted} test cases`);

      // Delete assignment
      await assignment.destroy();
      console.log(`  ✅ Deleted assignment "${name}"`);
    }

    console.log('\n✅ Deletion completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Deletion failed:', error);
    process.exit(1);
  }
};

// Run deletion
deleteAssignments();