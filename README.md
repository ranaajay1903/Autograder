# Autograder - Automated Code Assignment & Grading Platform

A full-stack web application for managing, submitting, and automatically grading coding assignments. Built with a modern tech stack featuring React, Node.js/Express, and PostgreSQL on Supabase.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [User Roles & Workflows](#user-roles--workflows)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Database Setup](#database-setup)
- [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)
- [Limitations](#limitations)
- [Future Enhancements](#future-enhancements)

---

## Overview

The Autograder platform streamlines the process of coding assignment management in educational settings. It enables instructors and teaching assistants to create assignments with automated test cases, allows students to submit code solutions, and automatically grades submissions based on predefined test cases.

**Key Use Case**: Universities and coding bootcamps can leverage this platform to efficiently manage programming assignments and provide feedback to students.

---

## Features

### For Students
- **User Authentication**: Secure login/signup with email verification
- **Course Registration**: Join courses via invite codes
- **Assignment Submission**: Upload and submit code solutions
- **Real-time Feedback**: View test results and marks instantly
- **Password Recovery**: Secure password reset functionality
- **Submission History**: Track all submissions and scores

### For Graders/Teaching Assistants
- **Assignment Management**: View and manage course assignments
- **Submission Review**: Review student submissions and test results
- **Reference Solutions**: Create and manage reference solutions with test cases
- **Student Performance Tracking**: Monitor class performance metrics
- **Grading Interface**: Mark submissions and provide feedback

### For Administrators
- **User Management**: Create courses, manage users and roles
- **Course Administration**: Set up courses and invite instructors
- **System Monitoring**: Manage graders and student assignments
- **Bulk Operations**: Import users and manage permissions
- **Assignment Configuration**: Create and deploy assignments with test cases

---

## Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| **React 19.2** | UI framework |
| **Vite 7.2** | Build tool & dev server |
| **Tailwind CSS 4.1** | Utility-first CSS framework |
| **React Router 7.12** | Client-side routing |
| **Axios 1.13** | HTTP client for API calls |
| **JavaScript (ES Modules)** | Language |

### Backend
| Technology | Purpose |
|-----------|---------|
| **Node.js 24.x** | JavaScript runtime |
| **Express.js 5.2** | Web application framework |
| **Sequelize 6.37** | ORM for database queries |
| **PostgreSQL** | Database (via Supabase) |
| **JWT** | Authentication & authorization |
| **Bcryptjs** | Password hashing |
| **Brevo** | Email notifications |
| **Multer** | File upload handling |

### Database & Infrastructure
| Technology | Purpose |
|-----------|---------|
| **Supabase** | PostgreSQL database & authentication |
| **Render** | Backend & frontend deployment |
| **Docker** | Containerization |

---

## System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (BROWSER)                         │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React Frontend (Vite + Tailwind CSS)                    │   │
│  │  - Login / Signup Pages                                  │   │
│  │  - Student/Grader/Admin Dashboards                       │   │
│  │  - Assignment & Submission Management                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                    REST API (HTTPS)
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                  BACKEND SERVER (Render)                        │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Express.js Application                                  │   │
│  │  ├─ Authentication Routes (JWT)                         │   │
│  │  ├─ Assignment Routes                                   │   │
│  │  ├─ Submission Routes                                   │   │
│  │  ├─ Grading Routes                                      │   │
│  │  ├─ User Management Routes                              │   │
│  │  └─ Course Management Routes                            │   │
│  │                                                          │   │
│  │  Middleware:                                            │   │
│  │  ├─ JWT Verification                                    │   │
│  │  ├─ Role-Based Access Control                           │   │
│  │  └─ Error Handling                                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                         │                                        │
│                    Sequelize ORM                                 │
│                         │                                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    PostgreSQL      Email Service   File Storage
         │             (Brevo)         │
    (Supabase)                     (Local/Cloud)
```

### Data Flow Diagram

```
STUDENT SUBMISSION WORKFLOW
═══════════════════════════════════════

1. Student Access
   │
   └─→ Login/Signup
       │
       └─→ Browse Courses
           │
           └─→ View Assignments
               │
               └─→ Submit Code
                   │
                   ├─→ Upload Code Files
                   └─→ Save Submission
                       │
                       └─→ Trigger Test Execution
                           │
                           ├─→ Run Test Cases
                           ├─→ Compare Output
                           └─→ Generate Test Results
                               │
                               └─→ Calculate Marks
                                   │
                                   └─→ Notify Student
                                       │
                                       └─→ Display Score & Feedback


GRADER REVIEW WORKFLOW
══════════════════════════════════════

1. Grader Access
   │
   └─→ Login (Grader Account)
       │
       └─→ View Courses
           │
           └─→ View Submissions
               │
               ├─→ Review Code
               ├─→ Check Test Results
               └─→ Add Comments/Marks
                   │
                   └─→ Finalize Grade
                       │
                       └─→ Notify Student
```

### Authentication & Authorization Flow

```
┌─────────────────────────────────────┐
│  User Credentials                   │
│  (Email + Password)                 │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  Backend Authentication              │
│  ├─ Verify Email                    │
│  ├─ Hash & Compare Password         │
│  └─ Generate JWT Token              │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  JWT Token Issued                   │
│  (Stored in localStorage)           │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  Subsequent API Requests            │
│  (Include JWT in Header)            │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  JWT Verification Middleware        │
│  ├─ Extract Token                   │
│  ├─ Verify Signature                │
│  └─ Extract User Info & Role        │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  Role-Based Access Control          │
│  ├─ Check User Role                 │
│  ├─ Verify Resource Permission      │
│  └─ Grant/Deny Access               │
└─────────────────────────────────────┘

ROLES:
- STUDENT: Access own submissions, view feedback
- GRADER: Review submissions, create reference solutions
- ADMIN: Full system access, user management
```

---

## Project Structure

```
root/
├── backend/                              # Node.js/Express backend
│   ├── src/
│   │   ├── app.js                       # Express app configuration
│   │   ├── server.js                    # Server entry point
│   │   ├── auth/                        # Authentication & route handlers
│   │   │   ├── auth.routes.js           # Auth endpoints
│   │   │   ├── auth.controller.js       # Auth business logic
│   │   │   ├── assignments.routes.js    # Assignment endpoints
│   │   │   ├── submissions.routes.js    # Submission endpoints
│   │   │   ├── grader.routes.js         # Grader endpoints
│   │   │   ├── admin.routes.js          # Admin endpoints
│   │   │   └── ...                      # Other route handlers
│   │   ├── config/                      # Configuration files
│   │   │   ├── database.js              # Database connection
│   │   │   ├── initDb.js                # DB initialization
│   │   │   └── ...                      # Other configs
│   │   ├── middlewares/                 # Express middlewares
│   │   │   ├── auth.middleware.js       # JWT verification
│   │   │   ├── role.middleware.js       # Role-based access
│   │   │   └── verify.middleware.js     # Token validation
│   │   ├── models/                      # Sequelize database models
│   │   │   ├── user.js                  # User model
│   │   │   ├── assignment.js            # Assignment model
│   │   │   ├── submission.js            # Submission model
│   │   │   ├── testCase.js              # Test case model
│   │   │   ├── testResult.js            # Test result model
│   │   │   └── ...                      # Other models
│   │   ├── services/                    # Business logic services
│   │   │   ├── fileService.js           # File handling
│   │   │   └── email.js                 # Email notifications
│   │   ├── utils/                       # Utility functions
│   │   └── temp/                        # Temporary file storage
│   ├── package.json                     # Backend dependencies
│   └── Dockerfile                       # Docker configuration
│
├── frontend/                             # React frontend
│   ├── src/
│   │   ├── main.jsx                     # React entry point
│   │   ├── App.jsx                      # Main app component
│   │   ├── pages/                       # Page components
│   │   │   ├── login.jsx                # Login page
│   │   │   ├── signup.jsx               # Signup page
│   │   │   ├── dashboard.jsx            # Student dashboard
│   │   │   ├── grader.jsx               # Grader dashboard
│   │   │   ├── admin.jsx                # Admin dashboard
│   │   │   ├── courseDashboard.jsx      # Course-specific view
│   │   │   ├── testCaseManager.jsx      # Test case management
│   │   │   └── ...                      # Other pages
│   │   ├── components/                  # Reusable components
│   │   ├── services/                    # API service calls
│   │   │   └── auth.js                  # Authentication service
│   │   ├── assets/                      # Images, icons, etc.
│   │   ├── App.css                      # Global styles
│   │   └── index.css                    # Base styles
│   ├── public/                          # Static files
│   ├── package.json                     # Frontend dependencies
│   ├── vite.config.js                   # Vite configuration
│   ├── eslint.config.js                 # ESLint configuration
│   └── tailwind.config.js               # Tailwind CSS config
│
├── package.json                         # Root package.json
├── Dockerfile                           # Docker setup
└── README.md                            # This file
```

---

## User Roles & Workflows

### 1. Student Workflow

```
Student Registration
    ↓
[Student Signup] → Verify Email → Set Password
    ↓
[Login] → View Available Courses
    ↓
[Join Course] → View Assignments
    ↓
[Submit Assignment] → Upload Code Files
    ↓
[Tests Run Automatically]
    ↓
[View Results] → See Marks & Test Feedback
    ↓
[Resubmit] (if allowed) → Improve Score
```

**Permissions**:
- View own profile and assignments
- Submit code for assigned courses
- View own submission history and grades
- Access password reset

### 2. Grader/TA Workflow

```
Grader Login
    ↓
[View Courses] → Manage Assignments
    ↓
[Create Reference Solution] → Add Test Cases
    ↓
[Review Submissions] → See Automated Test Results
    ↓
[Add Manual Feedback] → Set Final Marks
    ↓
[Release Grades] → Notify Students
```

**Permissions**:
- View all student submissions in assigned courses
- Create and manage reference solutions
- Create and manage test cases
- View and update student marks
- Generate performance reports

### 3. Admin Workflow

```
Admin Login
    ↓
[User Management] → Create Courses
    ↓
[Invite Graders] → Assign to Courses
    ↓
[Invite Students] → Bulk Import
    ↓
[Monitor System] → View All Activities
    ↓
[Configure Settings] → Manage Permissions
```

**Permissions**:
- Full system access
- Create and manage courses
- Manage all users (students, graders, admins)
- View all submissions and grades
- System configuration and maintenance

---

## Getting Started

### Prerequisites

- **Node.js 24.x** and npm
- **PostgreSQL** (via Supabase account)
- **Render account** (for deployment)
- **Git** for version control

---

## Deployment Guide

This app requires a PostgreSQL database and environment variables to run. Follow these steps to deploy on your own infrastructure.

### Prerequisites
- Node.js 20+ (matches Dockerfile)
- PostgreSQL database (local or cloud, e.g., Supabase, AWS RDS)
- Java JDK (for code execution features)

### Setup Steps
1. **Clone the repo**:
   ```
   git clone <your-repo-url>
   cd autograder
   ```

2. **Install dependencies**:
   ```
   npm run install-all  # Installs backend and frontend deps
   ```

3. **Set up the database**:
   - Create a PostgreSQL database instance.
   - Run the init script to set up tables: `node backend/src/config/initDb.js` (ensure your DB is running and env vars are set).
   - If migrating data, run additional scripts in `backend/` as needed (e.g., `node backend/src/config/migrate-graders-to-courses.js`).

4. **Configure environment variables**:
   - Copy `backend/.env.example` to `backend/.env`.
   - Fill in real values:
     - For `DATABASE_URL`: Use your DB's connection string (e.g., from Supabase or local Postgres).
     - Generate a secure `JWT_SECRET` (e.g., run `openssl rand -hex 32` in terminal).
     - Set `NODE_ENV` to `production` for deployment.
   - If using Docker, pass env vars via `-e` flags or a mounted `.env` file.

5. **Build and run**:
   - For development: `npm run dev` (backend only) or `npm run dev --prefix frontend`.
   - For production:
     - Build frontend: `npm run build`.
     - Start backend: `npm start`.
   - Using Docker: `docker build -t autograder .` then `docker run -p 5000:5000 --env-file backend/.env autograder`.

### Notes
- The app runs on port 5000 by default.
- Ensure your DB allows connections from your deploy service (e.g., whitelist IPs for cloud DBs).
- For email features, configure Brevo (see `BREVO_SETUP.md`).
- Test locally first: Run `npm run dev` in backend and `npm run dev` in frontend.

If issues arise, check logs for DB connection errors or missing env vars.

---

## Database Setup

### Database Schema Overview

```
TABLE: users
├─ id (PK)
├─ email (UNIQUE)
├─ password (hashed)
├─ name
├─ role (student|grader|admin)
└─ createdAt

TABLE: courses
├─ id (PK)
├─ title
├─ description
├─ code
└─ createdAt

TABLE: courseUsers
├─ id (PK)
├─ courseId (FK → courses)
├─ userId (FK → users)
└─ role

TABLE: assignments
├─ id (PK)
├─ courseId (FK → courses)
├─ title
├─ description
├─ dueDate
├─ totalMarks
└─ createdAt

TABLE: submissions
├─ id (PK)
├─ assignmentId (FK → assignments)
├─ studentId (FK → users)
├─ submissionDate
└─ marks

TABLE: codeFiles
├─ id (PK)
├─ submissionId (FK → submissions)
├─ fileName
├─ fileContent
└─ uploadedAt

TABLE: testCases
├─ id (PK)
├─ assignmentId (FK → assignments)
├─ input
├─ expectedOutput
└─ marksPerTest

TABLE: testResults
├─ id (PK)
├─ submissionId (FK → submissions)
├─ testCaseId (FK → testCases)
├─ output
├─ passed (boolean)
└─ executedAt

TABLE: graderSolutions
├─ id (PK)
├─ assignmentId (FK → assignments)
├─ graderId (FK → users)
└─ createdAt

TABLE: passwordResetTokens
├─ id (PK)
├─ userId (FK → users)
├─ token
└─ expiresAt

TABLE: studentInvites
├─ id (PK)
├─ email
├─ courseId (FK → courses)
└─ inviteCode
```
---

## API Documentation

### Authentication Endpoints

```bash
POST /api/auth/signup
- Body: { email, password, name }
- Response: { id, email, role, token }

POST /api/auth/login
- Body: { email, password }
- Response: { id, email, role, token }

POST /api/auth/logout
- Headers: { Authorization: Bearer token }
- Response: { message: "Logged out successfully" }

POST /api/auth/password-reset/request
- Body: { email }
- Response: { message: "Reset link sent" }

POST /api/auth/password-reset/verify
- Body: { token, newPassword }
- Response: { message: "Password updated" }
```

### Assignment Endpoints

```bash
GET /api/assignments?courseId=<courseId>
- Headers: { Authorization: Bearer token }
- Response: [{ id, title, dueDate, totalMarks, ... }]

POST /api/assignments
- Headers: { Authorization: Bearer token }
- Body: { courseId, title, description, dueDate, totalMarks }
- Response: { id, title, ... }

GET /api/assignments/<id>
- Headers: { Authorization: Bearer token }
- Response: { id, title, testCases: [...], ... }
```

### Submission Endpoints

```bash
POST /api/submissions
- Headers: { Authorization: Bearer token }
- Body: FormData with code files
- Response: { id, submissionDate, marks, testResults: [...] }

GET /api/submissions/<id>
- Headers: { Authorization: Bearer token }
- Response: { id, codeFiles: [...], testResults: [...], ... }

GET /api/submissions?assignmentId=<id>
- Headers: { Authorization: Bearer token }
- Response: [{ id, studentId, marks, ... }]
```

### Test Case Endpoints

```bash
POST /api/testcases
- Headers: { Authorization: Bearer token }
- Body: { assignmentId, input, expectedOutput, marksPerTest }
- Response: { id, assignmentId, ... }

DELETE /api/testcases/<id>
- Headers: { Authorization: Bearer token }
- Response: { message: "Test case deleted" }
```

---

## Limitations

### Current Version Limitations

1. **Test Execution**
   - Limited to Java code execution currently
   - Timeout constraints on test execution (default: 30 seconds)
   - Memory limits per submission (256MB)
   - No support for multiple programming languages yet

2. **File Uploads**
   - Maximum file size: 5MB per submission
   - Limited to `.java` files by default
   - No file versioning system

3. **Performance & Scalability**
   - Sequential test execution (not parallelized)
   - Database queries may slow down with large datasets (>100k submissions)
   - No caching layer (Redis) implemented
   - Single-server deployment (no load balancing)

4. **Features Not Yet Implemented**
   - Plagiarism detection
   - Multiple file format support (Python, Java, C++, etc.)
   - Analytics and detailed performance dashboards

5. **Security Considerations**
   - No two-factor authentication (2FA)
   - Password reset tokens don't have strong expiration enforcement

6. **User Interface**
   - Limited responsive design for mobile devices
   - Basic error handling and user feedback

7. **Infrastructure**
   - Render free tier limitations (deployment sleeps after inactivity)
   - Single database instance (no redundancy)
   - No automated backups configured
   - Limited logging and monitoring

### Workarounds for Current Limitations

1. **For multiple programming languages**: Use Docker containers for code execution (future enhancement)
2. **For high-volume submissions**: Implement Redis caching and database indexing
3. **For file storage**: Migrate to AWS S3 or similar cloud storage
4. **For scalability**: Implement job queues (Bull, RabbitMQ) for test execution
5. **For security**: Add rate limiting middleware, implement 2FA, add audit logging

---

## Future Enhancements

### Phase 2 Features (High Priority)

- [ ] Support for multiple programming languages (Python, Java, C++, etc.)
- [ ] Real-time submission notifications
- [ ] Plagiarism detection using MOSS or similar
- [ ] Mobile-responsive design

### Phase 3 Features (Medium Priority)

- [ ] Analytics dashboard with performance metrics
- [ ] AI-powered code review suggestions
- [ ] Two-factor authentication (2FA)

---

### Development Workflow

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and commit: `git commit -m "Add your feature"`
3. Push to GitHub: `git push origin feature/your-feature`
4. Create a Pull Request with detailed description

---

## Authors & Contributors

- Ajay Singh
- Khush Jain

---

## Additional Resources

- [Express.js Documentation](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [Sequelize ORM Guide](https://sequelize.org/)
- [Supabase Documentation](https://supabase.com/docs)
- [Render Deployment Guide](https://render.com/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

---

## Questions?

For questions or issues, please:
1. Check the documentation above
2. Review existing GitHub issues
3. Create a new issue with detailed information
4. Contact the project maintainers

---

**Last Updated**: April 2026  
**Version**: 1.0.0  
**Status**: Active Development

