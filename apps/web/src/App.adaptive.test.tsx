import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AdaptiveArchivePage,
  AdaptiveAuthCallbackPage,
  AdaptiveCheckEmailPage,
  AdaptiveComposePage,
  AdaptiveEditPostPage,
  AdaptiveFeedPage,
  AdaptiveForgotPasswordPage,
  AdaptiveLayout,
  AdaptiveLoginPage,
  AdaptiveModInvitesPage,
  AdaptiveModQueuePage,
  AdaptiveMyInvitesPage,
  AdaptiveNotFoundPage,
  AdaptiveNotificationsPage,
  AdaptivePostDetailPage,
  AdaptiveProfilePage,
  AdaptiveResetPasswordPage,
  AdaptiveSecurityPage,
  AdaptiveSignupAccountPage,
  AdaptiveSignupCodePage,
} from './App';

const useIsMobileMock = vi.fn();
vi.mock('./hooks/IsMobileContext', () => ({
  IsMobileProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useIsMobileShared: () => useIsMobileMock(),
}));

vi.mock('./components/Layout', () => ({ Layout: () => <div data-testid="desktop-layout" /> }));
vi.mock('./views/mobile/MobileLayout', () => ({
  MobileLayout: () => <div data-testid="mobile-layout" />,
}));
vi.mock('./pages/FeedPage', () => ({ FeedPage: () => <div data-testid="desktop-feed" /> }));
vi.mock('./views/mobile/MobileFeedPage', () => ({
  MobileFeedPage: () => <div data-testid="mobile-feed" />,
}));
vi.mock('./pages/PostDetailPage', () => ({
  PostDetailPage: () => <div data-testid="desktop-post" />,
}));
vi.mock('./views/mobile/MobilePostDetailPage', () => ({
  MobilePostDetailPage: () => <div data-testid="mobile-post" />,
}));
vi.mock('./pages/ComposePage', () => ({
  ComposePage: () => <div data-testid="desktop-compose" />,
}));
vi.mock('./views/mobile/MobileComposePage', () => ({
  MobileComposePage: () => <div data-testid="mobile-compose" />,
}));
vi.mock('./pages/EditPostPage', () => ({ EditPostPage: () => <div data-testid="desktop-edit" /> }));
vi.mock('./views/mobile/MobileEditPostPage', () => ({
  MobileEditPostPage: () => <div data-testid="mobile-edit" />,
}));
vi.mock('./pages/MyArchivePage', () => ({
  MyArchivePage: () => <div data-testid="desktop-archive" />,
}));
vi.mock('./views/mobile/MobileArchivePage', () => ({
  MobileArchivePage: () => <div data-testid="mobile-archive" />,
}));
vi.mock('./views/mobile/MobileNotificationsPage', () => ({
  MobileNotificationsPage: () => <div data-testid="mobile-notifications" />,
}));
vi.mock('./pages/ProfilePage', () => ({
  ProfilePage: () => <div data-testid="desktop-profile" />,
}));
vi.mock('./views/mobile/MobileProfilePage', () => ({
  MobileProfilePage: () => <div data-testid="mobile-profile" />,
}));
vi.mock('./pages/SecurityPage', () => ({
  SecurityPage: () => <div data-testid="desktop-security" />,
}));
vi.mock('./views/mobile/MobileSecurityPage', () => ({
  MobileSecurityPage: () => <div data-testid="mobile-security" />,
}));
vi.mock('./pages/MyInvitesPage', () => ({
  MyInvitesPage: () => <div data-testid="desktop-myinvites" />,
}));
vi.mock('./views/mobile/MobileMyInvitesPage', () => ({
  MobileMyInvitesPage: () => <div data-testid="mobile-myinvites" />,
}));
vi.mock('./pages/ModQueuePage', () => ({
  ModQueuePage: () => <div data-testid="desktop-modqueue" />,
}));
vi.mock('./views/mobile/MobileModQueuePage', () => ({
  MobileModQueuePage: () => <div data-testid="mobile-modqueue" />,
}));
vi.mock('./pages/ModInvitesPage', () => ({
  ModInvitesPage: () => <div data-testid="desktop-modinvites" />,
}));
vi.mock('./views/mobile/MobileModInvitesPage', () => ({
  MobileModInvitesPage: () => <div data-testid="mobile-modinvites" />,
}));
vi.mock('./pages/NotFoundPage', () => ({
  NotFoundPage: () => <div data-testid="desktop-notfound" />,
}));
vi.mock('./views/mobile/MobileNotFoundPage', () => ({
  MobileNotFoundPage: () => <div data-testid="mobile-notfound" />,
}));
vi.mock('./pages/LoginPage', () => ({ LoginPage: () => <div data-testid="desktop-login" /> }));
vi.mock('./views/mobile/MobileLoginPage', () => ({
  MobileLoginPage: () => <div data-testid="mobile-login" />,
}));
vi.mock('./pages/SignupCodePage', () => ({
  SignupCodePage: () => <div data-testid="desktop-signupcode" />,
}));
vi.mock('./views/mobile/MobileSignupCodePage', () => ({
  MobileSignupCodePage: () => <div data-testid="mobile-signupcode" />,
}));
vi.mock('./pages/SignupAccountPage', () => ({
  SignupAccountPage: () => <div data-testid="desktop-signupaccount" />,
}));
vi.mock('./views/mobile/MobileSignupAccountPage', () => ({
  MobileSignupAccountPage: () => <div data-testid="mobile-signupaccount" />,
}));
vi.mock('./pages/CheckEmailPage', () => ({
  CheckEmailPage: () => <div data-testid="desktop-checkemail" />,
}));
vi.mock('./views/mobile/MobileCheckEmailPage', () => ({
  MobileCheckEmailPage: () => <div data-testid="mobile-checkemail" />,
}));
vi.mock('./pages/ForgotPasswordPage', () => ({
  ForgotPasswordPage: () => <div data-testid="desktop-forgot" />,
}));
vi.mock('./views/mobile/MobileForgotPasswordPage', () => ({
  MobileForgotPasswordPage: () => <div data-testid="mobile-forgot" />,
}));
vi.mock('./pages/ResetPasswordPage', () => ({
  ResetPasswordPage: () => <div data-testid="desktop-reset" />,
}));
vi.mock('./views/mobile/MobileResetPasswordPage', () => ({
  MobileResetPasswordPage: () => <div data-testid="mobile-reset" />,
}));
vi.mock('./pages/AuthCallbackPage', () => ({
  AuthCallbackPage: () => <div data-testid="desktop-callback" />,
}));
vi.mock('./views/mobile/MobileAuthCallbackPage', () => ({
  MobileAuthCallbackPage: () => <div data-testid="mobile-callback" />,
}));

