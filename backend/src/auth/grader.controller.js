const Submission = require("../models/submission");
const Assignment = require("../models/assignment");
const CodeFile = require("../models/codeFile");
const TestCase = require("../models/testCase");
const TestResult = require("../models/testResult");
const GraderSolution = require("../models/graderSolution");
const GraderSolutionFile = require("../models/graderSolutionFile");
const CourseUser = require("../models/courseUser");
const { Op } = require("sequelize");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");

// Detect Java executable path (handle both Windows and Unix)
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

const parseCourseId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const getAllowedCourseIds = async (userId) => {
  const links = await CourseUser.findAll({
    where: { userId },
    attributes: ["courseId", "role"],
  });
  return links
    .filter((l) => l.role === "grader" || l.role === "admin")
    .map((l) => l.courseId);
};

// Safe file cleanup with timeout
const safeDeletedir = (dirpath) => {
  try {
    if (fs.existsSync(dirpath)) {
      const files = fs.readdirSync(dirpath);
      files.forEach(file => {
        const curPath = path.join(dirpath, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          safeDeletedir(curPath);
        } else {
          try { fs.unlinkSync(curPath); } catch (e) {}
        }
      });
      try { fs.rmdirSync(dirpath); } catch (e) {}
    }
  } catch (e) {
    console.warn(`Failed to cleanup ${dirpath}:`, e.message);
  }
};

const JUNIT_LIB_DIR = path.join(__dirname, '../../lib');
const JUNIT_JARS = [
  {
    name: 'junit-4.13.2.jar',
    url: 'https://repo1.maven.org/maven2/junit/junit/4.13.2/junit-4.13.2.jar'
  },
  {
    name: 'hamcrest-core-1.3.jar',
    url: 'https://repo1.maven.org/maven2/org/hamcrest/hamcrest-core/1.3/hamcrest-core-1.3.jar'
  },
  {
    name: 'junit-platform-console-standalone-1.10.2.jar',
    url: 'https://repo1.maven.org/maven2/org/junit/platform/junit-platform-console-standalone/1.10.2/junit-platform-console-standalone-1.10.2.jar'
  }
];

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}, status ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
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
      console.log(`[grader] Downloading ${jar.name} from Maven central`);
      await downloadFile(jar.url, jarPath);
      console.log(`[grader] Download complete: ${jarPath}`);
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

  if (process.env.JUNIT_CLASSPATH) {
    cpItems.push(process.env.JUNIT_CLASSPATH);
  }

  return cpItems.join(path.delimiter);
};

// Remove JUnit imports from submitted code if junit libs are not available
const sanitizeJavaSource = (source) => {
  if (typeof source !== 'string') return source;
  return source.replace(/\r\n/g, '\n');
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
        // skip whitespace
        while (code[j] && /\s/.test(code[j])) j++;
        if (code[j] !== '(') continue;

        // find matching closing parenthesis
        let depth = 0;
        let k = j;
        for (; k < code.length; k++) {
          if (code[k] === '(') depth++;
          else if (code[k] === ')') { depth--; if (depth === 0) break; }
        }
        if (k >= code.length) continue; // unmatched, skip

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

        // advance i to after closing parenthesis
        i = k + 1;
        // skip optional semicolon
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

const normalizeStoredPath = (rawPath, fallbackName = 'uploaded-file') => {
  const originalValue = String(rawPath || fallbackName).trim();
  const normalizedParts = originalValue
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);

  if (normalizedParts.length === 0) {
    throw new Error('Uploaded file path is empty');
  }

  if (normalizedParts.some(segment => segment === '.' || segment === '..')) {
    throw new Error(`Invalid uploaded file path: ${originalValue}`);
  }

  return normalizedParts.join('/');
};

