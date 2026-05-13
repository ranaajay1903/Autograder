const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const PasswordResetToken = require('../models/passwordResetToken');
const { sendEmail, getFrontendUrl } = require('../utils/email');

const generateResetToken = () => crypto.randomBytes(32).toString('hex');

const genericResetMessage = 'If an account with that email exists, a password reset link has been sent.';

exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ where: { email: normalizedEmail } });

    if (!user) {
      return res.json({ message: genericResetMessage });
    }

    await PasswordResetToken.update(
      { used: true, usedAt: new Date() },
      { where: { userId: user.id, used: false } }
    );

    const resetDurationHours = parseInt(process.env.PASSWORD_RESET_EXPIRY_HOURS, 10) || 1;
    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + resetDurationHours * 60 * 60 * 1000);

    await PasswordResetToken.create({
      userId: user.id,
      email: user.email,
      token,
      expiresAt,
    });

    const resetLink = `${getFrontendUrl(req)}/reset-password?token=${token}`;

    await sendEmail({
      to: user.email,
      subject: 'Reset your Autograder password',
      html: `
        <h2>Password Reset Request</h2>
        <p>Hello ${user.name || user.email},</p>
        <p>We received a request to reset your Autograder password.</p>
        <p>Click the link below to choose a new password:</p>
        <a href="${resetLink}" style="
          display: inline-block;
          padding: 10px 20px;
          background-color: #4CAF50;
          color: white;
          text-decoration: none;
          border-radius: 5px;
          margin: 10px 0;
        ">Reset Password</a>
        <p>Or copy this link: <code>${resetLink}</code></p>
        <p><strong>Note:</strong> This link will expire in ${resetDurationHours} hour(s).</p>
        <p>If you did not request this, you can safely ignore this email.</p>
      `,
      text: `Reset your Autograder password: ${resetLink}\nThis link expires in ${resetDurationHours} hour(s).`,
    });

    return res.json({
      message: genericResetMessage,
      ...(process.env.NODE_ENV !== 'production' && { resetLink }),
    });
  } catch (error) {
    console.error('Request password reset error:', error);
    return res.status(500).json({ message: 'Error sending password reset link', error: error.message });
  }
};

exports.validateResetToken = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }

    const resetToken = await PasswordResetToken.findOne({ where: { token } });

    if (!resetToken) {
      return res.status(404).json({ message: 'Invalid reset token' });
    }

    if (resetToken.used) {
      return res.status(400).json({ message: 'This reset link has already been used' });
    }

    if (new Date(resetToken.expiresAt) < new Date()) {
      return res.status(400).json({ message: 'This reset link has expired' });
    }

    return res.json({
      valid: true,
      email: resetToken.email,
      message: 'Reset token is valid',
    });
  } catch (error) {
    console.error('Validate password reset token error:', error);
    return res.status(500).json({ message: 'Error validating reset token', error: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const resetToken = await PasswordResetToken.findOne({ where: { token } });

    if (!resetToken) {
      return res.status(404).json({ message: 'Invalid reset token' });
    }

    if (resetToken.used) {
      return res.status(400).json({ message: 'This reset link has already been used' });
    }

    if (new Date(resetToken.expiresAt) < new Date()) {
      return res.status(400).json({ message: 'This reset link has expired' });
    }

    const user = await User.findByPk(resetToken.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await user.update({ password: hashedPassword });
    await PasswordResetToken.update(
      { used: true, usedAt: new Date() },
      { where: { id: resetToken.id } }
    );

    return res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ message: 'Error resetting password', error: error.message });
  }
};
