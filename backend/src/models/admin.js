// Mock data for courses
let courses = [
  {
    id: 1,
    name: "Introduction to Programming",
    code: "CS101",
    instructor: 101,
    semester: "Spring 2025",
    description: "Learn the basics of programming",
    createdAt: new Date(),
  },
  {
    id: 2,
    name: "Data Structures",
    code: "CS201",
    instructor: 102,
    semester: "Spring 2025",
    description: "Advanced data structures and algorithms",
    createdAt: new Date(),
  },
];

let nextCourseId = 3;

// Mock data for enrollments
let enrollments = [
  { studentId: 1, courseId: 1 },
  { studentId: 2, courseId: 1 },
  { studentId: 3, courseId: 1 },
  { studentId: 1, courseId: 2 },
];

// Mock data for course assignments to graders
let graderAssignments = [
  { courseId: 1, graderId: 101 },
  { courseId: 1, graderId: 103 },
  { courseId: 2, graderId: 102 },
];

exports.getAllCourses = () => {
  return courses;
};

exports.getCourseById = (id) => {
  return courses.find(c => c.id === id);
};

exports.createCourse = (courseData) => {
  const newCourse = {
    id: nextCourseId++,
    ...courseData,
    createdAt: new Date(),
  };
  courses.push(newCourse);
  return newCourse;
};

exports.updateCourse = (id, courseData) => {
  const course = courses.find(c => c.id === id);
  if (course) {
    Object.assign(course, courseData);
  }
  return course;
};

exports.deleteCourse = (id) => {
  courses = courses.filter(c => c.id !== id);
};

exports.enrollStudent = (studentId, courseId) => {
  if (!enrollments.some(e => e.studentId === studentId && e.courseId === courseId)) {
    enrollments.push({ studentId, courseId });
  }
};

exports.getEnrolledStudents = (courseId) => {
  return enrollments.filter(e => e.courseId === courseId).map(e => e.studentId);
};

exports.assignGraderToCourse = (courseId, graderId) => {
  if (!graderAssignments.some(g => g.courseId === courseId && g.graderId === graderId)) {
    graderAssignments.push({ courseId, graderId });
  }
};

exports.getGradersForCourse = (courseId) => {
  return graderAssignments.filter(g => g.courseId === courseId).map(g => g.graderId);
};

exports.getCoursesForGrader = (graderId) => {
  const courseIds = graderAssignments
    .filter(g => g.graderId === graderId)
    .map(g => g.courseId);
  return courses.filter(c => courseIds.includes(c.id));
};

exports.removeGraderFromCourse = (courseId, graderId) => {
  graderAssignments = graderAssignments.filter(
    g => !(g.courseId === courseId && g.graderId === graderId)
  );
};
