import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { logout } from "../services/auth";
import "./admin.css";
import "./adminCourses.css";
import "./dashboard.css";

export default function GraderCourses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState(() => {
    const saved = localStorage.getItem("selectedCourseId");
    return saved ? parseInt(saved, 10) : null;
  });

    const [currentUser, setCurrentUser] = useState(null);

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
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  useEffect(() => {
    const fetchCourses = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get("/courses/my-courses");
        const payload = res.data || {};
        const enrolled = Array.isArray(payload.enrolledCourses) ? payload.enrolledCourses : [];
        const available = Array.isArray(payload.courses) ? payload.courses : enrolled;
        setCourses(available);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load courses");
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, []);

const selectedCourse = courses.find((course) => course.id === selectedCourseId);

  const openCourse = (courseId) => {
    localStorage.setItem("selectedCourseId", String(courseId));
    setSelectedCourseId(courseId);
    navigate(`/grader/dashboard?courseId=${courseId}`);
  };

  return (
    <div className="admin-dashboard">
      <nav className="navbar" style={{ paddingBottom: "15px" }}>
              <div className="navbar-content">
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <h1 className="brand">Autograder - Grader</h1>
                </div>
                <div className="navbar-actions">
                  <span className="user-email">{currentUser?.email || "User"}</span>
                  <button className="btn-logout" onClick={logout}>Logout</button>
                </div>
              </div>
            </nav>
      <div className="course-shell">
      <div className="course-card">
        <div className="section-header">
          <h2>Your Courses</h2>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {loading ? (
          <div className="loading">Loading courses...</div>
        ) : courses.length === 0 ? (
          <div className="empty-state">No course assignment found yet.</div>
        ) : (
          <div className="course-list">
            {courses.map((course) => (
              <div key={course.id} className="course-item">
                <div className="user-info">
                  <h4>{course.name}</h4>
                  <p>{course.code || "No code"}{course.description ? ` • ${course.description}` : ""}</p>
                </div>
                <div className="user-actions">
                  <button className="btn btn-primary" onClick={() => openCourse(course.id)}>
                    Open Dashboard
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
