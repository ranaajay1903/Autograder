import { useState, useEffect } from "react";
import api from "../services/auth"; // Updated import
import "./studentDetail.css";

export default function StudentDetail({ submission, assignment, onBack }) {
  const [codeFiles, setCodeFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [codeContent, setCodeContent] = useState("");
  const [testCases, setTestCases] = useState([]);
  const [runningTests, setRunningTests] = useState(false);
  const [testResults, setTestResults] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Apply dark theme by default
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  useEffect(() => {
    fetchData();
  }, [submission.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Get code files for this submission using the automated 'api' service
      const filesRes = await api.get(`/admin/page/grade-submission/${submission.id}`);
      const files = filesRes.data;
      setCodeFiles(files || []);
      if (files && files.length > 0) {
        setSelectedFile(files[0]);
        setCodeContent(files[0].fileContent || "");
      }

      // Get test cases for this assignment
      const testsRes = await api.get(`/admin/page/test-cases-management/${assignment.id}`);
      setTestCases(testsRes.data || []);

      setError("");
    } catch (err) {
      setError("Error loading data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (file) => {
    setSelectedFile(file);
    setCodeContent(file.fileContent || "");
  };

  const handleRunIndividualTest = async (testCaseId) => {
    setRunningTests(true);
    setError("");

    try {
      const response = await api.post(`/admin/page/grade-submission/${submission.id}/run-single-test`, {
        testCaseId
      });
      setTestResults([response.data]);
      setError("");
    } catch (err) {
      setError("Error running test: " + err.message);
    } finally {
      setRunningTests(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "var(--text)" }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", color: "var(--text)" }}>
      {/* Header */}
      <div style={{
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border)",
        padding: "16px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div>
          <button onClick={onBack} style={{
            padding: "8px 12px",
            background: "var(--primary)",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            marginRight: "16px"
          }}>
            ← Back
          </button>
          <span style={{ fontSize: "1.1rem", fontWeight: "600" }}>
            {submission.student?.name || submission.studentEmail} - {assignment.title}
          </span>
        </div>
      </div>

      {error && <div style={{ padding: "12px 20px", background: "rgba(239, 68, 68, 0.1)", color: "#dc2626" }}>{error}</div>}

      {/* Main Content */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "0", minHeight: "calc(100vh - 80px)" }}>
        {/* Left Sidebar - Files List */}
        <div style={{
          background: "var(--bg-secondary)",
          borderRight: "1px solid var(--border)",
          overflowY: "auto",
          padding: "16px"
        }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: "0.95rem", color: "var(--text-secondary)" }}>
            📁 Files ({codeFiles.length})
          </h3>
          {codeFiles.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>No files uploaded</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {codeFiles.map((file) => (
                <button
                  key={file.id}
                  onClick={() => handleFileSelect(file)}
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    background: selectedFile?.id === file.id ? "var(--primary)" : "transparent",
                    color: selectedFile?.id === file.id ? "white" : "var(--text)",
                    border: "1px solid " + (selectedFile?.id === file.id ? "var(--primary)" : "var(--border)"),
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    fontWeight: selectedFile?.id === file.id ? "600" : "400",
                    transition: "all 0.2s"
                  }}
                >
                  📄 {file.fileName}
                </button>
              ))}
            </div>
          )}

          {/* Test Cases */}
          <h3 style={{ margin: "20px 0 12px 0", fontSize: "0.95rem", color: "var(--text-secondary)" }}>
            🧪 Tests ({testCases.length})
          </h3>
          {testCases.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>No test cases</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {testCases.map((test) => (
                <button
                  key={test.id}
                  onClick={() => handleRunIndividualTest(test.id)}
                  disabled={runningTests}
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    background: "rgba(16, 185, 129, 0.1)",
                    color: "var(--primary)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    fontWeight: "500",
                    opacity: runningTests ? 0.5 : 1,
                    transition: "all 0.2s"
                  }}
                >
                  ▶ {test.testName}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Content - Code Viewer */}
        <div style={{ padding: "20px", overflowY: "auto" }}>
          {selectedFile ? (
            <div>
              <h3 style={{ margin: "0 0 12px 0", color: "var(--primary)" }}>
                📄 {selectedFile.fileName}
              </h3>
              <pre style={{
                background: "var(--dark-secondary)",
                padding: "16px",
                borderRadius: "8px",
                overflowX: "auto",
                color: "var(--text-secondary)",
                fontSize: "0.85rem",
                lineHeight: "1.5",
                margin: 0
              }}>
                <code>{codeContent}</code>
              </pre>
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)", textAlign: "center", paddingTop: "40px" }}>
              {codeFiles.length === 0 ? "No files to display" : "Select a file to view code"}
            </p>
          )}

          {/* Test Results */}
          {testResults.length > 0 && (
            <div style={{ marginTop: "20px" }}>
              <h3 style={{ margin: "0 0 12px 0", color: "var(--primary)" }}>🧪 Test Result</h3>
              {testResults.map((result, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "12px",
                    marginBottom: "10px",
                    borderRadius: "6px",
                    background: result.passed ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                    border: `1px solid ${result.passed ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`
                  }}
                >
                  <strong style={{ color: result.passed ? "var(--primary)" : "#dc2626" }}>
                    {result.passed ? "✅" : "❌"} {result.testName}
                  </strong>
                  {!result.passed && result.errorMessage && (
                    <p style={{ margin: "8px 0 0 0", color: "#fca5a5", fontSize: "0.85rem" }}>
                      {result.errorMessage}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}