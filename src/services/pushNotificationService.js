import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';
import { api } from './api';

// Safety default: keep FCM registration OFF unless explicitly enabled.
// This avoids native crash when Firebase config (google-services.json) is missing.
const isFcmPushEnabled = () => import.meta.env.VITE_ENABLE_FCM_PUSH === 'true';
const LAST_SELECTED_TRUST_ID_KEY = 'last_selected_trust_id';

const getCurrentUserContext = () => {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return { userId: null, trustId: null };
    const user = JSON.parse(userStr);
    return {
      userId: String(user.Mobile || user.mobile || user.phone || user.id || '').trim() || null,
      trustId: String(localStorage.getItem('selected_trust_id') || '').trim() || null,
    };
  } catch {
    return { userId: null, trustId: null };
  }
};

export const initPushNotifications = async () => {
  // Default OFF. Enable only after native push is configured for the target platform.
  if (!isFcmPushEnabled()) {
    console.warn('FCM push is disabled. Set VITE_ENABLE_FCM_PUSH=true after Firebase setup.');
    return null;
  }

  const platform = Capacitor.getPlatform();
  if (platform !== 'android' && platform !== 'ios') {
    return null;
  }

  try {
    const permissionStatus = await PushNotifications.requestPermissions();
    if (permissionStatus.receive !== 'granted') {
      return null;
    }

    await PushNotifications.register();

    const registration = await PushNotifications.addListener('registration', async (token) => {
      const { userId, trustId } = getCurrentUserContext();
      if (!userId || !token?.value) return;

      try {
        await api.post('/notifications/device-token', {
          userId,
          token: token.value,
          platform,
          trustId,
        });
      } catch (error) {
        console.error('Failed to save push token:', error?.message || error);
      }
    });

    const registrationError = await PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error:', err);
    });

    // Listen for push notifications arriving while the app is in the foreground
    const foregroundListener = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const data = notification?.data || notification?.notification?.data || {};
      // Emit a custom event to notify Home.jsx (and other components) to refetch notifications
      const event = new CustomEvent('pushNotificationArrived', {
        detail: {
          notificationId: data?.notificationId || data?.notification_id || null,
          trustId: data?.trustId || data?.trust_id || null,
          clickAction: data?.clickAction || data?.click_action || data?.type || null,
          title: notification?.title || notification?.notification?.title,
          body: notification?.body || notification?.notification?.body,
        }
      });
      window.dispatchEvent(event);
    });

    const actionListener = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action?.notification?.data || {};
      const notificationId =
        data?.notificationId ||
        data?.notification_id ||
        action?.notification?.id ||
        null;
      const trustId = data?.trustId || data?.trust_id || null;
      const clickAction = data?.clickAction || data?.click_action || data?.type || null;

      if (trustId) {
        localStorage.setItem('selected_trust_id', String(trustId));
        localStorage.setItem(LAST_SELECTED_TRUST_ID_KEY, String(trustId));
        window.dispatchEvent(new CustomEvent('trust-changed', { detail: { trustId: String(trustId) } }));
        sessionStorage.setItem('openNotificationTrustId', String(trustId));
      }

      if (notificationId) {
        sessionStorage.setItem('openNotificationId', String(notificationId));
      }
      if (clickAction) {
        sessionStorage.setItem('openNotificationClickAction', String(clickAction));
      }
      localStorage.setItem('openNotificationsFromPush', '1');
      window.dispatchEvent(new CustomEvent('pushNotificationClicked'));
    });

    // ✅ NEW: Listen for app resume/focus
    // This ensures notifications are fetched when user opens the app after receiving a push
    const resumeListener = await App.addListener('appStateChange', (state) => {
      if (state.isActive) {
        // App is now in foreground - refetch notifications to sync with database
        window.dispatchEvent(new CustomEvent('appResumed'));
      }
    });

    return () => {
      registration.remove();
      registrationError.remove();
      actionListener.remove();
      foregroundListener.remove();
      resumeListener.remove();
    };
  } catch (error) {
    console.error('Push init skipped due to native/Firebase setup issue:', error?.message || error);
    return null;
  }
};