const writeSubmissionFileToTemp = (tempDir, storedPath, fileContent) => {
  const normalizedPath = normalizeStoredPath(storedPath, path.basename(String(storedPath || 'uploaded-file')));
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

// Get all assignments (for grader to select from)
exports.getAssignments = async (req, res) => {
  try {
    const requestedCourseId = parseCourseId(req.query.courseId);
    const allowedCourseIds = await getAllowedCourseIds(req.user.id);
    let where = {};
    if (requestedCourseId) {
      if (!allowedCourseIds.includes(requestedCourseId)) {
        return res.status(403).json({ message: "You do not have access to this course" });
      }
      where.courseId = requestedCourseId;
    } else if (allowedCourseIds.length > 0) {
      where.courseId = { [Op.in]: allowedCourseIds };
    } else {
      return res.json([]);
    }

    const assignments = await Assignment.findAll({ where });
    res.json(assignments);
  } catch (error) {
    console.error("Error fetching assignments:", error);
    res.status(500).json({ message: "Error fetching assignments" });
  }
};

// Get all submissions
exports.getAllSubmissions = async (req, res) => {
  try {
    const requestedCourseId = parseCourseId(req.query.courseId);
    const allowedCourseIds = await getAllowedCourseIds(req.user.id);
    let assignmentIds = [];
    if (requestedCourseId) {
      if (!allowedCourseIds.includes(requestedCourseId)) {
        return res.status(403).json({ message: "You do not have access to this course" });
      }
      const scopedAssignments = await Assignment.findAll({ where: { courseId: requestedCourseId }, attributes: ["id"] });
      assignmentIds = scopedAssignments.map((a) => a.id);
    } else {
      const scopedAssignments = await Assignment.findAll({ where: { courseId: { [Op.in]: allowedCourseIds } }, attributes: ["id"] });
      assignmentIds = scopedAssignments.map((a) => a.id);
    }

    if (assignmentIds.length === 0) {
      return res.json([]);
    }

    const submissions = await Submission.findAll({
      where: { assignmentId: { [Op.in]: assignmentIds } },
      include: [
        { model: Assignment, as: "assignment" },
        { model: CodeFile, as: "codeFiles" }
      ],
      order: [["id", "DESC"]]
    });
    res.json(submissions);
  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({ message: "Error fetching submissions" });
  }
};

// Get submissions for a specific assignment
exports.getSubmissionsByAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
      return res.json([]);
    }
    const allowedCourseIds = await getAllowedCourseIds(req.user.id);
    if (!allowedCourseIds.includes(assignment.courseId)) {
      return res.status(403).json({ message: "You do not have access to this course" });
    }
    const submissions = await Submission.findAll({
      where: { assignmentId },
      include: [
        { model: CodeFile, as: "codeFiles" }
      ],
      order: [["id", "DESC"]]
    });

    return res.json(submissions || []); 
  } catch (error) {
    console.error("Error fetching submissions:", error);
    return res.json([]); 
  }
};

// Run test cases on a submission

