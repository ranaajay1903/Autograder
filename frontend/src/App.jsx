import { useState, useEffect, useRef } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import Home from './pages/home'
import Login from './pages/login'
import Signup from './pages/signup'
import ForgotPassword from './pages/forgotPassword'
import Dashboard from './pages/dashboard'
import GraderDashboard from './pages/grader'
import GraderCourses from './pages/graderCourses'
import AdminDashboard from './pages/admin'
import AdminCourses from './pages/adminCourses'
import StudentCourses from './pages/studentCourses'
import InviteStudents from './pages/inviteStudents'
import StudentSignup from './pages/studentSignup'
import ResetPassword from './pages/resetPassword'
import { AUTH_LOGOUT_EVENT, logout } from './services/auth'

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000

function App() {
  const initializeAuth = () => {
    const token = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')
    
    if (token && storedUser) {
      try {
        const parsed = JSON.parse(storedUser)
        const normalizedRole = (parsed.role === 'ta' || parsed.role === 'TA') ? 'grader' : parsed.role;
        const userData = { ...parsed, role: normalizedRole };
        return { isAuth: true, role: userData.role, user: userData }
      } catch (error) {
        localStorage.removeItem('token')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('user')
        localStorage.removeItem('selectedCourseId')
        localStorage.removeItem('selectedCourse')
      }
    }
    return { isAuth: false, role: null, user: null }
  }

  const authState = initializeAuth()
  const [isAuthenticated, setIsAuthenticated] = useState(authState.isAuth)
  const [userRole, setUserRole] = useState(authState.role)
  const [user, setUser] = useState(authState.user)
  const inactivityTimeoutRef = useRef(null)
  const lastActivityRef = useRef(Number(localStorage.getItem('lastActivityAt')) || Date.now())

  const handleLogout = () => {
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current)
    }
    setIsAuthenticated(false)
    setUserRole(null)
    setUser(null)
    logout()
  }

  useEffect(() => {
    const syncAuthState = () => {
      const nextAuthState = initializeAuth()
      setIsAuthenticated(nextAuthState.isAuth)
      setUserRole(nextAuthState.role)
      setUser(nextAuthState.user)
    }

    const handleStorageChange = (event) => {
      if (!event.key || ['token', 'refreshToken', 'user'].includes(event.key)) {
        syncAuthState()
      }
    }

    window.addEventListener(AUTH_LOGOUT_EVENT, syncAuthState)
    window.addEventListener('storage', handleStorageChange)

    return () => {
      window.removeEventListener(AUTH_LOGOUT_EVENT, syncAuthState)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current)
        inactivityTimeoutRef.current = null
      }
      return
    }

    const markActivity = () => {
      const now = Date.now()
      lastActivityRef.current = now
      localStorage.setItem('lastActivityAt', String(now))

      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current)
      }

      inactivityTimeoutRef.current = setTimeout(() => {
        logout()
      }, INACTIVITY_LIMIT_MS)
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        return
      }

      const lastActivityAt = Number(localStorage.getItem('lastActivityAt')) || lastActivityRef.current
      if (Date.now() - lastActivityAt >= INACTIVITY_LIMIT_MS) {
        logout()
        return
      }

      markActivity()
    }

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, markActivity)
    })
    document.addEventListener('visibilitychange', handleVisibilityChange)

    markActivity()

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity)
      })
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current)
        inactivityTimeoutRef.current = null
      }
    }
  }, [isAuthenticated])

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            isAuthenticated ?
            (userRole === 'grader' ? <Navigate to="/grader/dashboard" replace={true} /> : <Navigate to={`/${userRole}`} replace={true} />) :
            <Home />
          }
        />
        <Route 
          path="/login" 
          element={
            isAuthenticated ? 
            (userRole === 'grader' ? <Navigate to="/grader/dashboard" replace={true} /> : <Navigate to={`/${userRole}`} replace={true} />) : 
            <Login setIsAuthenticated={setIsAuthenticated} setUserRole={setUserRole} setUser={setUser} />
          } 
        />
        <Route
          path="/signup"
          element={
            isAuthenticated ?
            <Navigate to={`/${userRole}`} replace={true} /> :
            <Signup setIsAuthenticated={setIsAuthenticated} setUserRole={setUserRole} setUser={setUser} />
          }
        />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/student"
          element={
            isAuthenticated && userRole === 'student' ?
            <Navigate to="/student/courses" /> :
            <Navigate to="/" replace={true} />
          }
        />

        <Route
          path="/student/courses"
          element={
            isAuthenticated && userRole === 'student' ?
            <StudentCourses /> :
            <Navigate to="/" replace={true} />
          }
        />

        <Route
          path="/student/dashboard"
          element={
            isAuthenticated && userRole === 'student' ?
            <Dashboard handleLogout={handleLogout} user={user} /> :
            <Navigate to="/" replace={true} />
          }
        />

        <Route
          path="/student/submit/:assignmentId"
          element={
            isAuthenticated && userRole === 'student' ?
            <Dashboard handleLogout={handleLogout} user={user} /> :
            <Navigate to="/login" />
          }
        />

        <Route
          path="/student/view-results/:submissionId"
          element={
            isAuthenticated && userRole === 'student' ?
            <Dashboard handleLogout={handleLogout} user={user} /> :
            <Navigate to="/login" />
          }
        />

        <Route
          path="/grader"
          element={
            isAuthenticated && userRole === 'grader' ? (
              <Navigate to="/grader/courses" />
            ) : (
              <Navigate to="/" replace={true} />
            )
          }
        />

        <Route
          path="/grader/courses"
          element={
            isAuthenticated && userRole === 'grader' ? (
              <GraderCourses />
            ) : (
              <Navigate to="/" replace={true} />
            )
          }
        />

        <Route
          path="/grader/dashboard"
          element={
            isAuthenticated && userRole === 'grader' ? (
              <GraderDashboard />
            ) : (
              <Navigate to="/" replace={true} />
            )
          }
        />

        <Route
          path="/grader/test-solutions/:assignmentId"
          element={
            isAuthenticated && userRole === 'grader' ? (
              <GraderDashboard />
            ) : (
              <Navigate to="/" replace={true} />
            )
          }
        />

        <Route
          path="/grader/grade-submissions/:assignmentId"
          element={
            isAuthenticated && userRole === 'grader' ? (
              <GraderDashboard />
            ) : (
              <Navigate to="/" replace={true} />
            )
          }
        />

        <Route
          path="/admin"
          element={
            isAuthenticated && userRole === 'admin' ?
            <Navigate to="/admin/courses" /> :
            <Navigate to="/" replace={true} />
          }
        />

        <Route
          path="/admin/courses"
          element={
            isAuthenticated && userRole === 'admin' ? (
              <div className="with-navbar">
                <nav className="navbar" style={{ padding: "15px" }}>
                  <div className="navbar-content">
                    <h2 className="navbar-title">Autograder - Admin</h2>
                    <div className="navbar-user">
                      <span>{user?.name}</span>
                      <button className="logout-btn" onClick={handleLogout}>Logout</button>
                    </div>
                  </div>
                </nav>
                <AdminCourses />
              </div>
            ) : (
              <Navigate to="/" replace={true} />
            )
          }
        />

        <Route
          path="/admin/dashboard"
          element={
            isAuthenticated && userRole === 'admin' ? (
                <AdminDashboard />
            ) : (
              <Navigate to="/" replace={true} />
            )
          }
        />

        <Route
          path="/admin/test-cases-management/:assignmentId"
          element={
            isAuthenticated && userRole === 'admin' ? (
              <div className="with-navbar">
                <nav className="navbar">
                  <div className="navbar-content">
                    <h2 className="navbar-title">Autograder - Admin</h2>
                    <div className="navbar-user">
                      <span>{user?.name}</span>
                      <button className="logout-btn" onClick={handleLogout}>Logout</button>
                    </div>
                  </div>
                </nav>
                <AdminDashboard />
              </div>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/grade-submission/:submissionId"
          element={
            isAuthenticated && userRole === 'admin' ? (
              <div className="with-navbar">
                <nav className="navbar">
                  <div className="navbar-content">
                    <h2 className="navbar-title">Autograder - Admin</h2>
                    <div className="navbar-user">
                      <span>{user?.name}</span>
                      <button className="logout-btn" onClick={handleLogout}>Logout</button>
                    </div>
                  </div>
                </nav>
                <AdminDashboard />
              </div>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/student-signup"
          element={
            <StudentSignup />
          }
        />

        <Route
          path="/admin/invite-students"
          element={
            isAuthenticated && userRole === 'admin' ? (
              <div className="with-navbar">
                <nav className="navbar">
                  <div className="navbar-content">
                    <h2 className="navbar-title">Autograder - Admin</h2>
                    <div className="navbar-user">
                      <span>{user?.name}</span>
                      <button className="logout-btn" onClick={handleLogout}>Logout</button>
                    </div>
                  </div>
                </nav>
                <InviteStudents />
              </div>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

      </Routes>
    </Router>
  )
}

export default App
