import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/auth";
import "./courseDashboard.css";

export default function CourseDashboard() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [newCourse, setNewCourse] = useState({
    name: "",
    code: "",
    description: "",
  });

  const navigate = useNavigate();

  // Apply dark theme by default
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const response = await api.get("/courses/my-courses");
      const { createdCourses = [], enrolledCourses = [] } = response.data;
      // Combine created and enrolled courses
      const allCourses = [...createdCourses, ...enrolledCourses];
      setCourses(allCourses);
    } catch (err) {
      console.error("Error fetching courses:", err);
      setError("Failed to load courses");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    navigate("/");
  };

  const handleCourseSelect = (courseId) => {
    localStorage.setItem("selectedCourse", courseId);
    navigate("/admin");
  };

  return (
    <div className="course-dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <div className="header-title">
            <h1>📚 My Courses</h1>
            <p>Welcome, {user?.name || "User"}!</p>
          </div>
          <div className="header-actions">
            <button
              className="btn btn-primary"
              onClick={() => setShowModal(true)}
            >
              ➕ Create New Course
            </button>
            <button className="btn btn-secondary" onClick={handleLogout}>
              🚪 Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-main">
        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="loading-spinner">Loading courses...</div>
        ) : courses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h2>No courses yet</h2>
            <p>Create your first course to get started!</p>
            <button
              className="btn btn-primary"
              onClick={() => setShowModal(true)}
            >
              Create Course
            </button>
          </div>
        ) : (
          <div className="courses-grid">
            {courses.map((course) => (
              <div
                key={course.id}
                className="course-card"
                onClick={() => handleCourseSelect(course.id)}
              >
                <div className="course-header">
                  <h3>{course.name}</h3>
                  {course.code && <span className="course-code">{course.code}</span>}
                </div>
                <p className="course-description">{course.description || "No description"}</p>
                <div className="course-footer">
                  <span className="course-id">ID: {course.id}</span>
                  <span className="course-arrow">→</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Course Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Create New Course</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                // This would call a create course endpoint
                // For now, just close modal
                setShowModal(false);
              }}
            >
              <div className="form-group">
                <label>Course Name *</label>
                <input
                  type="text"
                  placeholder="e.g., Advanced Python"
                  value={newCourse.name}
                  onChange={(e) =>
                    setNewCourse({ ...newCourse, name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>Course Code</label>
                <input
                  type="text"
                  placeholder="e.g., CS202"
                  value={newCourse.code}
                  onChange={(e) =>
                    setNewCourse({ ...newCourse, code: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  placeholder="Course description..."
                  rows="4"
                  value={newCourse.description}
                  onChange={(e) =>
                    setNewCourse({ ...newCourse, description: e.target.value })
                  }
                ></textarea>
              </div>
              <div className="modal-buttons">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
