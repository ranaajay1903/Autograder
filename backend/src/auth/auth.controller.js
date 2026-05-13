const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/user");
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";
const REFRESH_SECRET = process.env.REFRESH_SECRET || "dev_refresh_secret_change_me";

// Updated Login: Issues two tokens
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.password || typeof user.password !== "string") {
      console.error(`Login rejected for user ${user.id}: password hash missing/invalid`);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Access Token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "1h" } 
    );

    // Refresh Token
    const refreshToken = jwt.sign(
      { id: user.id },
      REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login error" });
  }
};

// New Refresh Function: Generates a new Access Token automatically
exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ message: "Refresh Token Required" });

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    const user = await User.findByPk(decoded.id);
    
    if (!user) return res.status(403).json({ message: "User not found" });

    const newAccessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.json({ token: newAccessToken });
  } catch (err) {
    res.status(403).json({ message: "Invalid or expired refresh token" });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const userList = await User.findAll({ attributes: { exclude: ['password'] } });
    res.json(userList);
  } catch (error) {
    res.status(500).json({ message: "Error fetching users" });
  }
};

exports.getUsersByRole = async (req, res) => {
  try {
    const { role } = req.params;
    const userList = await User.findAll({
      where: { role },
      attributes: { exclude: ['password'] }
    });
    res.json(userList);
  } catch (error) {
    res.status(500).json({ message: "Error fetching users" });
  }
};
