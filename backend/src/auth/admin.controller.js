const User = require("../models/user");
const Assignment = require("../models/assignment");
const Submission = require("../models/submission");
const CodeFile = require("../models/codeFile");
const TestCase = require("../models/testCase");
const TestResult = require("../models/testResult");
const GraderSolution = require("../models/graderSolution");
const GraderSolutionFile = require("../models/graderSolutionFile");
const Course = require("../models/course");
const CourseUser = require("../models/courseUser");
const sequelize = require("../config/database");
const bcrypt = require("bcryptjs");
const os = require("os");
const path = require("path");
const fs = require("fs");
const https = require("https");
const { execSync, spawn } = require("child_process");
const { promisify } = require("util");
const exec = promisify(require("child_process").exec);

// Safe execution with proper timeout handling that actually kills processes
const execWithRealTimeout = (command, timeoutMs = 20000) => {
  return new Promise((resolve, reject) => {
    let isResolved = false;
    const timeout = setTimeout(() => {
      isResolved = true;
      reject(new Error(`Command timeout exceeded (${timeoutMs}ms)`));
    }, timeoutMs);

    try {
      const result = execSync(command, {
        encoding: "utf8",
        timeout: timeoutMs,
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 1 * 1024 * 1024
      });

      if (!isResolved) {
        clearTimeout(timeout);
        isResolved = true;
        resolve(result.trim());
      }
    } catch (error) {
      if (!isResolved) {
        clearTimeout(timeout);
        isResolved = true;
        reject(error);
      }
    }
  });
};

// Detect Java executable path
const getJavaExecutable = () => {
  const isWindows = os.platform() === 'win32';
  const javaCmd = isWindows ? `"C:\\Program Files\\Java\\jdk-21.0.10\\bin\\java.exe"` : 'java';
  return javaCmd;
};

const getJavacExecutable = () => {
  const isWindows = os.platform() === 'win32';
  const javacCmd = isWindows ? `"C:\\Program Files\\Java\\jdk-21.0.10\\bin\\javac.exe"` : 'javac';
  return javacCmd;
};

const JAVA_CMD = getJavaExecutable();
const JAVAC_CMD = getJavacExecutable();

// ==================== HELPER FUNCTIONS FOR COURSE-BASED FILTERING ====================

const parseCourseId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const hasColumn = async (tableName, columnName) => {
  const tableDescription = await sequelize.getQueryInterface().describeTable(tableName);
  return Boolean(tableDescription[columnName]);
};

// Helper: Get courseId from request and verify admin access
const getCourseIdAndVerify = async (req) => {
  const rawCourseId = req.query.courseId || req.body.courseId;
  const courseId = parseCourseId(rawCourseId);
  if (!courseId) {
    throw {
      status: 400,
      message: "courseId parameter is required"
    };
  }

  const userId = req.user.id;

  // Check if user is admin of this course
  const course = await Course.findByPk(courseId);
  if (!course) {
    throw {
      status: 404,
      message: "Course not found"
    };
  }

  // Verify admin access (user must be course admin or global admin)
  if (course.adminId !== userId && req.user.role !== 'admin') {
    // Double check: also verify in CourseUser table
    const courseUser = await CourseUser.findOne({
      where: { courseId, userId, role: 'admin' }
    });
    if (!courseUser) {
      throw {
        status: 403,
        message: "You do not have admin access to this course"
      };
    }
  }

  return courseId;
};

// Transform simple JUnit-style assertions into plain Java checks that throw AssertionError
const transformJUnitStyle = (code) => {
  if (!code || typeof code !== 'string') return code;

  const splitTopLevelArgs = (s) => {
    const parts = [];
    let cur = '';
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === "'" && !inDouble) { inSingle = !inSingle; cur += ch; continue; }
      if (ch === '"' && !inSingle) { inDouble = !inDouble; cur += ch; continue; }
      if (!inSingle && !inDouble) {
        if (ch === '(' || ch === '{' || ch === '[') { depth++; }
        else if (ch === ')' || ch === '}' || ch === ']') { depth--; }
        else if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
      }
      cur += ch;
    }
    if (cur.trim() !== '') parts.push(cur.trim());
    return parts;
  };

  const isMessageArg = (arg) => /^["']/.test(String(arg || '').trim());
  const buildFailureMessage = (customMessage, fallbackMessage) => (
    customMessage ? `String.valueOf(${customMessage})` : fallbackMessage
  );
  const normalizeArgs = (parts, expectedCount) => {
    if (parts.length === expectedCount + 1 && isMessageArg(parts[0])) {
      return { customMessage: parts[0], args: parts.slice(1) };
    }
    if (parts.length === expectedCount + 1 && isMessageArg(parts[parts.length - 1])) {
      return { customMessage: parts[parts.length - 1], args: parts.slice(0, -1) };
    }
    return { customMessage: null, args: parts };
  };
  const wrapDeepValue = (value) => `new Object[]{${value}}`;

  const keywords = [
    'assertThrows',
    'assertDoesNotThrow',
    'assertInstanceOf',
    'assertLinesMatch',
    'assertIterableEquals',
    'assertNotEqualsArray',
    'assertArrayNotEquals',
    'assertArrayEquals',
    'assertEqualsArray',
    'assertEqualArray',
    'assertFalse',
    'assertTrue',
    'assertNotEquals',
    'assertEquals',
    'assertNull',
    'assertNotNull',
    'assertSame',
    'assertNotSame',
    'fail'
  ];
  let i = 0;
  let out = '';
  while (i < code.length) {
    let matched = false;
    for (const kw of keywords) {
      if (code.startsWith(kw, i)) {
        let j = i + kw.length;
        while (code[j] && /\s/.test(code[j])) j++;
        if (code[j] !== '(') continue;

        let depth = 0;
        let k = j;
        for (; k < code.length; k++) {
          if (code[k] === '(') depth++;
          else if (code[k] === ')') { depth--; if (depth === 0) break; }
        }
        if (k >= code.length) continue;

        const argsStr = code.substring(j + 1, k);
        let replacement = '';
        if (kw === 'fail') {
          const parts = splitTopLevelArgs(argsStr);
          const customMessage = parts[0] || `"Test failed"`;
          replacement = `throw new AssertionError(String.valueOf(${customMessage}));`;
        } else if (kw === 'assertTrue') {
          const { customMessage, args } = normalizeArgs(splitTopLevelArgs(argsStr), 1);
          const condition = args[0] || 'false';
          replacement = `if (!(${condition})) throw new AssertionError(${buildFailureMessage(customMessage, `"assertTrue failed"`) });`;
        } else if (kw === 'assertFalse') {
          const { customMessage, args } = normalizeArgs(splitTopLevelArgs(argsStr), 1);
          const condition = args[0] || 'false';
          replacement = `if ((${condition})) throw new AssertionError(${buildFailureMessage(customMessage, `"assertFalse failed"`) });`;
        } else if (kw === 'assertNotNull') {
          const { customMessage, args } = normalizeArgs(splitTopLevelArgs(argsStr), 1);
          const value = args[0] || 'null';
          replacement = `if (${value} == null) throw new AssertionError(${buildFailureMessage(customMessage, `"assertNotNull failed"`) });`;
        } else if (kw === 'assertNull') {
          const { customMessage, args } = normalizeArgs(splitTopLevelArgs(argsStr), 1);
          const value = args[0] || 'null';
          replacement = `if (${value} != null) throw new AssertionError(${buildFailureMessage(customMessage, `"assertNull failed"`) });`;
        } else if (kw === 'assertNotEquals') {
          const { customMessage, args } = normalizeArgs(splitTopLevelArgs(argsStr), 2);
          const expected = args[0] || 'null';
          const actual = args[1] || 'null';
          replacement = `if (java.util.Arrays.deepEquals(new Object[]{${expected}}, new Object[]{${actual}})) throw new AssertionError(${buildFailureMessage(customMessage, `"assertNotEquals failed: both were " + java.util.Arrays.deepToString(new Object[]{${actual}})`) });`;
        } else if (kw === 'assertSame') {
          const { customMessage, args } = normalizeArgs(splitTopLevelArgs(argsStr), 2);
          const expected = args[0] || 'null';
          const actual = args[1] || 'null';
          replacement = `if (${expected} != ${actual}) throw new AssertionError(${buildFailureMessage(customMessage, `"assertSame failed"`) });`;
        } else if (kw === 'assertNotSame') {
          const { customMessage, args } = normalizeArgs(splitTopLevelArgs(argsStr), 2);
          const expected = args[0] || 'null';
          const actual = args[1] || 'null';
          replacement = `if (${expected} == ${actual}) throw new AssertionError(${buildFailureMessage(customMessage, `"assertNotSame failed"`) });`;
        } else if (kw === 'assertInstanceOf') {
          const { customMessage, args } = normalizeArgs(splitTopLevelArgs(argsStr), 2);
          const expectedType = args[0] || 'Object.class';
          const actual = args[1] || 'null';
          replacement = `if (!(${expectedType}.isInstance(${actual}))) throw new AssertionError(${buildFailureMessage(customMessage, `"assertInstanceOf failed"`) });`;
        } else if (kw === 'assertArrayEquals' || kw === 'assertEqualsArray' || kw === 'assertEqualArray') {
          const { customMessage, args } = normalizeArgs(splitTopLevelArgs(argsStr), 2);
          const expected = args[0] || 'null';
          const actual = args[1] || 'null';
          replacement = `if (!java.util.Arrays.deepEquals(${wrapDeepValue(expected)}, ${wrapDeepValue(actual)})) throw new AssertionError(${buildFailureMessage(customMessage, `"${kw} failed: expected " + java.util.Arrays.deepToString(${wrapDeepValue(expected)}) + " got " + java.util.Arrays.deepToString(${wrapDeepValue(actual)})`) });`;
        } else if (kw === 'assertNotEqualsArray' || kw === 'assertArrayNotEquals') {
          const { customMessage, args } = normalizeArgs(splitTopLevelArgs(argsStr), 2);
          const expected = args[0] || 'null';
          const actual = args[1] || 'null';
          replacement = `if (java.util.Arrays.deepEquals(${wrapDeepValue(expected)}, ${wrapDeepValue(actual)})) throw new AssertionError(${buildFailureMessage(customMessage, `"${kw} failed: arrays matched"`) });`;
        } else if (kw === 'assertIterableEquals') {
          const { customMessage, args } = normalizeArgs(splitTopLevelArgs(argsStr), 2);
          const expected = args[0] || 'null';
          const actual = args[1] || 'null';
          replacement = `if (!java.util.Objects.equals(new java.util.ArrayList<>(${expected}), new java.util.ArrayList<>(${actual}))) throw new AssertionError(${buildFailureMessage(customMessage, `"assertIterableEquals failed"`) });`;
        } else if (kw === 'assertLinesMatch') {
          const { customMessage, args } = normalizeArgs(splitTopLevelArgs(argsStr), 2);
          const expected = args[0] || 'null';
          const actual = args[1] || 'null';
          replacement = `if (!java.util.Objects.equals(String.join("\\n", ${expected}), String.join("\\n", ${actual}))) throw new AssertionError(${buildFailureMessage(customMessage, `"assertLinesMatch failed"`) });`;
        } else if (kw === 'assertEquals') {
          const parts = splitTopLevelArgs(argsStr);
          if (parts.length >= 3 && !isMessageArg(parts[0]) && !isMessageArg(parts[parts.length - 1])) {
            const expected = parts[0] || '0';
            const actual = parts[1] || '0';
            const delta = parts[2] || '0';
            replacement = `if (Math.abs(((Number)(${expected})).doubleValue() - ((Number)(${actual})).doubleValue()) > ((Number)(${delta})).doubleValue()) throw new AssertionError("assertEquals failed with delta");`;
          } else {
            const { customMessage, args } = normalizeArgs(parts, 2);
            const expected = args[0] || 'null';
            const actual = args[1] || 'null';
            replacement = `if (!java.util.Arrays.deepEquals(${wrapDeepValue(expected)}, ${wrapDeepValue(actual)})) throw new AssertionError(${buildFailureMessage(customMessage, `"assertEquals failed: expected " + java.util.Arrays.deepToString(${wrapDeepValue(expected)}) + " got " + java.util.Arrays.deepToString(${wrapDeepValue(actual)})`) });`;
          }
        }
        else if (kw === 'assertThrows') {
          const { customMessage, args } = normalizeArgs(splitTopLevelArgs(argsStr), 2);
          const expectedType = args[0] || 'Throwable.class';
          const executable = args[1] || '() -> {}';
          replacement = `try { ${executable}.run(); throw new AssertionError(${buildFailureMessage(customMessage, `"assertThrows failed: exception was not thrown"`) }); } catch (Throwable e) { if (!${expectedType}.isInstance(e)) throw new AssertionError(${buildFailureMessage(customMessage, `"assertThrows failed: wrong exception type " + e.getClass().getName()`) }); }`;
        } else if (kw === 'assertDoesNotThrow') {
          const { customMessage, args } = normalizeArgs(splitTopLevelArgs(argsStr), 1);
          const executable = args[0] || '() -> {}';
          replacement = `try { ${executable}.run(); } catch (Throwable e) { throw new AssertionError(${buildFailureMessage(customMessage, `"assertDoesNotThrow failed: " + e.getMessage()`) }); }`;
        }

        out += replacement;

        i = k + 1;
        while (code[i] && /\s/.test(code[i])) i++;
        if (code[i] === ';') i++;

        matched = true;
        break;
      }
    }
    if (!matched) {
      out += code[i];
      i++;
    }
  }

  return out;
};

