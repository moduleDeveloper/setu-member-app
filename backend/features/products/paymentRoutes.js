import express from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';

const router = express.Router();

const getRazorpayInstance = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are not configured on the server.');
  }

  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

// Create a Razorpay order. Amount must be sent in paise from the client.
router.post('/create-order', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const amount = Number(body.amount);
    const currency = typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : 'INR';
    const receipt = typeof body.receipt === 'string' && body.receipt.trim() ? body.receipt.trim() : `receipt_${Date.now()}`;

    if (!Number.isFinite(amount) || amount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a valid number in paise and at least 100 (₹1).',
      });
    }

    let razorpay;
    try {
      razorpay = getRazorpayInstance();
    } catch (configError) {
      return res.status(401).json({ success: false, message: configError.message });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(amount),
      currency,
      receipt,
    });

    return res.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    return res.status(500).json({
      success: false,
      message: error?.error?.description || error?.message || 'Failed to create Razorpay order.',
    });
  }
});

// Verify the payment signature returned by Razorpay Checkout after a successful payment.
router.post('/verify-payment', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required.',
      });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return res.status(401).json({
        success: false,
        message: 'Razorpay credentials are not configured on the server.',
      });
    }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    let isValid = false;
    try {
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      const actualBuffer = Buffer.from(String(razorpay_signature), 'hex');
      isValid = expectedBuffer.length === actualBuffer.length
        && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    } catch {
      isValid = false;
    }

    if (!isValid) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'Payment signature verification failed.',
      });
    }

    return res.json({
      success: true,
      verified: true,
      razorpay_order_id,
      razorpay_payment_id,
    });
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to verify payment.',
    });
  }
});

export default router;
