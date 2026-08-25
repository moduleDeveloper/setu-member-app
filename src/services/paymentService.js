import { api } from './api';

const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || '';

let razorpayScriptPromise = null;

export const loadRazorpayScript = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay checkout can only be loaded in the browser.'));
  }
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${RAZORPAY_CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay checkout script.')));
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout script.'));
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
};

export const createRazorpayOrder = async ({ amount, currency = 'INR', receipt }) => {
  const response = await api.post('/payments/create-order', { amount, currency, receipt });
  if (!response?.data?.success) {
    throw new Error(response?.data?.message || 'Failed to create payment order.');
  }
  return response.data;
};

export const verifyRazorpayPayment = async ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
  const response = await api.post('/payments/verify-payment', {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  });
  if (!response?.data?.success || !response?.data?.verified) {
    throw new Error(response?.data?.message || 'Payment verification failed.');
  }
  return response.data;
};

/**
 * Opens Razorpay Standard Checkout for the given rupee amount.
 * Resolves with { razorpay_order_id, razorpay_payment_id, razorpay_signature, verification }
 * only after the backend has verified the payment signature.
 */
export const openRazorpayCheckout = async ({
  amountInRupees,
  receipt,
  name,
  description,
  prefill = {},
  notes = {},
}) => {
  if (!RAZORPAY_KEY_ID) {
    throw new Error('Payment gateway is not configured (missing Razorpay key).');
  }

  const amountInPaise = Math.round(Number(amountInRupees) * 100);
  if (!Number.isFinite(amountInPaise) || amountInPaise < 100) {
    throw new Error('Order amount must be at least ₹1.');
  }

  await loadRazorpayScript();
  const order = await createRazorpayOrder({ amount: amountInPaise, receipt });

  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      name,
      description,
      order_id: order.order_id,
      prefill,
      notes,
      theme: { color: '#0f766e' },
      handler: async (response) => {
        try {
          const verification = await verifyRazorpayPayment(response);
          resolve({ ...response, verification });
        } catch (verifyError) {
          reject(verifyError);
        }
      },
      modal: {
        ondismiss: () => reject(new Error('Payment cancelled.')),
      },
    });

    checkout.on('payment.failed', (response) => {
      reject(new Error(response?.error?.description || 'Payment failed. Please try again.'));
    });

    checkout.open();
  });
};
