// Android hooks and utilities exports
export { useAndroidBackHandler, registerSidebarState } from '@/shared/hooks/useAndroidBackHandler';
export { useAndroidStatusBar } from '@/shared/hooks/useAndroidStatusBar';
export { useHapticFeedback } from '@/shared/hooks/useHapticFeedback';
export { useAndroidSafeArea } from '@/shared/hooks/useAndroidSafeArea';
export { useAndroidScreenOrientation } from '@/shared/hooks/useAndroidScreenOrientation';
export { useAndroidKeyboard } from '@/shared/hooks/useAndroidKeyboard';
export { 
  useAndroidButton,
  getAndroidButtonClass,
  createAndroidButton
} from '@/shared/hooks/useAndroidButton';
export { useSidebarWithBack } from '@/features/home-navigation/useSidebarWithBack';
export { useSwipeBackNavigation } from '@/shared/hooks/useSwipeBackNavigation';
export { useBackNavigation } from '@/shared/hooks/useBackNavigation';
export { useHistoryTracker, resetNavigationStack, getNavigationStack } from '@/shared/hooks/useHistoryTracker';
export { useRegisterBackButton } from '@/shared/hooks/useRegisterBackButton';
export { useImprovedAndroidBack, useBackCleanup } from '@/shared/hooks/useImprovedAndroidBack';
export { useAndroidBack, useModalBackHandler, useProperBackNavigation } from '@/shared/hooks/useAndroidBack';
export { useTheme } from '@/shared/hooks/useTheme';
export { useAppVersion } from '@/shared/hooks/useAppVersion';
export { useTrustDataVersion } from '@/shared/hooks/useTrustDataVersion';
export { useInAppUpdate } from '@/shared/hooks/useInAppUpdate';