const generateFieldDeclarations = (testCode = '', classMembers = '') => {
  if (typeof testCode !== 'string' || testCode.trim() === '') return '';

  const declaredNames = new Set();
  const combinedDeclarations = `${classMembers || ''}\n`;
  const declarationRegex = /\b(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?[A-Z][a-zA-Z0-9_<>\[\]]*\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:=|;)/g;
  let declaredMatch;
  while ((declaredMatch = declarationRegex.exec(combinedDeclarations)) !== null) {
    declaredNames.add(declaredMatch[1]);
  }

  const fieldMap = new Map();
  const assignmentRegex = /(?:^|[;\n\r\t ])([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*new\s+([A-Z][a-zA-Z0-9_]*)(?:\s*<[^>]*>)?\s*\(/g;
  let assignmentMatch;
  while ((assignmentMatch = assignmentRegex.exec(testCode)) !== null) {
    const varName = assignmentMatch[1];
    const className = assignmentMatch[2];
    if (!declaredNames.has(varName) && !fieldMap.has(varName)) {
      fieldMap.set(varName, className);
    }
  }

  return [...fieldMap.entries()]
    .map(([fieldName, className]) => `  private ${className} ${fieldName};`)
    .join('\n');
};

const quoteShellPath = (filePath) => `"${String(filePath).replace(/"/g, '\\"')}"`;

const getJavaSourceArguments = (javaFiles) => (
  javaFiles.map(file => quoteShellPath(file.fileName)).join(" ")
);

const writeSubmissionFileToTemp = (tempDir, storedPath, fileContent) => {
  const normalizedPath = String(storedPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const targetPath = path.join(tempDir, normalizedPath);
  const resolvedTempDir = path.resolve(tempDir);
  const resolvedTargetPath = path.resolve(targetPath);

  if (resolvedTargetPath !== resolvedTempDir && !resolvedTargetPath.startsWith(`${resolvedTempDir}${path.sep}`)) {
    throw new Error(`Unsafe submission file path: ${storedPath}`);
  }

  fs.mkdirSync(path.dirname(resolvedTargetPath), { recursive: true });
  fs.writeFileSync(resolvedTargetPath, fileContent, "utf8");
};

const looksLikeJavaFieldDeclaration = (trimmedLine) => {
  if (!trimmedLine) return false;
  if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.startsWith('*')) return true;
  if (trimmedLine.startsWith('@')) return true;
  if (!trimmedLine.endsWith(';')) return false;
  if (trimmedLine.startsWith('if ') || trimmedLine.startsWith('if(')) return false;
  if (trimmedLine.startsWith('for ') || trimmedLine.startsWith('for(')) return false;
  if (trimmedLine.startsWith('while ') || trimmedLine.startsWith('while(')) return false;
  if (trimmedLine.startsWith('switch ') || trimmedLine.startsWith('switch(')) return false;
  if (trimmedLine.startsWith('return ') || trimmedLine.startsWith('throw ')) return false;
  if (trimmedLine.includes('.')) return false;

  return /^(public|private|protected|static|final|transient|volatile)\b/.test(trimmedLine);
};

// Extract import lines from submitted test code and split leading class members from executable body
const extractImportsFromTestCode = (code) => {
  if (!code || typeof code !== 'string') return { imports: '', classMembers: '', body: '' };
  const imports = [];
  const classMemberLines = [];
  const bodyLines = [];
  const lines = code.split(/\r?\n/);
  let collectingClassMembers = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('import ')) {
      imports.push(trimmed);
    } else if (trimmed.startsWith('package ')) {
      // ignore package statements in snippet
    } else if (collectingClassMembers && looksLikeJavaFieldDeclaration(trimmed)) {
      classMemberLines.push(line);
    } else {
      if (trimmed !== '') {
        collectingClassMembers = false;
      }
      bodyLines.push(line);
    }
  }
  const uniqueImports = [...new Set(imports)];
  return {
    imports: uniqueImports.join('\n'),
    classMembers: classMemberLines.join('\n').trim(),
    body: bodyLines.join('\n').trim()
  };
};

const collectJavaTypeImports = (javaFiles = []) => {
  const imports = [];

  for (const file of javaFiles) {
    if (!file?.fileName?.endsWith('.java')) continue;
    const className = path.basename(file.fileName, '.java');
    const source = typeof file.fileContent === 'string' ? file.fileContent : '';
    const packageMatch = source.match(/^\s*package\s+([a-zA-Z_][\w.]*)\s*;/m);
    if (packageMatch) {
      imports.push(`import ${packageMatch[1]}.${className};`);
    }
  }

  return [...new Set(imports)].join('\n');
};

const JUNIT_LIB_DIR = path.join(__dirname, '../../lib');
const JUNIT_JARS = [
  { name: 'junit-4.13.2.jar', url: 'https://repo1.maven.org/maven2/junit/junit/4.13.2/junit-4.13.2.jar' },
  { name: 'hamcrest-core-1.3.jar', url: 'https://repo1.maven.org/maven2/org/hamcrest/hamcrest-core/1.3/hamcrest-core-1.3.jar' },
  { name: 'junit-platform-console-standalone-1.10.2.jar', url: 'https://repo1.maven.org/maven2/org/junit/platform/junit-platform-console-standalone/1.10.2/junit-platform-console-standalone-1.10.2.jar' }
];

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}, status ${res.statusCode}`));
      }
      res.pipe(fileStream);
      fileStream.on('finish', () => fileStream.close(resolve));
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
};

const ensureJUnitJars = async () => {
  if (!fs.existsSync(JUNIT_LIB_DIR)) {
    fs.mkdirSync(JUNIT_LIB_DIR, { recursive: true });
  }
  for (const jar of JUNIT_JARS) {
    const jarPath = path.join(JUNIT_LIB_DIR, jar.name);
    if (!fs.existsSync(jarPath)) {
      console.log(`[admin] Downloading ${jar.name} from Maven central`);
      await downloadFile(jar.url, jarPath);
      console.log(`[admin] Download complete: ${jarPath}`);
    }
  }
};

const getJavaClasspath = (tempDir) => {
  const cpItems = [tempDir];
  for (const jar of JUNIT_JARS) {
    const jarPath = path.join(JUNIT_LIB_DIR, jar.name);
    if (fs.existsSync(jarPath)) {
      cpItems.push(jarPath);
    }
  }
  if (process.env.JUNIT_CLASSPATH) cpItems.push(process.env.JUNIT_CLASSPATH);
  return cpItems.join(path.delimiter);
};

// Detect potential infinite loops in test code
const detectInfiniteLoop = (code) => {
  const warnings = [];
  if (/while\s*\(\s*true\s*\)/.test(code)) warnings.push("Found while(true)");
  if (/for\s*\(\s*;\s*;\s*\)/.test(code)) warnings.push("Found for(;;)");
  if (/while\s*\(\s*1\s*\)/.test(code)) warnings.push("Found while(1)");
  if (code.match(/System\.out\.println.*\{.*\}/g)) warnings.push("Complex loop output detected");
  return warnings;
};



const sanitizeJavaSource = (source) => {
  if (typeof source !== 'string') return source;
  return source.replace(/\r\n/g, '\n');
};

// Safe file cleanup with timeout
const safeDeletedir = (dirpath) => {
  try {
    if (fs.existsSync(dirpath)) {
      // Force delete with short timeout for cleanup
      const files = fs.readdirSync(dirpath);
      files.forEach(file => {
        const curPath = path.join(dirpath, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          safeDeletedir(curPath);
        } else {
          try { fs.unlinkSync(curPath); } catch (e) { }
        }
      });
      try { fs.rmdirSync(dirpath); } catch (e) { }
    }
  } catch (e) {
    console.warn(`Failed to cleanup ${dirpath}:`, e.message);
  }
};

// Fast bulk insert for test results (used instead of bulkCreate for better performance)
const fastBulkInsertResults = async (testResults) => {
  if (!testResults || testResults.length === 0) return;

  const { sequelize } = TestResult;
  const { QueryTypes } = require('sequelize');

  // Build a single INSERT statement with all values using quoted column names
  // Note: testresults table does NOT have timestamps (createdAt/updatedAt)
  const cols = ['"submissionId"', '"testCaseId"', '"passed"', '"actualOutput"', '"errorMessage"'];
  const placeholders = testResults.map(() => '(?, ?, ?, ?, ?)').join(',');

  const values = [];
  for (const r of testResults) {
    values.push(r.submissionId, r.testCaseId, r.passed, r.actualOutput || '', r.errorMessage || null);
  }

  const query = `INSERT INTO "testresults" (${cols.join(',')}) VALUES ${placeholders}`;

  try {
    await sequelize.query(query, {
      replacements: values,
      type: QueryTypes.INSERT
    });
  } catch (err) {
    console.warn('Raw SQL insert failed, falling back to bulkCreate:', err.message);
    // Fallback to bulkCreate if raw SQL fails
    await TestResult.bulkCreate(testResults, { individualHooks: false, timestamps: false });
  }
};

// ==================== USER MANAGEMENT ====================

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const courseId = await getCourseIdAndVerify(req);
    
    // Get all users in this course
    const courseUsers = await CourseUser.findAll({
      where: { courseId },
      include: [{
        model: User,
        as: 'user',
        attributes: { exclude: ['password'] }
      }],
      attributes: ['role']
    });

    const users = courseUsers.map(cu => ({
      ...cu.user.dataValues,
      courseRole: cu.role
    }));

    res.json(users);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Error fetching users" });
  }
};

// Create new user (student, grader, or admin)
exports.createUser = async (req, res) => {
  try {
    const courseId = await getCourseIdAndVerify(req);
    const { email, name, role } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail || !name || !role) {
      return res.status(400).json({ message: "Email, name, and role required" });
    }

    if (!['student', 'grader', 'admin'].includes(role)) {
      return res.status(400).json({ message: "Invalid role. Must be: student, grader, or admin" });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ where: { email: normalizedEmail } });
    let user = existingUser;
    let tempPassword = null;

    if (!user) {
      // Generate temporary password for new accounts only
      tempPassword = "TempPass123!";
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      user = await User.create({
        email: normalizedEmail,
        name,
        role,
        password: hashedPassword
      });
    } else {
      // Keep profile fresh when assigning existing user into another course.
      await user.update({
        name: name || user.name,
        role: role === 'admin' ? 'admin' : (role === 'grader' && user.role === 'student' ? 'grader' : user.role),
      });
    }

    // Add (or update) user in this specific course
    const existingCourseLink = await CourseUser.findOne({
      where: { courseId, userId: user.id },
    });
    if (!existingCourseLink) {
      await CourseUser.create({
        courseId,
        userId: user.id,
        role
      });
    } else if (existingCourseLink.role !== role) {
      await existingCourseLink.update({ role });
    }

    res.status(201).json({
      message: existingUser ? "User added to course successfully" : "User created successfully",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        courseRole: role,
        ...(tempPassword ? { tempPassword } : {}),
      }
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Error creating user:", error);
    res.status(500).json({ message: "Error creating user" });
  }
};

// Update user role
exports.updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['student', 'grader', 'admin'].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await user.update({ role });

    res.json({
      message: "User role updated successfully",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Error updating user" });
  }
};

// Delete user and related data
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Delete submissions and their related data
    const submissions = await Submission.findAll({ where: { studentId: userId } });
    for (const submission of submissions) {
      await TestResult.destroy({ where: { submissionId: submission.id } });
      await CodeFile.destroy({ where: { submissionId: submission.id } });
      await submission.destroy();
    }

    // Delete grader solutions uploaded by this user (and their files)
    try {
      const graderSolutions = await GraderSolution.findAll({ where: { graderId: userId } });
      for (const sol of graderSolutions) {
        await GraderSolutionFile.destroy({ where: { solutionId: sol.id } });
      }
      await GraderSolution.destroy({ where: { graderId: userId } });
    } catch (e) {
      console.warn('Warning deleting grader solutions for user', userId, e.message || e);
    }

    // Delete password reset tokens for this user
    try {
      const PasswordResetToken = require("../models/passwordResetToken");
      await PasswordResetToken.destroy({ where: { userId } });
    } catch (e) {
      console.warn('Warning deleting password reset tokens for user', userId, e.message || e);
    }

    // Delete student invites (no specific user reference - just delete all)
    try {
      const StudentInvite = require("../models/studentInvite");
      // Note: StudentInvite model doesn't have createdBy column
      // Just log that invites for this email should be cleaned up separately if needed
      console.log('Note: Student invites for user', userId, 'may need cleanup separately');
    } catch (e) {
      console.warn('Warning with student invites cleanup for user', userId, e.message || e);
    }

    // Delete all course enrollments (CourseUser records) - IMPORTANT: must do this before deleting user
    await CourseUser.destroy({ where: { userId } });

    // Finally delete the user
    await user.destroy();

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
};

// Get users by role
exports.getUsersByRole = async (req, res) => {
  try {
    const courseId = await getCourseIdAndVerify(req);
    const { role } = req.params;

    if (!['student', 'grader', 'admin'].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const courseUsers = await CourseUser.findAll({
      where: { courseId, role },
      include: [{
        model: User,
        as: 'user',
        attributes: { exclude: ['password'] }
      }],
      attributes: ['role']
    });

    const users = courseUsers.map(cu => ({
      ...cu.user.dataValues,
      courseRole: cu.role
    }));

    res.json(users);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Error fetching users by role:", error);
    res.status(500).json({ message: "Error fetching users" });
  }
};

// ==================== ASSIGNMENT MANAGEMENT ====================

// Get all assignments
exports.getAssignments = async (req, res) => {
  try {
    const courseId = await getCourseIdAndVerify(req);
    const tableDescription = await sequelize.getQueryInterface().describeTable("assignments");
    const baseAttrs = ["id", "courseId", "title", "description", "dueDate", "totalMarks"];
    const optionalAttrs = ["canViewMarks", "isHidden"];
    const assignmentAttributes = [
      ...baseAttrs.filter((attr) => tableDescription[attr]),
      ...optionalAttrs.filter((attr) => tableDescription[attr]),
    ];
    const supportsCourseId = Boolean(tableDescription.courseId);

    const whereClause = supportsCourseId ? { courseId } : {};
    let assignments = await Assignment.findAll({
      where: whereClause,
      attributes: assignmentAttributes,
      include: [{ model: TestCase, as: 'testCases' }],
      order: [['dueDate', 'ASC']]
    });

    // One-time compatibility backfill: attach legacy assignments (courseId NULL) to selected course.
    if (supportsCourseId && assignments.length === 0) {
      const legacyAssignments = await Assignment.findAll({
        where: { courseId: null },
        attributes: ["id"],
        order: [["id", "ASC"]],
      });
      if (legacyAssignments.length > 0) {
        const legacyIds = legacyAssignments.map((a) => a.id);
        await Assignment.update({ courseId }, { where: { id: legacyIds } });
        assignments = await Assignment.findAll({
          where: { courseId },
          attributes: assignmentAttributes,
          include: [{ model: TestCase, as: "testCases" }],
          order: [["dueDate", "ASC"]],
        });
      }
    }

    res.json(assignments);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Error fetching assignments:", error);
    res.status(500).json({ message: "Error fetching assignments" });
  }
};

// Create new assignment
exports.createAssignment = async (req, res) => {
  try {
    const courseId = await getCourseIdAndVerify(req);
    const { title, description, dueDate, totalMarks } = req.body;

    if (!title || !dueDate) {
      return res.status(400).json({ message: "Title and due date required" });
    }

    // Validate date format
    const parsedDate = new Date(dueDate);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    const supportsCourseId = await hasColumn("assignments", "courseId");
    const payload = {
      title: title.trim(),
      description: description ? description.trim() : "",
      dueDate: parsedDate,
      totalMarks: totalMarks || 100
    };
    if (supportsCourseId) {
      payload.courseId = courseId;
    }

    const assignment = await Assignment.create(payload);

    res.status(201).json({
      message: "Assignment created successfully",
      assignment
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Error creating assignment:", error);
    res.status(500).json({
      message: "Error creating assignment",
      error: error.message || error
    });
  }
};

// Update assignment
exports.updateAssignment = async (req, res) => {
  try {
    const courseId = await getCourseIdAndVerify(req);
    const { assignmentId } = req.params;
    const { title, description, dueDate, totalMarks } = req.body;

    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    // Verify assignment belongs to this course
    if (assignment.courseId != null && Number(assignment.courseId) !== Number(courseId)) {
      return res.status(403).json({ message: "You don't have access to this assignment" });
    }

    await assignment.update({
      title: title || assignment.title,
      description: description !== undefined ? description : assignment.description,
      dueDate: dueDate ? new Date(dueDate) : assignment.dueDate,
      totalMarks: totalMarks || assignment.totalMarks
    });

    res.json({
      message: "Assignment updated successfully",
      assignment
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Error updating assignment:", error);
    res.status(500).json({ message: "Error updating assignment" });
  }
};

// Delete assignment
exports.deleteAssignment = async (req, res) => {
  try {
    const courseId = await getCourseIdAndVerify(req);
    const { assignmentId } = req.params;

    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    // Verify assignment belongs to this course
    if (assignment.courseId != null && Number(assignment.courseId) !== Number(courseId)) {
      return res.status(403).json({ message: "You don't have access to this assignment" });
    }

    // Also delete related submissions, code files, test cases, test results
    const submissions = await Submission.findAll({ where: { assignmentId } });
    for (const submission of submissions) {
      await CodeFile.destroy({ where: { submissionId: submission.id } });
      await TestResult.destroy({ where: { submissionId: submission.id } });
      await submission.destroy();
    }

    // Delete grader solution files and grader solutions referencing this assignment
    try {
      const graderSolutions = await GraderSolution.findAll({ where: { assignmentId } });
      for (const sol of graderSolutions) {
        await GraderSolutionFile.destroy({ where: { solutionId: sol.id } });
      }
      await GraderSolution.destroy({ where: { assignmentId } });
    } catch (e) {
      console.warn('Warning: error deleting grader solutions for assignment', assignmentId, e.message || e);
    }

    await TestCase.destroy({ where: { assignmentId } });
    await assignment.destroy();

    res.json({ message: "Assignment deleted successfully" });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Error deleting assignment:", error);
    res.status(500).json({ message: "Error deleting assignment" });
  }
};

// Toggle allow students to view marks for an assignment
exports.toggleCanViewMarks = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { canViewMarks } = req.body;

    if (canViewMarks === undefined || canViewMarks === null) {
      return res.status(400).json({ message: "canViewMarks parameter required" });
    }

    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    await assignment.update({ canViewMarks: Boolean(canViewMarks) });

    res.json({
      message: `Students can ${canViewMarks ? 'now' : 'no longer'} view marks for this assignment`,
      assignment
    });
  } catch (error) {
    console.error("Error toggling view marks:", error);
    res.status(500).json({ message: "Error toggling view marks" });
  }
};

// Toggle assignment hidden status
exports.toggleAssignmentVisibility = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { isHidden } = req.body;

    if (isHidden === undefined || isHidden === null) {
      return res.status(400).json({ message: "isHidden parameter required" });
    }

    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    await assignment.update({ isHidden: Boolean(isHidden) });

    res.json({
      message: `Assignment is now ${isHidden ? 'hidden' : 'visible'} to students`,
      assignment
    });
  } catch (error) {
    console.error("Error toggling assignment visibility:", error);
    res.status(500).json({ message: "Error toggling assignment visibility" });
  }
};

// ==================== GRADING & MARKS ====================

// Get all submissions with marks
exports.getAllSubmissions = async (req, res) => {
  try {
    const courseId = await getCourseIdAndVerify(req);
    const assignments = await Assignment.findAll({
      where: { courseId },
      attributes: ["id"],
    });
    const assignmentIds = assignments.map((a) => a.id);
    if (assignmentIds.length === 0) {
      return res.json([]);
    }

    const submissionTable = await sequelize.getQueryInterface().describeTable("submissions");
    const submissionBaseAttrs = ["id", "assignmentId", "studentId", "marks", "totalMarks", "status"];
    const submissionOptionalAttrs = ["studentEmail", "viewMarks", "viewTestResults", "submittedAt"];
    const submissionAttributes = [
      ...submissionBaseAttrs.filter((attr) => submissionTable[attr]),
      ...submissionOptionalAttrs.filter((attr) => submissionTable[attr]),
    ];

    const submissions = await Submission.findAll({
      where: { assignmentId: assignmentIds },
      attributes: submissionAttributes,
      include: [
        {
          model: Assignment,
          as: 'assignment',
          attributes: ["id", "title", "dueDate", "totalMarks", "courseId"],
        },
        { model: User, as: 'student', attributes: ['id', 'name', 'email'] },
        { model: CodeFile, as: 'codeFiles' }
      ],
      order: [['id', 'DESC']]
    });
    res.json(submissions);
  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({ message: "Error fetching submissions" });
  }
};

// Get submissions for specific assignment
exports.getSubmissionsByAssignment = async (req, res) => {
  try {
    await getCourseIdAndVerify(req);
    const { assignmentId } = req.params;

    const submissionTable = await sequelize.getQueryInterface().describeTable("submissions");
    const submissionBaseAttrs = ["id", "assignmentId", "studentId", "marks", "totalMarks", "status"];
    const submissionOptionalAttrs = ["studentEmail", "viewMarks", "viewTestResults", "submittedAt"];
    const submissionAttributes = [
      ...submissionBaseAttrs.filter((attr) => submissionTable[attr]),
      ...submissionOptionalAttrs.filter((attr) => submissionTable[attr]),
    ];

    const submissions = await Submission.findAll({
      where: { assignmentId },
      attributes: submissionAttributes,
      include: [
        { model: User, as: 'student', attributes: ['id', 'name', 'email'] },
        { model: CodeFile, as: 'codeFiles' }
      ],
      order: [['id', 'DESC']]
    });

    res.json(submissions);
  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({ message: "Error fetching submissions" });
  }
};

// Update submission marks (admin only)
exports.updateSubmissionMarks = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { marks } = req.body;

    if (marks === undefined || marks === null) {
      return res.status(400).json({ message: "Marks required" });
    }

    const submission = await Submission.findByPk(submissionId);
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    // Convert to float and validate
    const floatMarks = parseFloat(marks);
    if (isNaN(floatMarks) || floatMarks < 0) {
      return res.status(400).json({
        message: "Marks must be a non-negative number"
      });
    }

    await submission.update({ marks: floatMarks });

    res.json({
      message: "Marks updated successfully",
      submission
    });
  } catch (error) {
    console.error("Error updating marks:", error);
    res.status(500).json({ message: "Error updating marks" });
  }
};

// Toggle allow students to view marks
exports.toggleViewMarks = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { canView } = req.body;

    if (canView === undefined || canView === null) {
      return res.status(400).json({ message: "canView parameter required" });
    }

    const submission = await Submission.findByPk(submissionId);
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    await submission.update({ viewMarks: Boolean(canView) });

    res.json({
      message: "View marks permission updated successfully",
      submission: {
        id: submission.id,
        viewMarks: submission.viewMarks
      }
    });
  } catch (error) {
    console.error("Error updating view marks permission:", error);
    res.status(500).json({ message: "Error updating view marks permission" });
  }
};

// Get code files for a submission
exports.getSubmissionCodeFiles = async (req, res) => {
  try {
    const { submissionId } = req.params;

    const codeFiles = await CodeFile.findAll({
      where: { submissionId },
      attributes: ['id', 'fileName', 'fileContent']
    });

    if (!codeFiles || codeFiles.length === 0) {
      return res.json([]);
    }

    res.json(codeFiles);
  } catch (error) {
    console.error("Error fetching code files:", error);
    res.status(500).json({ message: "Error fetching code files" });
  }
};

exports.runSingleTest = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { testCaseId } = req.body;

    const submission = await Submission.findByPk(submissionId, {
      include: [{ model: CodeFile, as: "codeFiles" }]
    });

    if (!submission) return res.status(404).json({ message: "Submission not found" });

    const testCase = await TestCase.findByPk(testCaseId);
    if (!testCase) return res.status(404).json({ message: "Test case not found" });

    const codeFiles = submission.codeFiles;
    const javaFiles = codeFiles.filter(f => f.fileName.endsWith(".java"));
    if (javaFiles.length === 0) return res.status(404).json({ message: "No Java files found" });

    const tempDir = path.join(__dirname, "../../temp", `test_${submissionId}_${Date.now()}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    try {
      for (const codeFile of javaFiles) {
        writeSubmissionFileToTemp(tempDir, codeFile.fileName, sanitizeJavaSource(codeFile.fileContent));
      }

      try {
        await ensureJUnitJars();
        const javaFileNames = getJavaSourceArguments(javaFiles);
        const classpath = getJavaClasspath(tempDir);
        console.log("[admin] javac classpath:", classpath);
        execSync(`cd "${tempDir}" && ${JAVAC_CMD} -encoding UTF-8 -cp "${classpath}" -d "${tempDir}" ${javaFileNames}`, {
          timeout: 20000,
          stdio: ['pipe', 'pipe', 'pipe'],
          maxBuffer: 1 * 1024 * 1024
        });
      } catch (compileErr) {
        return res.json({
          testName: testCase.testName,
          passed: false,
          errorMessage: `Compilation Failed: ${compileErr.stderr?.toString() || compileErr.message}`
        });
      }

      const uniqueId = Date.now() + Math.random().toString().replace('.', '');
      const testClassName = `Test${uniqueId}`;
      const { imports, classMembers, body } = extractImportsFromTestCode(testCase.testCode);
      const autoImports = collectJavaTypeImports(javaFiles);
      const generatedFields = generateFieldDeclarations(body, classMembers);
      const mergedImports = [imports, autoImports].filter(Boolean).join('\n');
      const testCode = `${mergedImports ? mergedImports + '\n\n' : ''}public class ${testClassName} {
${generatedFields ? generatedFields + '\n' : ''}${classMembers ? classMembers + '\n' : ''}        public static void main(String[] args) {
          new ${testClassName}().run();
        }

        private void run() {
          try {
            ${transformJUnitStyle(body)}
            System.out.println("PASS");
          } catch (AssertionError e) {
            System.out.println("FAIL: " + e.getMessage());
          } catch (Exception e) {
            System.out.println("FAIL: " + e.getMessage());
          }
        }
      }`;
      fs.writeFileSync(path.join(tempDir, `${testClassName}.java`), testCode);

      try {
        const classpath = getJavaClasspath(tempDir);
        console.log("[admin] test compile classpath:", classpath);
        const cmd = `cd "${tempDir}" && ${JAVAC_CMD} -encoding UTF-8 -cp "${classpath}" -d "${tempDir}" ${testClassName}.java && ${JAVA_CMD} -cp "${classpath}" ${testClassName}`;
        console.log("[admin] running command:", cmd);
        const actualOutput = execSync(cmd, { encoding: "utf8", timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 5 * 1024 * 1024 }).trim();
        const passed = actualOutput.includes("PASS");
        res.json({ testName: testCase.testName, testCaseId: testCase.id, passed, actualOutput: passed ? actualOutput : "", errorMessage: passed ? null : "Assertion failed", marks: testCase.marks || 0 });
      } catch (execError) {
        res.json({ testName: testCase.testName, passed: false, errorMessage: execError.stderr?.toString() || execError.message, marks: 0 });
      }
    } finally {
      if (fs.existsSync(tempDir)) safeDeletedir(tempDir);
    }
  } catch (error) {
    res.status(500).json({ message: "Error running test: " + error.message });
  }
};

