import express from 'express';
import { checkPhone, verifyOTPController, specialLogin } from '../controllers/authController.js';

const router = express.Router();

// Special login for phone number 9911334455 (bypass OTP)
router.post('/special-login', specialLogin);

// Check phone and send OTP
router.post('/check-phone', checkPhone);

// Verify OTP
router.post('/verify-otp', verifyOTPController);

export default router;