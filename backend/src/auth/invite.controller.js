const crypto = require('crypto');
const StudentInvite = require('../models/studentInvite');
const User = require('../models/user');
const Course = require('../models/course');
const CourseUser = require('../models/courseUser');
const bcrypt = require('bcryptjs');
const { sendEmail, getFrontendUrl } = require('../utils/email');
require('dotenv').config();

const generateInviteToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const parseCourseId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const getCourseIdAndVerifyAdmin = async (req) => {
  const rawCourseId = req.query.courseId || req.body.courseId;
  const courseId = parseCourseId(rawCourseId);
  if (!courseId) {
    throw { status: 400, message: 'courseId parameter is required' };
  }

  const course = await Course.findByPk(courseId);
  if (!course) {
    throw { status: 404, message: 'Course not found' };
  }

  const userId = req.user?.id;
  if (!userId) {
    throw { status: 401, message: 'Unauthorized' };
  }

  if (Number(course.adminId) !== Number(userId)) {
    const adminLink = await CourseUser.findOne({
      where: { courseId, userId, role: 'admin' },
    });
    if (!adminLink) {
      throw { status: 403, message: 'You do not have admin access to this course' };
    }
  }

  return courseId;
};

const ensureCourseEnrollment = async (courseId, userId, role = 'student') => {
  if (!courseId) return;
  const existing = await CourseUser.findOne({ where: { courseId, userId } });
  if (!existing) {
    await CourseUser.create({ courseId, userId, role });
  }
};

