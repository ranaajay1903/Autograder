const express = require('express');
const router = express.Router();
const inviteController = require('./invite.controller');
const verify = require('../middlewares/verify.middleware');
const checkRole = require('../middlewares/role.middleware');

// Admin route to send invites (protected)
router.post('/send', verify, checkRole('admin'), inviteController.sendInvites);

// Public routes for signup flow (no authentication required)
router.get('/validate/:token', inviteController.validateInvite);
router.post('/complete-signup', inviteController.completeSignup);

module.exports = router;
