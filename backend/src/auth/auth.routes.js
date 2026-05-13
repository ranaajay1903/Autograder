const express = require("express");
const router = express.Router();
const { login, refreshToken } = require("./auth.controller");

router.post("/login", login);
router.post("/refresh", refreshToken);

router.get("/login", (req, res) => {
    res.send("Login route working. Use POST with email.");
});

module.exports = router;