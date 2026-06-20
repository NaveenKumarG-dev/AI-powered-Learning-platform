from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    GenerateVideoView, VideoTaskStatusView,
    CoursePlanningView, CoursePlanningStatusView,
    RegisterView, CustomTokenObtainPairView, LogoutView,
    UserProfileView, LearningProfileView,
    CourseViewSet, ModuleViewSet, LessonViewSet, ResourceViewSet,
    EnrollmentViewSet, QuestionViewSet, QuizAttemptViewSet, QuizAnswerViewSet,
    ModuleProgressViewSet, LessonProgressViewSet, LearningRoadmapViewSet, AchievementViewSet,
    UserAchievementViewSet, ActivityLogViewSet, DashboardView, AdminStatsView,
    InitialAssessmentView, EvaluateAssessmentView, GetSyllabusView,
    GenerateTopicContentView, GenerateTopicQuizView, EvaluateTopicQuizView,
    GenerateTopicMindMapView, GenerateRemediationContentView, GenerateDynamicScriptView,
    GeneratePersonaOptionsView, GenerateScenarioOptionsView, GeneratePodcastView,
    ChatWithContextView, GetChatHistoryView, ClearChatHistoryView,
    GenerateCodingProblemView, CodingProblemDetailView,
    CreateCodeSubmissionView, CodeExecutionTaskStatusView, CodeSubmissionResultView,
    GenerateSampleCodeView, RunSampleCodeView,
    StartInteractiveSampleCodeView, SendInteractiveSampleInputView, StopInteractiveSampleCodeView,
)

# Create router for ViewSets
router = DefaultRouter()
router.register(r'courses', CourseViewSet, basename='course')
router.register(r'modules', ModuleViewSet, basename='module')
router.register(r'lessons', LessonViewSet, basename='lesson')
router.register(r'resources', ResourceViewSet, basename='resource')
router.register(r'enrollments', EnrollmentViewSet, basename='enrollment')
router.register(r'questions', QuestionViewSet, basename='question')
router.register(r'quiz-attempts', QuizAttemptViewSet, basename='quiz-attempt')
router.register(r'quiz-answers', QuizAnswerViewSet, basename='quiz-answer')
router.register(r'module-progress', ModuleProgressViewSet, basename='module-progress')
router.register(r'lesson-progress', LessonProgressViewSet, basename='lesson-progress')
router.register(r'learning-roadmaps', LearningRoadmapViewSet, basename='learning-roadmap')
router.register(r'achievements', AchievementViewSet, basename='achievement')
router.register(r'user-achievements', UserAchievementViewSet, basename='user-achievement')
router.register(r'activity-logs', ActivityLogViewSet, basename='activity-log')

urlpatterns = [
    # Authentication
    path('auth/register/', RegisterView.as_view(), name='auth-register'),
    path('auth/login/', CustomTokenObtainPairView.as_view(), name='auth-login'),
    path('auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='auth-token-refresh'),
    
    # User Profile
    path('users/me/', UserProfileView.as_view(), name='user-profile'),
    path('users/me/learning-profile/', LearningProfileView.as_view(), name='learning-profile'),
    
    # Dashboard
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    
    # Admin Dashboard Stats (staff/superuser only)
    path('admin/stats/', AdminStatsView.as_view(), name='admin-stats'),
    
    # Video Generation
    path('videos/generate/', GenerateVideoView.as_view(), name='video-generate'),
    path('videos/status/<uuid:task_id>/', VideoTaskStatusView.as_view(), name='video-status'),
    
    # Course Planning
    path('courses/plan/', CoursePlanningView.as_view(), name='course-plan'),
    path('courses/plan/status/<uuid:task_id>/', CoursePlanningStatusView.as_view(), name='course-plan-status'),
    
    # Assessment & Personalized Learning
    path('assessment/initial/', InitialAssessmentView.as_view(), name='assessment-initial'),
    path('assessment/evaluate/', EvaluateAssessmentView.as_view(), name='assessment-evaluate'),
    path('assessment/syllabus/<str:enrollment_id>/', GetSyllabusView.as_view(), name='assessment-syllabus'),
    path('assessment/topic/content/', GenerateTopicContentView.as_view(), name='topic-content'),
    path('assessment/topic/dynamic-script/', GenerateDynamicScriptView.as_view(), name='topic-dynamic-script'),
    path('assessment/topic/quiz/', GenerateTopicQuizView.as_view(), name='topic-quiz'),
    path('assessment/topic/evaluate/', EvaluateTopicQuizView.as_view(), name='topic-evaluate'),
    path('assessment/topic/remediation/', GenerateRemediationContentView.as_view(), name='topic-remediation'),
    path('assessment/topic/mindmap/', GenerateTopicMindMapView.as_view(), name='topic-mindmap'),

    # Coding Lab
    path('coding/problems/generate/', GenerateCodingProblemView.as_view(), name='coding-problem-generate'),
    path('coding/problems/<str:problem_id>/', CodingProblemDetailView.as_view(), name='coding-problem-detail'),
    path('coding/submissions/', CreateCodeSubmissionView.as_view(), name='coding-submission-create'),
    path('coding/tasks/<uuid:task_id>/', CodeExecutionTaskStatusView.as_view(), name='coding-task-status'),
    path('coding/submissions/<uuid:submission_id>/result/', CodeSubmissionResultView.as_view(), name='coding-submission-result'),
    path('coding/samples/generate/', GenerateSampleCodeView.as_view(), name='coding-sample-generate'),
    path('coding/samples/run/', RunSampleCodeView.as_view(), name='coding-sample-run'),
    path('coding/samples/interactive/start/', StartInteractiveSampleCodeView.as_view(), name='coding-sample-interactive-start'),
    path('coding/samples/interactive/input/', SendInteractiveSampleInputView.as_view(), name='coding-sample-interactive-input'),
    path('coding/samples/interactive/stop/', StopInteractiveSampleCodeView.as_view(), name='coding-sample-interactive-stop'),
    
    # Podcast Generation
    path('podcast/personas/', GeneratePersonaOptionsView.as_view(), name='podcast-personas'),
    path('podcast/scenarios/', GenerateScenarioOptionsView.as_view(), name='podcast-scenarios'),
    path('podcast/generate/', GeneratePodcastView.as_view(), name='podcast-generate'),
    
    # RAG Chatbot
    path('chat/', ChatWithContextView.as_view(), name='chat'),
    path('chat/history/', GetChatHistoryView.as_view(), name='chat-history'),
    path('chat/clear/', ClearChatHistoryView.as_view(), name='chat-clear'),
    
    # Router URLs (all ViewSets)
    path('', include(router.urls)),
]