// Run tests (same as grader)
exports.runTestCases = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { execSync } = require("child_process");
    const fs = require("fs");
    const path = require("path");

    const submission = await Submission.findByPk(submissionId, {
      include: [{ model: CodeFile, as: "codeFiles" }]
    });

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    const testCases = await TestCase.findAll({
      where: { assignmentId: submission.assignmentId }
    });

    if (testCases.length === 0) {
      return res.json({ message: "No test cases defined for this assignment", results: [] });
    }

    const codeFiles = await CodeFile.findAll({
      where: { submissionId }
    });

    if (codeFiles.length === 0) {
      return res.status(404).json({ message: "No code files found in submission" });
    }

    const tempDir = path.join(__dirname, "../../temp", `submission_${submissionId}`);

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      for (const codeFile of codeFiles) {
        const sanitized = sanitizeJavaSource(codeFile.fileContent);
        writeSubmissionFileToTemp(tempDir, codeFile.fileName, sanitized);
      }

      // Remove any previous test results for this submission to avoid duplicates
      await TestResult.destroy({ where: { submissionId } });

      // Compile all Java files ONCE before test loop
      const javaFiles = codeFiles.filter(f => f.fileName.endsWith(".java"));
      console.log("[admin.runTestCases] Submission:", submissionId);
      console.log("[admin.runTestCases] Total codeFiles:", codeFiles.length, "Files:", codeFiles.map(f => f.fileName));
      console.log("[admin.runTestCases] Filtered javaFiles:", javaFiles.length, "Files:", javaFiles.map(f => f.fileName));
      if (javaFiles.length > 0) {
        try {
          const javaFileNames = getJavaSourceArguments(javaFiles);
          const classpath = getJavaClasspath(tempDir);
          execSync(`cd "${tempDir}" && ${JAVAC_CMD} -encoding UTF-8 -cp "${classpath}" -d "${tempDir}" ${javaFileNames}`, {
            timeout: 20000,
            stdio: ['pipe', 'pipe', 'pipe'],
            maxBuffer: 5 * 1024 * 1024
          });
        } catch (compileErr) {
          await submission.update({ marks: 0, status: 'compilation-error' });
          return res.json({
            message: "Compilation Failed",
            results: [],
            passCount: 0,
            totalCount: testCases.length,
            marksObtained: 0,
            totalMarks: submission.totalMarks,
            errorMessage: compileErr.stderr?.toString() || compileErr.message
          });
        }
      }

      // Run test cases with limited concurrency (max 5 at a time to prevent resource exhaustion)
      const limiter = pLimit(5);
      const results = await Promise.all(testCases.map((testCase, caseIndex) =>
        limiter(async () => {
          let passed = false;
          let actualOutput = "";
          let errorMessage = "";

          try {
            const codeFileExtensions = codeFiles.map(f => path.extname(f.fileName))[0];
            let command = "";

            if (codeFileExtensions === ".java" || javaFiles.length > 0) {
              // For Java, create a test file that runs the test code as a harness
              const uniqueId = `${submissionId}_${caseIndex}`;
              const testFileName = `Test${uniqueId}.java`;
              const testClassName = `Test${uniqueId}`;
              console.log("[testCode generation] caseIndex:", caseIndex, "javaFiles:", javaFiles.map(f => f.fileName));
              const { imports, classMembers, body } = extractImportsFromTestCode(testCase.testCode);
              const autoImports = collectJavaTypeImports(javaFiles);
              const fieldDecls = generateFieldDeclarations(body, classMembers);
              const mergedImports = [imports, autoImports].filter(Boolean).join('\n');
              console.log("[testCode generation] fieldDecls:", fieldDecls);
              console.log("[testCode generation] imports:", imports);
              console.log("[testCode generation] classMembers:\n", classMembers);
              console.log("[testCode generation] body (no imports):\n", body);
              const testBody = transformJUnitStyle(body);
              const testCode = `${mergedImports ? mergedImports + '\n\n' : ''}public class ${testClassName} {
${fieldDecls}
${classMembers ? classMembers + '\n' : ''}
  public static void main(String[] args) {
    new ${testClassName}().run();
  }

  private void run() {
    try {
      ${testBody}
      System.out.println("PASS");
    } catch (AssertionError e) {
      System.out.println("FAIL: " + e.getMessage());
    } catch (Exception e) {
      System.out.println("FAIL: " + e.getMessage());
    }
  }
}`;
              console.log("Generated test code for", testCase.testName, ":\n", testCode);
              fs.writeFileSync(path.join(tempDir, testFileName), testCode);
              const classpath = getJavaClasspath(tempDir);
              command = `cd "${tempDir}" && ${JAVAC_CMD} -encoding UTF-8 -cp "${classpath}" -d "${tempDir}" ${testFileName} && ${JAVA_CMD} -cp "${classpath}" ${testClassName}`;
              actualOutput = execSync(command, {
                encoding: "utf8",
                timeout: 15000,
                stdio: ['pipe', 'pipe', 'pipe'],
                maxBuffer: 2 * 1024 * 1024
              }).trim();
            } else {
              const mainFile = codeFiles.find(f => f.fileName.endsWith(".js")) || codeFiles[0];

              if (mainFile.fileName.endsWith(".js")) {
                command = `cd "${tempDir}" && node ${quoteShellPath(mainFile.fileName)}`;
              } else if (mainFile.fileName.endsWith(".py")) {
                command = `cd "${tempDir}" && python ${quoteShellPath(mainFile.fileName)}`;
              }

              if (command) {
                if (testCase.input) {
                  actualOutput = execSync(command, {
                    input: testCase.input,
                    encoding: "utf8",
                    stdio: ["pipe", "pipe", "pipe"],
                    timeout: 15000,
                    maxBuffer: 2 * 1024 * 1024
                  }).trim();
                } else {
                  actualOutput = execSync(command, {
                    encoding: "utf8",
                    timeout: 15000,
                    maxBuffer: 2 * 1024 * 1024
                  }).trim();
                }
              }
            }

            const expectedOutput = typeof testCase.expectedOutput === "string"
              ? testCase.expectedOutput.trim()
              : "";
            passed = actualOutput.includes("PASS") || (expectedOutput !== "" && actualOutput === expectedOutput);
          } catch (execError) {
            errorMessage = execError.message || "Execution failed";
            passed = false;
          }

          if (!passed && !errorMessage && typeof actualOutput === "string" && actualOutput.trim() !== "") {
            errorMessage = actualOutput.trim();
          }

          return {
            testName: testCase.testName,
            testCaseId: testCase.id,
            passed,
            actualOutput,
            expectedOutput: testCase.expectedOutput,
            errorMessage
          };
        })
      ));

      // Build testResultsToSave from results array
      const testResultsToSave = results.map(result => ({
        submissionId,
        testCaseId: result.testCaseId,
        passed: result.passed,
        actualOutput: result.actualOutput,
        errorMessage: result.errorMessage
      }));

      // Batch save all test results at once using raw SQL (much faster than ORM)
      if (testResultsToSave.length > 0) {
        await fastBulkInsertResults(testResultsToSave);
      }

      // Calculate marks based on passed tests
      let totalMarksEarned = 0;
      for (let i = 0; i < results.length; i++) {
        if (results[i].passed) {
          totalMarksEarned += parseFloat(testCases[i].marks) || 0;
        }
      }

      // Update submission with calculated marks and status
      await submission.update({
        marks: totalMarksEarned,
        status: "evaluated"
      });

      res.json({
        message: "Test cases executed",
        results: results.map(r => ({
          testName: r.testName,
          passed: r.passed,
          actualOutput: r.actualOutput,
          expectedOutput: r.expectedOutput,
          errorMessage: r.errorMessage
        })),
        submissionId,
        passCount: results.filter(r => r.passed).length,
        totalCount: results.length,
        marksObtained: totalMarksEarned,
        totalMarks: submission.totalMarks
      });
    } finally {
      try { safeDeletedir(tempDir); } catch (e) { }
    }
  } catch (error) {
    console.error("Error running tests:", error);
    res.status(500).json({ message: "Error running tests: " + error.message });
  }
};

