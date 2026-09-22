import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageLoading } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../layouts/AppShell';
import { HOME_PATH } from '../utils/constants';
import { PublicOnly, RequireAuth, RequireRole } from './guards';

// Every page is code-split: users only download the workspace they actually use.
const LoginPage = lazy(() => import('../pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage'));
const ChangePasswordPage = lazy(() => import('../pages/auth/ChangePasswordPage'));
const VerifyCertificatePage = lazy(() => import('../pages/public/VerifyCertificatePage'));
const NotFoundPage = lazy(() => import('../pages/public/NotFoundPage'));

// Trainee workspace
const TraineeDashboard = lazy(() => import('../pages/trainee/TraineeDashboard'));
const PassportPage = lazy(() => import('../pages/trainee/PassportPage'));
const SkillGapsPage = lazy(() => import('../pages/trainee/SkillGapsPage'));
const LearningPathPage = lazy(() => import('../pages/trainee/LearningPathPage'));
const CatalogPage = lazy(() => import('../pages/trainee/CatalogPage'));
const CourseDetailPage = lazy(() => import('../pages/trainee/CourseDetailPage'));
const CoursePlayerPage = lazy(() => import('../pages/trainee/CoursePlayerPage'));
const MyCoursesPage = lazy(() => import('../pages/trainee/MyCoursesPage'));
const AssessmentsPage = lazy(() => import('../pages/trainee/AssessmentsPage'));
const AssessmentPage = lazy(() => import('../pages/trainee/AssessmentPage'));
const AssessmentResultPage = lazy(() => import('../pages/trainee/AssessmentResultPage'));
const CertificatesPage = lazy(() => import('../pages/trainee/CertificatesPage'));
const AchievementsPage = lazy(() => import('../pages/trainee/AchievementsPage'));
const OfflineLibraryPage = lazy(() => import('../pages/trainee/OfflineLibraryPage'));
const MyReadinessPage = lazy(() => import('../pages/trainee/MyReadinessPage'));
const ARLabPage = lazy(() => import('../pages/trainee/ARLabPage'));
const ARModulePage = lazy(() => import('../pages/trainee/ARModulePage'));
const ARAttemptPage = lazy(() => import('../pages/trainee/ARAttemptPage'));

// Shared pages (every signed-in role)
const NotificationsPage = lazy(() => import('../pages/shared/NotificationsPage'));
const ProfilePage = lazy(() => import('../pages/shared/ProfilePage'));
const SearchPage = lazy(() => import('../pages/shared/SearchPage'));
const AnnouncementsPage = lazy(() => import('../pages/shared/AnnouncementsPage'));
const CompetencyDetailPage = lazy(() => import('../pages/shared/CompetencyDetailPage'));
const ARPracticalsPage = lazy(() => import('../pages/shared/ARPracticalsPage'));

// Trainer workspace (administrators reuse the course and assessment tools under /admin)
const TrainerDashboard = lazy(() => import('../pages/trainer/TrainerDashboard'));
const TrainerCoursesPage = lazy(() => import('../pages/trainer/TrainerCoursesPage'));
const CourseEditorPage = lazy(() => import('../pages/trainer/CourseEditorPage'));
const TrainerAssessmentsPage = lazy(() => import('../pages/trainer/TrainerAssessmentsPage'));
const AssessmentBuilderPage = lazy(() => import('../pages/trainer/AssessmentBuilderPage'));
const AssessmentResultsPage = lazy(() => import('../pages/trainer/AssessmentResultsPage'));
const TrainerTraineesPage = lazy(() => import('../pages/trainer/TrainerTraineesPage'));
const EmployeePassportPage = lazy(() => import('../pages/trainer/EmployeePassportPage'));
const EvaluationsPage = lazy(() => import('../pages/trainer/EvaluationsPage'));
const QuizGeneratorPage = lazy(() => import('../pages/trainer/QuizGeneratorPage'));

// Administration workspace
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'));
const HeatmapPage = lazy(() => import('../pages/admin/HeatmapPage'));
const OperationalReadinessPage = lazy(() => import('../pages/admin/OperationalReadinessPage'));
const ReadinessEventsPage = lazy(() => import('../pages/admin/ReadinessEventsPage'));
const ReadinessEventPage = lazy(() => import('../pages/admin/ReadinessEventPage'));
const SuccessionPage = lazy(() => import('../pages/admin/SuccessionPage'));
const SuccessionDetailPage = lazy(() => import('../pages/admin/SuccessionDetailPage'));
const TrainingNeedsPage = lazy(() => import('../pages/admin/TrainingNeedsPage'));
const UsersPage = lazy(() => import('../pages/admin/UsersPage'));
const UserDetailPage = lazy(() => import('../pages/admin/UserDetailPage'));
const DepartmentsPage = lazy(() => import('../pages/admin/DepartmentsPage'));
const RolesPage = lazy(() => import('../pages/admin/RolesPage'));
const RoleDetailPage = lazy(() => import('../pages/admin/RoleDetailPage'));
const CompetenciesAdminPage = lazy(() => import('../pages/admin/CompetenciesAdminPage'));
const EngineSettingsPage = lazy(() => import('../pages/admin/EngineSettingsPage'));
const AdminCoursesPage = lazy(() => import('../pages/admin/AdminCoursesPage'));
const CertificatesAdminPage = lazy(() => import('../pages/admin/CertificatesAdminPage'));
const AnnouncementsAdminPage = lazy(() => import('../pages/admin/AnnouncementsAdminPage'));
const AuditLogsPage = lazy(() => import('../pages/admin/AuditLogsPage'));

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? HOME_PATH[user.role] : '/login'} replace />;
}