describe('Adaptive route wrappers', () => {
  afterEach(() => useIsMobileMock.mockReset());

  it('AdaptiveLayout: desktop when not mobile', () => {
    useIsMobileMock.mockReturnValue(false);
    render(<AdaptiveLayout />);
    expect(screen.getByTestId('desktop-layout')).toBeInTheDocument();
  });

  it('AdaptiveLayout: mobile when isMobile', () => {
    useIsMobileMock.mockReturnValue(true);
    render(<AdaptiveLayout />);
    expect(screen.getByTestId('mobile-layout')).toBeInTheDocument();
  });

  it.each<[string, () => JSX.Element, string, string]>([
    ['feed', () => <AdaptiveFeedPage />, 'desktop-feed', 'mobile-feed'],
    ['post detail', () => <AdaptivePostDetailPage />, 'desktop-post', 'mobile-post'],
    ['compose', () => <AdaptiveComposePage />, 'desktop-compose', 'mobile-compose'],
    ['edit', () => <AdaptiveEditPostPage />, 'desktop-edit', 'mobile-edit'],
    ['archive', () => <AdaptiveArchivePage />, 'desktop-archive', 'mobile-archive'],
    ['profile', () => <AdaptiveProfilePage />, 'desktop-profile', 'mobile-profile'],
    ['security', () => <AdaptiveSecurityPage />, 'desktop-security', 'mobile-security'],
    ['my invites', () => <AdaptiveMyInvitesPage />, 'desktop-myinvites', 'mobile-myinvites'],
    ['mod queue', () => <AdaptiveModQueuePage />, 'desktop-modqueue', 'mobile-modqueue'],
    ['mod invites', () => <AdaptiveModInvitesPage />, 'desktop-modinvites', 'mobile-modinvites'],
    ['not found', () => <AdaptiveNotFoundPage />, 'desktop-notfound', 'mobile-notfound'],
    ['login', () => <AdaptiveLoginPage />, 'desktop-login', 'mobile-login'],
    ['signup code', () => <AdaptiveSignupCodePage />, 'desktop-signupcode', 'mobile-signupcode'],
    [
      'signup account',
      () => <AdaptiveSignupAccountPage />,
      'desktop-signupaccount',
      'mobile-signupaccount',
    ],
    ['check email', () => <AdaptiveCheckEmailPage />, 'desktop-checkemail', 'mobile-checkemail'],
    ['forgot password', () => <AdaptiveForgotPasswordPage />, 'desktop-forgot', 'mobile-forgot'],
    ['reset password', () => <AdaptiveResetPasswordPage />, 'desktop-reset', 'mobile-reset'],
    ['auth callback', () => <AdaptiveAuthCallbackPage />, 'desktop-callback', 'mobile-callback'],
  ])('Adaptive%s: picks correct tree', (_label, Component, desktopId, mobileId) => {
    useIsMobileMock.mockReturnValue(false);
    const { unmount } = render(<Component />);
    expect(screen.getByTestId(desktopId)).toBeInTheDocument();
    unmount();
    useIsMobileMock.mockReturnValue(true);
    render(<Component />);
    expect(screen.getByTestId(mobileId)).toBeInTheDocument();
  });

  it('AdaptiveNotificationsPage: redirects to / on desktop', () => {
    useIsMobileMock.mockReturnValue(false);
    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <Routes>
          <Route path="/notifications" element={<AdaptiveNotificationsPage />} />
          <Route path="/" element={<div data-testid="redirected" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('redirected')).toBeInTheDocument();
  });

  it('AdaptiveNotificationsPage: renders mobile page on mobile', () => {
    useIsMobileMock.mockReturnValue(true);
    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <Routes>
          <Route path="/notifications" element={<AdaptiveNotificationsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('mobile-notifications')).toBeInTheDocument();
  });
});
