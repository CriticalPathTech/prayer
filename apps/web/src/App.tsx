import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { IsMobileProvider, useIsMobileShared } from './hooks/IsMobileContext';
import { AuthProvider } from './hooks/useAuth';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { CheckEmailPage } from './pages/CheckEmailPage';
import { ComposePage } from './pages/ComposePage';
import { EditPostPage } from './pages/EditPostPage';
import { FeedPage } from './pages/FeedPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { ModInvitesPage } from './pages/ModInvitesPage';
import { ModQueuePage } from './pages/ModQueuePage';
import { MyArchivePage } from './pages/MyArchivePage';
import { MyInvitesPage } from './pages/MyInvitesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PostDetailPage } from './pages/PostDetailPage';
import { ProfilePage } from './pages/ProfilePage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SecurityPage } from './pages/SecurityPage';
import { SignupAccountPage } from './pages/SignupAccountPage';
import { SignupCodePage } from './pages/SignupCodePage';
import { MobileArchivePage } from './views/mobile/MobileArchivePage';
import { MobileAuthCallbackPage } from './views/mobile/MobileAuthCallbackPage';
import { MobileCheckEmailPage } from './views/mobile/MobileCheckEmailPage';
import { MobileComposePage } from './views/mobile/MobileComposePage';
import { MobileEditPostPage } from './views/mobile/MobileEditPostPage';
import { MobileFeedPage } from './views/mobile/MobileFeedPage';
import { MobileForgotPasswordPage } from './views/mobile/MobileForgotPasswordPage';
import { MobileLayout } from './views/mobile/MobileLayout';
import { MobileLoginPage } from './views/mobile/MobileLoginPage';
import { MobileModInvitesPage } from './views/mobile/MobileModInvitesPage';
import { MobileModQueuePage } from './views/mobile/MobileModQueuePage';
import { MobileMyInvitesPage } from './views/mobile/MobileMyInvitesPage';
import { MobileNotFoundPage } from './views/mobile/MobileNotFoundPage';
import { MobileNotificationsPage } from './views/mobile/MobileNotificationsPage';
import { MobilePostDetailPage } from './views/mobile/MobilePostDetailPage';
import { MobileProfilePage } from './views/mobile/MobileProfilePage';
import { MobileResetPasswordPage } from './views/mobile/MobileResetPasswordPage';
import { MobileSecurityPage } from './views/mobile/MobileSecurityPage';
import { MobileSignupAccountPage } from './views/mobile/MobileSignupAccountPage';
import { MobileSignupCodePage } from './views/mobile/MobileSignupCodePage';

export function AdaptiveLayout(): JSX.Element {
  return useIsMobileShared() ? <MobileLayout /> : <Layout />;
}
export function AdaptiveFeedPage(): JSX.Element {
  return useIsMobileShared() ? <MobileFeedPage /> : <FeedPage />;
}
export function AdaptivePostDetailPage(): JSX.Element {
  return useIsMobileShared() ? <MobilePostDetailPage /> : <PostDetailPage />;
}
export function AdaptiveComposePage(): JSX.Element {
  return useIsMobileShared() ? <MobileComposePage /> : <ComposePage />;
}
export function AdaptiveEditPostPage(): JSX.Element {
  return useIsMobileShared() ? <MobileEditPostPage /> : <EditPostPage />;
}
export function AdaptiveArchivePage(): JSX.Element {
  return useIsMobileShared() ? <MobileArchivePage /> : <MyArchivePage />;
}
export function AdaptiveNotificationsPage(): JSX.Element {
  if (!useIsMobileShared()) return <Navigate to="/" replace />;
  return <MobileNotificationsPage />;
}
export function AdaptiveProfilePage(): JSX.Element {
  return useIsMobileShared() ? <MobileProfilePage /> : <ProfilePage />;
}
export function AdaptiveSecurityPage(): JSX.Element {
  return useIsMobileShared() ? <MobileSecurityPage /> : <SecurityPage />;
}
export function AdaptiveMyInvitesPage(): JSX.Element {
  return useIsMobileShared() ? <MobileMyInvitesPage /> : <MyInvitesPage />;
}
export function AdaptiveModQueuePage(): JSX.Element {
  return useIsMobileShared() ? <MobileModQueuePage /> : <ModQueuePage />;
}
export function AdaptiveModInvitesPage(): JSX.Element {
  return useIsMobileShared() ? <MobileModInvitesPage /> : <ModInvitesPage />;
}
export function AdaptiveNotFoundPage(): JSX.Element {
  return useIsMobileShared() ? <MobileNotFoundPage /> : <NotFoundPage />;
}
export function AdaptiveLoginPage(): JSX.Element {
  return useIsMobileShared() ? <MobileLoginPage /> : <LoginPage />;
}
export function AdaptiveSignupCodePage(): JSX.Element {
  return useIsMobileShared() ? <MobileSignupCodePage /> : <SignupCodePage />;
}
export function AdaptiveSignupAccountPage(): JSX.Element {
  return useIsMobileShared() ? <MobileSignupAccountPage /> : <SignupAccountPage />;
}
export function AdaptiveCheckEmailPage(): JSX.Element {
  return useIsMobileShared() ? <MobileCheckEmailPage /> : <CheckEmailPage />;
}
export function AdaptiveForgotPasswordPage(): JSX.Element {
  return useIsMobileShared() ? <MobileForgotPasswordPage /> : <ForgotPasswordPage />;
}
export function AdaptiveResetPasswordPage(): JSX.Element {
  return useIsMobileShared() ? <MobileResetPasswordPage /> : <ResetPasswordPage />;
}
export function AdaptiveAuthCallbackPage(): JSX.Element {
  return useIsMobileShared() ? <MobileAuthCallbackPage /> : <AuthCallbackPage />;
}

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <BrowserRouter>
        <IsMobileProvider>
          <Routes>
            <Route path="/login" element={<AdaptiveLoginPage />} />
            <Route path="/signup" element={<AdaptiveSignupCodePage />} />
            <Route path="/signup/account" element={<AdaptiveSignupAccountPage />} />
            <Route path="/signup/check-email" element={<AdaptiveCheckEmailPage />} />
            <Route path="/forgot-password" element={<AdaptiveForgotPasswordPage />} />
            <Route path="/auth/reset-password" element={<AdaptiveResetPasswordPage />} />
            <Route path="/auth/callback" element={<AdaptiveAuthCallbackPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AdaptiveLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<AdaptiveFeedPage />} />
              <Route path="/compose" element={<AdaptiveComposePage />} />
              <Route path="/posts/:id" element={<AdaptivePostDetailPage />} />
              <Route path="/posts/:id/edit" element={<AdaptiveEditPostPage />} />
              <Route path="/me/invites" element={<AdaptiveMyInvitesPage />} />
              <Route path="/me/profile" element={<AdaptiveProfilePage />} />
              <Route path="/me/security" element={<AdaptiveSecurityPage />} />
              <Route path="/me/archive" element={<AdaptiveArchivePage />} />
              <Route path="/notifications" element={<AdaptiveNotificationsPage />} />
              <Route path="/mod/queue" element={<AdaptiveModQueuePage />} />
              <Route path="/mod/invites" element={<AdaptiveModInvitesPage />} />
            </Route>
            <Route path="*" element={<AdaptiveNotFoundPage />} />
          </Routes>
        </IsMobileProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
