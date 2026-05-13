import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import TestCaseManager from "./testCaseManager";
import Modal from "../components/Modal";
import api, { logout } from "../services/auth";
import "./grader.css";
import "./dashboard.css";

// Helper function: Display UTC time as IST for date display
const displayDateAsIST = (utcDateStr) => {
  if (!utcDateStr) return '';
  
  const date = new Date(utcDateStr);
  // Add 5 hours 30 minutes to convert UTC to IST
  date.setTime(date.getTime() + (5.5 * 60 * 60 * 1000));
  
  return date.toLocaleString();
};

export default function GraderDashboard() {
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [codeFiles, setCodeFiles] = useState([]);
  const [codeContent, setCodeContent] = useState("");
  const [codeName, setCodeName] = useState("");
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [isUploadDragOver, setIsUploadDragOver] = useState(false);
  const [runningTests, setRunningTests] = useState(false);
  const [testResults, setTestResults] = useState([]);
  const [showTestCaseManager, setShowTestCaseManager] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState('info');
  const [modalActions, setModalActions] = useState([]);

  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const graderFileInputRef = useRef(null);
  const graderFolderInputRef = useRef(null);
  const uploadFilesRef = useRef([]);
  const [selectedCourseId, setSelectedCourseId] = useState(() => {
    const saved = localStorage.getItem("selectedCourseId");
    return saved ? parseInt(saved, 10) : null;
  });
  const [courses, setCourses] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  const parseAssignments = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.assignments)) return payload.assignments;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  };

  const showModal = (title, message, type = 'info', actions = []) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalType(type);
    setModalActions(actions.length > 0 ? actions : [{ label: 'OK', onClick: () => setIsModalOpen(false) }]);
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (!localStorage.getItem('token')) { navigate('/login', { replace: true }); }
  }, [navigate]);

  // Apply dark theme by default
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");

    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch {
        setCurrentUser(null);
      }
    }
  }, []);

  useEffect(() => {
    const fromQuery = parseInt(searchParams.get("courseId"), 10);
    if (!Number.isNaN(fromQuery) && fromQuery > 0) {
      setSelectedCourseId(fromQuery);
      localStorage.setItem("selectedCourseId", String(fromQuery));
    }
  }, [searchParams]);

  useEffect(() => {
    uploadFilesRef.current = uploadFiles;
  }, [uploadFiles]);

  useEffect(() => {
    const fetchAssignments = async () => {
      setLoading(true);
      try {
        if (!selectedCourseId) {
          navigate("/grader/courses", { replace: true });
          return;
        }
        const res = await api.get(`/grader/page/dashboard?courseId=${selectedCourseId}`);
        setAssignments(parseAssignments(res.data));
      } catch (err) {
        showModal('Error', "Error loading assignments: " + err.message, 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchAssignments();
  }, [selectedCourseId, navigate]);

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

  // frontend/src/pages/grader.jsx

  useEffect(() => {
    const { assignmentId, submissionId } = params || {};
    const path = window.location.pathname;

    // 1. Determine which "mode" we are in based on the URL
    const isTestSolutions = path.includes('test-solutions');
    const isGradeSubmissions = path.includes('grade-submissions');

    if (assignmentId && assignments.length > 0) {
      const found = assignments.find((a) => String(a.id) === String(assignmentId));
      if (found) {
        setSelectedAssignment(found);

        if (isTestSolutions) {
          // Mode: Uploading/Testing Grader Solutions
          setShowTestCaseManager(true);
          setSubmissions([]);
        } else if (isGradeSubmissions) {
          // Mode: Viewing Student Submissions
          setShowTestCaseManager(false);
          fetchSubmissionsForAssignment(assignmentId);
        }
      }
    } else if (submissionId) {
      // Mode: Deep link to a specific student submission
      (async () => {
        try {
          const res = await api.get(`/grader/page/grade-submissions/${submissionId}`);
          const submission = res.data;
          setSelectedAssignment({
            id: submission.assignmentId,
            title: submission.assignmentTitle,
            totalMarks: submission.totalMarks
          });
          setSelectedSubmission(submission);
          setShowTestCaseManager(false);
          await fetchCodeForSubmission(submission.id);
        } catch (err) {
          console.error(err);
        }
      })();
    } else {
      // Reset state for Dashboard
      setSelectedAssignment(null);
      setSelectedSubmission(null);
      setSubmissions([]);
      setShowTestCaseManager(false);
    }
  }, [params, assignments]);

  const fetchSubmissionsForAssignment = async (assignmentId) => {
  try {
    const res = await api.get(`/grader/page/grade-submissions/${assignmentId}/list`);
    
    if (res.data && Array.isArray(res.data)) {
      setSubmissions(res.data);
    } else {
      setSubmissions([]);
    }
  } catch (err) {
    console.error("Fetch error:", err);
    setSubmissions([]); 
  }
};

  const handleAssignmentClick = (assignment) => {
    setSelectedAssignment(assignment);
    setSelectedSubmission(null);
    setCodeFiles([]);
    setCodeContent("");
    setTestResults([]);
    uploadFilesRef.current = [];
    setUploadFiles([]);
    navigate(`/grader/grade-submissions/${assignment.id}?courseId=${selectedCourseId}`);
    fetchSubmissionsForAssignment(assignment.id);
  };

  const handleBackToAssignments = () => {
    setSelectedAssignment(null);
    setSelectedSubmission(null);
    setSubmissions([]);
    setCodeFiles([]);
    setCodeContent("");
    setTestResults([]);
    uploadFilesRef.current = [];
    navigate(`/grader/dashboard?courseId=${selectedCourseId}`);
  };

  const fetchCodeForSubmission = async (submissionId) => {
    try {
      const res = await api.get(`/grader/page/grade-submissions/${submissionId}/code`);
      const files = res.data;
      setCodeFiles(files || []);
      if (files && files.length > 0) {
        setSelectedFileId(0);
        setCodeContent(files[0].fileContent || "");
        setCodeName(files[0].fileName || "Code");
      }
    } catch (err) { showModal('Error', "Failed to fetch code: " + err.message, 'error'); }
  };

  const handleViewCode = async (submission) => {
    setSelectedSubmission(submission);
    setTestResults([]);
    await fetchCodeForSubmission(submission.id);
  };

  const getQueuedPath = (file) => file.webkitRelativePath || file.relativePath || file.name;

  const withRelativePath = (file, relativePath) => {
    if (!relativePath || relativePath === file.webkitRelativePath) {
      return file;
    }

    try {
      Object.defineProperty(file, "relativePath", {
        value: relativePath,
        configurable: true
      });
    } catch (error) {
      file.relativePath = relativePath;
    }

    return file;
  };

  const mergeUploadFiles = (currentFiles, incomingFiles) => {
    const nextFiles = Array.from(incomingFiles || []);
    if (nextFiles.length === 0) return currentFiles;

    const seenPaths = new Set(currentFiles.map((file) => getQueuedPath(file)));
    const deduped = nextFiles.filter((file) => {
      const relativePath = getQueuedPath(file);
      if (seenPaths.has(relativePath)) {
        return false;
      }
      seenPaths.add(relativePath);
      return true;
    });

    return [...currentFiles, ...deduped];
  };

  const uploadSelectedFiles = async (filesToUpload) => {
    if (!selectedAssignment || filesToUpload.length === 0) {
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      filesToUpload.forEach((file) => {
        form.append("files", file);
        form.append("paths", getQueuedPath(file));
      });
      const res = await api.post(`/grader/page/test-solutions/${selectedAssignment.id}/upload`, form);
      if (res.data.files) {
        setCodeFiles(res.data.files);
        setSelectedFileId(0);
        setCodeContent(res.data.files[0].fileContent || "");
        setCodeName(res.data.files[0].fileName || "Code");
      }
    } catch (err) {
      showModal('Error', "Error uploading files: " + err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const appendUploadFiles = (incomingFiles) => {
    const mergedFiles = mergeUploadFiles(uploadFilesRef.current, incomingFiles);
    uploadFilesRef.current = mergedFiles;
    setUploadFiles(mergedFiles);
    return mergedFiles;
  };

  const handleGraderFileChange = (e) => {
    const mergedFiles = appendUploadFiles(e.target.files);
    e.target.value = "";
    if (mergedFiles.length > 0) {
      void uploadSelectedFiles(mergedFiles);
    }
  };

  const handleGraderFolderChange = (e) => {
    const mergedFiles = appendUploadFiles(e.target.files);
    e.target.value = "";
    if (mergedFiles.length > 0) {
      void uploadSelectedFiles(mergedFiles);
    }
  };

  const openGraderFilePicker = () => {
    graderFileInputRef.current?.click();
  };

  const openGraderFolderPicker = () => {
    graderFolderInputRef.current?.click();
  };

  const readDroppedEntry = async (entry, parentPath = "") => {
    if (!entry) return [];

    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file) => {
          const relativePath = parentPath ? `${parentPath}/${file.name}` : file.name;
          resolve([withRelativePath(file, relativePath)]);
        }, () => resolve([]));
      });
    }

    if (!entry.isDirectory) {
      return [];
    }

    const reader = entry.createReader();
    const entries = [];
    const readAllEntries = () => new Promise((resolve, reject) => {
      const readBatch = () => {
        reader.readEntries((batch) => {
          if (!batch.length) {
            resolve(entries);
            return;
          }
          entries.push(...batch);
          readBatch();
        }, reject);
      };
      readBatch();
    });

    const childEntries = await readAllEntries();
    const nestedFiles = await Promise.all(
      childEntries.map((childEntry) =>
        readDroppedEntry(childEntry, parentPath ? `${parentPath}/${entry.name}` : entry.name)
      )
    );

    return nestedFiles.flat();
  };

  const extractDroppedFiles = async (dataTransferItems, fallbackFiles) => {
    const items = Array.from(dataTransferItems || []);
    if (items.length === 0) {
      return Array.from(fallbackFiles || []);
    }

    const extracted = await Promise.all(
      items.map(async (item) => {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (!entry) {
          const file = item.getAsFile ? item.getAsFile() : null;
          return file ? [file] : [];
        }
        return readDroppedEntry(entry);
      })
    );

    return extracted.flat();
  };

  const handleUploadDrop = async (e) => {
    e.preventDefault();
    setIsUploadDragOver(false);

    const droppedFiles = await extractDroppedFiles(e.dataTransfer?.items, e.dataTransfer?.files);
    const mergedFiles = appendUploadFiles(droppedFiles);
    if (mergedFiles.length > 0) {
      await uploadSelectedFiles(mergedFiles);
    }
  };

  const removeQueuedUpload = (pathToRemove) => {
    setUploadFiles((currentFiles) =>
      currentFiles.filter((file) => getQueuedPath(file) !== pathToRemove)
    );
  };

  const clearQueuedUploads = () => {
    uploadFilesRef.current = [];
    setUploadFiles([]);
  };

  const handleRunTests = async (assignment) => {
    setRunningTests(true);
    try {
      const payload = {
        solutionFiles: Array.isArray(codeFiles) ? codeFiles.map(f => ({ fileName: f.fileName, fileContent: f.fileContent })) : []
      };
      if (!payload.solutionFiles || payload.solutionFiles.length === 0) throw new Error("No solution files to test");
      const res = await api.post(`/grader/page/test-solutions/${assignment.id}/run-tests`, payload);
      setTestResults(res.data.results || []);
      showModal('Success', `Tests: ${res.data.passCount || 0}/${res.data.totalCount || 0}`, 'success');
    } catch (err) {
      showModal('Error', "Error running tests: " + err.message, 'error');
    } finally {
      setRunningTests(false);
    }
  };

  const handleLogout = () => {
    logout();
  };

  if (showTestCaseManager && selectedAssignment) {
    return (
      <TestCaseManager
        assignment={selectedAssignment}
        onBack={() => {
          setShowTestCaseManager(false);
          setSelectedAssignment(null);
          navigate('/grader/dashboard');
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="grader-dashboard">
        <div style={{ textAlign: "center", padding: "3rem" }}>📋 Loading assignments...</div>
      </div>
    );
  }

  if (!selectedAssignment) {
    return (
      <div className="grader-dashboard">
        <nav className="navbar" style={{ padding: "15px" }}>
          <div className="navbar-content">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <h1 className="brand">Autograder - Grader</h1>
              <button className="btn-course-list" onClick={() => navigate("/grader/courses")}>Course List</button>
            </div>
            <div className="navbar-actions">
              <span className="user-email">Course: {selectedCourse?.name || "Not selected"}</span>
              <span className="user-email">{currentUser?.email || "User"}</span>
              <button className="btn-logout" onClick={handleLogout}>Logout</button>
            </div>
          </div>
        </nav>
        <div style={{ maxWidth: 1200, margin: '24px auto', padding: '0 16px' }}>
          {assignments.length === 0 ? (
            <div className="empty-state"><p>No assignments available</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {assignments.map((a) => (
                <div key={a.id} className="assignment-card" style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-secondary)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, color: 'var(--primary)' }}>{a.title}</h3>
                    <div style={{ color: 'var(--text-muted)' }}>Marks - {a.totalMarks || 100}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={(e) => { e.stopPropagation(); handleAssignmentClick(a); }} className="btn-select">Grade Submissions</button>
                    <button onClick={(e) => { e.stopPropagation(); setSelectedAssignment(a); setShowTestCaseManager(true); navigate(`/grader/test-solutions/${a.id}`); }} className="btn-manage-tests">Edit Test Cases</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grader-dashboard">
      <nav className="navbar">
        <div className="navbar-content">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1 className="brand">Autograder - Grader</h1>
            <button className="btn-course-list" onClick={() => navigate("/grader/courses")}>Course List</button>
          </div>
          <div className="navbar-actions">
            <span className="user-email">Course: {selectedCourse?.name || "Not selected"}</span>
            <span className="user-email">{currentUser?.email || "User"}</span>
            <button className="btn-logout" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </nav>
      <button className="btn-back" style={{ marginTop: '20px', marginLeft: '20px' }} onClick={handleBackToAssignments}>← Back to Assignments</button>

      <div className="grader-workspace">
        <div className={`grader-main-layout ${submissions.length === 0 ? 'grader-main-layout-full' : ''}`}>
          {submissions.length > 0 && (
            <div className="submissions-list-panel grader-submissions-panel">
              <h2>Submissions</h2>
              <div className="submissions-list">
                {submissions.map((sub) => (
                  <div key={sub.id} className={`submission-item ${selectedSubmission && selectedSubmission.id === sub.id ? 'active' : ''}`} onClick={() => handleViewCode(sub)}>
                    <div className="submission-top">
                      <div>
                        <div className="student-id">{sub.studentName || 'Student'}</div>
                        <div className="submitted-date">{sub.submittedAt ? displayDateAsIST(sub.submittedAt) : ''} IST</div>
                      </div>
                      <div className={`status-badge ${sub.status ? 'status-' + sub.status : ''}`}>{sub.status || 'pending'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grader-content-panel">
            <header className="grader-page-header">
              <div>
                <h1 className="grader-page-title">{selectedAssignment.title}</h1>
                <p className="grader-page-meta">
                  Total Marks: <span>{selectedAssignment.totalMarks || 100}</span>
                </p>
              </div>
            </header>

            <div className="grader-content-stack">
              <div className="grader-upload-card">
                <div className="grader-upload-header">
                  <div>
                    <h3 className="grader-upload-title">Upload Author Solution</h3>
                  </div>
                </div>

                <input ref={graderFileInputRef} id="grader-file-input" type="file" style={{ display: 'none' }} multiple onChange={handleGraderFileChange} />
                <input ref={graderFolderInputRef} id="grader-folder-input" type="file" style={{ display: 'none' }} multiple webkitdirectory="" directory="" onChange={handleGraderFolderChange} />

                <div className="grader-upload-actions">
                  <button type="button" className="grader-upload-picker" onClick={openGraderFilePicker}>Add files</button>
                  <button type="button" className="grader-upload-picker" onClick={openGraderFolderPicker}>Add folder</button>
                  <button type="button" className="grader-upload-clear" onClick={clearQueuedUploads} disabled={uploadFiles.length === 0}>Clear selected</button>
                </div>

                <div
                  className={`grader-upload-dropzone ${uploadFiles.length > 0 ? 'has-files' : ''} ${isUploadDragOver ? 'is-dragover' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsUploadDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsUploadDragOver(false);
                  }}
                  onDrop={handleUploadDrop}
                >
                  <div className="grader-upload-count">{uploadFiles.length > 0 ? `${uploadFiles.length} item(s) selected` : 'Drop files or folders here'}</div>
                </div>

                {uploadFiles.length > 0 && (
                  <div className="grader-upload-list">
                    {uploadFiles.map((file, index) => {
                      const queuedPath = getQueuedPath(file);
                      return (
                        <div key={`${queuedPath}-${index}`} className="grader-upload-item">
                          <div className="grader-upload-item-main">
                            <div className="grader-upload-item-name">{queuedPath}</div>
                            <div className="grader-upload-item-meta">{Math.max(1, Math.round(file.size / 1024))} KB</div>
                          </div>
                          <button
                            type="button"
                            className="grader-upload-remove"
                            onClick={() => removeQueuedUpload(queuedPath)}
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {codeFiles.length > 0 && (
                <div className="grader-run-panel">
                  <div>
                    <p className="grader-run-panel-label">Solution workspace</p>
                    <h3 className="grader-run-panel-title">{codeFiles.length} uploaded file(s) will be tested together</h3>
                  </div>
                  <button className="btn btn-primary grader-run-panel-button" onClick={() => handleRunTests(selectedAssignment)} disabled={runningTests}>
                    {runningTests ? 'Running tests...' : 'Run Tests On All Files'}
                  </button>
                </div>
              )}

              {codeFiles.length > 0 && (
                <div style={{ display: 'flex', minHeight: '500px', flex: 1, background: '#0d1117', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                  <aside style={{ width: '200px', background: 'rgba(0,0,0,0.2)', borderRight: '1px solid var(--border)', padding: '12px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 'bold' }}>Files</p>
                    {codeFiles.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: '4px', gap: '4px' }}>
                        <button onClick={() => { setSelectedFileId(i); setCodeContent(f.fileContent || ''); setCodeName(f.fileName || 'Code'); }} style={{ flex: 1, textAlign: 'left', padding: '10px', borderRadius: '6px', border: 'none', background: selectedFileId === i ? 'var(--primary)' : 'transparent', color: selectedFileId === i ? '#000' : '#fff', cursor: 'pointer' }}>
                          {f.fileName}
                        </button>
                      </div>
                    ))}
                  </aside>
                  <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', height: '50px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--primary)', fontWeight: '600' }}>{codeName}</span>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                      <pre style={{ flex: 1, margin: 0, padding: '24px', overflow: 'auto', fontSize: '14px', lineHeight: '1.6', background: 'var(--bg-code, #1e1e1e)', color: 'var(--text-code, #d4d4d4)' }}>
                        <code style={{ fontFamily: '"SF Mono", "Fira Code", monospace' }}>{codeContent}</code>
                      </pre>

                      {/* Detailed Output Panel at the bottom of the editor */}
                      {testResults.length > 0 && (
                        <div style={{ height: '220px', background: '#161b22', borderTop: '2px solid var(--border)', padding: '20px', overflowY: 'auto' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                            <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Test Results Output</h4>
                            <button onClick={() => setTestResults([])} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
                          </div>
                          {testResults.map((res, index) => (
                            <div key={index} style={{ padding: '12px', borderRadius: '8px', marginBottom: '10px', background: res.passed ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', borderLeft: `4px solid ${res.passed ? '#10b981' : '#ef4444'}` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: '600', color: res.passed ? '#10b981' : '#f87171' }}>{res.passed ? '✓' : '✗'} {res.testName}</span>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{res.passed ? `+${res.marks} marks` : '0 marks'}</span>
                              </div>
                              {!res.passed && res.errorMessage && (
                                <div style={{ marginTop: '8px', fontSize: '12px', color: '#fca5a5', fontFamily: 'monospace' }}>Error: {res.errorMessage}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </main>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={modalTitle} message={modalMessage} type={modalType} actions={modalActions} />
    </div>
  );
}


