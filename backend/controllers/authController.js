import { supabase } from '../config/supabase.js';
import { initializePhoneAuth, verifyOTP, checkPhoneExists } from '../services/otpService.js';

/**
 * Special login using trust-configured developer credentials (no hardcoded bypass).
 */
export const specialLogin = async (req, res, next) => {
  try {
    const { phoneNumber, passcode, trustId } = req.body;

    if (!phoneNumber || !passcode || !trustId) {
      return res.status(400).json({
        success: false,
        message: 'Phone number, passcode and trustId are required'
      });
    }

    const normalizedTrustId = String(trustId || '').trim();
    const normalizedPhone = String(phoneNumber || '').replace(/\D/g, '').slice(-10);
    const normalizedPasscode = String(passcode || '').trim();

    const { data: trustRow, error: trustError } = await supabase
      .from('Trust')
      .select('id, developer_mobile, developer_secret_code')
      .eq('id', normalizedTrustId)
      .maybeSingle();

    if (trustError) {
      return res.status(500).json({
        success: false,
        message: 'Unable to validate passcode right now'
      });
    }

    const expectedPhone = String(trustRow?.developer_mobile || '').replace(/\D/g, '').slice(-10);
    const expectedPasscode = String(trustRow?.developer_secret_code || '').trim();

    if (!expectedPhone || !expectedPasscode || expectedPhone !== normalizedPhone || expectedPasscode !== normalizedPasscode) {
      return res.status(401).json({
        success: false,
        message: 'Invalid passcode'
      });
    }

    console.log(`Special login attempt for ${phoneNumber} on trust ${normalizedTrustId}`);

    const phoneCheck = await checkPhoneExists(phoneNumber);

    if (!phoneCheck.exists) {
      return res.status(404).json({
        success: false,
        message: 'Phone number not registered in the system'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Special login successful',
      data: {
        user: phoneCheck.user,
        phoneNumber
      }
    });
  } catch (error) {
    console.error('Error in specialLogin:', error);
    next(error);
  }
};

/**
 * Check phone and send OTP
 */
export const checkPhone = async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }

    console.log(`Checking phone and sending OTP: ${cleanPhone}`);

    const result = await initializePhoneAuth(cleanPhone);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        phoneNumber: result.data.phoneNumber,
        user: result.data.user,
        requestId: result.data.requestId
      }
    });
  } catch (error) {
    console.error('Error in checkPhone:', error);
    next(error);
  }
};

/**
 * Verify OTP
 */
export const verifyOTPController = async (req, res, next) => {
  try {
    const { phoneNumber, otp, secretCode, trustId } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    const normalizedOtp = String(otp || '').trim();
    const normalizedSecretCode = String(secretCode || '').trim();
    const normalizedTrustId = String(trustId || '').trim();

    if (!normalizedOtp && !normalizedSecretCode) {
      return res.status(400).json({
        success: false,
        message: 'OTP or secret code is required'
      });
    }

    if (normalizedOtp && !/^\d{6}$/.test(normalizedOtp)) {
      return res.status(400).json({
        success: false,
        message: 'OTP must be 6 digits'
      });
    }

    if (normalizedSecretCode && !normalizedTrustId) {
      return res.status(400).json({
        success: false,
        message: 'Trust ID is required for secret code verification'
      });
    }

    const result = await verifyOTP(phoneNumber, normalizedOtp, {
      secretCode: normalizedSecretCode,
      trustId: normalizedTrustId
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(200).json({
      success: true,
      message: result.usedSecretCode ? 'Secret code verified successfully' : 'OTP verified successfully',
      loginMethod: result.usedSecretCode ? 'secret_code' : 'otp',
      usedSecretCode: Boolean(result.usedSecretCode)
    });
  } catch (error) {
    console.error('Error in verifyOTP:', error);
    next(error);
  }
};
