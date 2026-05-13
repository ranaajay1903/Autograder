const express = require('express');
const controller = require('./passwordReset.controller');

const router = express.Router();

router.post('/forgot-password', controller.requestPasswordReset);
router.get('/validate/:token', controller.validateResetToken);
router.post('/reset-password', controller.resetPassword);

module.exports = router;