// ==================== REPORTING & DOWNLOADS ====================

// Get marks report for an assignment
exports.getMarksReport = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const submissions = await Submission.findAll({
      where: { assignmentId },
      include: [
        { model: User, as: 'student', attributes: ['id', 'name', 'email'] }
      ],
      order: [['studentId', 'ASC']]
    });

    const report = submissions.map(s => ({
      studentId: s.studentId,
      studentName: s.student.name,
      studentEmail: s.student.email,
      marks: s.marks || 0,
      totalMarks: s.totalMarks,
      percentage: ((s.marks || 0) / s.totalMarks * 100).toFixed(2),
      status: s.status
    }));

    res.json({
      assignmentId,
      assignmentTitle: assignment.title,
      report
    });
  } catch (error) {
    console.error("Error generating report:", error);
    res.status(500).json({ message: "Error generating report" });
  }
};

// Download marks as CSV
exports.downloadMarksCSV = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const submissions = await Submission.findAll({
      where: { assignmentId },
      include: [
        { model: User, as: 'student', attributes: ['id', 'name', 'email'] }
      ],
      order: [['studentId', 'ASC']]
    });

    // Create CSV content
    let csv = "Student ID,Student Name,Email,Marks,Total Marks,Percentage,Status\n";

    submissions.forEach(s => {
      const percentage = ((s.marks || 0) / s.totalMarks * 100).toFixed(2);
      csv += `${s.studentId},"${s.student.name}","${s.student.email}",${s.marks || 0},${s.totalMarks},${percentage}%,${s.status}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="marks_${assignmentId}_${new Date().getTime()}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("Error downloading CSV:", error);
    res.status(500).json({ message: "Error downloading CSV" });
  }
};

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    const courseId = await getCourseIdAndVerify(req);

    // Get course-specific statistics
    const totalAssignments = await Assignment.count({ where: { courseId } });
    
    // Get submissions for assignments in this course
    const assignments = await Assignment.findAll({ where: { courseId }, attributes: ['id'] });
    const assignmentIds = assignments.map(a => a.id);
    
    const totalSubmissions = assignmentIds.length > 0 
      ? await Submission.count({ where: { assignmentId: assignmentIds } })
      : 0;
    
    const gradedSubmissions = assignmentIds.length > 0
      ? await Submission.count({ where: { assignmentId: assignmentIds, status: 'graded' } })
      : 0;
    
    // Get users in this course
    const courseUsers = await CourseUser.findAll({
      where: { courseId },
      attributes: ['userId', 'role']
    });

    const totalUsers = courseUsers.length;
    const totalStudents = courseUsers.filter(cu => cu.role === 'student').length;
    const totalGraders = courseUsers.filter(cu => cu.role === 'grader').length;
    const totalAdmins = courseUsers.filter(cu => cu.role === 'admin').length;

    res.json({
      courseId,
      totalUsers,
      totalStudents,
      totalGraders,
      totalAdmins,
      totalAssignments,
      totalSubmissions,
      gradedSubmissions,
      pendingGrading: totalSubmissions - gradedSubmissions
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Error fetching stats:", error);
    res.status(500).json({ message: "Error fetching stats" });
  }
};
// ========== TEST CASE MANAGEMENT ==========

exports.getTestCases = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const testCases = await TestCase.findAll({
      where: { assignmentId },
      order: [["id", "ASC"]]
    });
    res.json(testCases);
  } catch (error) {
    console.error("Error fetching test cases:", error);
    res.status(500).json({ message: "Error fetching test cases" });
  }
};

exports.createTestCase = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { testName, testCode, marks, isHidden, input, expectedOutput } = req.body;

    if (!testName) {
      return res.status(400).json({ message: "Test case name is required" });
    }
    if (!testCode) {
      return res.status(400).json({ message: "Test code is required" });
    }

    // Validate that total marks don't exceed assignment's total marks
    const assignment = await Assignment.findByPk(parseInt(assignmentId));
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const newMarks = parseFloat(marks) || 1;
    const assignmentTotalMarks = parseFloat(assignment.totalMarks) || 0;

    // Calculate sum of existing test cases
    const existingTestCases = await TestCase.findAll({
      where: { assignmentId: parseInt(assignmentId) },
      attributes: ['marks']
    });

    const existingMarksSum = existingTestCases.reduce((sum, tc) => sum + (parseFloat(tc.marks) || 0), 0);
    const totalMarksAfterCreation = existingMarksSum + newMarks;

    if (totalMarksAfterCreation > assignmentTotalMarks) {
      return res.status(400).json({
        message: `Total marks of test cases (${totalMarksAfterCreation.toFixed(2)}) cannot exceed assignment total marks (${assignmentTotalMarks.toFixed(2)})`,
        existingMarksSum: existingMarksSum.toFixed(2),
        newMarks: newMarks.toFixed(2),
        totalMarksAfterCreation: totalMarksAfterCreation.toFixed(2),
        assignmentTotalMarks: assignmentTotalMarks.toFixed(2)
      });
    }

    const testCase = await TestCase.create({
      courseId: assignment.courseId,
      assignmentId: parseInt(assignmentId),
      testName,
      testCode,
      input: typeof input === "string" ? input : "",
      expectedOutput: typeof expectedOutput === "string" ? expectedOutput : "",
      marks: newMarks,
      isHidden: isHidden === 'true' || isHidden === true,
    });

    res.status(201).json({
      message: "Test case created successfully",
      testCase,
      success: true
    });
  } catch (error) {
    console.error("Error creating test case:", error);
    res.status(500).json({
      message: "Error creating test case: " + error.message,
      error: error.message
    });
  }
};

exports.updateTestCase = async (req, res) => {
  try {
    const { testCaseId } = req.params;
    const { testName, testCode, marks, isHidden, input, expectedOutput } = req.body;

    const testCase = await TestCase.findByPk(testCaseId);
    if (!testCase) {
      return res.status(404).json({ message: "Test case not found" });
    }

    // If marks are being updated, validate total marks
    if (marks !== undefined) {
      const newMarks = parseFloat(marks);
      const oldMarks = parseFloat(testCase.marks) || 0;
      const marksChange = newMarks - oldMarks;

      // Get assignment to check total marks limit
      const assignment = await Assignment.findByPk(testCase.assignmentId);
      if (!assignment) {
        return res.status(404).json({ message: "Assignment not found" });
      }

      const assignmentTotalMarks = parseFloat(assignment.totalMarks) || 0;

      // Calculate sum of all test cases except this one
      const otherTestCases = await TestCase.findAll({
        where: { assignmentId: testCase.assignmentId, id: { [require('sequelize').Op.ne]: testCaseId } },
        attributes: ['marks']
      });

      const otherMarksSum = otherTestCases.reduce((sum, tc) => sum + (parseFloat(tc.marks) || 0), 0);
      const totalMarksAfterUpdate = otherMarksSum + newMarks;

      if (totalMarksAfterUpdate > assignmentTotalMarks) {
        return res.status(400).json({
          message: `Total marks of test cases (${totalMarksAfterUpdate.toFixed(2)}) cannot exceed assignment total marks (${assignmentTotalMarks.toFixed(2)})`,
          otherMarksSum: otherMarksSum.toFixed(2),
          newMarks: newMarks.toFixed(2),
          totalMarksAfterUpdate: totalMarksAfterUpdate.toFixed(2),
          assignmentTotalMarks: assignmentTotalMarks.toFixed(2)
        });
      }

      testCase.marks = newMarks;
    }

    if (testName) testCase.testName = testName;
    if (testCode) testCase.testCode = testCode;
    if (input !== undefined) testCase.input = typeof input === "string" ? input : "";
    if (expectedOutput !== undefined) testCase.expectedOutput = typeof expectedOutput === "string" ? expectedOutput : "";
    if (isHidden !== undefined) testCase.isHidden = isHidden;

    await testCase.save();
    res.json({ message: "Test case updated", testCase });
  } catch (error) {
    console.error("Error updating test case:", error);
    res.status(500).json({ message: "Error updating test case" });
  }
};

exports.deleteTestCase = async (req, res) => {
  try {
    const { testCaseId } = req.params;
    const testCase = await TestCase.findByPk(testCaseId);

    if (!testCase) {
      return res.status(404).json({ message: "Test case not found" });
    }

    // Delete all test results associated with this test case first (foreign key constraint)
    await TestResult.destroy({
      where: { testCaseId }
    });

    // Now delete the test case
    await testCase.destroy();
    res.json({ message: "Test case deleted successfully" });
  } catch (error) {
    console.error("Error deleting test case:", error);
    res.status(500).json({ message: "Error deleting test case", error: error.message });
  }
};

// ==================== HELPER: Concurrency Control ====================

// Run promises with limited concurrency
const pLimit = (limit) => {
  let count = 0;
  const queue = [];

  const run = async (fn) => {
    while (count >= limit) {
      await new Promise(resolve => queue.push(resolve));
    }
    count++;
    try {
      return await fn();
    } finally {
      count--;
      const resolve = queue.shift();
      if (resolve) resolve();
    }
  };

  return (fn) => run(fn);
};

// Track currently running bulk tests to prevent duplicates
const runningTests = new Set();
const bulkTestProgress = new Map();

const resolveServiceBaseUrl = (req) => {
  const envUrl =
    process.env.RENDER_EXTERNAL_URL ||
    process.env.PUBLIC_BASE_URL ||
    process.env.FRONTEND_URL;

  if (envUrl && typeof envUrl === "string") {
    return envUrl.replace(/\/+$/, "");
  }

  const host = req?.headers?.host;
  if (!host) return null;

  const forwardedProto = req?.headers?.["x-forwarded-proto"];
  const protocol = forwardedProto || (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
};

const startKeepAlive = (req, label = "grading") => {
  const baseUrl = resolveServiceBaseUrl(req);
  if (!baseUrl) return () => { };

  const pingUrl = `${baseUrl}/api/health`;
  const intervalMs = 2 * 60 * 1000; // 2 min < 15 min Render idle timeout

  const pingOnce = async () => {
    try {
      await fetch(pingUrl, { method: "GET" });
    } catch (error) {
      console.warn(`[KEEPALIVE:${label}] Ping failed: ${error.message}`);
    }
  };

  // Best-effort immediate ping, then periodic ping.
  pingOnce();
  const interval = setInterval(() => { pingOnce(); }, intervalMs);

  return () => clearInterval(interval);
};

// ==================== BULK OPERATIONS ====================

exports.getBulkTestProgress = async (req, res) => {
  const { assignmentId } = req.params;
  const progress = bulkTestProgress.get(String(assignmentId));

  if (!progress) {
    return res.json({
      running: false,
      processedCount: 0,
      totalCount: 0,
      currentStudentName: null
    });
  }

  // Return full progress object with all details
  return res.json({
    running: progress.running || false,
    processedCount: progress.processedCount || 0,
    totalCount: progress.totalCount || 0,
    currentStudentName: progress.currentStudentName || null,
    startedAt: progress.startedAt,
    completedAt: progress.completedAt,
    totalTime: progress.totalTime,
    error: progress.error,
    success: progress.success,
    results: progress.results
  });
};

exports.runBulkTestsStandard = async (req, res) => {
  const { assignmentId } = req.params;
  const assignmentKey = String(assignmentId);

  if (runningTests.has(assignmentKey)) {
    return res.status(409).json({ message: "Tests already running for this assignment. Please wait." });
  }
  runningTests.add(assignmentKey);

  // Return immediately with 202 Accepted while tests run in background
  res.status(202).json({ 
    message: "Bulk tests started. Check progress with polling endpoint.",
    running: true,
    assignmentId 
  });

  // Run tests in background AFTER response is sent
  setImmediate(async () => {
    const bulkStartTime = Date.now();
    const stopKeepAlive = startKeepAlive(req, `bulk-standard-${assignmentId}`);

    try {
      const submissions = await Submission.findAll({
        where: { assignmentId },
        include: [{ model: User, as: "student", attributes: ["name", "email"] }],
        order: [["submittedAt", "ASC"], ["id", "ASC"]]
      });

      if (submissions.length === 0) {
        bulkTestProgress.set(assignmentKey, {
          running: false,
          processedCount: 0,
          totalCount: 0,
          currentStudentName: null,
          error: "No submissions found"
        });
        runningTests.delete(assignmentKey);
        stopKeepAlive();
        return;
      }

      bulkTestProgress.set(assignmentKey, {
        running: true,
        processedCount: 0,
        totalCount: submissions.length,
        currentStudentName: null,
        startedAt: new Date().toISOString()
      });

      const studentResults = [];

      for (let index = 0; index < submissions.length; index += 1) {
        const submission = submissions[index];
        const studentName = submission.student?.name || "Unknown student";
        const startedAt = bulkTestProgress.get(assignmentKey)?.startedAt || new Date().toISOString();

        // Update progress BEFORE running tests for this student
        bulkTestProgress.set(assignmentKey, {
          running: true,
          processedCount: index,
          totalCount: submissions.length,
          currentStudentName: studentName,
          startedAt
        });

        const result = await new Promise((resolve) => {
          const fakeReq = { params: { submissionId: submission.id } };
          const fakeRes = {
            json: (data) => resolve({ statusCode: 200, data }),
            status: (statusCode) => ({
              json: (data) => resolve({ statusCode, data })
            })
          };

          exports.runTestCases(fakeReq, fakeRes).catch((error) => {
            resolve({
              statusCode: 500,
              data: { message: error.message || "Error running tests" }
            });
          });
        });

        const payload = result.data || {};
        const status =
          result.statusCode >= 400 ? "error"
            : payload.message === "Compilation Failed" ? "compilation-error"
              : "evaluated";

        studentResults.push({
          submissionId: submission.id,
          studentName,
          status,
          passCount: payload.passCount || 0,
          totalCount: payload.totalCount || 0,
          marksObtained: payload.marksObtained || 0,
          errorMessage: payload.errorMessage || payload.message || null
        });

        // Update progress AFTER running tests for this student
        bulkTestProgress.set(assignmentKey, {
          running: true,
          processedCount: index + 1,
          totalCount: submissions.length,
          currentStudentName: studentName,
          startedAt
        });
      }

      const totalTime = Date.now() - bulkStartTime;

      // Final state: tests completed
      bulkTestProgress.set(assignmentKey, {
        running: false,
        processedCount: submissions.length,
        totalCount: submissions.length,
        currentStudentName: null,
        startedAt: bulkTestProgress.get(assignmentKey)?.startedAt || new Date().toISOString(),
        completedAt: new Date().toISOString(),
        totalTime: `${totalTime}ms`,
        results: studentResults,
        success: true
      });

      console.log(`[BULK TEST] Completed bulk tests for assignment ${assignmentId} in ${totalTime}ms`);
    } catch (error) {
      console.error("Critical Bulk test error:", error);
      bulkTestProgress.set(assignmentKey, {
        running: false,
        error: error.message || "Error during bulk tests",
        failedAt: new Date().toISOString()
      });
    } finally {
      stopKeepAlive();
      runningTests.delete(assignmentKey);
    }
  });
};

// Run test cases for all submissions in an assignment
exports.runBulkTests = async (req, res) => {
  const bulkStartTime = Date.now();
  const { assignmentId } = req.params;
  const stopKeepAlive = startKeepAlive(req, `bulk-${assignmentId}`);

  // Prevent duplicate test runs
  if (runningTests.has(assignmentId)) {
    return res.status(409).json({ message: "Tests already running for this assignment. Please wait." });
  }
  runningTests.add(assignmentId);

  try {
    console.log(`[BULK TEST] Starting optimized bulk tests for assignment ${assignmentId} at ${new Date().toISOString()}`);

    // 1. Fetch all submissions and the test cases for this assignment
    const submissions = await Submission.findAll({
      where: { assignmentId },
      include: [{ model: User, as: "student", attributes: ['name'] }]
    });

    const testCases = await TestCase.findAll({
      where: { assignmentId },
      order: [['id', 'ASC']]
    });

    if (submissions.length === 0) {
      runningTests.delete(assignmentId);
      return res.json({ message: "No submissions found", results: [] });
    }

    console.log(`[BULK TEST] Processing ${submissions.length} submissions with ${testCases.length} test cases each`);

    // OPTIMIZATION 1: Fetch ALL code files for the entire assignment at once to reduce DB hits
    console.log(`[BULK TEST] Pre-fetching all code files for the assignment...`);
    const allCodeFiles = await CodeFile.findAll({
      where: { submissionId: submissions.map(s => s.id) }
    });

    // OPTIMIZATION 2: Clear previous test results in ONE bulk query upfront
    console.log(`[BULK TEST] Clearing previous test results for ${submissions.length} submissions...`);
    await TestResult.destroy({ where: { submissionId: submissions.map(s => s.id) } });
    console.log(`[BULK TEST] Test results cleared`);

    const submissionUpdates = [];
    const tempDirsToClean = [];

    // OPTIMIZATION 3: Set pLimit to 5
    const submissionLimiter = pLimit(1);

    const studentResults = await Promise.all(submissions.map((submission, index) =>
      submissionLimiter(async () => {
        const studentStartTime = Date.now();
        console.log(`[BULK TEST] [${index + 1}/${submissions.length}] Processing ${submission.student.name} (ID: ${submission.id})`);

        const tempDir = path.join(__dirname, `../../temp/bulk_${submission.id}_${Date.now()}`);
        tempDirsToClean.push(tempDir);
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        try {
          // OPTIMIZATION 4: Filter files from memory instead of individual DB queries
          const codeFiles = allCodeFiles.filter(f => f.submissionId === submission.id);
          const javaFiles = codeFiles.filter(f => f.fileName.endsWith(".java"));

          if (javaFiles.length === 0) {
            console.log(`  ✗ ${submission.student.name}: No Java files found`);
            submissionUpdates.push({ id: submission.id, marks: 0, status: 'no-code' });
            return { studentName: submission.student.name, status: 'no-code', passCount: 0, totalCount: testCases.length };
          }

          // Write all code files to disk
          for (const file of codeFiles) {
            writeSubmissionFileToTemp(tempDir, file.fileName, sanitizeJavaSource(file.fileContent));
          }

          // Compile all Java files ONCE before test loop
          let compileSuccess = true;
          try {
            const compileStart = Date.now();
            const javaFileNames = getJavaSourceArguments(javaFiles);
          await ensureJUnitJars();
          const classpath = getJavaClasspath(tempDir);
          execSync(`cd "${tempDir}" && ${JAVAC_CMD} -encoding UTF-8 -cp "${classpath}" -d "${tempDir}" ${javaFileNames}`, {
              timeout: 25000,
              stdio: 'pipe'
            });
            console.log(`  ✓ Compiled in ${Date.now() - compileStart}ms`);
          } catch (compileErr) {
            console.log(`  ✗ ${submission.student.name}: Compilation failed`);
            submissionUpdates.push({ id: submission.id, marks: 0, status: 'compilation-error' });
            compileSuccess = false;
          }

          if (!compileSuccess) {
            return { studentName: submission.student.name, status: 'compilation-error', passCount: 0, totalCount: testCases.length };
          }

          // Run test cases with internal concurrency control
          const testResultsToSave = [];
          const testLimiter = pLimit(1); // Internal test concurrency (Low to save RAM)

          const results = await Promise.all(testCases.map((testCase, caseIndex) =>
            testLimiter(async () => {
              let passed = false;
              let actualOutput = "";
              let errorMessage = "";

              try {
                const uniqueId = `${submission.id}_${caseIndex}`;
                const testClassName = `Test${uniqueId}`;
                const { imports, classMembers, body } = extractImportsFromTestCode(testCase.testCode);
                const autoImports = collectJavaTypeImports(javaFiles);
                const generatedFields = generateFieldDeclarations(body, classMembers);
                const mergedImports = [imports, autoImports].filter(Boolean).join('\n');
                const testCode = `${mergedImports ? mergedImports + '\n\n' : ''}public class ${testClassName} {
${generatedFields ? generatedFields + '\n' : ''}${classMembers ? classMembers + '\n' : ''}
                  public static void main(String[] args) {
                    new ${testClassName}().run();
                  }

                  private void run() {
                    try { 
                      ${transformJUnitStyle(body)} 
                      System.out.println("PASS"); 
                    } catch (Throwable e) { 
                      System.out.println("FAIL: " + e.getMessage()); 
                    }
                  }
                }`;
                fs.writeFileSync(path.join(tempDir, `${testClassName}.java`), testCode);

                await ensureJUnitJars();
                const classpath = getJavaClasspath(tempDir);
                actualOutput = execSync(`cd "${tempDir}" && ${JAVAC_CMD} -encoding UTF-8 -cp "${classpath}" -d "${tempDir}" ${testClassName}.java && ${JAVA_CMD} -cp "${classpath}" ${testClassName}`, {
                  encoding: "utf8",
                  timeout: 10000,
                  stdio: ['pipe', 'pipe', 'pipe']
                }).trim();

                passed = actualOutput.includes("PASS");
              } catch (execError) {
                errorMessage = execError.message || "Execution failed";
                passed = false;
              }

              testResultsToSave.push({
                submissionId: submission.id,
                testCaseId: testCase.id,
                passed,
                actualOutput: passed ? actualOutput : "",
                errorMessage: passed ? null : (errorMessage || "Assertion failed")
              });

              return { passed };
            })
          ));

          // Batch save all test results at once
          if (testResultsToSave.length > 0) {
            await fastBulkInsertResults(testResultsToSave);
          }

          // Calculate marks
          let totalMarksEarned = 0;
          for (let i = 0; i < results.length; i++) {
            if (results[i].passed) {
              totalMarksEarned += parseFloat(testCases[i].marks) || 0;
            }
          }

          const passCount = results.filter(r => r.passed).length;
          console.log(`  ✓ ${submission.student.name}: ${passCount}/${results.length} tests passed (${Date.now() - studentStartTime}ms)`);

          submissionUpdates.push({ id: submission.id, marks: totalMarksEarned, status: 'evaluated' });
          return { studentName: submission.student.name, status: 'success', passCount, totalCount: results.length, marksObtained: totalMarksEarned };

        } catch (err) {
          console.error(`Error processing submission ${submission.id}:`, err);
          submissionUpdates.push({ id: submission.id, marks: 0, status: 'error' });
          return { studentName: submission.student.name, status: 'error', error: err.message, passCount: 0, totalCount: testCases.length };
        }
      })
    ));

    // OPTIMIZATION 5: Update all submissions in a single transaction
    console.log(`[BULK TEST] Updating marks for ${submissionUpdates.length} submissions...`);
    if (submissionUpdates.length > 0) {
      await Submission.sequelize.transaction(async (t) => {
        for (const update of submissionUpdates) {
          await Submission.update(
            { marks: update.marks, status: update.status },
            { where: { id: update.id }, transaction: t }
          );
        }
      });
    }

    const totalTime = Date.now() - bulkStartTime;
    console.log(`[BULK TEST] Completed bulk tests in ${totalTime}ms`);

    res.json({
      message: "Bulk tests completed successfully",
      results: studentResults,
      totalTime: `${totalTime}ms`
    });

    // Clean up temp directories asynchronously
    setImmediate(() => {
      tempDirsToClean.forEach(dir => {
        try { safeDeletedir(dir); } catch (e) { console.warn(`Cleanup error for ${dir}:`, e.message); }
      });
    });

  } catch (error) {
    console.error("Critical Bulk test error:", error);
    res.status(500).json({ message: "Error during bulk tests: " + error.message });
  } finally {
    stopKeepAlive();
    runningTests.delete(assignmentId);
  }
};

// Run test cases for all submissions in an assignment - PARALLEL
exports.runTestCasesForAll = async (req, res) => {
  const startTime = Date.now();
  const stopKeepAlive = startKeepAlive(req, "run-all");
  try {
    const { assignmentId } = req.params;
    console.log(`[ALL TESTS] Starting parallel tests for assignment ${assignmentId}`);

    // Fetch all submissions for the assignment
    const submissions = await Submission.findAll({ where: { assignmentId } });

    if (submissions.length === 0) {
      return res.status(404).json({ message: "No submissions found for this assignment" });
    }

    // Clear old marks for all submissions
    await Submission.update({ marks: 0, status: "pending" }, { where: { assignmentId } });

    // Process all submissions in parallel
    const results = await Promise.all(submissions.map(async (submission) => {
      return new Promise((resolve) => {
        const fakeReq = { params: { submissionId: submission.id } };
        const fakeRes = {
          json: (data) => resolve(data),
          status: (code) => ({ json: (data) => resolve({ status: code, data }) })
        };
        exports.runTestCases(fakeReq, fakeRes).catch(err => {
          console.error(`Error in parallel test for submission ${submission.id}:`, err);
          resolve({ error: err.message });
        });
      });
    }));

    const totalTime = Date.now() - startTime;
    console.log(`[ALL TESTS] Completed all tests in ${totalTime}ms`);

    res.json({
      message: "Test cases executed for all submissions in parallel",
      results,
      totalSubmissions: submissions.length,
      totalTime: `${totalTime}ms`
    });
  } catch (error) {
    console.error("Error running test cases for all submissions:", error);
    res.status(500).json({ message: "Error running test cases for all submissions" });
  } finally {
    stopKeepAlive();
  }
};