exports.runTestCases = async (req, res) => {
  try {
    const { submissionId } = req.params;

    const submission = await Submission.findByPk(submissionId, {
      include: [{ model: CodeFile, as: "codeFiles" }]
    });

    if (!submission) return res.status(404).json({ message: "Submission not found" });

    const testCases = await TestCase.findAll({
      where: { assignmentId: submission.assignmentId }
    });

    if (testCases.length === 0) {
      return res.json({ message: "No test cases defined", results: [] });
    }

    const codeFiles = submission.codeFiles;
    const javaFiles = codeFiles.filter(f => f.fileName.endsWith(".java"));
    
    console.log("[grader.runTestCases] Submission:", submissionId);
    console.log("[grader.runTestCases] Total codeFiles:", codeFiles.length, "Files:", codeFiles.map(f => f.fileName));
    console.log("[grader.runTestCases] Filtered javaFiles:", javaFiles.length, "Files:", javaFiles.map(f => f.fileName));
    if (javaFiles.length === 0) {
      return res.status(404).json({ message: "No Java files found in submission" });
    }

    const results = [];
    const tempDir = path.join(__dirname, "../../temp", `submission_${submissionId}_${Date.now()}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Write student Java files
      for (const codeFile of javaFiles) {
        writeSubmissionFileToTemp(tempDir, codeFile.fileName, sanitizeJavaSource(codeFile.fileContent));
      }

      // [STEP 1] Ensure junit/hamcrest libs exist and compile all student Java files together
      try {
        await ensureJUnitJars();
        const javaFileNames = getJavaSourceArguments(javaFiles);
        const classpath = getJavaClasspath(tempDir);
        console.log("[grader] javac classpath:", classpath);
        execSync(`cd "${tempDir}" && ${JAVAC_CMD} -encoding UTF-8 -cp "${classpath}" -d "${tempDir}" ${javaFileNames}`, { 
          timeout: 20000, 
          stdio: ['pipe', 'pipe', 'pipe'],
          maxBuffer: 5 * 1024 * 1024
        });
      } catch (compileErr) {
        const errorMsg = compileErr.stderr ? compileErr.stderr.toString() : compileErr.message;
        return res.json({ 
          message: "Compilation failed", 
          error: errorMsg,
          results: [],
          submissionId
        });
      }

      // [STEP 2] Run each test case individually
      for (const testCase of testCases) {
        let passed = false;
        let actualOutput = "";
        let errorMessage = "";

        try {
          const uniqueId = Date.now() + Math.random().toString().replace('.', '');
          const testClassName = `Test${uniqueId}`;
          const { imports, classMembers, body } = extractImportsFromTestCode(testCase.testCode);
          console.log("[grader.runTestCases] Generating test for:", testCase.testName, "javaFiles:", javaFiles.map(f => f.fileName));
          const fieldDecls = generateFieldDeclarations(body, classMembers);
          const autoImports = collectJavaTypeImports(javaFiles);
          const mergedImports = [imports, autoImports].filter(Boolean).join('\n');
          console.log("[grader.runTestCases] fieldDecls:", fieldDecls);
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
          fs.writeFileSync(path.join(tempDir, `${testClassName}.java`), testCode);

          // Compile and run the harness
          const classpath = getJavaClasspath(tempDir);
          console.log("[grader] test compile classpath:", classpath);
          const cmd = `cd "${tempDir}" && ${JAVAC_CMD} -encoding UTF-8 -cp "${classpath}" -d "${tempDir}" ${testClassName}.java && ${JAVA_CMD} -cp "${classpath}" ${testClassName}`;
          console.log("[grader] running command:", cmd);
          actualOutput = execSync(cmd, {
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
            timeout: 20000,
            maxBuffer: 5 * 1024 * 1024
          }).trim();

          passed = actualOutput.includes("PASS");
        } catch (execError) {
          errorMessage = execError.stderr ? execError.stderr.toString() : execError.message;
          passed = false;
        }

        if (!passed && !errorMessage && typeof actualOutput === "string" && actualOutput.trim() !== "") {
          errorMessage = actualOutput.trim();
        }

        results.push({
          testName: testCase.testName,
          passed,
          actualOutput,
          expectedOutput: testCase.expectedOutput,
          errorMessage: passed ? null : errorMessage,
          marks: testCase.marks
        });
      }

      // [STEP 3] Update Submission Marks
      let totalMarksEarned = 0;
      results.forEach((r) => { if (r.passed) totalMarksEarned += parseFloat(r.marks) || 0; });
      await submission.update({ marks: totalMarksEarned, status: "evaluated" });

      res.json({
        message: "Tests completed",
        results,
        submissionId,
        marksObtained: totalMarksEarned,
        passCount: results.filter(r => r.passed).length,
        totalCount: results.length
      });

    } finally {
      if (fs.existsSync(tempDir)) safeDeletedir(tempDir);
    }
  } catch (error) {
    res.status(500).json({ message: "Error running tests: " + error.message });
  }
};

// Provide feedback on a submission
exports.provideFeedback = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { feedback, marks } = req.body;
    const graderId = req.user.id;

    if (!feedback || marks === undefined) {
      return res.status(400).json({ message: "Feedback and marks required" });
    }

    const submission = await Submission.findByPk(submissionId);
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    // Update submission marks and status
    await submission.update({
      marks: parseFloat(marks),
      status: "graded"
    });

    res.json({
      message: "Feedback provided successfully",
      submission
    });
  } catch (error) {
    console.error("Error providing feedback:", error);
    res.status(500).json({ message: "Error providing feedback" });
  }
};

// Get feedback for a submission
exports.getSubmissionFeedback = async (req, res) => {
  try {
    const { submissionId } = req.params;

    const submission = await Submission.findByPk(submissionId);
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    const testResults = await TestResult.findAll({
      where: { submissionId },
      include: [{ model: TestCase, as: "testCase" }]
    });

    res.json({
      submission,
      testResults
    });
  } catch (error) {
    console.error("Error fetching feedback:", error);
    res.status(500).json({ message: "Error fetching feedback" });
  }
};

// Get submission details for grading
exports.getSubmissionForGrading = async (req, res) => {
  try {
    const { submissionId } = req.params;

    const submission = await Submission.findByPk(submissionId, {
      include: [
        { model: CodeFile, as: "codeFiles" },
        { model: TestResult, as: "testResults" }
      ]
    });

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    res.json(submission);
  } catch (error) {
    console.error("Error fetching submission:", error);
    res.status(500).json({ message: "Error fetching submission" });
  }
};

// Get submission code/files
exports.getSubmissionCode = async (req, res) => {
  try {
    const { submissionId, fileId } = req.params;

    const submission = await Submission.findByPk(submissionId);
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    if (fileId) {
      const codeFile = await CodeFile.findOne({
        where: { id: fileId, submissionId }
      });
      if (!codeFile) {
        return res.status(404).json({ message: "Code file not found" });
      }
      return res.json(codeFile);
    }

    // Return all files for this submission
    const codeFiles = await CodeFile.findAll({
      where: { submissionId }
    });

    res.json(codeFiles);
  } catch (error) {
    console.error("Error fetching code:", error);
    res.status(500).json({ message: "Error fetching code" });
  }
};

// Update submission status
exports.updateSubmissionStatus = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { status } = req.body;

    const submission = await Submission.findByPk(submissionId);
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    await submission.update({ status });

    res.json({
      message: "Submission status updated",
      submission
    });
  } catch (error) {
    console.error("Error updating submission:", error);
    res.status(500).json({ message: "Error updating submission" });
  }
};
// Upload grader's own solution
exports.uploadGraderSolution = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const graderId = req.user.id;
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files provided" });
    }

    // Create grader solution record
    const solution = await GraderSolution.create({
      assignmentId: parseInt(assignmentId),
      graderId
    });

    const uploadedPaths = Array.isArray(req.body?.paths)
      ? req.body.paths
      : req.body?.paths
        ? [req.body.paths]
        : [];

    // Save all files
    const savedFiles = await Promise.all(
      req.files.map((file, index) => 
        GraderSolutionFile.create({
          solutionId: solution.id,
          fileName: normalizeStoredPath(uploadedPaths[index] || file.originalname, file.originalname),
          fileContent: file.buffer.toString('utf-8')
        })
      )
    );

    const files = savedFiles.map(f => ({
      id: f.id,
      fileName: f.fileName,
      fileContent: f.fileContent
    }));

    res.json({
      message: "Solutions uploaded successfully",
      solutionId: solution.id,
      files,
      fileCount: files.length
    });
  } catch (error) {
    console.error("Error uploading solution:", error);
    res.status(500).json({ message: "Error uploading solution" });
  }
};

// Run test cases for grader's solution (supports multiple files)
exports.runGraderTests = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { solutionFiles, solutionId, solutionContent, fileName } = req.body;

    // 1. Prepare file list based on input type
    let files = [];
    if (solutionId) {
      const solution = await GraderSolution.findByPk(parseInt(solutionId), {
        include: [{ model: GraderSolutionFile, as: 'files' }]
      });
      if (!solution) return res.status(404).json({ message: "Solution not found" });
      files = solution.files.map(f => ({ fileName: f.fileName, fileContent: f.fileContent }));
    } else if (solutionFiles && Array.isArray(solutionFiles)) {
      files = solutionFiles;
    } else if (solutionContent && fileName) {
      files = [{ fileName, fileContent: solutionContent }];
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No solution files provided" });
    }

    // 2. Fetch Test Cases
    const testCases = await TestCase.findAll({ where: { assignmentId } });
    if (testCases.length === 0) {
      return res.json({ message: "No test cases found", results: [] });
    }

    const tempDir = path.join(__dirname, '../../temp', `grader_test_${Date.now()}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const results = [];
    let passCount = 0;

    try {
      // 3. Write all files to temp directory
      for (const file of files) {
        writeSubmissionFileToTemp(tempDir, file.fileName, sanitizeJavaSource(file.fileContent));
      }

      // 4. Identify Main Language
      const mainFile = files.find(f => 
        f.fileName.endsWith('.java') || f.fileName.endsWith('.py') || f.fileName.endsWith('.js')
      ) || files[0];
      const fileExt = path.extname(mainFile.fileName);

      // =========================================
      // OPTIMIZATION: Compile Java ONCE here
      // =========================================
      if (fileExt === '.java') {
        const javaFiles = files.filter(f => f.fileName.endsWith('.java'));
        const javaFileNames = getJavaSourceArguments(javaFiles);
        
        try {
          await ensureJUnitJars();
          const classpath = getJavaClasspath(tempDir);
          // Compile all solution files
          execSync(`cd "${tempDir}" && ${JAVAC_CMD} -encoding UTF-8 -cp "${classpath}" -d "${tempDir}" ${javaFileNames}`, { 
            timeout: 20000,
            stdio: ['pipe', 'pipe', 'pipe'],
            maxBuffer: 1 * 1024 * 1024
          });
        } catch (compileErr) {
          // If compilation fails, stop immediately and return error
          return res.json({ 
            message: "Solution Compilation Failed", 
            error: compileErr.stderr?.toString() || compileErr.message,
            results: []
          });
        }
      }

      // 5. Run Test Cases
      for (const testCase of testCases) {
        let testPassed = false;
        let errorMessage = "";
        let output = "";

        try {
          if (fileExt === '.java') {
            const uniqueId = Date.now() + Math.random().toString().replace('.', '');
            const testClassName = `Test${uniqueId}`;
            const { imports, classMembers, body } = extractImportsFromTestCode(testCase.testCode);
            const generatedFields = generateFieldDeclarations(body, classMembers);
            const autoImports = collectJavaTypeImports(files.filter(f => f.fileName.endsWith('.java')));
            const mergedImports = [imports, autoImports].filter(Boolean).join('\n');
            
            // Generate Test Harness
            const testCode = `${mergedImports ? mergedImports + '\n\n' : ''}public class ${testClassName} {
${generatedFields ? generatedFields + '\n' : ''}${classMembers ? classMembers + '\n' : ''}
              public static void main(String[] args) {
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
                  e.printStackTrace();
                }
              }
            }`;
            
            fs.writeFileSync(path.join(tempDir, `${testClassName}.java`), testCode);

            // Compile and Run only the harness (linking to pre-compiled solution)
            const classpath = getJavaClasspath(tempDir);
            output = execSync(`cd "${tempDir}" && ${JAVAC_CMD} -encoding UTF-8 -cp "${classpath}" -d "${tempDir}" ${testClassName}.java && ${JAVA_CMD} -cp "${classpath}" ${testClassName}`, { 
              timeout: 20000,
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe'],
              maxBuffer: 1 * 1024 * 1024
            }).trim();
            
            testPassed = output.includes("PASS");

          } else if (fileExt === '.py') {
             const uniqueId = Date.now();
             const testFileName = `test${uniqueId}.py`;
             const testCode = `try:\n    ${testCase.testCode.replace(/\n/g, '\\n')}\n    print("PASS")\nexcept AssertionError as e:\n    print("FAIL: " + str(e))\nexcept Exception as e:\n    print("FAIL: " + str(e))\n`;
             fs.writeFileSync(path.join(tempDir, testFileName), testCode);
             
             output = execSync(`cd "${tempDir}" && python ${testFileName}`, { 
               timeout: 20000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 5 * 1024 * 1024
             }).trim();
             testPassed = output.includes("PASS");

          } else if (fileExt === '.js') {
             const uniqueId = Date.now();
             const testFileName = `test${uniqueId}.js`;
             const testCode = `try {\n    ${testCase.testCode.replace(/\n/g, '\\n')}\n    console.log("PASS");\n} catch (e) {\n    console.log("FAIL: " + e.message);\n}\n`;
             fs.writeFileSync(path.join(tempDir, testFileName), testCode);
             
             output = execSync(`cd "${tempDir}" && node ${testFileName}`, { 
               timeout: 20000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 5 * 1024 * 1024
             }).trim();
             testPassed = output.includes("PASS");
          }
        } catch (execError) {
          testPassed = false;
          errorMessage = execError.stderr?.toString() || execError.message || "Execution error";
        }

        if (testPassed) passCount++;

        results.push({
          testName: testCase.testName,
          passed: testPassed,
          errorMessage: testPassed ? null : errorMessage,
          marks: testCase.marks
        });
      }

      res.json({
        message: "Tests completed",
        results,
        passCount,
        totalCount: testCases.length
      });

    } finally {
      if (fs.existsSync(tempDir)) safeDeletedir(tempDir);
    }
  } catch (error) {
    console.error("Error running grader tests:", error);
    res.status(500).json({ message: "Error running tests: " + error.message });
  }
};

// Get grader's uploaded solutions for an assignment
exports.getGraderSolutions = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const graderId = req.user.id;

    const solutions = await GraderSolution.findAll({
      where: { 
        assignmentId: parseInt(assignmentId),
        graderId 
      },
      include: [{
        model: GraderSolutionFile,
        as: 'files',
        attributes: ['id', 'fileName']
      }],
      order: [['uploadedAt', 'DESC']]
    });

    res.json(solutions || []);
  } catch (error) {
    console.error("Error fetching solutions:", error);
    res.status(500).json({ message: "Error fetching solutions" });
  }
};

