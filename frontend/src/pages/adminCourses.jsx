import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/auth";
import "./admin.css";
import "./adminCourses.css";
import "./dashboard.css";

export default function AdminCourses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState(() => {
    const saved = localStorage.getItem("selectedCourseId");
    return saved ? parseInt(saved, 10) : null;
  });
  const [newCourse, setNewCourse] = useState({ name: "", code: "", description: "" });
  const [creating, setCreating] = useState(false);
  const [deletingCourseId, setDeletingCourseId] = useState(null);

  const parseCourses = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.courses)) return payload.courses;
    const created = Array.isArray(payload?.createdCourses) ? payload.createdCourses : [];
    const enrolled = Array.isArray(payload?.enrolledCourses) ? payload.enrolledCourses : [];
    return [...created, ...enrolled];
  };

  const fetchCourses = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/courses/my-courses");
      setCourses(parseCourses(res.data));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load courses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");

    fetchCourses();
  }, []);

  const openCourse = (courseId) => {
    localStorage.setItem("selectedCourseId", String(courseId));
    setSelectedCourseId(courseId);
    navigate(`/admin/dashboard?courseId=${courseId}`);
  };

  const handleCreateCourse = async (e) => {
    e.preventDefault();
    if (!newCourse.name.trim()) {
      setError("Course name is required");
      return;
    }

    setCreating(true);
    setError("");
    try {
      const res = await api.post("/courses", {
        name: newCourse.name.trim(),
        code: newCourse.code?.trim() || "",
        description: newCourse.description?.trim() || "",
      });
      const createdCourseId = res?.data?.course?.id;
      setNewCourse({ name: "", code: "", description: "" });
      await fetchCourses();
      if (createdCourseId) {
        openCourse(createdCourseId);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create course");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCourse = async (courseId) => {
    const ok = window.confirm("Delete this course and ALL related data (assignments, submissions, users in course, invites)? This cannot be undone.");
    if (!ok) return;

    setDeletingCourseId(courseId);
    setError("");
    try {
      await api.delete(`/courses/${courseId}`);
      const selected = localStorage.getItem("selectedCourseId");
      if (selected && Number(selected) === Number(courseId)) {
        localStorage.removeItem("selectedCourseId");
      }
      await fetchCourses();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete course");
    } finally {
      setDeletingCourseId(null);
    }
  };

  return (
    <div className="admin-dashboard">
      <div className="course-shell">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="course-card">
          <h3>Create New Course</h3>
          <form onSubmit={handleCreateCourse}>
            <div className="course-grid">
              <div className="form-group">
                <label>Course Name *</label>
                <input
                  type="text"
                  value={newCourse.name}
                  onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
                  placeholder="Course name"
                  disabled={creating}
                />
              </div>
              <div className="form-group">
                <label>Course Code</label>
                <input
                  type="text"
                  value={newCourse.code}
                  onChange={(e) => setNewCourse({ ...newCourse, code: e.target.value })}
                  placeholder="CS101"
                  disabled={creating}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={newCourse.description}
                onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                placeholder="Optional description"
                rows="3"
                disabled={creating}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Creating..." : "Create Course"}
            </button>
          </form>
        </div>

        <div className="course-card">
          <div className="section-header">
            <h2>Your Courses</h2>
          </div>
          {loading ? (
            <div className="loading">Loading courses...</div>
          ) : courses.length === 0 ? (
            <div className="empty-state">No courses found. Create your first course above.</div>
          ) : (
            <div className="course-list">
              {courses.map((course) => (
                <div key={course.id} className="course-item">
                  <div className="user-info">
                    <h4>{course.name}</h4>
                    <p>{course.code || "No code"}{course.description ? ` � ${course.description}` : ""}</p>
                  </div>
                  <div className="user-actions">
                    <button className="btn btn-primary" onClick={() => openCourse(course.id)}>
                      Open Dashboard
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => handleDeleteCourse(course.id)}
                      disabled={deletingCourseId === course.id}
                    >
                      {deletingCourseId === course.id ? "Deleting..." : "Delete Course"}
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