exports.sendInvites = async (req, res) => {
  try {
    const courseId = await getCourseIdAndVerifyAdmin(req);
    const { emails } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ message: 'Please provide a list of valid email addresses' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails = emails.filter(e => emailRegex.test(e));

    if (validEmails.length === 0) {
      return res.status(400).json({ message: 'No valid email addresses provided' });
    }

    const frontendUrl = getFrontendUrl(req);
    const inviteDurationHours = parseInt(process.env.INVITE_EXPIRY_HOURS, 10) || 168;
    const invites = [];
    const results = {
      success: [],
      failed: [],
    };

    for (const rawEmail of validEmails) {
      const email = String(rawEmail).trim().toLowerCase();
      try {
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
          await ensureCourseEnrollment(courseId, existingUser.id, 'student');

          const loginLink = `${frontendUrl}/login`;
          await sendEmail({
            to: email,
            subject: 'You were added to a new Autograder course',
            html: `
              <h2>You were added to a new course</h2>
              <p>Your account is already registered.</p>
              <p>Please login to access the newly assigned course.</p>
              <a href="${loginLink}" style="
                display: inline-block;
                padding: 10px 20px;
                background-color: #4CAF50;
                color: white;
                text-decoration: none;
                border-radius: 5px;
                margin: 10px 0;
              ">Go to Login</a>
            `,
            text: `You were added to a new Autograder course. Login here: ${loginLink}`,
          });

          results.success.push(email);
          continue;
        }

        const existingInvite = await StudentInvite.findOne({
          where: { email, used: false, courseId },
        });

        let token;
        if (existingInvite && new Date(existingInvite.expiresAt) > new Date()) {
          token = existingInvite.token;
        } else {
          token = generateInviteToken();
          const expiresAt = new Date(Date.now() + inviteDurationHours * 60 * 60 * 1000);

          await StudentInvite.create({
            email,
            courseId,
            token,
            expiresAt,
          });
        }

        const inviteLink = `${frontendUrl}/student-signup?token=${token}`;

        await sendEmail({
          to: email,
          subject: 'You are invited to join our Autograder Platform!',
          html: `
            <h2>Welcome to Autograder!</h2>
            <p>You have been invited to join our platform as a student.</p>
            <p>Click the link below to create your account:</p>
            <a href="${inviteLink}" style="
              display: inline-block;
              padding: 10px 20px;
              background-color: #4CAF50;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin: 10px 0;
            ">Complete Your Sign Up</a>
            <p>Or copy this link: <code>${inviteLink}</code></p>
            <p><strong>Note:</strong> This invite link will expire in ${inviteDurationHours} hours.</p>
            <p>If you have any questions, please contact your administrator.</p>
          `,
          text: `You have been invited to join our Autograder Platform!\nClick the link to sign up: ${inviteLink}\nThis link expires in ${inviteDurationHours} hours.`,
        });

        results.success.push(email);
        invites.push({ email, inviteLink });
      } catch (error) {
        console.error(`Error processing invite for ${email}:`, error);
        const brevoErrors = error?.response?.body?.errors || error?.response?.body?.message;
        const errorMessage = typeof brevoErrors === 'string' ? brevoErrors : null;
        const reason =
          errorMessage ||
          error.message ||
          "Unknown email provider error";

        results.failed.push({
          email,
          reason,
        });
      }
    }

    const allFailed = results.success.length === 0 && results.failed.length > 0;
    const hasUnauthorizedFailure = results.failed.some((f) =>
      String(f.reason || "").toLowerCase().includes("unauthorized") ||
      String(f.reason || "").toLowerCase().includes("invalid") ||
      String(f.reason || "").toLowerCase().includes("api") ||
      String(f.reason || "").toLowerCase().includes("authentication failed") ||
      String(f.reason || "").toLowerCase().includes("eauth") ||
      String(f.reason || "").toLowerCase().includes("535")
    );

    res.json({
      message: allFailed && hasUnauthorizedFailure
        ? 'Invitations failed: email provider unauthorized. Check BREVO_SMTP_KEY, BREVO_SENDER_EMAIL and EMAIL_USER.'
        : 'Invitations processed',
      results: {
        successCount: results.success.length,
        failureCount: results.failed.length,
        successEmails: results.success,
        failedEmails: results.failed,
      },
      ...(process.env.NODE_ENV !== 'production' && { invites }),
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Send invites error:', error);
    res.status(500).json({ message: 'Error sending invitations', error: error.message });
  }
};

exports.validateInvite = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }

    const invite = await StudentInvite.findOne({ where: { token } });

    if (!invite) {
      return res.status(404).json({ message: 'Invalid invite token' });
    }

    if (invite.used) {
      return res.status(400).json({ message: 'This invite has already been used' });
    }

    if (new Date(invite.expiresAt) < new Date()) {
      return res.status(400).json({ message: 'This invite has expired' });
    }

    res.json({
      valid: true,
      email: invite.email,
      message: 'Invite is valid',
    });
  } catch (error) {
    console.error('Validate invite error:', error);
    res.status(500).json({ message: 'Error validating invite', error: error.message });
  }
};

exports.completeSignup = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const invite = await StudentInvite.findOne({ where: { token } });

    if (!invite) {
      return res.status(404).json({ message: 'Invalid invite token' });
    }

    if (invite.used) {
      return res.status(400).json({ message: 'This invite has already been used' });
    }

    if (new Date(invite.expiresAt) < new Date()) {
      return res.status(400).json({ message: 'This invite has expired' });
    }

    const existingUser = await User.findOne({ where: { email: invite.email } });
    if (existingUser) {
      await ensureCourseEnrollment(invite.courseId, existingUser.id, 'student');
      await StudentInvite.update(
        { used: true, usedAt: new Date() },
        { where: { id: invite.id } }
      );
      return res.json({
        message: 'Account already exists. Course access granted.',
        user: {
          id: existingUser.id,
          email: existingUser.email,
          role: existingUser.role,
          name: existingUser.name,
        },
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      email: invite.email,
      password: hashedPassword,
      name: invite.email.split('@')[0],
      role: 'student',
    });

    await StudentInvite.update(
      { used: true, usedAt: new Date() },
      { where: { id: invite.id } }
    );

    await ensureCourseEnrollment(invite.courseId, newUser.id, 'student');

    res.json({
      message: 'Account created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        name: newUser.name,
      },
    });
  } catch (error) {
    console.error('Complete signup error:', error);
    res.status(500).json({ message: 'Error completing signup', error: error.message });
  }
};
