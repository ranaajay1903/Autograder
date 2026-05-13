import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import Modal from "../components/Modal";
import StudentDetail from "./studentDetail";
import api, { logout } from "../services/auth";
import "./admin.css";
import "./dashboard.css";

// Helper function: Convert IST time (user input) to UTC ISO string for storage
const convertISTToUTC = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;
  
  // Create a UTC-based date first (by treating input as UTC initially)
  const utcString = `${dateStr}T${timeStr}:00Z`;
  const tempDate = new Date(utcString); // This treats as UTC
  
  // Now subtract 5:30 hours to convert from IST to UTC
  // Because: 18:30 IST = 13:00 UTC (subtract 5:30)
  const utcDate = new Date(tempDate.getTime() - (5.5 * 60 * 60 * 1000));
  
  return utcDate.toISOString();
};

// Helper function: Convert UTC time to IST display string
const convertUTCToIST = (dateStr) => {
  if (!dateStr) return null;
  
  const date = new Date(dateStr);
  
  // Add 5 hours 30 minutes to convert UTC to IST
  date.setTime(date.getTime() + (5.5 * 60 * 60 * 1000));
  
  return date.toISOString();
};

// Helper function: Convert UTC ISO string to YYYY-MM-DDTHH:MM format for IST display in inputs
const convertUTCToISTForInputs = (utcDateStr) => {
  if (!utcDateStr) return '';
  
  const date = new Date(utcDateStr);
  // Add 5 hours 30 minutes to get IST
  date.setTime(date.getTime() + (5.5 * 60 * 60 * 1000));
  
  const iso = date.toISOString();
  return iso.split('.')[0]; // Return YYYY-MM-DDTHH:MM:SS format, which we'll split for inputs
};

