import { Route, Routes } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout.jsx';
import { AdminLayout } from './layouts/AdminLayout.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { CategoryPage } from './pages/CategoryPage.jsx';
import { SearchPage } from './pages/SearchPage.jsx';
import { ArticlePage } from './pages/ArticlePage.jsx';
import { AuthPage } from './pages/AuthPage.jsx';
import { AdminArticlesPage } from './pages/AdminArticlesPage.jsx';
import { AdminArticleFormPage } from './pages/AdminArticleFormPage.jsx';
import { RequireRole } from './auth/RequireRole.jsx';
import { STAFF_ROLES } from './auth/AuthContext.jsx';
import { ForgotPasswordPage, ResetPasswordPage, ChangePasswordPage } from './pages/PasswordPages.jsx';
import { VerifyEmailPage } from './pages/VerifyEmailPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';

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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="admin" element={<RequireRole roles={STAFF_ROLES}><AdminLayout /></RequireRole>}>
        <Route index element={<AdminArticlesPage />} />
        <Route path="articles/new" element={<AdminArticleFormPage />} />
        <Route path="articles/:id" element={<AdminArticleFormPage />} />
      </Route>
    </Routes>
  );
}
