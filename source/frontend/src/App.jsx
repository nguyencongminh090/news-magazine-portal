import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout.jsx';
import { AdminLayout } from './layouts/AdminLayout.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { CategoryPage } from './pages/CategoryPage.jsx';
import { SearchPage } from './pages/SearchPage.jsx';
import { ArticlePage } from './pages/ArticlePage.jsx';
import { AuthPage } from './pages/AuthPage.jsx';
import { AdminArticlesPage } from './pages/AdminArticlesPage.jsx';
import { AdminArticleFormPage } from './pages/AdminArticleFormPage.jsx';
import { AdminTaxonomyPage } from './pages/AdminTaxonomyPage.jsx';
import { AdminModerationPage } from './pages/AdminModerationPage.jsx';
import { AdminSeoPage } from './pages/AdminSeoPage.jsx';
import { AdminAnalyticsPage } from './pages/AdminAnalyticsPage.jsx';
import { AdminSearchEnginePage } from './pages/AdminSearchEnginePage.jsx';
import { AdminUsersPage } from './pages/AdminUsersPage.jsx';
import { AdminLogsPage } from './pages/AdminLogsPage.jsx';
import { AdminSettingsPage } from './pages/AdminSettingsPage.jsx';
import { ProfilePage } from './pages/ProfilePage.jsx';
import { RequireRole } from './auth/RequireRole.jsx';
import { ADMIN_ROLES, CONTENT_ROLES, MOD_ROLES, SEO_ROLES, STAFF_ROLES, useAuth } from './auth/AuthContext.jsx';
import { ForgotPasswordPage, ResetPasswordPage, ChangePasswordPage } from './pages/PasswordPages.jsx';
import { VerifyEmailPage } from './pages/VerifyEmailPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';

function AdminIndexRedirect() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  if (roles.some((r) => CONTENT_ROLES.includes(r))) return <AdminArticlesPage />;
  if (roles.includes('moderator')) return <Navigate to="/admin/moderation" replace />;
  if (roles.includes('seo')) return <Navigate to="/admin/seo" replace />;
  return <AdminArticlesPage />;
}

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="category/:slug" element={<CategoryPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="articles/:slug" element={<ArticlePage />} />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="register" element={<AuthPage mode="register" />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="account/password" element={<ChangePasswordPage />} />
        <Route path="account/profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="admin" element={<RequireRole roles={STAFF_ROLES}><AdminLayout /></RequireRole>}>
        <Route index element={<AdminIndexRedirect />} />
        <Route element={<RequireRole roles={CONTENT_ROLES} />}>
          <Route path="articles/new" element={<AdminArticleFormPage />} />
          <Route path="articles/:id" element={<AdminArticleFormPage />} />
          <Route path="taxonomy" element={<AdminTaxonomyPage />} />
        </Route>
        <Route element={<RequireRole roles={MOD_ROLES} />}>
          <Route path="moderation" element={<AdminModerationPage />} />
        </Route>
        <Route element={<RequireRole roles={SEO_ROLES} />}>
          <Route path="seo" element={<AdminSeoPage />} />
          <Route path="analytics" element={<AdminAnalyticsPage />} />
          <Route path="search-engine" element={<AdminSearchEnginePage />} />
        </Route>
        <Route element={<RequireRole roles={ADMIN_ROLES} />}>
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="logs" element={<AdminLogsPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