export function AppRoutes() {
  return (
    <Suspense
      fallback={
        <div className="p-8">
          <PageLoading />
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnly>
              <RegisterPage />
            </PublicOnly>
          }
        />
        <Route path="/verify" element={<VerifyCertificatePage />} />
        <Route path="/verify/:certificateId" element={<VerifyCertificatePage />} />

        <Route element={<RequireAuth />}>
          <Route path="/account/password" element={<ChangePasswordPage />} />
          <Route element={<AppShell />}>
            <Route element={<RequireRole roles={['TRAINEE']} />}>
              <Route path="/trainee" element={<TraineeDashboard />} />
              <Route path="/trainee/passport" element={<PassportPage />} />
              <Route path="/trainee/skill-gaps" element={<SkillGapsPage />} />
              <Route path="/trainee/readiness" element={<MyReadinessPage />} />
              <Route path="/trainee/ar-lab" element={<ARLabPage />} />
              <Route path="/trainee/ar-lab/:moduleKey" element={<ARModulePage />} />
              <Route path="/trainee/ar-lab/:moduleKey/attempts/:attemptId" element={<ARAttemptPage />} />
              <Route path="/trainee/learning-path" element={<LearningPathPage />} />
              <Route path="/trainee/courses" element={<CatalogPage />} />
              <Route path="/trainee/courses/:courseId" element={<CourseDetailPage />} />
              <Route path="/trainee/learn/:courseId" element={<CoursePlayerPage />} />
              <Route path="/trainee/my-courses" element={<MyCoursesPage />} />
              <Route path="/trainee/assessments" element={<AssessmentsPage />} />
              <Route path="/trainee/assessments/:assessmentId" element={<AssessmentPage />} />
              <Route path="/trainee/results/:attemptId" element={<AssessmentResultPage />} />
              <Route path="/trainee/certificates" element={<CertificatesPage />} />
              <Route path="/trainee/achievements" element={<AchievementsPage />} />
              <Route path="/trainee/notifications" element={<NotificationsPage />} />
              <Route path="/trainee/profile" element={<ProfilePage />} />
            </Route>

            <Route element={<RequireRole roles={['TRAINER']} />}>
              <Route path="/trainer" element={<TrainerDashboard />} />
              <Route path="/trainer/courses" element={<TrainerCoursesPage />} />
              <Route path="/trainer/courses/:courseId" element={<CourseEditorPage />} />
              <Route path="/trainer/preview/:courseId" element={<CoursePlayerPage />} />
              <Route path="/trainer/assessments" element={<TrainerAssessmentsPage />} />
              <Route path="/trainer/assessments/:assessmentId" element={<AssessmentBuilderPage />} />
              <Route path="/trainer/assessments/:assessmentId/results" element={<AssessmentResultsPage />} />
              <Route path="/trainer/attempts/:attemptId" element={<AssessmentResultPage />} />
              <Route path="/trainer/trainees" element={<TrainerTraineesPage />} />
              <Route path="/trainer/trainees/:userId" element={<EmployeePassportPage />} />
              <Route path="/trainer/evaluations" element={<EvaluationsPage />} />
              <Route path="/trainer/quiz-generator" element={<QuizGeneratorPage />} />
              <Route path="/trainer/ar-practicals" element={<ARPracticalsPage />} />
              <Route path="/trainer/notifications" element={<NotificationsPage />} />
              <Route path="/trainer/profile" element={<ProfilePage />} />
            </Route>

            <Route element={<RequireRole roles={['ADMIN']} />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/readiness" element={<OperationalReadinessPage />} />
              <Route path="/admin/readiness/events" element={<ReadinessEventsPage />} />
              <Route path="/admin/readiness/events/:eventId" element={<ReadinessEventPage />} />
              <Route path="/admin/succession" element={<SuccessionPage />} />
              <Route path="/admin/succession/:competencyId" element={<SuccessionDetailPage />} />
              <Route path="/admin/heatmap" element={<HeatmapPage />} />
              <Route path="/admin/training-needs" element={<TrainingNeedsPage />} />
              <Route path="/admin/users" element={<UsersPage />} />
              <Route path="/admin/users/:userId" element={<UserDetailPage />} />
              <Route path="/admin/departments" element={<DepartmentsPage />} />
              <Route path="/admin/roles" element={<RolesPage />} />
              <Route path="/admin/roles/:roleId" element={<RoleDetailPage />} />
              <Route path="/admin/competencies" element={<CompetenciesAdminPage />} />
              <Route path="/admin/settings" element={<EngineSettingsPage />} />
              <Route path="/admin/courses" element={<AdminCoursesPage />} />
              <Route path="/admin/courses/:courseId" element={<CourseEditorPage />} />
              <Route path="/admin/preview/:courseId" element={<CoursePlayerPage />} />
              <Route path="/admin/assessments" element={<TrainerAssessmentsPage />} />
              <Route path="/admin/assessments/:assessmentId" element={<AssessmentBuilderPage />} />
              <Route path="/admin/assessments/:assessmentId/results" element={<AssessmentResultsPage />} />
              <Route path="/admin/attempts/:attemptId" element={<AssessmentResultPage />} />
              <Route path="/admin/quiz-generator" element={<QuizGeneratorPage />} />
              <Route path="/admin/ar-practicals" element={<ARPracticalsPage />} />
              <Route path="/admin/certificates" element={<CertificatesAdminPage />} />
              <Route path="/admin/announcements" element={<AnnouncementsAdminPage />} />
              <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
              <Route path="/admin/notifications" element={<NotificationsPage />} />
              <Route path="/admin/profile" element={<ProfilePage />} />
            </Route>

            <Route path="/announcements" element={<AnnouncementsPage />} />
            <Route path="/offline-library" element={<OfflineLibraryPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/competencies/:competencyId" element={<CompetencyDetailPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