// Get specific solution with files
exports.getGraderSolution = async (req, res) => {
  try {
    const { solutionId } = req.params;
    const graderId = req.user.id;

    const solution = await GraderSolution.findOne({
      where: { 
        id: parseInt(solutionId),
        graderId 
      },
      include: [{
        model: GraderSolutionFile,
        as: 'files'
      }]
    });

    if (!solution) {
      return res.status(404).json({ message: "Solution not found" });
    }

    res.json(solution);
  } catch (error) {
    console.error("Error fetching solution:", error);
    res.status(500).json({ message: "Error fetching solution" });
  }
};

// Get specific file from solution
exports.getGraderSolutionFile = async (req, res) => {
  try {
    const { solutionId, fileId } = req.params;
    const graderId = req.user.id;

    const solution = await GraderSolution.findOne({
      where: { 
        id: parseInt(solutionId),
        graderId 
      }
    });

    if (!solution) {
      return res.status(404).json({ message: "Solution not found" });
    }

    const file = await GraderSolutionFile.findOne({
      where: {
        id: parseInt(fileId),
        solutionId: parseInt(solutionId)
      }
    });

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    res.json(file);
  } catch (error) {
    console.error("Error fetching file:", error);
    res.status(500).json({ message: "Error fetching file" });
  }
};

