// Middleware to check user role
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const userRole = req.user.role;
    const normalizedRole = (userRole === 'ta' || userRole === 'TA') ? 'grader' : userRole;

    if (!allowedRoles.includes(normalizedRole) && !allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        message: "Access denied. Required roles: " + allowedRoles.join(", ") 
      });
    }

    next();
  };
};

module.exports = checkRole;

