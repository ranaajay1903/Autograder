/**
 * User Management Script
 * Add new users to the database with bcrypt hashed passwords
 * 
 * Usage:
 *   node addUser.js                              (interactive mode)
 *   node addUser.js <email> <password> <role>   (command line args)
 * 
 * Roles: student, grader, admin
 * 
 * Examples:
 *   node addUser.js
 *   node addUser.js student@uni.edu mypassword123 student
 *   node addUser.js grader@uni.edu tapass123 grader
 */

const sequelize = require('./src/config/database');
const User = require('./src/models/user');
const bcrypt = require('bcryptjs');
const readline = require('readline');
const session = require('express-session');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const secretKey = process.env.JWT_SECRET;
const tokenExpiration = process.env.JWT_EXPIRATION || '1800s';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

const addUser = async (email, password, role, name) => {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection successful');

    // Validate role
    if (!['student', 'grader', 'admin'].includes(role)) {
      console.error('❌ Invalid role. Must be: student, grader, or admin');
      process.exit(1);
    }

    // Check if email already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      console.error(`❌ Email "${email}" already exists in database`);
      process.exit(1);
    }

    // Hash password with bcrypt (salt rounds: 10)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      email,
      password: hashedPassword,
      name: name || email.split('@')[0], // Use part before @ if no name provided
      role,
    });

    console.log('\n✅ User created successfully!\n');
    console.log('📋 User Details:');
    console.log(`   ID:    ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name:  ${user.name}`);
    console.log(`   Role:  ${user.role}`);
    console.log('\n💡 This user can now login with:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log('\n✨ Password is securely hashed with bcrypt (10 salt rounds)\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    process.exit(1);
  }
};

const interactiveMode = async () => {
  console.log('\n🔐 Add New User to Database\n');

  const email = await question('📧 Email address: ');
  if (!email || !email.includes('@')) {
    console.error('❌ Invalid email format');
    process.exit(1);
  }

  const password = await question('🔑 Password: ');
  if (!password || password.length < 6) {
    console.error('❌ Password must be at least 6 characters');
    process.exit(1);
  }

  console.log('\n👤 Role options: student, grader, admin');
  const role = await question('👤 Role: ');
  if (!['student', 'grader', 'admin'].includes(role)) {
    console.error('❌ Invalid role. Must be: student, grader, or admin');
    process.exit(1);
  }

  const name = await question('📝 Full name (optional, press Enter to skip): ');

  rl.close();

  console.log('\n⏳ Creating user...\n');
  await addUser(email, password, role, name);
};

const main = async () => {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Interactive mode
    await interactiveMode();
  } else if (args.length >= 3) {
    // Command line arguments mode
    const email = args[0];
    const password = args[1];
    const role = args[2];
    const name = args[3] || '';

    // Validate inputs
    if (!email || !email.includes('@')) {
      console.error('❌ Invalid email format');
      process.exit(1);
    }

    if (!password || password.length < 6) {
      console.error('❌ Password must be at least 6 characters');
      process.exit(1);
    }

    if (!['student', 'grader', 'admin'].includes(role)) {
      console.error('❌ Invalid role. Must be: student, grader, or admin');
      process.exit(1);
    }

    await addUser(email, password, role, name);
  } else {
    console.error('❌ Invalid arguments\n');
    console.log('Usage:');
    console.log('  Interactive: node addUser.js');
    console.log('  Direct:      node addUser.js <email> <password> <role> [name]\n');
    console.log('Example:');
    console.log('  node addUser.js student@uni.edu mypassword123 student "John Doe"');
    process.exit(1);
  }
};

main();