// Helper function: Format IST display from local time input
const formatISTDisplay = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;
  
  const [year, month, day] = dateStr.split('-');
  const [hours, minutes] = timeStr.split(':');
  
  // Create date treating input as IST
  const istDate = new Date(year, month - 1, day, parseInt(hours), parseInt(minutes), 0);
  
  // Format for display
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  
  const formatted = `${dayOfWeek[istDate.getDay()]}, ${istDate.getDate()} ${monthNames[istDate.getMonth()]} ${istDate.getFullYear()} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  
  return formatted;
};

// Helper function: Display UTC time as IST for assignments list
const displayDateAsIST = (utcDateStr) => {
  if (!utcDateStr) return '';
  
  const date = new Date(utcDateStr);
  // Add 5 hours 30 minutes to convert UTC to IST
  date.setTime(date.getTime());
  
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day} ${month} ${year} ${hours}:${minutes}`;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [submissions, setSubmissions] = useState([]);

  const [activeTab, setActiveTab] = useState("assignments");
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [detailsTab, setDetailsTab] = useState("submissions");
  const [showStudentDetail, setShowStudentDetail] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const token = localStorage.getItem("token");
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Apply dark theme by default
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');

    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch {
        setCurrentUser(null);
      }
    }
  }, []);

  // Course and data states
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(() => {
    const saved = localStorage.getItem("selectedCourseId");
    return saved ? parseInt(saved) : null;
  });
  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  useEffect(() => {
    const fromQuery = parseInt(searchParams.get("courseId"), 10);
    if (!Number.isNaN(fromQuery) && fromQuery > 0) {
      setSelectedCourseId(fromQuery);
      localStorage.setItem("selectedCourseId", String(fromQuery));
    }
  }, [searchParams]);

  // Form states
  const [newAssignment, setNewAssignment] = useState({ title: "", description: "", dueDate: "", totalMarks: 100 });
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [newUser, setNewUser] = useState({ email: "", name: "", role: "student" });
  const [newCourse, setNewCourse] = useState({ name: "", code: "", description: "" });
  const [studentSearchInput, setStudentSearchInput] = useState("");
  const [graderSearchInput, setGraderSearchInput] = useState("");
  const [adminSearchInput, setAdminSearchInput] = useState("");
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [graderSearchQuery, setGraderSearchQuery] = useState("");
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [selectedUserRole, setSelectedUserRole] = useState("");
  const [submissionMarks, setSubmissionMarks] = useState("");
  const [testResults, setTestResults] = useState(null);
  const [runningSubmissionId, setRunningSubmissionId] = useState(null);
  const [bulkTestsRunning, setBulkTestsRunning] = useState(false);
  const [bulkTestResults, setBulkTestResults] = useState(null);
  const [bulkProcessedCount, setBulkProcessedCount] = useState(0);
  const [bulkTotalCount, setBulkTotalCount] = useState(0);
  const [bulkCurrentStudentName, setBulkCurrentStudentName] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalType, setModalType] = useState("info");
  const [modalActions, setModalActions] = useState([]);
  const keepAliveIntervalRef = useRef(null);
  const bulkProgressIntervalRef = useRef(null);
  const studentSearchRef = useRef(null);
  const graderSearchRef = useRef(null);
  const adminSearchRef = useRef(null);

  const showModal = (title, message, type = "info", actions = []) => {
    setModalTitle(title || "");
    setModalMessage(message || "");
    setModalType(type || "info");
    setModalActions(actions || []);
    setIsModalOpen(true);
  };

  const stopKeepAlivePings = () => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
  };

  const startKeepAlivePings = () => {
    stopKeepAlivePings();
    const ping = async () => {
      try {
        await api.get("/health");
      } catch (_) {
        // Keep-alive is best-effort; do not block test execution flow.
      }
    };

    // Send one ping immediately, then every 4 minutes (Render free sleeps after 15 minutes idle).
    ping();
    keepAliveIntervalRef.current = setInterval(ping, 2 * 60 * 1000);
  };

  const stopBulkProgressPolling = () => {
    if (bulkProgressIntervalRef.current) {
      clearInterval(bulkProgressIntervalRef.current);
      bulkProgressIntervalRef.current = null;
    }
  };

  const startBulkProgressPolling = (assignmentId) => {
    stopBulkProgressPolling();
    let lastProgressTime = Date.now();
    let hasShownCompletion = false;

    const poll = async () => {
      try {
        const response = await api.get(`/admin/page/submissions-list/${assignmentId}/run-all-tests/status`);
        const progress = response.data || {};
        
        // Update progress state
        setBulkProcessedCount(progress.processedCount || 0);
        setBulkTotalCount(progress.totalCount || 0);
        setBulkCurrentStudentName(progress.currentStudentName || "");
        lastProgressTime = Date.now();

        // Handle completion
        if (!progress.running && bulkProgressIntervalRef.current) {
          stopBulkProgressPolling();
          setBulkTestsRunning(false);
          
          // Show completion message and refresh data
          if (!hasShownCompletion) {
            hasShownCompletion = true;
            
            if (progress.error) {
              setError(`Tests failed: ${progress.error}`);
            } else {
              setError("");
              if (progress.totalCount > 0) {
                showModal("Success", `✅ Bulk tests completed!\n${progress.totalCount} student(s) processed\nTime: ${progress.totalTime || "Unknown"}`);
              }
            }

            // Refresh submissions data after tests complete
            if (selectedAssignment) {
              try {
                const submissionsRes = await api.get(`/admin/page/submissions-list/${selectedAssignment.id}`);
                if (submissionsRes.status === 200) {
                  setSubmissions(submissionsRes.data);
                }
              } catch (err) {
                console.error("Error refreshing submissions after bulk tests:", err);
              }
            }
          }
        }
      } catch (err) {
        console.error("Error polling progress:", err);
        // Continue polling even if there's an error (server might be busy)
      }
    };

    // Poll immediately, then every 500ms (faster updates for better UX)
    poll();
    bulkProgressIntervalRef.current = setInterval(poll, 500);
  };

  // Fetch user's courses
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await api.get("/courses/my-courses");
        let allCourses = [];

        const payload = response.data || {};
        if (Array.isArray(payload)) {
          allCourses = payload;
        } else if (Array.isArray(payload.courses)) {
          allCourses = payload.courses;
        } else {
          const created = Array.isArray(payload.createdCourses) ? payload.createdCourses : [];
          const enrolled = Array.isArray(payload.enrolledCourses) ? payload.enrolledCourses : [];
          allCourses = [...created, ...enrolled];
        }
        
        setCourses(allCourses);

        if (allCourses.length > 0) {
          const validSelectedCourseId = Number.isInteger(selectedCourseId)
            ? allCourses.find(c => c.id === selectedCourseId)?.id
            : null;

          const courseToUse = validSelectedCourseId
            ? allCourses.find(c => c.id === validSelectedCourseId)
            : allCourses[0];

          if (courseToUse) {
            setSelectedCourseId(courseToUse.id);
            localStorage.setItem("selectedCourseId", courseToUse.id.toString());
          } else {
            setSelectedCourseId(allCourses[0].id);
            localStorage.setItem("selectedCourseId", allCourses[0].id.toString());
          }
        } else {
          localStorage.removeItem("selectedCourseId");
        }
      } catch (err) {
        console.error("Error fetching courses:", err);
        setError("Failed to load courses");
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, [token]);

  // Fetch all data
  useEffect(() => {
    if (!selectedCourseId) return;
    fetchAllData();
  }, [token, selectedCourseId]);

  useEffect(() => {
    return () => {
      stopKeepAlivePings();
      stopBulkProgressPolling();
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "users") return;

    requestAnimationFrame(() => {
      studentSearchRef.current?.blur();
      graderSearchRef.current?.blur();
      adminSearchRef.current?.blur();
    });
  }, [activeTab]);

  // Respond to route params: assignmentId -> open assignment, submissionId -> open student detail
  useEffect(() => {
    if (!params) return;
    const { assignmentId, submissionId } = params;

    if (assignmentId && assignments.length > 0) {
      const found = assignments.find(a => String(a.id) === String(assignmentId));
      if (found) setSelectedAssignment(found);
    }

    if (submissionId) {
      (async () => {
        try {
          const res = await api.get(`/admin/page/grade-submission/${submissionId}`);
          const submission = res.data;
          // Ensure selected assignment is set (if possible)
          if (submission.assignmentId && assignments.length > 0) {
            const a = assignments.find(x => String(x.id) === String(submission.assignmentId));
            if (a) setSelectedAssignment(a);
          }
          setSelectedSubmission(submission);
          setShowStudentDetail(true);
        } catch (err) {
          console.error("Error fetching submission by param", err);
        }
      })();
    }
  }, [params, assignments]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const courseIdParam = `?courseId=${selectedCourseId}`;
      const [statsRes, assignRes, usersRes, submissionsRes] = await Promise.all([
        api.get(`/admin/page/dashboard${courseIdParam}`),
        api.get(`/admin/page/assignments-list${courseIdParam}`),
        api.get(`/admin/page/users-management${courseIdParam}`),
        api.get(`/admin/page/submissions-list${courseIdParam}`),
      ]);

      setStats(statsRes.data);
      setAssignments(assignRes.data);
      setUsers(usersRes.data);
      setSubmissions(submissionsRes.data);
    } catch (err) {
      setError("Error loading data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Create new assignment
  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    if (!newAssignment.title || !newAssignment.dueDate) {
      setError("Title and due date required");
      return;
    }

    try {
      // Convert IST time to UTC for backend storage
      const [dateStr, timeStr] = newAssignment.dueDate.split('T');
      const utcDate = convertISTToUTC(dateStr, timeStr);

      const response = await api.post(`/admin/page/assignments-list?courseId=${selectedCourseId}`, {
        ...newAssignment,
        dueDate: utcDate
      });
      const data = response.data;
      setAssignments([...assignments, data.assignment]);
      setNewAssignment({ title: "", description: "", dueDate: "", totalMarks: 100 });
      setError("");
      showModal("Success", "Assignment created successfully!", "success");
      fetchAllData();
    } catch (err) {
      setError("Error creating assignment: " + err.message);
    }
  };

  // Create new course
  const handleCreateCourse = async (e) => {
    e.preventDefault();
    if (!newCourse.name) {
      setError("Course name is required");
      return;
    }

    try {
      const response = await api.post("/courses", newCourse);
      const data = response.data;
      // Refetch courses to ensure consistency
      const coursesResponse = await api.get("/courses/my-courses");
      let allCourses = [];
      if (coursesResponse.data.createdCourses) {
        allCourses = coursesResponse.data.courses || [...coursesResponse.data.createdCourses, ...coursesResponse.data.enrolledCourses];
      } else {
        allCourses = coursesResponse.data;
      }
      setCourses(allCourses);
      setNewCourse({ name: "", code: "", description: "" });
      setSelectedCourseId(data.course.id);
      localStorage.setItem("selectedCourseId", data.course.id.toString());
      setError("");
      showModal("Success", "Course created successfully!", "success");
      await fetchAllData();
    } catch (err) {
      setError("Error creating course: " + err.message);
    }
  };

  // Edit assignment
  const handleEditAssignment = (assignment) => {
    // Convert UTC dueDate to IST for display in form inputs
    const istDateTime = convertUTCToISTForInputs(assignment.dueDate);
    setEditingAssignment({ 
      ...assignment,
      dueDate: istDateTime // This is now in YYYY-MM-DDTHH:MM:SS format representing IST time
    });
  };

  // Update assignment
  const handleUpdateAssignment = async () => {
    if (!editingAssignment.title || !editingAssignment.dueDate) {
      setError("Title and due date required");
      return;
    }

    try {
      // Convert IST time to UTC for backend storage
      const [dateStr, timeStr] = editingAssignment.dueDate.split('T');
      const utcDate = convertISTToUTC(dateStr, timeStr);

      const response = await api.patch(`/admin/page/assignments-list/${editingAssignment.id}?courseId=${selectedCourseId}`, {
        title: editingAssignment.title,
        description: editingAssignment.description,
        dueDate: utcDate,
        totalMarks: editingAssignment.totalMarks
      });

      const data = response.data;
      setAssignments(assignments.map(a => a.id === editingAssignment.id ? data.assignment : a));
      setEditingAssignment(null);
      setSelectedAssignment(null);
      setError("");
      showModal("Success", "Assignment updated successfully!", "success");
      fetchAllData();
    } catch (err) {
      setError("Error updating assignment: " + err.message);
    }
  };

  // Cancel edit
  const handleCancelEdit = () => {
    setEditingAssignment(null);
  };

  // Create new user
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.email || !newUser.name) {
      setError("Email and name required");
      return;
    }

    try {
      const response = await api.post(`/admin/page/users-management?courseId=${selectedCourseId}`, newUser);
      const data = response.data;
      setUsers([...users, data.user]);
      setNewUser({ email: "", name: "", role: "student" });
      setError("");
      showModal("Success", `User created! Temp password: ${data.user.tempPassword}`, "success");
      fetchAllData();
    } catch (err) {
      setError("Error creating user: " + err.message);
    }
  };

  // Update user role
  const handleUpdateUserRole = async (userId, role) => {
    try {
      const response = await api.patch(`/admin/page/users-management/${userId}/role?courseId=${selectedCourseId}`, { role });
      const data = response.data;
      setUsers(users.map(u => u.id === userId ? data.user : u));
      showModal("User Role Updated", "The user's role has been successfully updated.", "success");
      fetchAllData();
    } catch (err) {
      setError("Error updating user: " + err.message);
    }
  };

  const handleDeleteUser = (userId) => {
    showModal(
      "Confirm Deletion",
      "Delete this user and all their data?",
      "warning",
      [
        { label: "Cancel", onClick: () => setIsModalOpen(false) },
        {
          label: "Delete",
          onClick: async () => {
            setIsModalOpen(false);

            try {
              await api.delete(`/admin/page/users-management/${userId}?courseId=${selectedCourseId}`);
              setUsers(prev => prev.filter(u => u.id !== userId));

              showModal(
                "User Deleted",
                "The user has been successfully deleted.",
                "success"
              );

              fetchAllData();
            } catch (err) {
              showModal(
                "Error",
                "Failed to delete user: " + err.message,
                "error"
              );
            }
          }
        }
      ]
    );
  };

  // Update submission marks
  const handleUpdateMarks = async (submissionId, marks) => {
    try {
      const response = await api.patch(`/admin/page/grade-submission/${submissionId}/marks?courseId=${selectedCourseId}`, { marks: parseFloat(marks) });
      const data = response.data;
      setSubmissions(submissions.map(s => s.id === submissionId ? data.submission : s));
      setSubmissionMarks("");
      showModal("Success", "Marks updated successfully!", "success");
    } catch (err) {
      setError("Error updating marks: " + err.message);
    }
  };

  // Toggle allow students to view marks for an assignment
  const handleToggleCanViewMarks = async (assignmentId, canViewMarks) => {
    try {
      const response = await api.patch(`/admin/page/assignments-list/${assignmentId}/toggle-visibility?courseId=${selectedCourseId}`, { canViewMarks });
      const data = response.data;
      // Update local state with server response
      setAssignments(assignments.map(a =>
        a.id === assignmentId ? { ...a, ...data.assignment } : a
      ));
      showModal("Success", `Marks ${canViewMarks ? 'enabled' : 'disabled'} for students`, "success");
    } catch (err) {
      setError("Error toggling view marks: " + err.message);
    }
  };

  // Toggle assignment visibility (show/hide to students)
  const handleToggleAssignmentVisibility = async (assignmentId, isHidden) => {
    try {
      const response = await api.patch(`/admin/page/assignments-list/${assignmentId}/hide?courseId=${selectedCourseId}`, { isHidden });
      const data = response.data;
      // Update local state with server response
      setAssignments(assignments.map(a =>
        a.id === assignmentId ? { ...a, ...data.assignment } : a
      ));
      showModal("Success", `Assignment ${isHidden ? 'hidden' : 'published'}`, "success");
    } catch (err) {
      setError("Error toggling assignment visibility: " + err.message);
    }
  };

  // Toggle allow students to view marks for a specific submission
  const handleToggleViewMarks = async (submissionId, currentViewMarks) => {
    try {
      await api.patch(`/admin/page/grade-submission/${submissionId}/visibility?courseId=${selectedCourseId}`, { canView: !currentViewMarks });
      // Update local state
      setSubmissions(submissions.map(s =>
        s.id === submissionId ? { ...s, viewMarks: !currentViewMarks } : s
      ));
    } catch (err) {
      setError("Error toggling marks visibility: " + err.message);
    }
  };

  // Run test cases
  const handleRunTests = async (submissionId) => {
    setRunningSubmissionId(submissionId);
    try {
      const response = await api.post(`/admin/page/grade-submission/${submissionId}/run-tests?courseId=${selectedCourseId}`);
      const data = response.data;
      setTestResults(data.results);
      showModal("Success", `Tests completed: ${data.passCount}/${data.totalCount} passed`, "success");
    } catch (err) {
      setError("Error running tests: " + err.message);
    } finally {
      setRunningSubmissionId(null);
    }
  };

  // Run tests for all students in assignment
  const handleBulkRunTests = async () => {
    if (!selectedAssignment) return;

    setBulkTestsRunning(true);
    setError("");
    setBulkTestResults(null);
    setBulkProcessedCount(0);
    setBulkTotalCount(assignmentSubmissions.length);
    setBulkCurrentStudentName("");
    startKeepAlivePings();
    startBulkProgressPolling(selectedAssignment.id);

    try {
      const response = await api.post(`/admin/page/submissions-list/${selectedAssignment.id}/run-all-tests?courseId=${selectedCourseId}`);
      
      // Handle 202 Accepted (background processing) - this is the expected response
      if (response.status === 202) {
        console.log("Bulk tests started in background. Polling for progress...");
        // Tests are running in background, polling will track progress
        return;
      }

      // Legacy: Handle 200 OK (immediate completion, if backend still returns this way)
      if (response.status === 200) {
        const data = response.data;
        setBulkTestResults(data);
        setBulkProcessedCount(data.totalSubmissions || assignmentSubmissions.length);
        setBulkTotalCount(data.totalSubmissions || assignmentSubmissions.length);
        setBulkCurrentStudentName("");

        // Refresh submissions for this specific assignment
        const submissionsRes = await api.get(`/admin/page/submissions-list/${selectedAssignment.id}`);
        if (submissionsRes.status === 200) {
          setSubmissions(submissionsRes.data);
        }

        showModal("Success", `Tests completed! ${data.totalSubmissions} students processed.`);
        setBulkTestsRunning(false);
        stopBulkProgressPolling();
      }
    } catch (err) {
      // Check if error is a 409 (tests already running)
      if (err.response?.status === 409) {
        setError("Tests are already running for this assignment. Please wait.");
        // Re-enable polling in case tests were already in progress
        if (!bulkProgressIntervalRef.current) {
          startBulkProgressPolling(selectedAssignment.id);
        }
      } else {
        setError("Error running bulk tests: " + (err.message || err.response?.data?.message || "Unknown error"));
        setBulkTestsRunning(false);
        stopBulkProgressPolling();
      }
    }
  };

  // Download marks CSV
  const handleDownloadCSV = async (assignmentId) => {
    try {
      const response = await api.get(`/admin/page/assignments-list/${assignmentId}/export?courseId=${selectedCourseId}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `marks_${assignmentId}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError("Error downloading CSV: " + err.message);
    }
  };

  // Delete assignment
  const handleDeleteAssignment = (assignmentId) => {
    showModal(
      "Confirm Deletion",
      "Delete this assignment and all submissions?",
      "warning",
      [
        { label: "Cancel", onClick: () => setIsModalOpen(false) },
        {
          label: "Delete",
          onClick: async () => {
            setIsModalOpen(false);
            try {
              await api.delete(`/admin/page/assignments-list/${assignmentId}?courseId=${selectedCourseId}`);
              setAssignments(prev => prev.filter(a => a.id !== assignmentId));
              setSelectedAssignment(null);

              showModal(
                "Assignment Deleted",
                "The assignment has been successfully deleted.",
                "success"
              );

              fetchAllData();
            } catch (err) {
              showModal(
                "Error",
                "Error deleting assignment: " + err.message,
                "error"
              );
            }
          }
        }
      ]
    );
  };


  if (loading) {
    return <div className="admin-dashboard"><div className="loading">Loading admin dashboard...</div></div>;
  }

  const assignmentSubmissions = selectedAssignment
    ? submissions.filter(s => s.assignmentId === selectedAssignment.id)
    : [];

  // If showing student detail, render that view
  if (showStudentDetail && selectedAssignment && selectedSubmission) {
    const submission = assignmentSubmissions.find(s => s.id === selectedSubmission.id) ||
      assignmentSubmissions.find(s => s.id === selectedSubmission);
    if (submission) {
      return (
        <StudentDetail
          submission={submission}
          assignment={selectedAssignment}
          token={token}
          onBack={() => setShowStudentDetail(false)}
        />
      );
    }
  }

  const studentUsers = users.filter(u => u.role === "student");
  const taUsers = users.filter(u => u.role === "grader");
  const adminUsers = users.filter(u => u.role === "admin");

  const matchesUserSearch = (user, query) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;

    return (
      user.name?.toLowerCase().includes(normalizedQuery) ||
      user.email?.toLowerCase().includes(normalizedQuery)
    );
  };

  const filteredStudentUsers = studentUsers.filter(user => matchesUserSearch(user, studentSearchQuery));
  const filteredTaUsers = taUsers.filter(user => matchesUserSearch(user, graderSearchQuery));
  const filteredAdminUsers = adminUsers.filter(user => matchesUserSearch(user, adminSearchQuery));

  return (
    <div className="admin-dashboard">
      <nav className="navbar" style={{ paddingBottom: "15px" }}>
        <div className="navbar-content">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1 className="brand">Autograder - Admin</h1>
            <button className="btn-course-list" onClick={() => navigate("/admin/courses")}>Course List</button>
          </div>
          <div className="navbar-actions">
            <span className="user-email">Course: {selectedCourse?.name || "Not selected"}</span>
            <span className="user-email">{currentUser?.email || "User"}</span>
            <button className="btn-logout" onClick={logout}>Logout</button>
          </div>
        </div>
      </nav>
        
        {/* Create Course Form */}
        <form id="createCourseForm" onSubmit={handleCreateCourse} className="form-panel" style={{ display: "none", marginBottom: "1rem" }}>
          <h3 style={{color: "#10b981"}}>Create New Course</h3>
          <div className="form-group">
            <label style={{color: "#10b981"}}>Course Name *</label>
            <input
              type="text"
              value={newCourse.name}
              onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
              placeholder="Course name"
              required
            />
          </div>
          <div className="form-group">
            <label style={{color: "#10b981"}}>Course Code</label>
            <input
              type="text"
              value={newCourse.code}
              onChange={(e) => setNewCourse({ ...newCourse, code: e.target.value })}
              placeholder="Course code (optional)"
            />
          </div>
          <div className="form-group">
            <label style={{color: "#10b981"}}>Description</label>
            <textarea
              value={newCourse.description}
              onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
              placeholder="Course description (optional)"
              rows="3"
              style={{backgroundColor: "var(--bg-primary)", color: "var(--text)"}}
            ></textarea>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">Create Course</button>
            <button type="button" className="btn btn-secondary" onClick={() => document.getElementById("createCourseForm").style.display = "none"}>Cancel</button>
          </div>
        </form>

      {error && <div className="error-message">{error}</div>}

      {/* Main Tabs or Assignment Header */}
      {!selectedAssignment ? (
        <>
          {/* Main Tabs */}
          <div className="main-tabs">
            <button
              className={`tab-btn ${activeTab === "assignments" ? "active" : ""}`}
              onClick={() => { setActiveTab("assignments"); setSelectedAssignment(null); }}
            >
              Assignments
            </button>
            <button
              className={`tab-btn ${activeTab === "users" ? "active" : ""}`}
              onClick={() => { setActiveTab("users"); setSelectedUserRole("student"); }}
            >
              Users
            </button>
            <button
              className={`tab-btn ${activeTab === "invite" ? "active" : ""}`}
              onClick={() => { setActiveTab("invite"); window.location.href = "/admin/invite-students"; }}
              style={{ marginLeft: "auto", background: "#4CAF50", color: "white" }}
            >
              + Invite Students
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Assignment Header with Back Button */}
          <div style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "20px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between", // Ensures equal spacing between elements
            gap: "20px",
            flexWrap: "wrap",
            marginRight: "67px",
            marginLeft: "70px",
            marginTop: "20px"
          }}>
            <button
              className="btn-back"
              onClick={() => setSelectedAssignment(null)}
              style={{ fontSize: "1rem", padding: "8px 16px", height: "37.6px", width: "194.56px", alignContent: "center" }}
            >
              ← Back to Assignments
            </button>
            <span style={{ textAlign: "center", flex: 1, fontSize: "1.5rem", fontWeight: "bold" }}>{selectedAssignment.title}</span>
            <button className="btn btn-danger" style={{ height: "37.6px", width: "100px", alignContent: "center" }} onClick={() => {
              handleDeleteAssignment(selectedAssignment.id);
            }}>Delete</button>
          </div>
        </>
      )}

      {/* ASSIGNMENTS TAB */}
      {activeTab === "assignments" && (
        <div className="admin-content">
          {!selectedAssignment ? (
            <>
              {/* Assignments Grid */}
              <div className="assignments-section">
                <div className="section-header">
                  <h2>Assignments</h2>
                  <button className="btn btn-primary" onClick={() => document.getElementById("createAssignmentForm").style.display =
                    document.getElementById("createAssignmentForm").style.display === "none" ? "block" : "none"}>
                    + New Assignment
                  </button>
                </div>

                {/* Create Assignment Form */}
                <form id="createAssignmentForm" onSubmit={handleCreateAssignment} className="form-panel" style={{ display: "none" }}>
                  <h3>Create New Assignment</h3>
                  <div className="form-group">
                    <label style={{color: "var(--primary)"}}>Title *</label>
                    <input
                      type="text"
                      value={newAssignment.title}
                      onChange={(e) => setNewAssignment({ ...newAssignment, title: e.target.value })}
                      placeholder="Assignment title"
                    />
                  </div>
                  <div className="form-group">
                    <label style={{color: "var(--primary)"}}>Description</label>
                    <textarea
                      value={newAssignment.description}
                      onChange={(e) => setNewAssignment({ ...newAssignment, description: e.target.value })}
                      placeholder="Assignment description"
                      rows="3"
                      style={{backgroundColor: "var(--bg-primary)", color: "var(--text)"}}
                    ></textarea>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label style={{color: "var(--primary)"}}>Due Date & Time * <span style={{ color: "var(--primary)", fontSize: "0.8rem", marginLeft: "4px" }}>(IST)</span></label>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type="date"
                          value={newAssignment.dueDate ? newAssignment.dueDate.split('T')[0] : ''}
                          onChange={(e) => {
                            const dateStr = e.target.value;
                            let time = '23:59';
                            if (newAssignment.dueDate) {
                              const timePart = newAssignment.dueDate.split('T')[1];
                              if (timePart) {
                                time = timePart.substring(0, 5);
                              }
                            }
                            if (dateStr) {
                              setNewAssignment({ ...newAssignment, dueDate: `${dateStr}T${time}` });
                            }
                          }}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "4px",
                            border: "1px solid var(--border)",
                            background: "var(--bg-primary)",
                            color: "var(--text)",
                            fontSize: "1rem",
                            cursor: "pointer",
                            flex: 1
                          }}
                        />
                        <input
                          type="time"
                          value={newAssignment.dueDate ? newAssignment.dueDate.split('T')[1]?.substring(0, 5) || '23:59' : '23:59'}
                          onChange={(e) => {
                            if (!e.target.value) return;
                            let dateStr = new Date().toISOString().split('T')[0];
                            if (newAssignment.dueDate) {
                              dateStr = newAssignment.dueDate.split('T')[0];
                            }
                            setNewAssignment({ ...newAssignment, dueDate: `${dateStr}T${e.target.value}` });
                          }}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "4px",
                            border: "1px solid var(--border)",
                            background: "var(--bg-primary)",
                            color: "var(--text)",
                            fontSize: "1rem",
                            cursor: "pointer",
                            flex: 1
                          }}
                        />
                      </div>
                      {newAssignment.dueDate && (
                        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px" }}>
                          {formatISTDisplay(newAssignment.dueDate.split('T')[0], newAssignment.dueDate.split('T')[1]?.substring(0, 5)) || 'Invalid date'} IST
                        </div>
                      )}
                    </div>
                    <div className="form-group">
                      <label style={{color: "var(--primary)"}}>Total Marks</label>
                      <input
                        type="number"
                        value={newAssignment.totalMarks}
                        onChange={(e) => setNewAssignment({ ...newAssignment, totalMarks: parseFloat(e.target.value) })}
                        min="1"
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-success">Create Assignment</button>
                </form>

                {/* Assignments List */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {assignments.length === 0 ? (
                    <p style={{ color: "var(--text-muted)" }}>No assignments yet</p>
                  ) : (
                    assignments.map(assignment => (
                      <div
                        key={assignment.id}
                        style={{
                          padding: "12px 16px",
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "16px",
                          transition: "all 0.2s ease"
                        }}
                        onClick={() => setSelectedAssignment(assignment)}
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(16, 185, 129, 0.1)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "var(--bg-secondary)"}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h4 style={{ margin: "0 0 4px 0", color: "var(--primary)" }}>
                            {assignment.title}
                          </h4>
                          <div style={{
                            fontSize: "0.85rem",
                            color: "var(--text-muted)",
                            display: "flex",
                            gap: "16px",
                            alignItems: "center"
                          }}>
                            <span>{assignment.totalMarks} marks</span>
                            <span>Due: {displayDateAsIST(assignment.dueDate)} IST</span>
                          </div>
                        </div>

                        {/* View Marks Toggle & Edit Button */}
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          {/* Toggle Assignment Visibility (Show/Hide to Students) */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleAssignmentVisibility(assignment.id, !assignment.isHidden);
                            }}
                            style={{
                              width: "50px",
                              height: "24px",
                              background: !assignment.isHidden ? "var(--primary)" : "var(--border)",
                              borderRadius: "12px",
                              cursor: "pointer",
                              position: "relative",
                              transition: "background 0.3s ease",
                              display: "flex",
                              alignItems: "center",
                              padding: "0 2px"
                            }}
                            title={assignment.isHidden ? "Click to publish assignment to students" : "Click to hide assignment from students"}
                          >
                            <div
                              style={{
                                width: "20px",
                                height: "20px",
                                background: "white",
                                borderRadius: "50%",
                                position: "absolute",
                                left: !assignment.isHidden ? "28px" : "2px",
                                transition: "left 0.3s ease",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                              }}
                            />
                          </div>
                          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", minWidth: "70px" }}>
                            {!assignment.isHidden ? "Published" : "Hidden"}
                          </span>

                          {/* Animated Toggle Switch for View Marks */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleCanViewMarks(assignment.id, !assignment.canViewMarks);
                            }}
                            style={{
                              width: "50px",
                              height: "24px",
                              background: assignment.canViewMarks ? "var(--primary)" : "var(--border)",
                              borderRadius: "12px",
                              cursor: "pointer",
                              position: "relative",
                              transition: "background 0.3s ease",
                              display: "flex",
                              alignItems: "center",
                              padding: "0 2px"
                            }}
                            title="Toggle to show/hide marks"
                          >
                            <div
                              style={{
                                width: "20px",
                                height: "20px",
                                background: "white",
                                borderRadius: "50%",
                                position: "absolute",
                                left: assignment.canViewMarks ? "28px" : "2px",
                                transition: "left 0.3s ease",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                              }}
                            />
                          </div>
                          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", minWidth: "70px" }}>
                            {assignment.canViewMarks ? "✓ Visible" : "Hidden"}
                          </span>
                          <button
                            className="btn-icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditAssignment(assignment);
                            }}
                            title="Edit assignment"
                            style={{ fontSize: "1rem", padding: "4px 8px", color: "#ffffff" }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn-icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadCSV(assignment.id);
                            }}
                            title="Download marks as CSV"
                            style={{ fontSize: "1rem", padding: "4px 8px", color: "#ffffff" }}
                          >
                            Download Marks
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Assignment Details */}
              <div className="assignment-details-section">
                <div className="details-tabs">
                  <button
                    className={`tab-btn ${detailsTab === "submissions" ? "active" : ""}`}
                    onClick={() => setDetailsTab("submissions")}
                  >
                    Submissions ({assignmentSubmissions.length})
                  </button>
                  <button
                    className={`tab-btn ${detailsTab === "marks" ? "active" : ""}`}
                    onClick={() => setDetailsTab("marks")}
                  >
                    Edit Marks
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleBulkRunTests}
                    disabled={bulkTestsRunning || assignmentSubmissions.length === 0}
                    style={{ marginLeft: "auto" }}
                  >
                    {bulkTestsRunning ? `⏳ Running... ${bulkProcessedCount}/${bulkTotalCount || assignmentSubmissions.length}` : " ▶ Run Tests"}
                  </button>
                </div>

                {error && error.includes("Tests are already running") && (
                  <div style={{
                    margin: "10px 0 14px",
                    padding: "12px",
                    background: "rgba(249, 115, 22, 0.1)",
                    border: "1px solid rgb(249, 115, 22)",
                    borderRadius: "4px",
                    color: "rgb(234, 88, 12)",
                    fontSize: "0.9rem"
                  }}>
                    ⚠️ {error}
                  </div>
                )}

                {bulkTestsRunning && (
                  <div style={{ margin: "10px 0 14px", fontSize: "0.9rem", color: "var(--text-muted)" }}>
                    Processed {bulkProcessedCount}/{bulkTotalCount || assignmentSubmissions.length} student(s)
                    {bulkCurrentStudentName ? ` - Current: ${bulkCurrentStudentName}` : ""}
                  </div>
                )}

                {/* Submissions List - Compact */}
                {detailsTab === "submissions" && (
                  <div style={{ maxHeight: "900px", overflowY: "auto" }}>
                    {assignmentSubmissions.length === 0 ? (
                      <p>No submissions yet</p>
                    ) : (
                      <>
                        <div style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "15px" }}>
                          👥 {assignmentSubmissions.length} student(s) uploaded
                        </div>
                        <div style={{ display: "grid", gap: "8px" }}>
                          {assignmentSubmissions.map(submission => (
                            <div
                              key={submission.id}
                              style={{
                                background: selectedSubmission?.id === submission.id ? "rgba(16, 185, 129, 0.1)" : "var(--bg-secondary)",
                                border: selectedSubmission?.id === submission.id ? "2px solid var(--primary)" : "1px solid var(--border)",
                                borderRadius: "6px",
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                              }}
                              onClick={() => {
                                setSelectedSubmission(submission.id === selectedSubmission?.id ? null : submission);
                                setSubmissionMarks(submission.marks || "");
                              }}
                            >
                              <div style={{
                                padding: "10px 12px",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: "12px",
                              }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <h5 style={{ margin: "0 0 3px 0", color: "var(--primary)", fontSize: "0.95rem" }}>
                                    {submission.student?.name || "Unknown"}
                                  </h5>
                                  <div style={{ display: "flex", gap: "12px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                    <span>{submission.student?.email}</span>
                                    <span className={`status-badge ${submission.status}`} style={{ padding: "2px 6px", fontSize: "0.75rem" }}>{submission.status}</span>
                                    <span style={{ fontWeight: 600, color: "var(--primary)" }}>{submission.marks || 0}/{submission.totalMarks}</span>
                                  </div>
                                </div>
                                <div style={{ fontSize: "1rem", color: "var(--text-muted)" }}>
                                  {selectedSubmission?.id === submission.id ? "▼" : "▶"}
                                </div>
                              </div>
                              {/* Expanded Details */}
                              {selectedSubmission?.id === submission.id && (
                                <div style={{
                                  borderTop: "1px solid var(--border)",
                                  padding: "12px",
                                  background: "var(--dark-secondary)",
                                  fontSize: "0.85rem"
                                }}>
                                  {/* Marks Section */}
                                  <div style={{ marginBottom: "12px", padding: "10px", background: "rgba(16, 185, 129, 0.05)", borderRadius: "4px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                      <span style={{ color: "var(--text-muted)" }}>📊 Current Marks:</span>
                                      <span style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--primary)" }}>{submission.marks || 0}/{submission.totalMarks}</span>
                                    </div>
                                    <p style={{ margin: "0 0 8px 0", color: "var(--text-muted)", fontSize: "0.75rem" }}>Submitted: {new Date(submission.submittedAt).toLocaleString()}</p>
                                  </div>

                                  {/* Code Files */}
                                  {submission.codeFiles && submission.codeFiles.length > 0 ? (
                                    <div style={{ marginBottom: "12px" }}>
                                      <h6 style={{ margin: "0 0 8px 0", color: "var(--primary)" }}>📄 Code Files:</h6>
                                      {submission.codeFiles.map((file, idx) => (
                                        <details key={idx} style={{ marginBottom: "8px" }}>
                                          <summary style={{ cursor: "pointer", color: "var(--primary)", padding: "6px", background: "rgba(16, 185, 129, 0.05)", borderRadius: "3px" }}>
                                            {file.fileName}
                                          </summary>
                                          <pre style={{
                                            background: "var(--bg-secondary)",
                                            padding: "10px",
                                            borderRadius: "4px",
                                            overflow: "auto",
                                            maxHeight: "250px",
                                            margin: "6px 0 0 0",
                                            fontSize: "0.75rem",
                                            color: "var(--text-secondary)",
                                            border: "1px solid var(--border)"
                                          }}>
                                            <code>{file.fileContent}</code>
                                          </pre>
                                        </details>
                                      ))}
                                    </div>
                                  ) : (
                                    <p style={{ margin: "0 0 12px 0", color: "var(--text-muted)" }}>No code files</p>
                                  )}

                                  {/* Test Results from Bulk Run */}
                                  {bulkTestResults?.results && (
                                    (() => {
                                      const studentResult = bulkTestResults.results.find(r => r.submissionId === submission.id);
                                      return studentResult ? (
                                        <div style={{ padding: "10px", background: "rgba(16, 185, 129, 0.05)", borderRadius: "4px" }}>
                                          <h6 style={{ margin: "0 0 8px 0", color: "var(--primary)" }}>🧪 Test Results:</h6>
                                          <div style={{ fontSize: "0.8rem", marginBottom: "8px" }}>
                                            <div style={{ display: "flex", gap: "15px" }}>
                                              <span>✅ Passed: <strong>{studentResult.passedTests}</strong></span>
                                              <span>❌ Failed: <strong>{studentResult.totalTests - studentResult.passedTests}</strong></span>
                                              <span>⭐ Marks: <strong style={{ color: "var(--primary)" }}>{studentResult.marksAllocated}</strong></span>
                                            </div>
                                          </div>
                                          {studentResult.testDetails && (
                                            <details style={{ fontSize: "0.75rem" }}>
                                              <summary style={{ cursor: "pointer", color: "var(--primary)" }}>Details</summary>
                                              <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px solid rgba(16, 185, 129, 0.2)" }}>
                                                {studentResult.testDetails.map((test, idx) => (
                                                  <div key={idx} style={{ margin: "4px 0", color: test.passed ? "#10b981" : "#ef4444" }}>
                                                    {test.passed ? "✅" : "❌"} {test.testName} (+{test.marks})
                                                  </div>
                                                ))}
                                              </div>
                                            </details>
                                          )}
                                        </div>
                                      ) : null;
                                    })()
                                  )}

                                  {/* Action Buttons */}
                                  <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                                    <button
                                      className="btn btn-primary"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowStudentDetail(true);
                                      }}
                                      style={{ flex: 1, fontSize: "0.85rem", padding: "8px" }}
                                    >
                                      📁 View Files
                                    </button>
                                    <button
                                      className="btn btn-primary"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRunTests(submission.id);
                                      }}
                                      disabled={runningSubmissionId === submission.id}
                                      style={{ flex: 1, fontSize: "0.85rem", padding: "8px" }}
                                    >
                                      {runningSubmissionId === submission.id ? "⏳ Running..." : "▶️ Run Tests"}
                                    </button>
                                  </div>

                                  {testResults && (
                                    <div style={{ marginTop: "12px", padding: "10px", background: "rgba(16, 185, 129, 0.05)", borderRadius: "4px" }}>
                                      <h6 style={{ margin: "0 0 8px 0", color: "var(--primary)" }}>Individual Test Results:</h6>
                                      {testResults.map((result, idx) => (
                                        <div key={idx} style={{
                                          padding: "6px",
                                          marginBottom: "4px",
                                          borderRadius: "3px",
                                          background: result.passed ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                                          fontSize: "0.8rem"
                                        }}>
                                          <p style={{ margin: 0, fontWeight: 600, color: result.passed ? "var(--primary)" : "#dc2626" }}>
                                            {result.passed ? "✅" : "❌"} {result.testName}
                                          </p>
                                          {!result.passed && result.errorMessage && (
                                            <p style={{ margin: "3px 0 0 0", fontSize: "0.75rem", color: "#fca5a5" }}>
                                              {result.errorMessage}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Edit Marks */}
                {detailsTab === "marks" && assignmentSubmissions.length > 0 && (
                  <div className="marks-editor">
                    <h4 style={{ marginTop: 0 }}>📊 Edit Marks for {selectedAssignment.title}</h4>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Click a student to edit marks and allow viewing</p>
                    <div style={{ display: "grid", gap: "10px", maxHeight: "600px", overflowY: "auto" }}>
                      {assignmentSubmissions.map(submission => (
                        <div key={submission.id}>
                          <div
                            style={{
                              background: selectedSubmission?.id === submission.id ? "rgba(16, 185, 129, 0.1)" : "var(--bg-secondary)",
                              border: "1px solid var(--border)",
                              borderRadius: selectedSubmission?.id === submission.id ? "6px 6px 0 0" : "6px",
                              padding: "10px",
                              cursor: "pointer",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "10px"
                            }}
                            onClick={() => {
                              setSelectedSubmission(submission);
                              setSubmissionMarks(submission.marks || "");
                            }}
                          >
                            <div>
                              <h5 style={{ margin: "0 0 3px 0", color: "var(--primary)" }}>{submission.student?.name}</h5>
                              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>{submission.student?.email}</p>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontSize: "0.9rem", color: "var(--primary)", fontWeight: "bold" }}>{submission.marks || 0}/{submission.totalMarks}</span>
                              {selectedSubmission?.id === submission.id && (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  max={submission.totalMarks}
                                  value={submissionMarks}
                                  onChange={(e) => setSubmissionMarks(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder="Enter marks"
                                  style={{
                                    width: "70px",
                                    padding: "6px",
                                    borderRadius: "4px",
                                    border: "1px solid var(--border)",
                                    background: "var(--bg-secondary)",
                                    color: "var(--text)",
                                    fontSize: "0.9rem"
                                  }}
                                />
                              )}
                            </div>
                            {selectedSubmission?.id === submission.id && (
                              <div style={{ display: "flex", gap: "8px" }}>
                                <button
                                  className="btn btn-success"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdateMarks(submission.id, submissionMarks);
                                  }}
                                  style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleViewMarks(submission.id, submission.viewMarks);
                                  }}
                                  style={{
                                    background: submission.viewMarks ? "var(--primary)" : "var(--border)",
                                    border: "none",
                                    borderRadius: "4px",
                                    padding: "6px 12px",
                                    fontSize: "0.85rem",
                                    color: "white",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    fontWeight: "bold"
                                  }}
                                  title={submission.viewMarks ? "Marks visible to student" : "Marks hidden from student"}
                                >
                                  <span style={{
                                    display: "inline-block",
                                    width: "24px",
                                    height: "14px",
                                    borderRadius: "7px",
                                    background: submission.viewMarks ? "white" : "#ccc",
                                    position: "relative",
                                    transition: "all 0.3s"
                                  }}>
                                    <span style={{
                                      position: "absolute",
                                      width: "12px",
                                      height: "12px",
                                      borderRadius: "50%",
                                      background: submission.viewMarks ? "var(--primary)" : "#999",
                                      top: "1px",
                                      left: submission.viewMarks ? "11px" : "1px",
                                      transition: "left 0.3s"
                                    }}></span>
                                  </span>
                                  {submission.viewMarks ? "Visible" : "Hidden"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* EDIT ASSIGNMENT MODAL */}
          {editingAssignment && (
            <div style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000
            }} onClick={() => setEditingAssignment(null)}>
              <div style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "30px",
                maxWidth: "500px",
                width: "90%",
                maxHeight: "90vh",
                overflowY: "auto"
              }} onClick={(e) => e.stopPropagation()}>
                <h2 style={{ marginTop: 0, color: "var(--primary)" }}>Edit Assignment</h2>

                <div className="form-group">
                  <label style={{color: "var(--primary)"}}>Title *</label>
                  <input
                    type="text"
                    value={editingAssignment.title}
                    onChange={(e) => setEditingAssignment({ ...editingAssignment, title: e.target.value })}
                    placeholder="Assignment title"
                  />
                </div>

                <div className="form-group">
                  <label style={{color: "var(--primary)"}}>Description</label>
                  <textarea
                    value={editingAssignment.description || ""}
                    onChange={(e) => setEditingAssignment({ ...editingAssignment, description: e.target.value })}
                    placeholder="Assignment description"
                    rows="3"
                    style={{backgroundColor: "var(--bg-primary)", color: "var(--text)"}}
                  ></textarea>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label style={{color: "var(--primary)"}}>Due Date & Time * <span style={{ color: "var(--primary)", fontSize: "0.8rem", marginLeft: "4px" }}>(IST)</span></label>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        type="date"
                        value={editingAssignment.dueDate ? editingAssignment.dueDate.split('T')[0] : ''}
                        onChange={(e) => {
                          const dateStr = e.target.value;
                          let time = '23:59';
                          if (editingAssignment.dueDate) {
                            const timePart = editingAssignment.dueDate.split('T')[1];
                            if (timePart) {
                              time = timePart.substring(0, 5);
                            }
                          }
                          if (dateStr) {
                            setEditingAssignment({ ...editingAssignment, dueDate: `${dateStr}T${time}` });
                          }
                        }}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "4px",
                          border: "1px solid var(--border)",
                          background: "var(--bg-primary)",
                          color: "var(--text)",
                          fontSize: "1rem",
                          cursor: "pointer",
                          flex: 1
                        }}
                      />
                      <input
                        type="time"
                        value={editingAssignment.dueDate ? editingAssignment.dueDate.split('T')[1]?.substring(0, 5) || '23:59' : '23:59'}
                        onChange={(e) => {
                          if (!e.target.value) return;
                          let dateStr = new Date().toISOString().split('T')[0];
                          if (editingAssignment.dueDate) {
                            dateStr = editingAssignment.dueDate.split('T')[0];
                          }
                          setEditingAssignment({ ...editingAssignment, dueDate: `${dateStr}T${e.target.value}` });
                        }}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "4px",
                          border: "1px solid var(--border)",
                          background: "var(--bg-primary)",
                          color: "var(--text)",
                          fontSize: "1rem",
                          cursor: "pointer",
                          flex: 1
                        }}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label style={{color: "var(--primary)"}}>Total Marks</label>
                    <input
                      type="number"
                      value={editingAssignment.totalMarks}
                      onChange={(e) => setEditingAssignment({ ...editingAssignment, totalMarks: parseFloat(e.target.value) })}
                      min="1"
                      step="0.01"
                    />
                  </div>
                </div>

                {editingAssignment.dueDate && (
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "10px", padding: "10px", background: "rgba(16, 185, 129, 0.1)", borderRadius: "6px" }}>
                    {formatISTDisplay(editingAssignment.dueDate.split('T')[0], editingAssignment.dueDate.split('T')[1]?.substring(0, 5)) || 'Invalid date'} IST
                  </div>
                )}

                <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                  <button
                    onClick={handleUpdateAssignment}
                    className="btn btn-success"
                    style={{ flex: 1 }}
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="btn btn-cancel"
                    style={{ flex: 1, background: "var(--border)", color: "var(--text)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* USERS TAB */}
      {activeTab === "users" && (
        <div className="users-section">
          <div className="section-header">
            <h2>User Management</h2>
            <button className="btn btn-primary" onClick={() => document.getElementById("createUserForm").style.display =
              document.getElementById("createUserForm").style.display === "none" ? "block" : "none"}>
              + Add User
            </button>
          </div>

          {/* Create User Form */}
          <form id="createUserForm" onSubmit={handleCreateUser} className="form-panel" style={{ display: "none" }}>
            <h3>Add New User</h3>
            <div className="form-row">
              <div className="form-group">
                <label style={{ color: "var(--text)" }}>Email *</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="user@example.com"
                />
              </div>
              <div className="form-group">
                <label style={{ color: "var(--text)" }}>Name *</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="Full name"
                />
              </div>
              <div className="form-group">
                <label style={{ color: "var(--text)" }}>Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="student">Student</option>
                  <option value="grader">Grader</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-success" style={{ marginTop: "20px" }}>Create User</button>
          </form>

          {/* Users Grid by Role */}
          <div className="users-grid">
            <div className="users-category" style={{ height: '100%' }}>
              <h3 style={{ color: 'var(--text)', marginBottom: '10px' }}>Students ({studentUsers.length})</h3>
              <div className="user-search-bar">
                <input
                  ref={studentSearchRef}
                  className="user-search-input"
                  type="text"
                  value={studentSearchInput}
                  onChange={(e) => {
                    setStudentSearchInput(e.target.value);
                    setStudentSearchQuery(e.target.value);
                  }}
                  placeholder="Search Students"
                />
              </div>
              <div className="users-list-panel">
                {filteredStudentUsers.map(user => (
                  <div key={user.id} className="user-card">
                    <div className="user-info">
                      <h4>{user.name}</h4>
                      <p>{user.email}</p>
                    </div>
                    <div className="user-actions">
                      <select
                        value={user.role}
                        onChange={(e) => handleUpdateUserRole(user.id, e.target.value)}
                        className="role-select" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text)' }}
                      >
                        <option value="student">Student</option>
                        <option value="grader">Grader</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button className="btn btn-danger" onClick={() => handleDeleteUser(user.id)} style={{ marginLeft: '8px' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="users-category">
              <h3 style={{ color: 'var(--text)', marginBottom: '10px' }}>Graders ({taUsers.length})</h3>
              <div className="user-search-bar">
                <input
                  ref={graderSearchRef}
                  className="user-search-input"
                  type="text"
                  value={graderSearchInput}
                  onChange={(e) => {
                    setGraderSearchInput(e.target.value);
                    setGraderSearchQuery(e.target.value);
                  }}
                  placeholder="Search Graders"
                />
              </div>
              <div className="users-list-panel">
                {filteredTaUsers.map(user => (
                  <div key={user.id} className="user-card">
                    <div className="user-info">
                      <h4>{user.name}</h4>
                      <p>{user.email}</p>
                    </div>
                    <div className="user-actions">
                      <select
                        value={user.role}
                        onChange={(e) => handleUpdateUserRole(user.id, e.target.value)}
                        className="role-select" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text)' }}
                      >
                        <option value="student">Student</option>
                        <option value="grader">Grader</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button className="btn btn-danger" onClick={() => handleDeleteUser(user.id)} style={{ marginLeft: '8px' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="users-category">
              <h3 style={{ color: 'var(--text)', marginBottom: '10px' }}>Admins ({adminUsers?.length || 0})</h3>
              <div className="user-search-bar">
                <input
                  ref={adminSearchRef}
                  className="user-search-input"
                  type="text"
                  value={adminSearchInput}
                  onChange={(e) => {
                    setAdminSearchInput(e.target.value);
                    setAdminSearchQuery(e.target.value);
                  }}
                  placeholder="Search Admins"
                />
              </div>
              <div className="users-list-panel">
                {filteredAdminUsers.map(user => (
                  <div key={user.id} className="user-card">
                    <div className="user-info">
                      <h4>{user.name}</h4>
                      <p>{user.email}</p>
                    </div>
                    <div className="user-actions">
                      <select
                        value={user.role}
                        onChange={(e) => handleUpdateUserRole(user.id, e.target.value)}
                        className="role-select" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text)' }}
                      >
                        <option value="student">Student</option>
                        <option value="grader">Grader</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button className="btn btn-danger" onClick={() => handleDeleteUser(user.id)} style={{ marginLeft: '8px' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>



      )}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalTitle}
        message={modalMessage}
        type={modalType}
        actions={modalActions}
      />

    </div>
  );
}
