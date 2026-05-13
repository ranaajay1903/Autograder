import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../services/auth";
import "./login.css";
import "./signup.css";

export default function Signup({ setIsAuthenticated, setUserRole, setUser }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
    courseName: "",
    courseCode: "",
    courseDescription: "",
  });

  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError("");
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (
      !formData.email ||
      !formData.password ||
      !formData.confirmPassword ||
      !formData.name ||
      !formData.courseName
    ) {
      setError("All fields are required");
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    try {
      const response = await api.post("/courses/signup", {
        email: formData.email,
        password: formData.password,
        name: formData.name,
        courseName: formData.courseName,
        courseCode: formData.courseCode || null,
        courseDescription: formData.courseDescription || null,
      });

      const data = response.data;

      localStorage.setItem("token", data.token);
      localStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("user", JSON.stringify(data.user));

      if (data.course?.id) {
        localStorage.setItem("selectedCourseId", data.course.id.toString());
        localStorage.setItem("selectedCourse", data.course.id.toString());
      }

      setIsAuthenticated(true);
      setUserRole("admin");
      setUser(data.user);
      setSuccess("Account and course created successfully!");

      setTimeout(() => {
        navigate("/admin");
      }, 1500);
    } catch (err) {
      console.error("Signup error:", err);
      const msg =
        err.response?.data?.message || "Signup failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container signup-container">
        <div className="login-card signup-card">
          <div className="login-header signup-header">
            <h1 className="brand-title">Autograder</h1>
            <p className="brand-subtitle">Create your account and first course.</p>
          </div>

          <form onSubmit={handleSignup} className="login-form signup-form">
            <div className="form-section">
              <h3>Personal Information</h3>

              <div className="form-group">
                <label htmlFor="name">Full Name *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  placeholder="Your full name"
                  value={formData.name}
                  onChange={handleChange}
                  disabled={loading}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email Address *</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={loading}
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="password">Password *</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    placeholder="Min 6 characters"
                    value={formData.password}
                    onChange={handleChange}
                    disabled={loading}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm Password *</label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    placeholder="Re-enter password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    disabled={loading}
                    className="form-input"
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3>Course Information</h3>

              <div className="form-group">
                <label htmlFor="courseName">Course Name *</label>
                <input
                  type="text"
                  id="courseName"
                  name="courseName"
                  placeholder="e.g., Introduction to Programming"
                  value={formData.courseName}
                  onChange={handleChange}
                  disabled={loading}
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="courseCode">Course Code</label>
                  <input
                    type="text"
                    id="courseCode"
                    name="courseCode"
                    placeholder="e.g., CS101"
                    value={formData.courseCode}
                    onChange={handleChange}
                    disabled={loading}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="courseDescription">Description</label>
                  <textarea
                    id="courseDescription"
                    name="courseDescription"
                    placeholder="Brief course description (optional)"
                    rows="3"
                    value={formData.courseDescription}
                    onChange={handleChange}
                    disabled={loading}
                    className="form-input signup-textarea"
                  ></textarea>
                </div>
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <button
              type="submit"
              className="btn-login"
              disabled={loading}
            >
              {loading ? "Creating Account..." : "Create Account & Course"}
            </button>
          </form>

          <p className="login-link signup-login-link">
            Already have an account?{" "}
            <Link to="/login" className="form-link">
              Login here
            </Link>
          </p>
        </div>
      
    </div>
  );
}
