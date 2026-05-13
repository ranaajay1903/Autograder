import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Modal from "../components/Modal";
import api from "../services/auth";
import "./dashboard.css";

// Helper function: Display UTC time as IST for date display
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
  
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
};

export default function Dashboard({ handleLogout, user }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [files, setFiles] = useState([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [assignmentSubmission, setAssignmentSubmission] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [showTestResults, setShowTestResults] = useState(false);
  const [codeContent, setCodeContent] = useState("");
  const [codeName, setCodeName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState(() => {
    const saved = localStorage.getItem("selectedCourseId");
    return saved ? parseInt(saved, 10) : null;
  });
  const [courses, setCourses] = useState([]);
  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState('info');
  const [modalActions, setModalActions] = useState([]);

  // Helper function to show modal
  const showModal = (title, message, type = 'info', actions = []) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalType(type);
    setModalActions(actions.length > 0 ? actions : [{ label: 'OK', onClick: () => setIsModalOpen(false) }]);
    setIsModalOpen(true);
  };

  // Apply dark theme by default
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  useEffect(() => {
    const fromQuery = parseInt(searchParams.get("courseId"), 10);
    if (!Number.isNaN(fromQuery) && fromQuery > 0) {
      setSelectedCourseId(fromQuery);
      localStorage.setItem("selectedCourseId", String(fromQuery));
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const res = await api.get("/courses/my-courses");
        const payload = res.data || {};
        const list = Array.isArray(payload)
          ? payload
          : Array.isArray(payload.courses)
            ? payload.courses
            : [...(payload.createdCourses || []), ...(payload.enrolledCourses || [])];
        setCourses(list);
      } catch (_) {}
    };
    fetchCourses();
  }, []);

  // Fetch assignments and submissions
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }
    if (!selectedCourseId) {
      navigate("/student/courses");
      return;
    }

    const fetchData = async () => {
      try {
        const courseQuery = `?courseId=${selectedCourseId}`;
        const assignmentsRes = await api.get(`/student/page/dashboard${courseQuery}`);
        setAssignments(assignmentsRes.data);

        const submissionsRes = await api.get(`/student/page/dashboard/submissions${courseQuery}`);
        setSubmissions(submissionsRes.data);

        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };

    fetchData();

    // Poll for updates every 5 seconds to catch admin mark visibility changes
    const interval = setInterval(fetchData, 5000);

    return () => clearInterval(interval);
  }, [navigate, selectedCourseId]);

  // Respond to route params
  const { assignmentId, submissionId } = useParams();

  useEffect(() => {
    if (!loading && assignments.length > 0) {
      if (assignmentId) {
        const found = assignments.find(a => String(a.id) === String(assignmentId));
        if (found) {
          handleAssignmentClick(found);
        }
      } else if (submissionId) {
        const foundSubmission = submissions.find(s => String(s.id) === String(submissionId));
        if (foundSubmission) {
          setAssignmentSubmission(foundSubmission);
          handleViewResults();
        } else {
          (async () => {
            try {
              const response = await api.get(`/student/page/view-results/${submissionId}`);
              const data = response.data;
              setTestResults(data);
              if (data.submission) setAssignmentSubmission(data.submission);
              setShowTestResults(true);
            } catch (err) {
              console.error("Error fetching results by param:", err);
            }
          })();
        }
      } else {
        setSelectedAssignment(null);
        setSelectedFile(null);
        setFiles([]);
        setShowTestResults(false);
        setCodeContent("");
        setAssignmentSubmission(null);
        setTestResults(null);
      }
    }
  }, [assignmentId, submissionId, loading, assignments, submissions]);

  const handleAssignmentClick = (assignment) => {
    setSelectedAssignment(assignment);
    setSelectedFile(null);
    setCodeContent("");
    const submission = submissions.find((s) => s.assignmentId === assignment.id);
    setAssignmentSubmission(submission || null);
  };

  useEffect(() => {
    if (selectedAssignment && submissions.length > 0) {
      const updatedSubmission = submissions.find((s) => s.assignmentId === selectedAssignment.id);
      setAssignmentSubmission(updatedSubmission || null);
    }
  }, [submissions, selectedAssignment]);

  const handleBackToAssignments = () => {
    setSelectedAssignment(null);
    setSelectedFile(null);
    setFiles([]);
    setShowTestResults(false);
    setCodeContent("");
    navigate(`/student/dashboard?courseId=${selectedCourseId}`);
  };

  const appendSelectedFiles = (incomingFiles) => {
    const nextFiles = Array.from(incomingFiles || []);
    if (nextFiles.length === 0) return;

    setFiles((currentFiles) => {
      const seenPaths = new Set(
        currentFiles.map((file) => file.webkitRelativePath || file.name)
      );
      const deduped = nextFiles.filter((file) => {
        const relativePath = file.webkitRelativePath || file.name;
        if (seenPaths.has(relativePath)) {
          return false;
        }
        seenPaths.add(relativePath);
        return true;
      });

      return [...currentFiles, ...deduped];
    });
  };

  const handleFileChange = (e) => {
    appendSelectedFiles(e.target.files);
    e.target.value = "";
  };

  const handleFolderChange = (e) => {
    appendSelectedFiles(e.target.files);
    e.target.value = "";
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (files.length === 0 || !selectedAssignment) {
      showModal('Upload Failed', 'Please select files to upload.', 'warning');
      return;
    }

    setUploadingFiles(true);

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append("files", file);
        formData.append("paths", file.webkitRelativePath || file.name);
      });
      formData.append("assignmentId", selectedAssignment.id);

      await api.post(`/student/page/submit-assignment/${selectedAssignment.id}/upload`, formData);

      setFiles([]);
      showModal('Success', 'Files uploaded successfully!', 'success');

      const submissionsRes = await api.get(`/student/page/dashboard/submissions?courseId=${selectedCourseId}`);
      setSubmissions(submissionsRes.data);

      const updatedSubmission = submissionsRes.data.find(
        (s) => s.assignmentId === selectedAssignment.id
      );
      setAssignmentSubmission(updatedSubmission || null);
    } catch (error) {
      console.error("Upload error:", error);
      const message = error.response?.data?.message || error.message;
      if (error.response?.data?.isLate) {
        showModal('Submission Late', message, 'error');
      } else {
        showModal('Upload Failed', message, 'error');
      }
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleViewResults = async () => {
    try {
      const response = await api.get(`/student/page/view-results/${assignmentSubmission.id}`);
      setTestResults(response.data);
      setShowTestResults(true);
    } catch (error) {
      console.error("Error fetching results:", error);
      showModal('No Results', 'Results are not available yet.', 'warning');
    }
  };

  const handleViewCode = async (file) => {
    if (!assignmentSubmission || !file || !file.id) {
      showModal('Invalid File', 'The selected file is not valid.', 'error');
      return;
    }

    try {
      const response = await api.get(`/student/page/view-results/${assignmentSubmission.id}/code/${file.id}`);
      const data = response.data;
      if (!data.fileContent) {
        showModal('No Content', 'No content found for this file.', 'warning');
        return;
      }
      setCodeContent(data.fileContent);
      setCodeName(data.fileName);
      setSelectedFile(file);
    } catch (error) {
      console.error("Error fetching code:", error);
      showModal('Load Error', 'Failed to load code.', 'error');
    }
  };

  const handleDeleteFile = async (fileId) => {
    if (!assignmentSubmission || !fileId) {
      showModal('Invalid File', 'The selected file is not valid.', 'error');
      return;
    }

    showModal(
      'Confirm Deletion',
      'Are you sure you want to delete this file?',
      'warning',
      [
        { label: 'Cancel', onClick: () => setIsModalOpen(false) },
        {
          label: 'Delete', onClick: async () => {
            setIsModalOpen(false);
            try {
              // DELETE request via api service
              await api.delete(`/student/page/submit-assignment/${assignmentSubmission.id}/file/${fileId}/delete`);

              if (selectedFile?.id === fileId) {
                setSelectedFile(null);
                setCodeContent("");
              }

              const submissionsRes = await api.get(`/student/page/dashboard/submissions?courseId=${selectedCourseId}`);
              setSubmissions(submissionsRes.data);

              showModal('Success', 'File deleted successfully!', 'success');
            }
            catch (err) {
              showModal('Error', 'Failed to delete file: ' + err.message, 'error');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-container" style={{ outline: '40px solid red' }}>
      <nav className="navbar" style={{ padding: "15px" }}>
        <div className="navbar-content">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1 className="brand">Autograder - Student</h1>
            <button onClick={() => navigate("/student/courses")} className="btn-course-list" style={{marginRight: "auto"}}>Course List</button>
          </div>
          <div className="navbar-actions">
            <span className="user-email">Course: {selectedCourse?.name || "Not selected"}</span>
            <span className="user-email">{user?.email || "User"}</span>
            <button onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </div>
      </nav>

      <div className="main-content">
        {!selectedAssignment ? (
          <div className="assignments-view">
            <div className="view-header">
              <h2>Assignments</h2>
            </div>
            <div className="assignments-table-wrapper">
              {assignments.length === 0 ? (
                <p className="empty-state">No assignments available</p>
              ) : (
                <table className="assignments-table">
                  <thead>
                    <tr>
                      <th className="col-assignment">Assignment</th>
                      <th className="col-code">Code</th>
                      <th className="col-grade">Grade</th>
                      <th className="col-upload">Upload Assignment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((assignment) => {
                      const submission = submissions.find(s => s.assignmentId === assignment.id);
                      const dueDate = new Date(assignment.dueDate);
                      return (
                        <tr key={assignment.id} className="assignment-row">
                          <td><div className="assignment-title">{assignment.title}</div></td>
                          <td style={{ textAlign: 'center' }}>
                            {submission ? <span className="code-label">Uploaded</span> : <span>—</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {submission && (["evaluated", "graded", "compilation-error", "no-code", "no-tests", "error"].includes(submission.status)) && (submission.viewMarks || assignment.canViewMarks) ? (
                              <div className="grade-value">{submission.marks}/{submission.totalMarks}</div>
                            ) : (
                              <div className="grade-placeholder">Not yet published</div>
                            )}
                          </td>
                          <td className="upload-cell">
                            <div className="upload-actions">
                              <div className="due-text">Due: {displayDateAsIST(assignment.dueDate)} IST</div>
                              <button
                                className="btn-upload-assignment"
                                onClick={() => navigate(`/student/submit/${assignment.id}`)}
                              >
                                Upload Assignment
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <div className="assignment-detail-view">
            <div className="detail-header">
              <button onClick={handleBackToAssignments} className="btn-back">← Back</button>
              <h2>{selectedAssignment.title}</h2>
            </div>
            <div className="detail-content">
              <div className="files-panel">
                <div className="panel-title">Files</div>
                {(() => {
                  const dueDate = new Date(selectedAssignment.dueDate);
                  const isOverdue = dueDate < new Date();
                  return (
                    <div style={{
                      padding: "10px",
                      background: isOverdue ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
                      border: `1px solid ${isOverdue ? "#ef4444" : "#10b981"}`,
                      borderRadius: "4px",
                      marginBottom: "12px",
                      color: isOverdue ? "#ef4444" : "#10b981",
                      fontSize: "0.9rem",
                    }}>
                      {isOverdue ? "Submission Closed" : "Open"} <br /> Due: {displayDateAsIST(selectedAssignment.dueDate)} IST
                    </div>
                  );
                })()}
                <div className="upload-box">
                  <form onSubmit={handleUpload}>
                    <input
                      type="file"
                      id="file-input"
                      style={{ display: 'none' }}
                      onChange={handleFileChange}
                      multiple
                      disabled={new Date(selectedAssignment.dueDate) < new Date()}
                    />
                    <input
                      type="file"
                      id="folder-input"
                      style={{ display: 'none' }}
                      onChange={handleFolderChange}
                      multiple
                      webkitdirectory=""
                      directory=""
                      disabled={new Date(selectedAssignment.dueDate) < new Date()}
                    />
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <label htmlFor="file-input" className="btn-upload">+ Select Files</label>
                      <label htmlFor="folder-input" className="btn-upload">+ Select Folder</label>
                    </div>
                    {files.length > 0 && (
                      <ul className="file-list-upload" style={{ gap: 2, padding: '10px' }}>
                        {files.map((f, i) => (
                          <li key={i}>{f.webkitRelativePath || f.name} <button type="button" onClick={() => removeFile(i)}>✕</button></li>
                        ))}
                      </ul>
                    )}
                    <button type="submit" disabled={uploadingFiles || files.length === 0} className="btn-submit">Upload</button>
                  </form>
                </div>
                {assignmentSubmission?.files?.length > 0 && (
                  <div className="submitted-files">
                    <div className="panel-subtitle">Submitted: {assignmentSubmission.files.length}</div>
                    <div className="files-list">
                      {assignmentSubmission.files.map((file) => (
                        <div key={file.id} className="file-row-container">
                          <div className={`file-view-container ${selectedFile?.id === file.id ? "active" : ""}`} onClick={() => handleViewCode(file)}>
                            <div className="file-name-text">{file.fileName}</div>
                          </div>
                          <button className="btn-delete-file" onClick={() => handleDeleteFile(file.id)} disabled={deleting}>🗑️</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {assignmentSubmission && (["evaluated", "graded", "compilation-error", "no-code", "no-tests", "error"].includes(assignmentSubmission.status)) && (assignmentSubmission.viewMarks || selectedAssignment?.canViewMarks) && (
                  <div className="marks-box">
                    <div className="marks-value">{assignmentSubmission.marks}/{assignmentSubmission.totalMarks}</div>
                    <button onClick={handleViewResults} className="btn-results">Results</button>
                  </div>
                )}
              </div>
              <div className="code-panel">
                {codeContent ? (
                  <div className="code-box">
                    <div className="code-header">{codeName}</div>
                    <pre className="code-display">{codeContent}</pre>
                  </div>
                ) : <div className="code-empty" style={{ fontSize: "rem" }}>Select a file</div>}
              </div>
            </div>
          </div>
        )}
      </div>

      {showTestResults && testResults && (
        <div className="modal-overlay" onClick={() => setShowTestResults(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Test Results</h3>
              <button style={{ transform: "scale(0.7)"}} onClick={() => setShowTestResults(false)}>✕</button>
            </div>
            <div className="modal-content">
              <div style={{ fontsize: "12px" , transform: "scale(0.7)"}} className="score-display">{testResults.submission.marks}/{testResults.submission.totalMarks}</div>
              <div className="results-list" >
                {testResults.testResults.map(test => (
                  <div style={{transform: "scale(0.7)"}} key={test.id} className={`result-item ${test.passed ? "pass" : "fail"}`}>
                    <span>{test.passed ? "✓" : "✗"}</span> {test.testName}
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button style={{transform: "scale(0.7)"}}  onClick={() => setShowTestResults(false)}>Close</button>
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