// Delete solution and all its files
exports.deleteGraderSolution = async (req, res) => {
  try {
    const { solutionId } = req.params;
    const graderId = req.user.id;

    const solution = await GraderSolution.findOne({
      where: { 
        id: parseInt(solutionId),
        graderId 
      }
    });

    if (!solution) {
      return res.status(404).json({ message: "Solution not found" });
    }

    // Delete all files first
    await GraderSolutionFile.destroy({
      where: { solutionId: parseInt(solutionId) }
    });

    // Delete solution
    await solution.destroy();

    res.json({ message: "Solution deleted successfully" });
  } catch (error) {
    console.error("Error deleting solution:", error);
    res.status(500).json({ message: "Error deleting solution" });
  }
};

// Delete specific file from solution
exports.deleteGraderSolutionFile = async (req, res) => {
  try {
    const { solutionId, fileId } = req.params;
    const graderId = req.user.id;

    const solution = await GraderSolution.findOne({
      where: { 
        id: parseInt(solutionId),
        graderId 
      }
    });

    if (!solution) {
      return res.status(404).json({ message: "Solution not found" });
    }

    const file = await GraderSolutionFile.findOne({
      where: {
        id: parseInt(fileId),
        solutionId: parseInt(solutionId)
      }
    });

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    await file.destroy();

    // Get remaining files
    const remainingFiles = await GraderSolutionFile.findAll({
      where: { solutionId: parseInt(solutionId) }
    });

    res.json({ 
      message: "File deleted successfully",
      remainingFiles 
    });
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).json({ message: "Error deleting file" });
  }
};
