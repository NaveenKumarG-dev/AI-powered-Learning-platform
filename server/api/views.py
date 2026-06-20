from rest_framework import status, viewsets, permissions
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.conf import settings
from django.db.models import Q, Avg, Count, Sum, Max
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters
import logging

logger = logging.getLogger(__name__)

from .models import (
    VideoTask, LearningProfile, Course, Module, Lesson, LessonProgress, Resource,
    Enrollment, Question, QuizAttempt, QuizAnswer, ModuleProgress,
    LearningRoadmap, Achievement, UserAchievement, ActivityLog,
    PersonalizedSyllabus, CoursePlanningTask,
    CodingProblem, CodingTestCase, CodeSubmission, CodeExecutionTask,
    TokenUsage, ChatHistory,
)
from .serializers import (
    VideoTaskCreateSerializer, VideoTaskStatusSerializer,
    CoursePlanningTaskSerializer,
    UserRegisterSerializer, UserSerializer, LearningProfileSerializer,
    CustomTokenObtainPairSerializer, CourseSerializer, ModuleSerializer,
    LessonSerializer, LessonProgressSerializer, ResourceSerializer, EnrollmentSerializer,
    QuestionSerializer, QuizAttemptSerializer, QuizAnswerSerializer,
    QuizSubmissionSerializer, ModuleProgressSerializer,
    LearningRoadmapSerializer, AchievementSerializer,
    UserAchievementSerializer, ActivityLogSerializer,
    GenerateCodingProblemRequestSerializer, CodingProblemSerializer,
    CreateCodeSubmissionSerializer, CodeExecutionTaskSerializer,
    CodeSubmissionSerializer,
    GenerateDynamicScriptRequestSerializer, DynamicScriptResponseSerializer,
    GenerateSampleCodeRequestSerializer, RunSampleCodeRequestSerializer,
    StartInteractiveSampleSerializer, SendInteractiveSampleInputSerializer, StopInteractiveSampleSerializer,
)
from .tasks import generate_video_task
from .services.assessment_service import get_assessment_service
from .services.podcast_service import get_podcast_service
from .services.code_problem_service import get_code_problem_service
from .services.code_execution_service import get_code_execution_service
from .services.dynamic_script_service import get_dynamic_script_service
from .services.sample_code_service import get_sample_code_service

User = get_user_model()


# ---------------------------------------------------------------------------
# Token Usage Helper
# ---------------------------------------------------------------------------

def record_token_usage(
    user,
    activity_type: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    model_name: str = '',
    metadata: dict = None,
) -> None:
    """
    Safely record token usage for any AI-powered feature.
    Call this from any view that makes an LLM call.
    Silently swallows errors so it never breaks the main request flow.
    """
    try:
        TokenUsage.objects.create(
            user=user,
            activity_type=activity_type,
            input_tokens=max(0, int(input_tokens)),
            output_tokens=max(0, int(output_tokens)),
            model_name=model_name or '',
            metadata=metadata,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning(f'record_token_usage failed silently: {exc}')



# ============================================================================
# AUTHENTICATION VIEWS
# ============================================================================

class RegisterView(APIView):
    """User registration endpoint"""
    permission_classes = [permissions.AllowAny]
    
    def post(self, request):
        serializer = UserRegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            # Generate tokens
            refresh = RefreshToken.for_user(user)
            
            # Log activity
            ActivityLog.objects.create(
                user=user,
                activity_type='account_created',
                description=f'New account created'
            )
            
            return Response({
                'user': UserSerializer(user).data,
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CustomTokenObtainPairView(TokenObtainPairView):
    """Custom login view with user data"""
    permission_classes = [permissions.AllowAny]
    serializer_class = CustomTokenObtainPairSerializer


class LogoutView(APIView):
    """Logout endpoint - blacklist refresh token"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            token = RefreshToken(refresh_token)
            token.blacklist()
            
            # Log activity
            ActivityLog.objects.create(
                user=request.user,
                activity_type='logout',
                description='User logged out'
            )
            
            return Response({'detail': 'Successfully logged out.'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class UserProfileView(APIView):
    """Get and update current user profile"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)
    
    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            
            # Log activity
            ActivityLog.objects.create(
                user=request.user,
                activity_type='profile_updated',
                description='Profile information updated'
            )
            
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LearningProfileView(APIView):
    """Get and update user learning profile"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        profile, created = LearningProfile.objects.get_or_create(user=request.user)
        serializer = LearningProfileSerializer(profile)
        return Response(serializer.data)
    
    def patch(self, request):
        profile, created = LearningProfile.objects.get_or_create(user=request.user)
        serializer = LearningProfileSerializer(profile, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            
            # Log activity
            ActivityLog.objects.create(
                user=request.user,
                activity_type='preferences_updated',
                description='Learning preferences updated'
            )
            
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ============================================================================
# COURSE & CONTENT VIEWSETS
# ============================================================================

class CourseViewSet(viewsets.ModelViewSet):
    """ViewSet for courses"""
    queryset = Course.objects.all()
    serializer_class = CourseSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'name', 'description', 'category']
    filterset_fields = ['category', 'difficulty_level', 'is_popular', 'is_sub_topic', 'created_by']
    ordering_fields = ['created_at', 'title', 'category']
    
    @action(detail=False, methods=['get'])
    def popular(self, request):
        """Get all popular courses"""
        popular_courses = self.queryset.filter(is_popular=True)
        serializer = self.get_serializer(popular_courses, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def my_created(self, request):
        """Get courses created by the current user"""
        created_courses = self.queryset.filter(created_by=request.user)
        serializer = self.get_serializer(created_courses, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def learnable_topics(self, request):
        """Get all learnable sub-topics (courses where is_sub_topic=True)"""
        sub_topics = self.queryset.filter(is_sub_topic=True)
        serializer = self.get_serializer(sub_topics, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def check_learnable(self, request, pk=None):
        """
        Check if a topic is learnable or if it's a broad topic.
        If it's a broad topic, return suggested sub-topics to learn instead.
        """
        course = self.get_object()
        
        if not course.is_sub_topic:
            # This is a broad topic - can't learn it directly
            # Get all sub-topics for this broad topic
            sub_topics = Course.objects.filter(
                is_sub_topic=True,
                parent_topic_name=course.title
            )
            
            return Response({
                'learnable': False,
                'message': f"We can't teach you the entire '{course.title}' topic, but we offer individual sub-topics you can learn one at a time.",
                'course': self.get_serializer(course).data,
                'suggested_sub_topics': self.get_serializer(sub_topics, many=True).data,
                'total_sub_topics': sub_topics.count()
            })
        else:
            # This is a learnable sub-topic
            return Response({
                'learnable': True,
                'message': f"You can learn '{course.title}' as an individual topic.",
                'course': self.get_serializer(course).data,
                'prerequisites': course.prerequisites,
                'learning_objectives': course.learning_objectives
            })
    
    @action(detail=True, methods=['get'])
    def sub_topics(self, request, pk=None):
        """Get all sub-topics for a broad topic"""
        course = self.get_object()
        
        if course.is_sub_topic:
            return Response({
                'message': f"'{course.title}' is already a sub-topic, not a broad topic."
            }, status=status.HTTP_400_BAD_REQUEST)
        
        sub_topics = Course.objects.filter(
            is_sub_topic=True,
            parent_topic_name=course.title
        )
        
        return Response({
            'broad_topic': self.get_serializer(course).data,
            'sub_topics': self.get_serializer(sub_topics, many=True).data,
            'total': sub_topics.count()
        })
    
    @action(detail=True, methods=['get'])
    def modules(self, request, pk=None):
        """Get all modules for a course"""
        course = self.get_object()
        modules = course.modules.all().order_by('order')
        serializer = ModuleSerializer(modules, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def enrollments_with_curricula(self, request, pk=None):
        """Get all enrollments for a course with their personalized curricula"""
        course = self.get_object()
        
        # Get all enrollments for this course that have a personalized syllabus
        enrollments = Enrollment.objects.filter(
            course=course,
            syllabus__isnull=False
        ).select_related('user', 'syllabus').order_by('-enrolled_at')
        
        curricula_data = []
        for idx, enrollment in enumerate(enrollments, 1):
            # Anonymize user identifier for privacy
            user_identifier = f"Student #{idx}"
            
            # Get syllabus data from the related PersonalizedSyllabus model
            syllabus_data = enrollment.syllabus.syllabus_data
            
            curriculum = {
                'id': enrollment.id,
                'user_identifier': user_identifier,
                'enrolled_at': enrollment.enrolled_at,
                'knowledge_level': enrollment.diagnosed_level or 'Not assessed',
                'study_method': enrollment.study_method_preference or 'real_world',
                'difficulty': syllabus_data.get('knowledge_level', 'beginner'),
                'syllabus': syllabus_data
            }
            curricula_data.append(curriculum)
        
        return Response({
            'course_id': course.id,
            'course_title': course.title,
            'total_enrollments': len(curricula_data),
            'curricula': curricula_data
        })


class ModuleViewSet(viewsets.ModelViewSet):
    """ViewSet for modules"""
    queryset = Module.objects.all()
    serializer_class = ModuleSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['course', 'difficulty_level']
    ordering_fields = ['order', 'title']
    
    @action(detail=True, methods=['get'])
    def lessons(self, request, pk=None):
        """Get all lessons for a module"""
        module = self.get_object()
        lessons = module.lessons.all().order_by('order')
        serializer = LessonSerializer(lessons, many=True)
        return Response(serializer.data)


class LessonViewSet(viewsets.ModelViewSet):
    """ViewSet for lessons"""
    queryset = Lesson.objects.all()
    serializer_class = LessonSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['module']
    ordering_fields = ['order', 'title']
    
    @action(detail=True, methods=['get'])
    def resources(self, request, pk=None):
        """Get all resources for a lesson"""
        lesson = self.get_object()
        resources = lesson.resources.all()
        serializer = ResourceSerializer(resources, many=True, context={'request': request})
        return Response(serializer.data)


class ResourceViewSet(viewsets.ModelViewSet):
    """ViewSet for resources"""
    queryset = Resource.objects.all()
    serializer_class = ResourceSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['lesson', 'resource_type']


class EnrollmentViewSet(viewsets.ModelViewSet):
    """ViewSet for enrollments"""
    queryset = Enrollment.objects.all()
    serializer_class = EnrollmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['course', 'status']
    
    def get_queryset(self):
        """Filter enrollments by current user"""
        return Enrollment.objects.filter(user=self.request.user).order_by('-enrolled_at')
    
    def perform_create(self, serializer):
        """Create enrollment and log activity"""
        enrollment = serializer.save(user=self.request.user)
        
        # Log activity
        ActivityLog.objects.create(
            user=self.request.user,
            activity_type='course_started',
            title=f'Enrolled in {enrollment.course.title}',
            description=f'Enrolled in course: {enrollment.course.title}',
            metadata={'course_id': str(enrollment.course.id)}
        )
    
    @action(detail=True, methods=['get'])
    def progress(self, request, pk=None):
        """Get detailed progress for an enrollment"""
        enrollment = self.get_object()
        module_progress = enrollment.module_progress.all()
        
        return Response({
            'enrollment': EnrollmentSerializer(enrollment).data,
            'module_progress': ModuleProgressSerializer(module_progress, many=True).data,
            'overall_progress': enrollment.overall_progress,
            'status': enrollment.status
        })
    
    @action(detail=True, methods=['post'])
    def diagnostic_quiz(self, request, pk=None):
        """Generate diagnostic quiz for enrollment"""
        enrollment = self.get_object()
        
        # Get diagnostic questions for the course
        questions = Question.objects.filter(
            course=enrollment.course,
            question_type='diagnostic'
        )
        
        if not questions.exists():
            return Response(
                {'detail': 'No diagnostic questions available for this course.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Create quiz attempt
        quiz_attempt = QuizAttempt.objects.create(
            user=request.user,
            enrollment=enrollment,
            quiz_type='diagnostic'
        )
        quiz_attempt.questions.set(questions)
        
        return Response({
            'attempt_id': quiz_attempt.id,
            'questions': QuestionSerializer(questions, many=True).data
        })

    @action(detail=True, methods=['post'])
    def generate_mindmap(self, request, pk=None):
        """Generate an AI mind map for the enrolled course"""
        enrollment = self.get_object()
        
        try:
            from .services.mindmap_service import MindMapService
            
            course_title = enrollment.course.title or enrollment.course.name
            user_level = enrollment.diagnosed_level
            
            mindmap_data = MindMapService.generate_course_mindmap(course_title, user_level)
            
            # Save mind map to the database
            # Try to save to the first lesson/module of the course
            first_module = enrollment.course.modules.first()
            if first_module:
                first_lesson = first_module.lessons.first()
                if first_lesson:
                    # Check if a course mind map already exists for this lesson
                    existing_mindmap = Resource.objects.filter(
                        lesson=first_lesson,
                        resource_type=Resource.ResourceType.MINDMAP,
                        title__icontains="Course Mind Map"
                    ).first()
                    
                    if existing_mindmap:
                        # Update existing mind map
                        existing_mindmap.content_json = mindmap_data
                        existing_mindmap.is_generated = True
                        existing_mindmap.save()
                    else:
                        # Create new mind map resource
                        Resource.objects.create(
                            lesson=first_lesson,
                            resource_type=Resource.ResourceType.MINDMAP,
                            title=f'Course Mind Map: {course_title}',
                            content_json=mindmap_data,
                            is_generated=True,
                        )
            
            # Log activity
            ActivityLog.objects.create(
                user=request.user,
                activity_type='course_started',
                title=f'Mind Map generated for {course_title}',
                description=f'Mind map generated for {course_title} at {user_level} level.',
                metadata={'course_id': str(enrollment.course.id)}
            )
            
            return Response(mindmap_data)
        except Exception as e:
            logger.error(f"Generate mindmap failed for enrollment {enrollment.id}: {str(e)}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



# ============================================================================
# QUIZ & ASSESSMENT VIEWSETS
# ============================================================================

class QuestionViewSet(viewsets.ModelViewSet):
    """ViewSet for questions"""
    queryset = Question.objects.all()
    serializer_class = QuestionSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['course', 'module', 'question_type', 'difficulty_level']


class QuizAttemptViewSet(viewsets.ModelViewSet):
    """ViewSet for quiz attempts"""
    queryset = QuizAttempt.objects.all()
    serializer_class = QuizAttemptSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Filter quiz attempts by current user's enrollments"""
        return QuizAttempt.objects.filter(enrollment__user=self.request.user)
    
    @action(detail=False, methods=['get'])
    def by_enrollment(self, request):
        """Get all quiz attempts for a specific enrollment"""
        enrollment_id = request.query_params.get('enrollment_id')
        
        if not enrollment_id:
            return Response(
                {'detail': 'enrollment_id query parameter is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            enrollment = Enrollment.objects.get(id=enrollment_id, user=request.user)
        except Enrollment.DoesNotExist:
            return Response({'detail': 'Enrollment not found.'}, status=status.HTTP_404_NOT_FOUND)
        
        # Get all topic quiz attempts for this enrollment
        attempts = self.get_queryset().filter(
            enrollment=enrollment,
            attempt_type='topic_quiz'
        ).select_related('lesson', 'module').order_by('-completed_at')
        
        serializer = self.get_serializer(attempts, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def submit(self, request):
        """Submit quiz answers and calculate score"""
        serializer = QuizSubmissionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        attempt_id = serializer.validated_data['attempt_id']
        answers_data = serializer.validated_data['answers']
        
        try:
            quiz_attempt = QuizAttempt.objects.get(id=attempt_id, user=request.user)
        except QuizAttempt.DoesNotExist:
            return Response({'detail': 'Quiz attempt not found.'}, status=status.HTTP_404_NOT_FOUND)
        
        if quiz_attempt.submitted_at:
            return Response({'detail': 'Quiz already submitted.'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Process answers
        correct_count = 0
        for answer_data in answers_data:
            question = Question.objects.get(id=answer_data['question_id'])
            user_answer = answer_data['selected_option']
            is_correct = user_answer == question.correct_option
            
            QuizAnswer.objects.create(
                quiz_attempt=quiz_attempt,
                question=question,
                selected_option=user_answer,
                is_correct=is_correct
            )
            
            if is_correct:
                correct_count += 1
        
        # Calculate score
        total_questions = quiz_attempt.questions.count()
        score = (correct_count / total_questions * 100) if total_questions > 0 else 0
        
        quiz_attempt.score = score
        quiz_attempt.total_questions = total_questions
        quiz_attempt.submitted_at = timezone.now()
        quiz_attempt.save()
        
        # Log activity
        ActivityLog.objects.create(
            user=request.user,
            activity_type='quiz_completed',
            title=f'Completed {quiz_attempt.quiz_type} quiz',
            description=f'Completed {quiz_attempt.quiz_type} quiz with score {score:.1f}%',
            metadata={
                'course_id': str(quiz_attempt.enrollment.course.id) if quiz_attempt.enrollment else None,
                'score': score
            }
        )
        
        return Response({
            'score': score,
            'correct_answers': correct_count,
            'total_questions': total_questions,
            'quiz_attempt': QuizAttemptSerializer(quiz_attempt).data
        })


class QuizAnswerViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for quiz answers (read-only)"""
    queryset = QuizAnswer.objects.all()
    serializer_class = QuizAnswerSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Filter answers by current user's quiz attempts"""
        return QuizAnswer.objects.filter(quiz_attempt__user=self.request.user)


# ============================================================================
# PROGRESS & ROADMAP VIEWSETS
# ============================================================================

class ModuleProgressViewSet(viewsets.ModelViewSet):
    """ViewSet for module progress"""
    queryset = ModuleProgress.objects.all()
    serializer_class = ModuleProgressSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['enrollment', 'module', 'status']
    
    def get_queryset(self):
        """Filter progress by current user's enrollments"""
        return ModuleProgress.objects.filter(enrollment__user=self.request.user).order_by('id')


class LessonProgressViewSet(viewsets.ModelViewSet):
    """ViewSet for lesson/topic progress and completion tracking"""
    queryset = LessonProgress.objects.all()
    serializer_class = LessonProgressSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['enrollment', 'lesson', 'is_completed']
    
    def get_queryset(self):
        """Filter progress by current user's enrollments"""
        return LessonProgress.objects.filter(enrollment__user=self.request.user).select_related('lesson', 'lesson__module')
    
    @action(detail=False, methods=['post'])
    def mark_complete(self, request):
        """Mark a lesson/topic as complete"""
        from django.utils import timezone
        
        enrollment_id = request.data.get('enrollment_id')
        lesson_id = request.data.get('lesson_id')
        is_completed = request.data.get('is_completed', True)
        
        if not enrollment_id or not lesson_id:
            return Response(
                {'detail': 'enrollment_id and lesson_id are required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            enrollment = Enrollment.objects.get(id=enrollment_id, user=request.user)
            lesson = Lesson.objects.get(id=lesson_id)
        except Enrollment.DoesNotExist:
            return Response({'detail': 'Enrollment not found.'}, status=status.HTTP_404_NOT_FOUND)
        except Lesson.DoesNotExist:
            return Response({'detail': 'Lesson not found.'}, status=status.HTTP_404_NOT_FOUND)
        
        # Get or create lesson progress
        progress, created = LessonProgress.objects.get_or_create(
            enrollment=enrollment,
            lesson=lesson
        )
        
        # Update completion status
        progress.is_completed = is_completed
        if is_completed and not progress.completed_at:
            progress.completed_at = timezone.now()
        elif not is_completed:
            progress.completed_at = None
        progress.save()
        
        serializer = self.get_serializer(progress)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def by_enrollment(self, request):
        """Get all lesson progress for a specific enrollment"""
        enrollment_id = request.query_params.get('enrollment_id')
        
        if not enrollment_id:
            return Response(
                {'detail': 'enrollment_id query parameter is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            enrollment = Enrollment.objects.get(id=enrollment_id, user=request.user)
        except Enrollment.DoesNotExist:
            return Response({'detail': 'Enrollment not found.'}, status=status.HTTP_404_NOT_FOUND)
        
        # Get all lesson progress for this enrollment
        progress_items = self.get_queryset().filter(enrollment=enrollment)
        serializer = self.get_serializer(progress_items, many=True)
        return Response(serializer.data)


class LearningRoadmapViewSet(viewsets.ModelViewSet):
    """ViewSet for learning roadmaps"""
    queryset = LearningRoadmap.objects.all()
    serializer_class = LearningRoadmapSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Filter roadmaps by current user's enrollments"""
        return LearningRoadmap.objects.filter(enrollment__user=self.request.user)
    
    @action(detail=False, methods=['post'])
    def generate(self, request):
        """Generate AI-powered learning roadmap"""
        enrollment_id = request.data.get('enrollment_id')
        
        try:
            enrollment = Enrollment.objects.get(id=enrollment_id, user=request.user)
        except Enrollment.DoesNotExist:
            return Response({'detail': 'Enrollment not found.'}, status=status.HTTP_404_NOT_FOUND)
        
        # Get user's learning profile
        learning_profile = getattr(request.user, 'learning_profile', None)
        
        # TODO: Integrate with Ollama to generate personalized roadmap
        # For now, create a basic roadmap with all modules
        roadmap, created = LearningRoadmap.objects.get_or_create(
            enrollment=enrollment,
            defaults={
                'personalization_factors': {
                    'learning_style': learning_profile.learning_style if learning_profile else 'visual',
                    'preferred_depth': learning_profile.preferred_depth if learning_profile else 'intermediate',
                    'learning_pace': learning_profile.learning_pace if learning_profile else 'moderate'
                },
                'ai_recommendations': 'Personalized learning path based on your profile and diagnostic quiz results.'
            }
        )
        
        # Add all modules to recommended modules
        course_modules = enrollment.course.modules.all()
        roadmap.recommended_modules.set(course_modules)
        
        # Create module progress entries
        for module in course_modules:
            ModuleProgress.objects.get_or_create(
                enrollment=enrollment,
                module=module
            )
        
        # Log activity
        ActivityLog.objects.create(
            user=request.user,
            activity_type='course_started',
            title=f'Roadmap generated for {enrollment.course.title}',
            description=f'Learning roadmap generated for {enrollment.course.title}',
            metadata={'course_id': str(enrollment.course.id)}
        )
        
        serializer = LearningRoadmapSerializer(roadmap)
        return Response(serializer.data)


class AchievementViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for achievements (read-only)"""
    queryset = Achievement.objects.all()
    serializer_class = AchievementSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['category']


class UserAchievementViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for user achievements (read-only)"""
    queryset = UserAchievement.objects.all()
    serializer_class = UserAchievementSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Filter achievements by current user"""
        return UserAchievement.objects.filter(user=self.request.user)


class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for activity logs (read-only)"""
    queryset = ActivityLog.objects.all()
    serializer_class = ActivityLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['activity_type']
    ordering_fields = ['timestamp']
    ordering = ['-timestamp']
    
    def get_queryset(self):
        """Filter activity logs by current user"""
        return ActivityLog.objects.filter(user=self.request.user)


# ============================================================================
# DASHBOARD VIEW
# ============================================================================

class DashboardView(APIView):
    """Get aggregated dashboard data"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        user = request.user
        
        # Get enrollment statistics
        enrollments = Enrollment.objects.filter(user=user)
        active_enrollments = enrollments.filter(status='active')
        completed_enrollments = enrollments.filter(status='completed')
        
        # Calculate average progress
        avg_progress = enrollments.aggregate(Avg('overall_progress'))['overall_progress__avg'] or 0
        
        # Get recent activity
        recent_activities = ActivityLog.objects.filter(user=user).order_by('-created_at')[:10]
        
        # Get earned achievements
        user_achievements = UserAchievement.objects.filter(user=user).count()
        
        # Aggregate total study time from all enrollments (field lives on Enrollment, not User)
        total_study_minutes = enrollments.aggregate(
            total=Sum('total_study_time_minutes')
        )['total'] or 0

        return Response({
            'user': UserSerializer(user).data,
            'stats': {
                'total_courses': enrollments.count(),
                'active_courses': active_enrollments.count(),
                'completed_courses': completed_enrollments.count(),
                'average_progress': round(avg_progress, 1),
                'study_time_hours': round(total_study_minutes / 60, 1),
                'streak_days': 0,
                'achievements_earned': user_achievements
            },
            'recent_activities': ActivityLogSerializer(recent_activities, many=True).data,
            'active_enrollments': EnrollmentSerializer(active_enrollments, many=True).data[:5]
        })


# ============================================================================
# ADMIN STATS VIEW
# ============================================================================

class AdminStatsView(APIView):
    """
    GET /api/admin/stats/
    Returns platform-wide and per-user token usage + activity stats.
    Only accessible to staff / superuser accounts.

    Query params:
      ?activity_type=quiz|video_generation|mindmap|chat|coding|notes|podcast|assessment|course_planning
      ?user_id=<int>          – filter to a single user
      ?date_from=YYYY-MM-DD   – start date (inclusive)
      ?date_to=YYYY-MM-DD     – end date (inclusive)
    """
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        from django.db.models.functions import TruncDate
        from datetime import datetime, timedelta

        # ── Query param parsing ────────────────────────────────────────────
        activity_type = request.query_params.get('activity_type', '').strip()
        user_id       = request.query_params.get('user_id', '').strip()
        date_from     = request.query_params.get('date_from', '').strip()
        date_to       = request.query_params.get('date_to', '').strip()

        # ── Base querysets ─────────────────────────────────────────────────
        token_qs     = TokenUsage.objects.all()
        activity_qs  = ActivityLog.objects.all()

        # Apply filters
        if activity_type:
            token_qs    = token_qs.filter(activity_type=activity_type)
            activity_qs = activity_qs.filter(activity_type=activity_type)

        if user_id:
            try:
                uid = int(user_id)
                token_qs    = token_qs.filter(user_id=uid)
                activity_qs = activity_qs.filter(user_id=uid)
            except ValueError:
                pass

        if date_from:
            try:
                dt = datetime.strptime(date_from, '%Y-%m-%d')
                token_qs    = token_qs.filter(created_at__date__gte=dt.date())
                activity_qs = activity_qs.filter(created_at__date__gte=dt.date())
            except ValueError:
                pass

        if date_to:
            try:
                dt = datetime.strptime(date_to, '%Y-%m-%d')
                token_qs    = token_qs.filter(created_at__date__lte=dt.date())
                activity_qs = activity_qs.filter(created_at__date__lte=dt.date())
            except ValueError:
                pass

        # ── Platform-wide totals ───────────────────────────────────────────
        token_totals = token_qs.aggregate(
            total_input=Sum('input_tokens'),
            total_output=Sum('output_tokens'),
            total_records=Count('id'),
        )
        total_input   = token_totals['total_input']  or 0
        total_output  = token_totals['total_output'] or 0
        total_tokens  = total_input + total_output
        total_records = token_totals['total_records'] or 0

        # ── Activity breakdown (tokens per type) ───────────────────────────
        activity_breakdown = list(
            token_qs
            .values('activity_type')
            .annotate(
                input_tokens=Sum('input_tokens'),
                output_tokens=Sum('output_tokens'),
                count=Count('id'),
            )
            .order_by('-input_tokens')
        )
        for row in activity_breakdown:
            row['total_tokens'] = (row['input_tokens'] or 0) + (row['output_tokens'] or 0)

        # ── Activity log breakdown (counts by activity_type) ───────────────
        activity_log_breakdown = list(
            activity_qs
            .values('activity_type')
            .annotate(count=Count('id'))
            .order_by('-count')
        )

        # ── Daily usage – last 30 days ─────────────────────────────────────
        thirty_days_ago = timezone.now() - timedelta(days=30)
        daily_usage = list(
            token_qs
            .filter(created_at__gte=thirty_days_ago)
            .annotate(date=TruncDate('created_at'))
            .values('date')
            .annotate(
                total=Sum('input_tokens') + Sum('output_tokens'),
                input_tokens=Sum('input_tokens'),
                output_tokens=Sum('output_tokens'),
            )
            .order_by('date')
        )
        for row in daily_usage:
            if hasattr(row['date'], 'isoformat'):
                row['date'] = row['date'].isoformat()

        # ── Per-user stats ─────────────────────────────────────────────────
        per_user_tokens = list(
            token_qs
            .values('user_id', 'user__email', 'user__full_name')
            .annotate(
                input_tokens=Sum('input_tokens'),
                output_tokens=Sum('output_tokens'),
                api_calls=Count('id'),
            )
            .order_by('-input_tokens')
        )
        for row in per_user_tokens:
            row['total_tokens'] = (row['input_tokens'] or 0) + (row['output_tokens'] or 0)

        # Enrich with enrollment count + last active
        user_ids = [r['user_id'] for r in per_user_tokens if r['user_id']]
        enrollment_counts = {
            e['user_id']: e['count']
            for e in Enrollment.objects.filter(user_id__in=user_ids)
                                       .values('user_id')
                                       .annotate(count=Count('id'))
        }
        last_active_map = {
            a['user_id']: a['last_active']
            for a in ActivityLog.objects.filter(user_id__in=user_ids)
                                        .values('user_id')
                                        .annotate(last_active=Max('created_at'))
        }
        for row in per_user_tokens:
            uid = row['user_id']
            row['enrollment_count'] = enrollment_counts.get(uid, 0)
            last = last_active_map.get(uid)
            row['last_active'] = last.isoformat() if last else None

        # ── All users (even those with 0 token usage) ──────────────────────
        all_users_qs = User.objects.all().order_by('email')
        if user_id:
            try:
                all_users_qs = all_users_qs.filter(id=int(user_id))
            except ValueError:
                pass

        all_users = []
        per_user_map = {r['user_id']: r for r in per_user_tokens}
        for u in all_users_qs:
            base = per_user_map.get(u.id, {
                'input_tokens': 0,
                'output_tokens': 0,
                'total_tokens': 0,
                'api_calls': 0,
            })
            all_users.append({
                'user_id':          u.id,
                'email':            u.email,
                'full_name':        u.full_name,
                'is_staff':         u.is_staff,
                'date_joined':      u.date_joined.isoformat() if u.date_joined else None,
                'input_tokens':     base.get('input_tokens', 0) or 0,
                'output_tokens':    base.get('output_tokens', 0) or 0,
                'total_tokens':     base.get('total_tokens', 0) or 0,
                'api_calls':        base.get('api_calls', 0) or 0,
                'enrollment_count': enrollment_counts.get(u.id, 0),
                'last_active':      last_active_map.get(u.id, u.last_login),
            })
            # serialise datetime if needed
            if isinstance(all_users[-1]['last_active'], timezone.datetime.__class__) or hasattr(all_users[-1]['last_active'], 'isoformat'):
                all_users[-1]['last_active'] = all_users[-1]['last_active'].isoformat() if all_users[-1]['last_active'] else None

        # ── Platform summary stats ─────────────────────────────────────────
        total_users       = User.objects.count()
        total_enrollments = Enrollment.objects.count()
        active_today      = ActivityLog.objects.filter(
            created_at__date=timezone.now().date()
        ).values('user').distinct().count()

        # Recent token usage records
        recent_usage = list(
            token_qs.select_related('user')
                    .order_by('-created_at')[:50]
                    .values(
                        'id', 'user_id', 'user__email', 'user__full_name',
                        'activity_type', 'input_tokens', 'output_tokens',
                        'model_name', 'created_at',
                    )
        )
        for row in recent_usage:
            row['total_tokens'] = (row['input_tokens'] or 0) + (row['output_tokens'] or 0)
            if row['created_at']:
                row['created_at'] = row['created_at'].isoformat()

        return Response({
            'summary': {
                'total_tokens':      total_tokens,
                'total_input':       total_input,
                'total_output':      total_output,
                'total_api_calls':   total_records,
                'total_users':       total_users,
                'total_enrollments': total_enrollments,
                'active_today':      active_today,
            },
            'activity_breakdown':      activity_breakdown,
            'activity_log_breakdown':  activity_log_breakdown,
            'daily_usage':             daily_usage,
            'users':                   all_users,
            'recent_usage':            recent_usage,
        })




class GenerateVideoView(APIView):
    """POST: Create a video generation task and dispatch it to Celery."""

    def post(self, request):
        serializer = VideoTaskCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        video_task = VideoTask.objects.create(
            topic=serializer.validated_data["topic"],
            lesson_id=serializer.validated_data.get("lesson_id"),
        )

        # Check if Celery is enabled in settings
        use_celery = getattr(settings, 'USE_CELERY', True)
        
        if use_celery:
            # Try async with Celery
            try:
                generate_video_task.delay(str(video_task.id))
                logger.info(f"✅ Video task queued asynchronously: {video_task.id}")
            except Exception as e:
                logger.warning(f"⚠️ Celery failed ({e}), falling back to synchronous execution")
                use_celery = False
        
        if not use_celery:
            # Run synchronously (works without Redis)
            logger.info(f"ℹ️ Running video generation synchronously")
            try:
                from api.tasks import generate_video_task as task_func
                from api.models import VideoTask as VT, Resource
                from api.services.video_generator import VideoGeneratorService
                from django.core.files import File
                from django.utils import timezone
                
                # Execute the task logic directly without Celery
                try:
                    vt = VT.objects.get(pk=str(video_task.id))
                except VT.DoesNotExist:
                    logger.error(f"VideoTask {video_task.id} not found")
                    return Response(
                        {"error": "Video task not found"},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR
                    )
                
                # Run in a separate thread to avoid blocking
                import threading
                def run_sync():
                    try:
                        lesson_content = None
                        if vt.lesson and vt.lesson.content:
                            lesson_content = vt.lesson.content
                        
                        service = VideoGeneratorService(str(video_task.id))
                        final_path = service.run(vt.topic, content=lesson_content)
                        
                        with open(final_path, "rb") as f:
                            vt.video_file.save(f"video_{video_task.id}.mp4", File(f), save=False)
                        
                        try:
                            import subprocess
                            cmd = [
                                "ffprobe", "-v", "quiet",
                                "-show_entries", "format=duration",
                                "-of", "csv=p=0",
                                final_path,
                            ]
                            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=True)
                            vt.duration_seconds = int(float(result.stdout.strip()))
                        except Exception:
                            pass
                        
                        vt.status = "completed"
                        vt.progress_message = "Video generation complete."
                        vt.completed_at = timezone.now()
                        vt.save()
                        
                        if vt.lesson:
                            try:
                                # Count existing video resources to create unique title
                                existing_count = Resource.objects.filter(
                                    lesson=vt.lesson,
                                    resource_type='video',
                                ).count()
                                
                                # Always create a new resource (allow multiple videos per topic)
                                Resource.objects.create(
                                    lesson=vt.lesson,
                                    title=f"Video: {vt.topic} #{existing_count + 1}",
                                    resource_type='video',
                                    file=vt.video_file,
                                    duration_seconds=vt.duration_seconds,
                                )
                                logger.info(f"✅ Created video resource #{existing_count + 1} for: {vt.topic}")
                            except Exception as e:
                                logger.error(f"Failed to create resource: {e}")
                        
                        logger.info(f"VideoTask {video_task.id} completed successfully")
                    except Exception as e:
                        logger.error(f"VideoTask {video_task.id} failed: {e}")
                        vt.status = "failed"
                        vt.progress_message = f"Error: {str(e)}"
                        vt.save()
                
                thread = threading.Thread(target=run_sync, daemon=True)
                thread.start()
                logger.info(f"✅ Video task started in background thread")
                
            except Exception as sync_error:
                logger.error(f"❌ Video generation failed to start: {sync_error}")
                video_task.status = "failed"
                video_task.progress_message = f"Failed to start: {str(sync_error)}"
                video_task.save()

        return Response(
            VideoTaskStatusSerializer(video_task, context={"request": request}).data,
            status=status.HTTP_202_ACCEPTED,
        )


class VideoTaskStatusView(APIView):
    """GET: Check the status of a video generation task."""

    def get(self, request, task_id):
        try:
            video_task = VideoTask.objects.get(pk=task_id)
        except VideoTask.DoesNotExist:
            return Response(
                {"detail": "Task not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            VideoTaskStatusSerializer(video_task, context={"request": request}).data,
        )


# ============================================================================
# COURSE PLANNING VIEWS
# ============================================================================


class CoursePlanningView(APIView):
    """POST: Create a course planning task and run it in background thread."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CoursePlanningTaskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        planning_task = CoursePlanningTask.objects.create(
            course_title=serializer.validated_data["course_title"],
            course_description=serializer.validated_data["course_description"],
            category=serializer.validated_data.get("category", "other"),
            difficulty_level=serializer.validated_data.get("difficulty_level", "beginner"),
            estimated_duration=serializer.validated_data.get("estimated_duration", 60),
            thumbnail=serializer.validated_data.get("thumbnail", ""),
        )

        # Run course planning in a background thread
        import threading
        from api.models import CoursePlanningTask as CPT, Course
        from api.services.course_planning_service import CoursePlanningService
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        # Capture user_id for the background thread
        user_id = request.user.id
        
        def run_course_planning():
            try:
                cpt = CPT.objects.get(pk=str(planning_task.id))
                cpt.status = "processing"
                cpt.progress_message = "Analyzing topic and generating course plan..."
                cpt.save()
                
                logger.info(f"Starting course planning for: {cpt.course_title}")
                
                # Initialize the course planning service
                service = CoursePlanningService()
                
                # Generate the course plan using LLM
                course_plan = service.create_course_plan(
                    course_title=cpt.course_title,
                    course_description=cpt.course_description
                )
                
                # Convert to dict for storage
                plan_dict = service.plan_to_dict(course_plan)
                cpt.result_data = plan_dict
                cpt.progress_message = f"Course plan generated: {'Broad' if course_plan.is_broad else 'Narrow'} topic, {course_plan.total_courses} course(s)"
                cpt.save()
                
                logger.info(f"Course plan generated: is_broad={course_plan.is_broad}, total_courses={course_plan.total_courses}")
                
                # Create Course records based on the plan
                created_course_ids = []
                
                # Get the user who created this course
                creator = User.objects.get(id=user_id)
                
                if course_plan.is_broad:
                    # Broad topic: Create parent + children
                    cpt.progress_message = "Creating parent course and sub-courses..."
                    cpt.save()
                    
                    # Create parent course
                    parent_course = Course.objects.create(
                        title=cpt.course_title,
                        name=cpt.course_title,
                        description=cpt.course_description,
                        category=cpt.category,
                        difficulty_level=cpt.difficulty_level,
                        estimated_duration=cpt.estimated_duration,
                        thumbnail=cpt.thumbnail,
                        is_sub_topic=False,
                        parent_topic_name='',
                        is_popular=True,
                        created_by=creator,
                        learning_objectives=[],
                        prerequisites=[],
                    )
                    created_course_ids.append(str(parent_course.id))
                    logger.info(f"Created parent course: {parent_course.title} (ID: {parent_course.id})")
                    
                    # Create child courses for each course in the plan
                    difficulty_map = {
                        'Beginner': 'beginner',
                        'Intermediate': 'intermediate',
                        'Advanced': 'advanced',
                    }
                    
                    for idx, course_model in enumerate(course_plan.courses, 1):
                        child_course = Course.objects.create(
                            title=course_model.course_name,
                            name=course_model.course_name,
                            description=course_model.description,
                            category=cpt.category,
                            difficulty_level=difficulty_map.get(course_model.difficulty, 'beginner'),
                            estimated_duration=cpt.estimated_duration,
                            thumbnail=cpt.thumbnail,
                            is_sub_topic=True,
                            parent_topic_name=cpt.course_title,
                            is_popular=True,
                            created_by=creator,
                            learning_objectives=[],
                            prerequisites=course_model.prerequisites,
                        )
                        created_course_ids.append(str(child_course.id))
                        logger.info(f"Created child course {idx}/{course_plan.total_courses}: {child_course.title} (ID: {child_course.id})")
                
                else:
                    # Narrow topic: Create single course
                    cpt.progress_message = "Creating single comprehensive course..."
                    cpt.save()
                    
                    course_model = course_plan.courses[0]
                    difficulty_map = {
                        'Beginner': 'beginner',
                        'Intermediate': 'intermediate',
                        'Advanced': 'advanced',
                    }
                    
                    single_course = Course.objects.create(
                        title=course_model.course_name,
                        name=course_model.course_name,
                        description=course_model.description,
                        category=cpt.category,
                        difficulty_level=difficulty_map.get(course_model.difficulty, cpt.difficulty_level),
                        estimated_duration=cpt.estimated_duration,
                        thumbnail=cpt.thumbnail,
                        is_sub_topic=True,  # Narrow/standalone course is directly learnable
                        parent_topic_name='',
                        is_popular=True,
                        created_by=creator,
                        learning_objectives=[],
                        prerequisites=[],
                    )
                    created_course_ids.append(str(single_course.id))
                    logger.info(f"Created single course: {single_course.title} (ID: {single_course.id})")
                
                # Mark task as completed
                cpt.status = "completed"
                cpt.created_courses = created_course_ids
                cpt.progress_message = f"Successfully created {len(created_course_ids)} course(s)"
                cpt.completed_at = timezone.now()
                cpt.save()
                
                logger.info(f"CoursePlanningTask {planning_task.id} completed successfully. Created {len(created_course_ids)} course(s).")
                
            except Exception as e:
                logger.exception(f"CoursePlanningTask {planning_task.id} failed")
                CPT.objects.filter(pk=str(planning_task.id)).update(
                    status="failed",
                    error_message=str(e),
                    progress_message="Course planning failed.",
                )
        
        # Start the background thread
        thread = threading.Thread(target=run_course_planning, daemon=True)
        thread.start()
        logger.info(f"✅ Course planning task {planning_task.id} started in background thread")

        return Response(
            CoursePlanningTaskSerializer(planning_task).data,
            status=status.HTTP_202_ACCEPTED,
        )


class CoursePlanningStatusView(APIView):
    """GET: Check the status of a course planning task."""
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        try:
            planning_task = CoursePlanningTask.objects.get(pk=task_id)
        except CoursePlanningTask.DoesNotExist:
            return Response(
                {"detail": "Task not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            CoursePlanningTaskSerializer(planning_task).data,
        )


# ============================================================================
# ASSESSMENT & PERSONALIZED LEARNING VIEWS
# ============================================================================

    def post(self, request):
        serializer = CoursePlanningTaskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        planning_task = CoursePlanningTask.objects.create(
            course_title=serializer.validated_data["course_title"],
            course_description=serializer.validated_data["course_description"],
            category=serializer.validated_data.get("category", "other"),
            difficulty_level=serializer.validated_data.get("difficulty_level", "beginner"),
            estimated_duration=serializer.validated_data.get("estimated_duration", 60),
            thumbnail=serializer.validated_data.get("thumbnail", ""),
        )

        # Check if Celery is enabled in settings
        use_celery = getattr(settings, 'USE_CELERY', True)
        
        if use_celery:
            # Try async with Celery
            try:
                from api.tasks import generate_course_plan_task
                generate_course_plan_task.delay(str(planning_task.id))
                logger.info(f"✅ Course planning task queued asynchronously: {planning_task.id}")
            except Exception as e:
                logger.warning(f"⚠️ Celery failed ({e}), falling back to synchronous execution")
                use_celery = False
        
        if not use_celery:
            # Run synchronously (works without Celery/Redis)
            logger.info(f"ℹ️ Running course planning synchronously")
            try:
                from api.tasks import generate_course_plan_task as task_func
                
                # Run in a separate thread to avoid blocking
                import threading
                def run_sync():
                    try:
                        # Execute the task logic directly
                        from api.models import CoursePlanningTask as CPT, Course
                        from api.services.course_planning_service import CoursePlanningService
                        from django.utils import timezone
                        
                        try:
                            cpt = CPT.objects.get(pk=str(planning_task.id))
                        except CPT.DoesNotExist:
                            logger.error(f"CoursePlanningTask {planning_task.id} not found")
                            return
                        
                        cpt.status = "processing"
                        cpt.progress_message = "Analyzing topic and generating course plan..."
                        cpt.save()
                        
                        service = CoursePlanningService()
                        course_plan = service.create_course_plan(
                            course_title=cpt.course_title,
                            course_description=cpt.course_description
                        )
                        
                        plan_dict = service.plan_to_dict(course_plan)
                        cpt.result_data = plan_dict
                        cpt.progress_message = f"Course plan generated: {'Broad' if course_plan.is_broad else 'Narrow'} topic, {course_plan.total_courses} course(s)"
                        cpt.save()
                        
                        created_course_ids = []
                        
                        if course_plan.is_broad:
                            # Create parent + children
                            parent_course = Course.objects.create(
                                title=cpt.course_title,
                                name=cpt.course_title,
                                description=cpt.course_description,
                                category=cpt.category,
                                difficulty_level=cpt.difficulty_level,
                                estimated_duration=cpt.estimated_duration,
                                thumbnail=cpt.thumbnail,
                                is_sub_topic=False,
                                parent_topic_name=None,
                                learning_objectives=[],
                                prerequisites=[],
                            )
                            created_course_ids.append(str(parent_course.id))
                            
                            for course_model in course_plan.courses:
                                difficulty_map = {
                                    'Beginner': 'beginner',
                                    'Intermediate': 'intermediate',
                                    'Advanced': 'advanced',
                                }
                                
                                child_course = Course.objects.create(
                                    title=course_model.course_name,
                                    name=course_model.course_name,
                                    description=course_model.description,
                                    category=cpt.category,
                                    difficulty_level=difficulty_map.get(course_model.difficulty, 'beginner'),
                                    estimated_duration=cpt.estimated_duration,
                                    thumbnail=cpt.thumbnail,
                                    is_sub_topic=True,
                                    parent_topic_name=cpt.course_title,
                                    learning_objectives=[],
                                    prerequisites=course_model.prerequisites,
                                )
                                created_course_ids.append(str(child_course.id))
                        else:
                            # Create single course
                            course_model = course_plan.courses[0]
                            difficulty_map = {
                                'Beginner': 'beginner',
                                'Intermediate': 'intermediate',
                                'Advanced': 'advanced',
                            }
                            
                            single_course = Course.objects.create(
                                title=course_model.course_name,
                                name=course_model.course_name,
                                description=course_model.description,
                                category=cpt.category,
                                difficulty_level=difficulty_map.get(course_model.difficulty, cpt.difficulty_level),
                                estimated_duration=cpt.estimated_duration,
                                thumbnail=cpt.thumbnail,
                                is_sub_topic=True,  # Narrow/standalone course is directly learnable
                                parent_topic_name='',
                                learning_objectives=[],
                                prerequisites=[],
                            )
                            created_course_ids.append(str(single_course.id))
                        
                        cpt.status = "completed"
                        cpt.created_courses = created_course_ids
                        cpt.progress_message = f"Successfully created {len(created_course_ids)} course(s)"
                        cpt.completed_at = timezone.now()
                        cpt.save()
                        
                        logger.info(f"CoursePlanningTask {planning_task.id} completed successfully")
                    except Exception as e:
                        logger.error(f"CoursePlanningTask {planning_task.id} failed: {e}")
                        cpt.status = "failed"
                        cpt.error_message = str(e)
                        cpt.progress_message = "Course planning failed."
                        cpt.save()
                
                thread = threading.Thread(target=run_sync, daemon=True)
                thread.start()
                logger.info(f"✅ Course planning task started in background thread")
                
            except Exception as sync_error:
                logger.error(f"❌ Course planning failed to start: {sync_error}")
                planning_task.status = "failed"
                planning_task.error_message = str(sync_error)
                planning_task.progress_message = f"Failed to start: {str(sync_error)}"
                planning_task.save()

        return Response(
            CoursePlanningTaskSerializer(planning_task, context={"request": request}).data,
            status=status.HTTP_202_ACCEPTED,
        )


class CoursePlanningStatusView(APIView):
    """GET: Check the status of a course planning task."""
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        try:
            planning_task = CoursePlanningTask.objects.get(pk=task_id)
        except CoursePlanningTask.DoesNotExist:
            return Response(
                {"detail": "Task not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            CoursePlanningTaskSerializer(planning_task, context={"request": request}).data,
        )


# ============================================================================
# ASSESSMENT & PERSONALIZED LEARNING VIEWS
# ============================================================================

class InitialAssessmentView(APIView):
    """Generate initial diagnostic MCQ questions for course enrollment using pre-knowledge assessment"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        """
        Generate initial assessment questions for a sub-topic.
        LLM determines the number of questions based on course complexity.
        
        Expected payload:
        {
            "course_id": 1,
            "course_name": "Linear Regression"
        }
        
        Returns:
        {
            "question_count": 8,
            "question_count_reasoning": "...",
            "questions": [
                {
                    "question_text": "...",
                    "topic": "...",
                    "options": [option1, option2, option3, "I don't know about this course"],
                    "correct_answer_index": 0-2,
                    "explanation": "...",
                    "difficulty_hint": "Beginner"
                }
            ]
        }
        """
        logger.info("="*60)
        logger.info("InitialAssessmentView.post() ENTERED")
        logger.info(f"Request user: {request.user}")
        logger.info(f"Request data: {request.data}")
        logger.info("="*60)
        
        from .services.pre_assessment_service import PreKnowledgeAssessment
        
        course_id = request.data.get('course_id')
        course_name = request.data.get('course_name')
        
        if not course_id or not course_name:
            return Response(
                {'error': 'course_id and course_name are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Verify course exists
            course = Course.objects.get(pk=course_id)
            
            # Check if this is a learnable sub-topic
            if not course.is_sub_topic:
                # Get sub-topics for this broad topic
                sub_topics = Course.objects.filter(
                    is_sub_topic=True,
                    parent_topic_name=course.title
                )
                return Response({
                    'error': f"Cannot enroll in '{course.title}' directly.",
                    'message': f"We can't teach you the entire '{course.title}' topic. Please choose from the individual sub-topics below.",
                    'learnable': False,
                    'suggested_sub_topics': CourseSerializer(sub_topics, many=True).data
                }, status=status.HTTP_400_BAD_REQUEST)
            
            logger.info("="*60)
            logger.info("InitialAssessmentView: Calling PreKnowledgeAssessment service")
            logger.info(f"Course ID: {course_id}, Course Name: {course_name}")
            logger.info("="*60)
            
            # Initialize pre-knowledge assessment service
            assessment_service = PreKnowledgeAssessment()
            
            # Step 1: Let LLM determine optimal question count based on complexity
            question_decision = assessment_service.determine_question_count(
                course_name=course.name,
                course_description=course.description,
                difficulty=course.difficulty_level
            )
            
            question_count = question_decision['question_count']
            logger.info(f"LLM determined question count: {question_count}")
            logger.info(f"Reasoning: {question_decision['reasoning']}")
            
            # Step 2: Generate the questions
            question_set = assessment_service.generate_questions(
                course_name=course.name,
                course_description=course.description,
                difficulty=course.difficulty_level,
                num_questions=question_count
            )
            
            logger.info(f"Generated {len(question_set.questions)} questions successfully")
            logger.info("="*60)
            
            # Convert to dict for JSON response
            response_data = {
                'question_count': question_count,
                'question_count_reasoning': question_decision['reasoning'],
                'questions': [q.model_dump() for q in question_set.questions]
            }
            
            return Response(response_data, status=status.HTTP_200_OK)
            
        except Course.DoesNotExist:
            return Response(
                {'error': 'Course not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error generating initial assessment: {e}", exc_info=True)
            return Response(
                {'error': f'Failed to generate assessment: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class EvaluateAssessmentView(APIView):
    """Evaluate initial assessment and generate personalized syllabus with two-layer validation"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        """
        Evaluate assessment answers and create enrollment with personalized syllabus.
        
        Expected payload:
        {
            "course_id": 1,
            "course_name": "Web Development",
            "questions": [...],  # Full question objects with correct_answer_index and topic
            "answers": [0, 2, 3, 1, ...],  # User's answer indices (0-3, where 3 is "I don't know")
            "study_method": "real_world" | "theory_depth" | "project_based" | "custom",
            "custom_study_method": "..." (required if study_method is "custom")
        }
        
        Returns:
        {
            "enrollment_id": 1,
            "assessment_result": {
                "knowledge_level": "Basic",
                "knowledge_percentage": 45.5,
                "correct_answers": 3,
                "incorrect_answers": 2,
                "dont_know_answers": 3,
                "known_topics": [...],
                "weak_topics": [...],
                "unknown_topics": [...]
            },
            "syllabus": {
                "course_name": "...",
                "study_method": "...",
                "total_modules": 5,
                "total_estimated_hours": 12.5,
                "modules": [...]
            },
            "message": "..."
        }
        """
        from .services.pre_assessment_service import PreKnowledgeAssessment
        from .services.syllabus_service import SyllabusGenerator
        
        course_id = request.data.get('course_id')
        course_name = request.data.get('course_name')
        questions = request.data.get('questions')
        answers = request.data.get('answers')
        study_method = request.data.get('study_method', 'real_world')
        custom_study_method = request.data.get('custom_study_method', '')
        # Learning style chosen by the user on the LearningPreferencePage
        user_learning_style = request.data.get('learning_style', None)
        
        if not all([course_id, course_name, questions, answers]):
            return Response(
                {'error': 'course_id, course_name, questions, and answers are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate study_method
        valid_study_methods = ['real_world', 'theory_depth', 'project_based', 'custom']
        if study_method not in valid_study_methods:
            return Response(
                {'error': f'study_method must be one of: {", ".join(valid_study_methods)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate custom_study_method if needed
        if study_method == 'custom' and not custom_study_method:
            return Response(
                {'error': 'custom_study_method is required when study_method is "custom"'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            course = Course.objects.get(pk=course_id)
            user = request.user
            
            # Check if this is a learnable sub-topic
            if not course.is_sub_topic:
                sub_topics = Course.objects.filter(
                    is_sub_topic=True,
                    parent_topic_name=course.title
                )
                return Response({
                    'error': f"Cannot enroll in '{course.title}' directly.",
                    'message': f"We can't teach you the entire '{course.title}' topic. Please choose from the individual sub-topics below.",
                    'learnable': False,
                    'suggested_sub_topics': CourseSerializer(sub_topics, many=True).data
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Check if already enrolled
            existing_enrollment = Enrollment.objects.filter(
                user=user,
                course=course
            ).first()
            
            if existing_enrollment:
                return Response(
                    {'error': 'Already enrolled in this sub-topic'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            logger.info("="*60)
            logger.info("EvaluateAssessmentView: Evaluating assessment")
            logger.info(f"Course: {course_name}")
            logger.info(f"Questions: {len(questions)}, Answers: {len(answers)}")
            logger.info(f"Study method: {study_method}")
            logger.info("="*60)
            
            # Step 1: Evaluate assessment locally
            assessment_service = PreKnowledgeAssessment()
            assessment_result = assessment_service.evaluate_assessment(
                questions=questions,
                user_answers=answers
            )
            
            logger.info(f"Assessment Result: {assessment_result.knowledge_level} ({assessment_result.knowledge_percentage:.1f}%)")
            logger.info(f"Known topics: {len(assessment_result.known_topics)}, Weak: {len(assessment_result.weak_topics)}, Unknown: {len(assessment_result.unknown_topics)}")
            
            # Step 2: Generate personalized syllabus with two-layer validation
            logger.info("Generating personalized syllabus with two-layer validation...")
            syllabus_generator = SyllabusGenerator()
            
            # Convert assessment result to dict for syllabus generation
            assessment_result_dict = assessment_service.result_to_dict(assessment_result)
            
            syllabus, attempt_history = syllabus_generator.generate_syllabus(
                course_name=course.name,
                course_description=course.description,
                difficulty=course.difficulty_level,
                study_method=study_method,
                custom_study_method=custom_study_method,
                assessment_result=assessment_result_dict,
                max_attempts=3
            )
            
            logger.info(f"Syllabus generated: {syllabus.total_modules} modules, {syllabus.total_estimated_hours:.1f} hrs")
            logger.info(f"Generation attempts: {len(attempt_history)}")
            
            # Convert syllabus to dict for storage
            syllabus_dict = syllabus_generator.syllabus_to_dict(syllabus)
            
            # Map knowledge level to Enrollment.KnowledgeLevel choices
            knowledge_level_map = {
                'None': 'beginner',
                'Basic': 'beginner',
                'Intermediate': 'intermediate',
                'Advanced': 'advanced',
            }
            diagnosed_level = knowledge_level_map.get(assessment_result.knowledge_level, 'beginner')
            
            # Use the user's explicit learning style choice if provided;
            # otherwise fall back to mapping from knowledge level.
            if user_learning_style and user_learning_style in ('mindmap', 'videos', 'summary', 'books', 'reels'):
                learning_style = user_learning_style
            else:
                level_to_style = {
                    'beginner': 'videos',
                    'intermediate': 'summary',
                    'advanced': 'mindmap',
                }
                learning_style = level_to_style.get(diagnosed_level, 'summary')
            
            # ── Generate personalized AI system prompt based on study method (learning style) ────
            # study_method describes HOW the student prefers to engage with content
            study_method_descriptions = {
                'real_world': (
                    'real-world examples, practical applications, and case studies. '
                    'They want to see how concepts apply in industry and everyday life. '
                    'Use analogies, real scenarios, and hands-on examples from the field.'
                ),
                'theory_depth': (
                    'deep theoretical understanding, first principles, and academic rigor. '
                    'They want to understand the "why" behind every concept. '
                    'Use precise definitions, formal explanations, proofs where relevant, and build understanding layer by layer.'
                ),
                'project_based': (
                    'building projects and learning by doing. '
                    'They are motivated by constructing things themselves. '
                    'Frame concepts around what they can build, provide step-by-step project guidance, and connect theory to implementation.'
                ),
                'custom': (
                    f'a custom learning approach they described as: "{custom_study_method}". '
                    'Tailor the content strictly to match this preference.'
                ),
            }
            study_desc = study_method_descriptions.get(study_method, 'clear, engaging educational content')
            
            try:
                from .services.ai_client import generate_text
                system_prompt_gen_prompt = (
                    f'You are an expert AI tutor. A student is learning "{course.title}" '
                    f'at the "{diagnosed_level}" level. '
                    f'Their chosen learning approach is "{study_method.replace("_", " ")}", '
                    f'meaning they learn best through {study_desc} '
                    f'Write a focused system prompt (4-6 sentences) that instructs an AI teaching assistant '
                    f'how to explain and teach "{course.title}" concepts to this student '
                    f'in a way that perfectly matches their learning approach. '
                    f'Be specific: mention the tone, depth, structure, and examples style that suit this student. '
                    f'Do not include greetings or preamble — output only the direct instruction.'
                )
                ai_system_prompt = generate_text(
                    prompt=system_prompt_gen_prompt,
                    system_prompt='You are a prompt engineering expert. Output only the system prompt text, no extra commentary.'
                ).strip()
                logger.info(f"Generated ai_system_prompt ({len(ai_system_prompt)} chars) for enrollment (study_method={study_method}).")
            except Exception as sp_err:
                logger.warning(f"Could not generate ai_system_prompt: {sp_err}")
                ai_system_prompt = ''
            
            # Create enrollment with new fields
            enrollment = Enrollment.objects.create(
                user=user,
                course=course,
                diagnosed_level=diagnosed_level,
                learning_style_override=learning_style,
                study_method_preference=study_method,
                custom_study_method=custom_study_method,
                ai_system_prompt=ai_system_prompt,
                assessment_questions_count=len(questions),
                status='active'
            )
            
            logger.info(f"Enrollment created: ID={enrollment.id}")
            
            # Create backward-compatible flat roadmap
            roadmap_data = {
                "topics": [
                    {
                        "topic_name": mod.get("module_name", ""),
                        "level": diagnosed_level,
                        "description": mod.get("module_description", ""),
                    }
                    for mod in syllabus_dict.get("modules", [])
                ]
            }
            
            roadmap = LearningRoadmap.objects.create(
                enrollment=enrollment,
                roadmap_data=roadmap_data,
                is_active=True,
                version=1
            )
            
            # Create personalized syllabus with new structure
            personalized_syllabus = PersonalizedSyllabus.objects.create(
                enrollment=enrollment,
                syllabus_data=syllabus_dict,
                generated_by_model=getattr(settings, 'OLLAMA_MODEL', 'llama3:8b')
            )
            
            logger.info(f"PersonalizedSyllabus created: ID={personalized_syllabus.id}")
            
            # Store topic breakdown in QuizAttempt for analytics
            quiz_attempt = QuizAttempt.objects.create(
                enrollment=enrollment,
                attempt_type='diagnostic',
                score_percent=assessment_result.knowledge_percentage,
                correct_answers=assessment_result.correct_answers,
                total_questions=assessment_result.total_questions,
                weak_areas={
                    'known_topics': assessment_result.known_topics,
                    'weak_topics': assessment_result.weak_topics,
                    'unknown_topics': assessment_result.unknown_topics,
                    'knowledge_level': assessment_result.knowledge_level
                }
            )
            
            # Log activity
            ActivityLog.objects.create(
                user=user,
                activity_type='course_started',
                title=f'Started {course.title}',
                description=f'Completed pre-knowledge assessment for {course.title}',
                metadata={
                    'course_id': str(course.id),
                    'knowledge_level': assessment_result.knowledge_level,
                    'knowledge_percentage': assessment_result.knowledge_percentage,
                    'study_method': study_method
                }
            )
            
            logger.info("="*60)
            logger.info("EvaluateAssessmentView: Complete!")
            logger.info("="*60)
            
            return Response({
                'enrollment_id': enrollment.id,
                'assessment_result': assessment_result_dict,
                'syllabus': syllabus_dict,
                'roadmap': roadmap_data,  # Backward compatibility
                'message': 'Enrollment created successfully with personalized syllabus'
            }, status=status.HTTP_201_CREATED)
            
        except Course.DoesNotExist:
            return Response(
                {'error': 'Course not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error in EvaluateAssessmentView: {str(e)}", exc_info=True)
            return Response(
                {'error': f'Failed to process assessment: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
            
        except Course.DoesNotExist:
            return Response(
                {'error': 'Course not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error evaluating assessment: {e}", exc_info=True)
            return Response(
                {'error': f'Failed to evaluate assessment: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class GetSyllabusView(APIView):
    """Retrieve the personalized syllabus for an enrollment"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, enrollment_id):
        try:
            enrollment = Enrollment.objects.get(pk=enrollment_id, user=request.user)
        except Enrollment.DoesNotExist:
            return Response(
                {'error': 'Enrollment not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            syllabus = PersonalizedSyllabus.objects.get(enrollment=enrollment)
        except PersonalizedSyllabus.DoesNotExist:
            return Response(
                {'error': 'No syllabus found for this enrollment'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        return Response({
            'enrollment_id': enrollment.id,
            'course_name': enrollment.course.title,
            'syllabus': syllabus.syllabus_data,
            'generated_by_model': syllabus.generated_by_model,
            'total_modules': syllabus.total_modules,
            'total_topics': syllabus.total_topics,
            'created_at': syllabus.created_at,
        })


class GenerateCodingProblemView(APIView):
    """Generate and persist a coding problem for a specific topic."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = GenerateCodingProblemRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        enrollment_id = payload['enrollment_id']
        module_id = payload['module_id']
        topic_name = payload['topic_name']
        regenerate = payload.get('regenerate', False)

        try:
            enrollment = Enrollment.objects.get(pk=enrollment_id, user=request.user)
            module = Module.objects.get(course=enrollment.course, order=module_id)
        except Enrollment.DoesNotExist:
            return Response({'error': 'Enrollment not found'}, status=status.HTTP_404_NOT_FOUND)
        except Module.DoesNotExist:
            return Response({'error': 'Module not found for this enrollment/course'}, status=status.HTTP_404_NOT_FOUND)

        lesson_order = module.lessons.count() + 1
        lesson, _ = Lesson.objects.get_or_create(
            module=module,
            title=topic_name,
            defaults={'order': lesson_order, 'content': ''},
        )

        existing_problem = CodingProblem.objects.filter(lesson=lesson, language='python').order_by('-created_at').first()
        if existing_problem and not regenerate:
            return Response(CodingProblemSerializer(existing_problem).data, status=status.HTTP_200_OK)

        service = get_code_problem_service()
        generated = service.generate_problem(
            course_name=enrollment.course.title,
            topic_name=topic_name,
            topic_context=lesson.content or '',
        )

        problem = CodingProblem.objects.create(
            course=enrollment.course,
            module=module,
            lesson=lesson,
            title=generated.title,
            problem_statement=generated.problem_statement,
            starter_code=generated.starter_code,
            reference_solution=generated.reference_solution,
            language='python',
            difficulty=generated.difficulty,
            constraints=generated.constraints,
            hints=generated.hints,
            is_generated=True,
            generation_model=getattr(settings, 'CODING_MODEL', getattr(settings, 'OLLAMA_MODEL', 'unknown')),
        )

        for test_data in [*generated.visible_tests, *generated.hidden_tests]:
            CodingTestCase.objects.create(
                problem=problem,
                input_data=test_data.get('input_data', ''),
                expected_output=test_data.get('expected_output', ''),
                explanation=test_data.get('explanation', ''),
                is_hidden=bool(test_data.get('is_hidden', False)),
                weight=test_data.get('weight', 1.0),
                order=test_data.get('order', 1),
            )

        Resource.objects.create(
            lesson=lesson,
            resource_type=Resource.ResourceType.CODE_EXERCISE,
            title=f'{topic_name} - Code Exercise',
            content_json={'coding_problem_id': problem.id, 'language': problem.language},
            is_generated=True,
            generation_model=problem.generation_model,
        )

        return Response(CodingProblemSerializer(problem).data, status=status.HTTP_201_CREATED)


class CodingProblemDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, problem_id):
        try:
            problem = CodingProblem.objects.select_related('course').get(pk=problem_id)
        except CodingProblem.DoesNotExist:
            return Response({'error': 'Coding problem not found'}, status=status.HTTP_404_NOT_FOUND)

        has_access = Enrollment.objects.filter(user=request.user, course=problem.course).exists()
        if not has_access:
            return Response({'error': 'You do not have access to this coding problem'}, status=status.HTTP_403_FORBIDDEN)

        return Response(CodingProblemSerializer(problem).data, status=status.HTTP_200_OK)


class CreateCodeSubmissionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = CreateCodeSubmissionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        try:
            enrollment = Enrollment.objects.get(pk=payload['enrollment_id'], user=request.user)
            problem = CodingProblem.objects.get(pk=payload['problem_id'])
        except Enrollment.DoesNotExist:
            return Response({'error': 'Enrollment not found'}, status=status.HTTP_404_NOT_FOUND)
        except CodingProblem.DoesNotExist:
            return Response({'error': 'Coding problem not found'}, status=status.HTTP_404_NOT_FOUND)

        if enrollment.course_id != problem.course_id:
            return Response({'error': 'Problem does not belong to this enrollment course'}, status=status.HTTP_400_BAD_REQUEST)

        submission = CodeSubmission.objects.create(
            user=request.user,
            enrollment=enrollment,
            problem=problem,
            language=payload['language'],
            source_code=payload['source_code'],
            status=CodeSubmission.Status.PENDING,
        )
        task = CodeExecutionTask.objects.create(
            submission=submission,
            status=CodeExecutionTask.Status.PENDING,
            progress_message='Submission queued',
        )

        # Current implementation executes immediately in-process. Task model keeps API contract
        # compatible with future async workers.
        task.status = CodeExecutionTask.Status.PROCESSING
        task.progress_message = 'Running test cases'
        task.save(update_fields=['status', 'progress_message'])
        submission.status = CodeSubmission.Status.RUNNING
        submission.save(update_fields=['status'])

        try:
            executor = get_code_execution_service()
            test_cases = list(problem.test_cases.all().order_by('order', 'id'))
            result = executor.run_python_tests(source_code=submission.source_code, test_cases=test_cases, timeout_seconds=2)

            submission.status = CodeSubmission.Status.COMPLETED
            submission.score_percent = result['score_percent']
            submission.passed_tests = result['passed_tests']
            submission.total_tests = result['total_tests']
            submission.feedback = {
                'summary': result['feedback'],
                'test_results': result['test_results'],
            }
            submission.completed_at = timezone.now()
            submission.save(
                update_fields=[
                    'status',
                    'score_percent',
                    'passed_tests',
                    'total_tests',
                    'feedback',
                    'completed_at',
                ]
            )

            task.status = CodeExecutionTask.Status.COMPLETED
            task.progress_message = 'Execution complete'
            task.result_data = {
                'score_percent': result['score_percent'],
                'passed_tests': result['passed_tests'],
                'total_tests': result['total_tests'],
            }
            task.completed_at = timezone.now()
            task.save(update_fields=['status', 'progress_message', 'result_data', 'completed_at'])
        except Exception as exc:
            submission.status = CodeSubmission.Status.FAILED
            submission.error_message = str(exc)
            submission.completed_at = timezone.now()
            submission.save(update_fields=['status', 'error_message', 'completed_at'])

            task.status = CodeExecutionTask.Status.FAILED
            task.error_message = str(exc)
            task.progress_message = 'Execution failed'
            task.completed_at = timezone.now()
            task.save(update_fields=['status', 'error_message', 'progress_message', 'completed_at'])

        return Response(
            {
                'submission': CodeSubmissionSerializer(submission).data,
                'task': CodeExecutionTaskSerializer(task).data,
            },
            status=status.HTTP_201_CREATED,
        )


class CodeExecutionTaskStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, task_id):
        try:
            task = CodeExecutionTask.objects.select_related('submission').get(pk=task_id, submission__user=request.user)
        except CodeExecutionTask.DoesNotExist:
            return Response({'error': 'Task not found'}, status=status.HTTP_404_NOT_FOUND)

        return Response(CodeExecutionTaskSerializer(task).data, status=status.HTTP_200_OK)


class CodeSubmissionResultView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, submission_id):
        try:
            submission = CodeSubmission.objects.select_related('problem').get(pk=submission_id, user=request.user)
        except CodeSubmission.DoesNotExist:
            return Response({'error': 'Submission not found'}, status=status.HTTP_404_NOT_FOUND)

        return Response(CodeSubmissionSerializer(submission).data, status=status.HTTP_200_OK)


class GenerateSampleCodeView(APIView):
    """Generate runnable sample code for a topic (without test cases)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = GenerateSampleCodeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        enrollment_id = payload['enrollment_id']
        module_id = payload['module_id']
        topic_name = payload['topic_name']
        regenerate = payload.get('regenerate', False)

        try:
            enrollment = Enrollment.objects.get(pk=enrollment_id, user=request.user)
            module = Module.objects.get(course=enrollment.course, order=module_id)
        except Enrollment.DoesNotExist:
            return Response({'error': 'Enrollment not found'}, status=status.HTTP_404_NOT_FOUND)
        except Module.DoesNotExist:
            return Response({'error': 'Module not found for this enrollment/course'}, status=status.HTTP_404_NOT_FOUND)

        lesson_order = module.lessons.count() + 1
        lesson, _ = Lesson.objects.get_or_create(
            module=module,
            title=topic_name,
            defaults={'order': lesson_order, 'content': ''},
        )

        if not regenerate:
            existing = Resource.objects.filter(
                lesson=lesson,
                resource_type=Resource.ResourceType.CODE_EXERCISE,
                title__startswith=f'Sample Code: {topic_name}',
            ).order_by('-created_at').first()
            if existing:
                return Response(ResourceSerializer(existing, context={'request': request}).data, status=status.HTTP_200_OK)

        sample = get_sample_code_service().generate_sample(
            course_title=enrollment.course.title,
            topic_name=topic_name,
            topic_content=lesson.content or '',
        )

        resource = Resource.objects.create(
            lesson=lesson,
            resource_type=Resource.ResourceType.CODE_EXERCISE,
            title=f"Sample Code: {topic_name}",
            content_text=sample['explanation'],
            content_json={
                'mode': 'sample_code',
                'title': sample['title'],
                'explanation': sample['explanation'],
                'language': 'python',
                'starter_code': sample['starter_code'],
                'sample_input': sample['sample_input'],
            },
            is_generated=True,
            generation_model=getattr(settings, 'CODING_MODEL', getattr(settings, 'OLLAMA_MODEL', 'unknown')),
        )

        return Response(ResourceSerializer(resource, context={'request': request}).data, status=status.HTTP_201_CREATED)


class RunSampleCodeView(APIView):
    """Execute sample code once without test cases."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = RunSampleCodeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        try:
            result = get_code_execution_service().run_python_sample(
                source_code=payload['source_code'],
                raw_input=payload.get('raw_input', ''),
                timeout_seconds=3,
            )
            return Response(result, status=status.HTTP_200_OK)
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class StartInteractiveSampleCodeView(APIView):
    """Start a long-lived sample code process for runtime terminal input."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = StartInteractiveSampleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        try:
            result = get_code_execution_service().start_interactive_sample(
                source_code=payload['source_code']
            )
            return Response(result, status=status.HTTP_200_OK)
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SendInteractiveSampleInputView(APIView):
    """Send stdin to a running interactive sample session."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = SendInteractiveSampleInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        try:
            result = get_code_execution_service().send_interactive_input(
                session_id=payload['session_id'],
                user_input=payload.get('user_input', ''),
            )
            return Response(result, status=status.HTTP_200_OK)
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class StopInteractiveSampleCodeView(APIView):
    """Stop an interactive sample session and release resources."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = StopInteractiveSampleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        try:
            result = get_code_execution_service().stop_interactive_sample(
                session_id=payload['session_id']
            )
            return Response(result, status=status.HTTP_200_OK)
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GenerateTopicContentView(APIView):
    """Generate educational content for a specific topic"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        """
        Generate content for a topic.
        
        Expected payload:
        {
            "enrollment_id": 1,
            "module_id": 5,
            "topic_name": "Introduction to HTML"
        }
        
        Returns:
        {
            "content": "Markdown formatted content..."
        }
        """
        from .services.assessment_service import get_assessment_service
        
        
        
        print(f"DEBUG: GenerateTopicContentView POST data: {request.data}")
        enrollment_id = request.data.get('enrollment_id')
        module_id = request.data.get('module_id')
        topic_name = request.data.get('topic_name')
        print(f"DEBUG: Extracted -> enrollment_id={enrollment_id}, module_id={module_id}, topic_name={topic_name}")
        
        if enrollment_id is None or module_id is None or not topic_name:
            return Response(
                {'error': 'enrollment_id, module_id, and topic_name are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            enrollment = Enrollment.objects.get(pk=enrollment_id, user=request.user)
            
            # Get or create the Module using the order field
            # Modules are stored in PersonalizedSyllabus JSON, not always in DB
            try:
                module = Module.objects.get(course=enrollment.course, order=module_id)
            except Module.DoesNotExist:
                # Create module dynamically from syllabus data
                try:
                    syllabus_obj = PersonalizedSyllabus.objects.get(enrollment=enrollment)
                    syllabus_data = syllabus_obj.syllabus_data
                    modules_list = syllabus_data.get('modules', [])
                    
                    # Treat module_id as 1-based index
                    try:
                        # module_id comes as integer from request, but json keys might differ. 
                        # Ideally rely on list index.
                        m_idx = int(module_id) - 1
                        
                        if 0 <= m_idx < len(modules_list):
                            matching_module = modules_list[m_idx]
                            # Inject order if missing so we can save it to DB
                            matching_module['order'] = int(module_id)
                        else:
                            matching_module = None
                    except (ValueError, TypeError) as e:
                        matching_module = None
                    
                    if not matching_module:
                        return Response(
                            {'error': f'Module with order {module_id} not found in syllabus'},
                            status=status.HTTP_404_NOT_FOUND
                        )
                    
                    module = Module.objects.create(
                        course=enrollment.course,
                        order=module_id,
                        title=matching_module.get('module_name', f'Module {module_id}'),
                        description=matching_module.get('module_description', ''),
                        difficulty_level=matching_module.get('difficulty_level', 'beginner'),
                        estimated_duration_minutes=matching_module.get('estimated_duration_minutes', 60),
                        is_generated=True
                    )
                except PersonalizedSyllabus.DoesNotExist:
                    return Response(
                        {'error': 'Syllabus not found for this enrollment'},
                        status=status.HTTP_404_NOT_FOUND
                    )
            
            # ── Check if content already exists in DB (unless regenerating) ──
            regenerate = request.data.get('regenerate', False)
            if not regenerate:
                try:
                    existing_lesson = Lesson.objects.filter(
                        module=module,
                        title=topic_name,
                    ).exclude(content__isnull=True).exclude(content__exact='').first()
                    
                    if existing_lesson:
                        print(f"*** Returning cached content for '{topic_name}' ({len(existing_lesson.content)} chars) ***")
                        return Response({
                            'lesson_id': existing_lesson.id,
                            'content': existing_lesson.content
                        }, status=status.HTTP_200_OK)
                except Exception:
                    pass  # Fall through to generation if check fails
            else:
                print(f"*** Force regeneration requested for '{topic_name}' ***")
            
            # ── No cached content – generate with AI ─────────────────────
            # Get study method from enrollment
            study_method = enrollment.learning_style_override or 'summary'
            
            # Extract topic description from syllabus data
            topic_description = ""
            try:
                syllabus_obj = PersonalizedSyllabus.objects.get(enrollment=enrollment)
                syllabus_data = syllabus_obj.syllabus_data
                
                # Find the topic in the syllabus JSON
                for idx, mod in enumerate(syllabus_data.get('modules', [])):
                    # Match by 'order' if present, otherwise fallback to the sequence index (1-based)
                    mod_order = mod.get('order')
                    mod_match = (mod_order == module_id) if mod_order is not None else ((idx + 1) == module_id)
                    
                    if mod_match:
                        for topic in mod.get('topics', []):
                            if topic.get('topic_name') == topic_name:
                                # AI-generated syllabi use 'detailed_description' or 'short_description'
                                topic_description = (
                                    topic.get('detailed_description') or 
                                    topic.get('short_description') or 
                                    topic.get('description', '')
                                )
                                break
                        if topic_description:
                            break
            except PersonalizedSyllabus.DoesNotExist:
                pass  # Continue without description if not found
            
            print("\n**************************************************")
            print("*** GenerateTopicContentView: Calling assessment service ***")
            print(f"*** Course: {enrollment.course.title} ***")
            print(f"*** Topic: {topic_name} ***")
            print(f"*** Topic Description: {topic_description} ***")
            print(f"*** Study method: {study_method} ***")
            print(f"*** Has personalized system prompt: {bool(enrollment.ai_system_prompt)} ***")
            print("**************************************************")
            # Generate content with personalized system prompt
            assessment_service = get_assessment_service()
            content = assessment_service.generate_topic_content(
                enrollment.course.title,
                topic_name,
                study_method,
                topic_description,
                system_prompt=enrollment.ai_system_prompt or None
            )
            print(f"*** Content generated: {len(content)} chars ***")
            print("**************************************************\n")
            
            # Create or update lesson (keyed by module + title so each topic is stored separately)
            existing_count = Lesson.objects.filter(module=module).count()
            lesson, created = Lesson.objects.get_or_create(
                module=module,
                title=topic_name,
                defaults={
                    'order': existing_count + 1,
                    'content': content,
                }
            )
            
            if not created:
                lesson.content = content
                lesson.save()
            
            # Count existing note resources to create unique title
            existing_notes_count = Resource.objects.filter(
                lesson=lesson,
                resource_type='notes',
            ).count()
            
            # Always create a new Resource of type 'notes' (allow multiple notes per topic)
            Resource.objects.create(
                lesson=lesson,
                resource_type='notes',
                title=f'{topic_name} - Notes #{existing_notes_count + 1}',
                content_text=content,
                is_generated=True,
                generation_model='phi3:mini',
            )
            logger.info(f"✅ Created notes resource #{existing_notes_count + 1} for: {topic_name}")
            
            return Response({
                'lesson_id': lesson.id,
                'content': content
            }, status=status.HTTP_200_OK)
            
        except Enrollment.DoesNotExist:
            return Response(
                {'error': 'Enrollment not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error generating topic content: {e}", exc_info=True)
            return Response(
                {'error': f'Failed to generate content: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class GenerateDynamicScriptView(APIView):
    """Generate a structured interactive script for a topic."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = GenerateDynamicScriptRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        enrollment_id = payload['enrollment_id']
        module_id = payload['module_id']
        topic_name = payload['topic_name']
        regenerate = payload.get('regenerate', False)

        try:
            enrollment = Enrollment.objects.get(pk=enrollment_id, user=request.user)

            try:
                module = Module.objects.get(course=enrollment.course, order=module_id)
            except Module.DoesNotExist:
                try:
                    syllabus_obj = PersonalizedSyllabus.objects.get(enrollment=enrollment)
                    modules_list = syllabus_obj.syllabus_data.get('modules', [])
                    module_pos = int(module_id) - 1
                    if module_pos < 0 or module_pos >= len(modules_list):
                        return Response(
                            {'error': f'Module with order {module_id} not found in syllabus'},
                            status=status.HTTP_404_NOT_FOUND,
                        )

                    module_data = modules_list[module_pos]
                    module = Module.objects.create(
                        course=enrollment.course,
                        order=module_id,
                        title=module_data.get('module_name', f'Module {module_id}'),
                        description=module_data.get('module_description', ''),
                        difficulty_level=module_data.get('difficulty_level', 'beginner'),
                        estimated_duration_minutes=module_data.get('estimated_duration_minutes', 60),
                        is_generated=True,
                    )
                except PersonalizedSyllabus.DoesNotExist:
                    return Response(
                        {'error': 'Syllabus not found for this enrollment'},
                        status=status.HTTP_404_NOT_FOUND,
                    )

            lesson_order = module.lessons.count() + 1
            lesson, _ = Lesson.objects.get_or_create(
                module=module,
                title=topic_name,
                defaults={'order': lesson_order, 'content': ''},
            )

            if not regenerate:
                existing_script = Resource.objects.filter(
                    lesson=lesson,
                    resource_type=Resource.ResourceType.VIDEO_SCRIPT,
                    title__startswith=f'Dynamic Script: {topic_name}',
                ).order_by('-created_at').first()

                if existing_script and isinstance(existing_script.content_json, dict):
                    cached_data = {
                        'lesson_id': lesson.id,
                        'schema_version': existing_script.content_json.get('schema_version', '1.0'),
                        'title': existing_script.content_json.get('title', f'Interactive Script: {topic_name}'),
                        'overview': existing_script.content_json.get('overview', ''),
                        'blocks': existing_script.content_json.get('blocks', []),
                    }
                    response_serializer = DynamicScriptResponseSerializer(data=cached_data)
                    response_serializer.is_valid(raise_exception=True)
                    return Response(response_serializer.validated_data, status=status.HTTP_200_OK)

            topic_description = ''
            try:
                syllabus_obj = PersonalizedSyllabus.objects.get(enrollment=enrollment)
                for idx, mod in enumerate(syllabus_obj.syllabus_data.get('modules', [])):
                    mod_order = mod.get('order')
                    mod_match = (mod_order == module_id) if mod_order is not None else ((idx + 1) == module_id)
                    if not mod_match:
                        continue

                    for topic in mod.get('topics', []):
                        if topic.get('topic_name') == topic_name:
                            topic_description = (
                                topic.get('detailed_description')
                                or topic.get('short_description')
                                or topic.get('description', '')
                            )
                            break
                    if topic_description:
                        break
            except PersonalizedSyllabus.DoesNotExist:
                topic_description = ''

            script_data = get_dynamic_script_service().generate_script(
                course_title=enrollment.course.title,
                topic_name=topic_name,
                topic_description=topic_description,
                lesson_content=lesson.content or '',
                system_prompt=enrollment.ai_system_prompt or None,
            )

            response_data = {
                'lesson_id': lesson.id,
                'schema_version': script_data.get('schema_version', '1.0'),
                'title': script_data.get('title', f'Interactive Script: {topic_name}'),
                'overview': script_data.get('overview', ''),
                'blocks': script_data.get('blocks', []),
            }

            response_serializer = DynamicScriptResponseSerializer(data=response_data)
            response_serializer.is_valid(raise_exception=True)

            Resource.objects.create(
                lesson=lesson,
                resource_type=Resource.ResourceType.VIDEO_SCRIPT,
                title=f'Dynamic Script: {topic_name}',
                content_text=response_data.get('overview', ''),
                content_json={
                    'schema_version': response_data['schema_version'],
                    'title': response_data['title'],
                    'overview': response_data['overview'],
                    'blocks': response_data['blocks'],
                },
                is_generated=True,
                generation_model=getattr(settings, 'OLLAMA_MODEL', 'unknown'),
            )

            return Response(response_serializer.validated_data, status=status.HTTP_200_OK)
        except Enrollment.DoesNotExist:
            return Response({'error': 'Enrollment not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as exc:
            logger.error('Error generating dynamic script: %s', exc, exc_info=True)
            return Response(
                {'error': f'Failed to generate dynamic script: {str(exc)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class GenerateTopicQuizView(APIView):
    """Generate quiz for a specific topic and save questions to DB"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        """
        Generate quiz for a topic based on its content, persist every
        question in the Question table, and return them *without*
        correct_answer so the browser never sees the answers.

        Expected payload:
        {
            "lesson_id": 10,
            "topic_name": "Introduction to HTML"
        }
        
        Returns:
        {
            "questions": [
                {
                    "id": 42,
                    "question": "...",
                    "options": ["A", "B", "C", "D"]
                }
            ]
        }
        """
        from .services.assessment_service import get_assessment_service
        
        lesson_id = request.data.get('lesson_id')
        topic_name = request.data.get('topic_name')
        
        if not all([lesson_id, topic_name]):
            return Response(
                {'error': 'lesson_id and topic_name are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            lesson = Lesson.objects.get(pk=lesson_id)
            content = lesson.content
            
            if not content:
                return Response(
                    {'error': 'Lesson content not found. Generate content first.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # We need the module's course to save Question records
            module = lesson.module
            course = module.course
            
            print("\n**************************************************")
            print("*** GenerateTopicQuizView: Calling assessment service ***")
            print(f"*** Lesson ID: {lesson_id} ***")
            print(f"*** Topic: {topic_name} ***")
            print(f"*** Content length: {len(content)} chars ***")
            print("**************************************************")
            # Generate quiz via AI
            assessment_service = get_assessment_service()
            quiz_data = assessment_service.generate_topic_quiz(topic_name, content)
            raw_questions = quiz_data.get('questions', [])
            print(f"*** Quiz generated with {len(raw_questions)} questions ***")

            # ── Persist every question in the DB ──────────────────────
            saved_questions = []
            for q in raw_questions:
                options_list = q.get('options', [])
                correct_text = q.get('correct_answer', '')

                # Determine correct_answer_index from the option list
                try:
                    correct_idx = next(
                        i for i, o in enumerate(options_list)
                        if o.strip().upper() == correct_text.strip().upper()
                    )
                except StopIteration:
                    correct_idx = 0  # fallback

                db_question = Question.objects.create(
                    course=course,
                    module=module,
                    question_type='topic_quiz',
                    difficulty='intermediate',
                    question_text=q.get('question', ''),
                    options=options_list,
                    correct_answer_index=correct_idx,
                    explanation='',
                    is_generated=True,
                )
                saved_questions.append(db_question)

            print(f"*** Saved {len(saved_questions)} questions to DB ***")
            print("**************************************************\n")

            # ── Build response WITHOUT correct_answer ─────────────────
            response_questions = [
                {
                    'id': dbq.id,
                    'question': dbq.question_text,
                    'options': dbq.options,
                }
                for dbq in saved_questions
            ]
            
            return Response({'questions': response_questions}, status=status.HTTP_200_OK)
            
        except Lesson.DoesNotExist:
            return Response(
                {'error': 'Lesson not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error generating topic quiz: {e}", exc_info=True)
            return Response(
                {'error': f'Failed to generate quiz: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class GenerateTopicMindMapView(APIView):
    """Generate mind map for a specific topic"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        from .services.mindmap_service import MindMapService
        
        lesson_id = request.data.get('lesson_id')
        topic_name = request.data.get('topic_name')
        
        if not all([lesson_id, topic_name]):
            return Response(
                {'error': 'lesson_id and topic_name are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            lesson = Lesson.objects.get(pk=lesson_id)
            content = lesson.content
            
            if not content:
                return Response(
                    {'error': 'Lesson content not found. Generate content first.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            mindmap_data = MindMapService.generate_topic_mindmap(topic_name, content)
            
            # Save mind map to the database
            # Check if a mind map already exists for this topic
            existing_mindmap = Resource.objects.filter(
                lesson=lesson,
                resource_type=Resource.ResourceType.MINDMAP,
                title__icontains=topic_name
            ).first()
            
            if existing_mindmap:
                # Update existing mind map
                existing_mindmap.content_json = mindmap_data
                existing_mindmap.is_generated = True
                existing_mindmap.save()
            else:
                # Create new mind map resource
                Resource.objects.create(
                    lesson=lesson,
                    resource_type=Resource.ResourceType.MINDMAP,
                    title=f'Mind Map: {topic_name}',
                    content_json=mindmap_data,
                    is_generated=True,
                )
            
            ActivityLog.objects.create(
                user=request.user,
                activity_type='course_started',
                title=f'Mind Map generated for {topic_name}',
                description=f'Mind map generated for topic: {topic_name}',
                metadata={'lesson_id': str(lesson.id)}
            )
            
            return Response(mindmap_data, status=status.HTTP_200_OK)
            
        except Lesson.DoesNotExist:
            return Response(
                {'error': 'Lesson not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error generating topic mind map: {e}", exc_info=True)
            return Response(
                {'error': f'Failed to generate mind map: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class EvaluateTopicQuizView(APIView):
    """Evaluate topic quiz using server-side answers from the DB"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        """
        Evaluate topic quiz answers by looking up correct answers from
        the Question table.  Creates QuizAttempt + individual QuizAnswer
        records.

        Expected payload:
        {
            "enrollment_id": 1,
            "module_id": 5,
            "lesson_id": 42,  // Added to track specific topic
            "question_ids": [42, 43, 44, 45, 46],
            "answers": ["Option A", "Option B", ...]
        }
        
        Returns:
        {
            "evaluation": {
                "score": "4/5",
                "score_percent": 80,
                "weak_areas": [...]
            },
            "refined_roadmap": { ... }   // only when weak areas exist
        }
        """
        from .services.assessment_service import get_assessment_service
        
        enrollment_id = request.data.get('enrollment_id')
        module_id = request.data.get('module_id')
        lesson_id = request.data.get('lesson_id')  # Added to track specific topic
        question_ids = request.data.get('question_ids')
        answers = request.data.get('answers')
        
        # Proper validation that handles 0 and empty arrays
        if enrollment_id is None or module_id is None or question_ids is None or answers is None:
            return Response(
                {'error': 'enrollment_id, module_id, question_ids, and answers are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if len(question_ids) != len(answers):
            return Response(
                {'error': 'question_ids and answers must have the same length'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            enrollment = Enrollment.objects.get(pk=enrollment_id, user=request.user)
            
            # Get or create the Module using the order field
            try:
                module = Module.objects.get(course=enrollment.course, order=module_id)
            except Module.DoesNotExist:
                # Create module dynamically from syllabus data
                try:
                    syllabus_obj = PersonalizedSyllabus.objects.get(enrollment=enrollment)
                    syllabus_data = syllabus_obj.syllabus_data
                    
                    # Find the module by order in the syllabus JSON
                    matching_module = None
                    for mod in syllabus_data.get('modules', []):
                        if mod.get('order') == module_id:
                            matching_module = mod
                            break
                    
                    if not matching_module:
                        return Response(
                            {'error': f'Module with order {module_id} not found in syllabus'},
                            status=status.HTTP_404_NOT_FOUND
                        )
                    
                    # Create the Module record
                    module = Module.objects.create(
                        course=enrollment.course,
                        title=matching_module.get('module_name', f'Module {module_id}'),
                        description=matching_module.get('description', ''),
                        order=module_id,
                        difficulty_level=matching_module.get('difficulty_level', 'beginner'),
                        estimated_duration_minutes=matching_module.get('estimated_duration_minutes', 60),
                        is_generated=True
                    )
                except PersonalizedSyllabus.DoesNotExist:
                    return Response(
                        {'error': 'Syllabus not found for this enrollment'},
                        status=status.HTTP_404_NOT_FOUND
                    )

            # ── Fetch questions from DB ──────────────────────────────
            db_questions = Question.objects.filter(id__in=question_ids)
            q_map = {q.id: q for q in db_questions}

            if len(q_map) != len(question_ids):
                return Response(
                    {'error': 'One or more question IDs are invalid'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # ── Evaluate each answer server-side ─────────────────────
            correct_count = 0
            weak_areas = []
            answer_records = []   # (question, selected_index, is_correct)

            for qid, user_answer in zip(question_ids, answers):
                q = q_map[qid]
                correct_text = q.options[q.correct_answer_index] if q.options else ''
                is_correct = user_answer.strip().upper() == correct_text.strip().upper()

                if is_correct:
                    correct_count += 1
                else:
                    weak_areas.append(q.question_text)

                # Determine selected_option_index
                selected_idx = None
                for idx, opt in enumerate(q.options or []):
                    if opt.strip().upper() == user_answer.strip().upper():
                        selected_idx = idx
                        break

                answer_records.append((q, selected_idx, is_correct))

            total_questions = len(question_ids)
            score_percent = round((correct_count / total_questions) * 100) if total_questions else 0

            evaluation = {
                'score': f'{correct_count}/{total_questions}',
                'correct_count': correct_count,
                'total_questions': total_questions,
                'score_percent': score_percent,
                'weak_areas': weak_areas,
            }

            print("\n**************************************************")
            print("*** EvaluateTopicQuizView: Server-side evaluation ***")
            print(f"*** Enrollment ID: {enrollment_id}, Module ID: {module_id}, Lesson ID: {lesson_id} ***")
            print(f"*** Score: {correct_count}/{total_questions} ({score_percent}%) ***")
            print("**************************************************\n")
            
            # Get the lesson object if lesson_id was provided
            lesson = None
            if lesson_id:
                try:
                    lesson = Lesson.objects.get(id=lesson_id)
                except Lesson.DoesNotExist:
                    pass  # Continue without lesson if not found
            
            # ── Create QuizAttempt + QuizAnswer records ──────────────
            quiz_attempt = QuizAttempt.objects.create(
                enrollment=enrollment,
                module=module,
                lesson=lesson,  # Store the lesson to track which topic
                attempt_type='topic_quiz',
                score_percent=score_percent,
                total_questions=total_questions,
                correct_answers=correct_count,
                weak_areas=weak_areas,
            )
            quiz_attempt.completed_at = timezone.now()
            quiz_attempt.save()

            for q_obj, sel_idx, is_c in answer_records:
                QuizAnswer.objects.create(
                    attempt=quiz_attempt,
                    question=q_obj,
                    selected_option_index=sel_idx,
                    is_correct=is_c,
                )
            
            # Update module progress
            module_progress, created = ModuleProgress.objects.get_or_create(
                enrollment=enrollment,
                module=module,
                defaults={'status': 'completed'}
            )
            
            if not created:
                module_progress.status = 'completed'
                module_progress.save()
            
            # Get remaining modules (topics)
            remaining_modules = Module.objects.filter(
                course=enrollment.course,
                order__gt=module.order
            ).order_by('order')
            
            refined_roadmap = None
            assessment_service = get_assessment_service()
            if remaining_modules.exists() and evaluation['weak_areas']:
                # Convert modules to topic format
                remaining_topics = [
                    {
                        'topic_name': m.title,
                        'level': m.difficulty_level
                    }
                    for m in remaining_modules
                ]
                
                # Refine roadmap
                refined_roadmap = assessment_service.refine_roadmap(
                    enrollment.course.title,
                    remaining_topics,
                    evaluation['weak_areas']
                )
                
                # Update roadmap
                roadmap = enrollment.roadmaps.filter(is_active=True).first()
                if roadmap:
                    # Deactivate old roadmap
                    roadmap.is_active = False
                    roadmap.save()
                    
                    # Create new version
                    LearningRoadmap.objects.create(
                        enrollment=enrollment,
                        roadmap_data=refined_roadmap,
                        is_active=True,
                        version=roadmap.version + 1
                    )
            
            # Update overall progress
            total_modules = enrollment.course.modules.count()
            completed_modules = enrollment.module_progresses.filter(
                status='completed'
            ).count()
            
            if total_modules > 0:
                progress = (completed_modules / total_modules) * 100
                enrollment.overall_progress = progress
                enrollment.save()
            
            # Log activity
            ActivityLog.objects.create(
                user=request.user,
                activity_type='quiz_completed',
                title=f'Completed quiz for {module.title}',
                description=f'Completed quiz for {module.title}',
                metadata={'course_id': str(enrollment.course.id), 'module_id': str(module.id)}
            )
            
            response_data = {
                'evaluation': evaluation,
                'progress_updated': True
            }
            
            if refined_roadmap:
                response_data['refined_roadmap'] = refined_roadmap
            
            return Response(response_data, status=status.HTTP_200_OK)
            
        except Enrollment.DoesNotExist:
            return Response(
                {'error': 'Enrollment not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error evaluating topic quiz: {e}", exc_info=True)
            return Response(
                {'error': f'Failed to evaluate quiz: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class GenerateRemediationContentView(APIView):
    """Generate focused remediation content for weak sub-topics after quiz"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        """
        Generate remediation content for sub-topics the user struggled with.
        
        Expected payload:
        {
            "enrollment_id": 1,
            "lesson_id": 10,
            "topic_name": "Introduction to HTML",
            "weak_areas": ["Question about CSS selectors...", "Question about box model..."]
        }
        
        Returns:
        {
            "remediation_notes": [
                {
                    "sub_topic": "CSS Selectors Explained",
                    "content": "Detailed markdown content..."
                }
            ]
        }
        """
        from .services.assessment_service import get_assessment_service
        
        enrollment_id = request.data.get('enrollment_id')
        lesson_id = request.data.get('lesson_id')
        topic_name = request.data.get('topic_name')
        weak_areas = request.data.get('weak_areas', [])
        
        if not all([enrollment_id, lesson_id, topic_name]) or not weak_areas:
            return Response(
                {'error': 'enrollment_id, lesson_id, topic_name, and non-empty weak_areas are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            enrollment = Enrollment.objects.get(pk=enrollment_id, user=request.user)
            lesson = Lesson.objects.get(pk=lesson_id)
            
            original_content = lesson.content or ''
            
            print("\n**************************************************")
            print("*** GenerateRemediationContentView ***")
            print(f"*** Topic: {topic_name} ***")
            print(f"*** Weak areas: {len(weak_areas)} ***")
            print("**************************************************")
            
            assessment_service = get_assessment_service()
            result = assessment_service.generate_remediation_content(
                enrollment.course.title,
                topic_name,
                weak_areas,
                original_content,
                system_prompt=enrollment.ai_system_prompt or None
            )
            
            print(f"*** Remediation notes generated: {len(result.get('remediation_notes', []))} ***")
            print("**************************************************\n")
            
            return Response(result, status=status.HTTP_200_OK)
            
        except Enrollment.DoesNotExist:
            return Response(
                {'error': 'Enrollment not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Lesson.DoesNotExist:
            return Response(
                {'error': 'Lesson not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error generating remediation content: {e}", exc_info=True)
            return Response(
                {'error': f'Failed to generate remediation content: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================================
# PODCAST GENERATION VIEWS
# ============================================================================

class GeneratePersonaOptionsView(APIView):
    """Generate persona options for podcast"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        """
        Generate 3 persona pair options based on content
        
        Expected payload:
        {
            "text": "Content to analyze..."
        }
        """
        try:
            text = request.data.get('text', '')
            
            if not text:
                return Response(
                    {'error': 'Text content is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            service = get_podcast_service()
            options = service.generate_persona_options(text)
            
            return Response({
                'options': options
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error generating persona options: {e}", exc_info=True)
            return Response(
                {'error': f'Failed to generate persona options: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class GenerateScenarioOptionsView(APIView):
    """Generate scenario options for podcast"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        """
        Generate 3 scenario options based on content and personas
        
        Expected payload:
        {
            "text": "Content to analyze...",
            "personas": {
                "person1": "Expert",
                "person2": "Novice"
            }
        }
        """
        try:
            text = request.data.get('text', '')
            personas = request.data.get('personas', None)
            
            if not text:
                return Response(
                    {'error': 'Text content is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            service = get_podcast_service()
            options = service.generate_scenario_options(text, personas)
            
            return Response({
                'options': options
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error generating scenario options: {e}", exc_info=True)
            return Response(
                {'error': f'Failed to generate scenario options: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class GeneratePodcastView(APIView):
    """Generate complete podcast from content"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        """
        Generate a complete podcast
        
        Expected payload:
        {
            "text": "Content to create podcast from...",
            "instruction": "Deep dive analysis",  // optional
            "person1": "Professor",               // optional
            "person2": "Student",                 // optional
            "lesson_id": 123,                      // optional
            "topic_name": "Introduction to ML"    // optional
        }
        """
        try:
            text = request.data.get('text', '')
            instruction = request.data.get('instruction', None)
            person1 = request.data.get('person1', None)
            person2 = request.data.get('person2', None)
            lesson_id = request.data.get('lesson_id', None)
            topic_name = request.data.get('topic_name', None)
            enrollment_id = request.data.get('enrollment_id', None)
            
            # Retrieve personalized system prompt from enrollment if enrollment_id is provided
            podcast_system_prompt = None
            if enrollment_id:
                try:
                    enrollment_obj = Enrollment.objects.get(pk=enrollment_id, user=request.user)
                    podcast_system_prompt = enrollment_obj.ai_system_prompt or None
                    logger.info(f"Podcast: using system prompt from enrollment {enrollment_id} ({len(podcast_system_prompt or '')} chars)")
                except Enrollment.DoesNotExist:
                    logger.warning(f"Podcast: enrollment {enrollment_id} not found, proceeding without system prompt")
            
            if not text:
                return Response(
                    {'error': 'Text content is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            service = get_podcast_service()
            audio_file_path = service.generate_podcast(
                text=text,
                instruction=instruction,
                person1=person1,
                person2=person2,
                system_prompt=podcast_system_prompt
            )
            
            if not audio_file_path:
                return Response(
                    {'error': 'Failed to generate podcast'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Convert absolute path to relative media URL
            import os
            from django.conf import settings
            
            relative_path = os.path.relpath(
                audio_file_path,
                settings.MEDIA_ROOT
            )
            audio_url = f"/media/{relative_path.replace(os.sep, '/')}"
            
            # Create Resource record if linked to a lesson
            if lesson_id:
                try:
                    from django.core.files import File as DjangoFile
                    lesson = Lesson.objects.get(pk=lesson_id)
                    
                    # Count existing podcast resources to create unique title
                    existing_count = Resource.objects.filter(
                        lesson=lesson,
                        resource_type='audio',
                    ).count()
                    
                    # Always create a new resource (allow multiple podcasts per topic)
                    title = f"{topic_name or 'Topic'} - Podcast #{existing_count + 1}"
                    file_size = os.path.getsize(audio_file_path) if os.path.exists(audio_file_path) else 0
                    
                    # Get audio duration
                    duration = None
                    try:
                        import subprocess
                        cmd = [
                            "ffprobe", "-v", "quiet",
                            "-show_entries", "format=duration",
                            "-of", "csv=p=0",
                            audio_file_path,
                        ]
                        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=True)
                        duration = int(float(result.stdout.strip()))
                    except Exception:
                        pass
                    
                    with open(audio_file_path, 'rb') as f:
                        resource = Resource.objects.create(
                            lesson=lesson,
                            resource_type='audio',
                            title=title,
                            content_text=f"Podcast: {person1 or 'Speaker 1'} & {person2 or 'Speaker 2'}",
                            content_json={
                                'person1': person1,
                                'person2': person2,
                                'instruction': instruction
                            },
                            file_size_bytes=file_size,
                            duration_seconds=duration,
                            is_generated=True,
                            generation_model='ollama + edge-tts'
                        )
                        resource.file.save(
                            os.path.basename(audio_file_path),
                            DjangoFile(f),
                            save=True
                        )
                    logger.info(f"✅ Created podcast resource #{existing_count + 1} for: {topic_name}")
                except Lesson.DoesNotExist:
                    logger.warning(f"Lesson {lesson_id} not found, skipping Resource creation")
                except Exception as resource_error:
                    logger.error(f"❌ Failed to create Resource record: {resource_error}", exc_info=True)
            
            # Log activity
            ActivityLog.objects.create(
                user=request.user,
                activity_type='podcast_generated',
                title='Generated Podcast',
                description='Generated audio podcast from content',
                metadata={'audio_url': audio_url}
            )
            
            return Response({
                'audio_url': audio_url,
                'message': 'Podcast generated successfully'
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error generating podcast: {e}", exc_info=True)
            return Response(
                {'error': f'Failed to generate podcast: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================================
# RAG CHATBOT VIEW
# ============================================================================

class ChatWithContextView(APIView):
    """RAG-based chatbot that answers questions using generated topic content as context"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        """
        Chat with AI using generated topic content as context.
        
        Expected payload:
        {
            "message": "What is the main concept here?",
            "context": "The generated lesson content...",
            "topic_name": "Introduction to HTML",
            "course_name": "Web Development",
            "enrollment_id": 123
        }
        
        Returns:
        {
            "response": "AI assistant's response..."
        }
        """
        from .services.assessment_service import get_assessment_service
        from .models import ChatHistory, Enrollment
        
        message = request.data.get('message', '').strip()
        context = request.data.get('context', '').strip()
        topic_name = request.data.get('topic_name', '')
        course_name = request.data.get('course_name', '')
        enrollment_id = request.data.get('enrollment_id')
        
        if not message:
            return Response(
                {'error': 'message is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not context:
            return Response(
                {'error': 'context (generated content) is required. Generate notes first.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not enrollment_id:
            return Response(
                {'error': 'enrollment_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Verify enrollment belongs to user
            enrollment = Enrollment.objects.get(id=enrollment_id, user=request.user)
            
            # Load chat history from database for this enrollment
            chat_history_queryset = ChatHistory.objects.filter(enrollment=enrollment).order_by('created_at')
            chat_history = [
                {"role": msg.role, "content": msg.content}
                for msg in chat_history_queryset
            ]
            
            # Get AI response
            assessment_service = get_assessment_service()
            response_text = assessment_service.chat_with_context(
                message=message,
                context=context,
                topic_name=topic_name,
                course_name=course_name,
                chat_history=chat_history
            )
            
            # Save user message to database
            ChatHistory.objects.create(
                enrollment=enrollment,
                role='user',
                content=message,
                topic_name=topic_name
            )
            
            # Save assistant response to database
            ChatHistory.objects.create(
                enrollment=enrollment,
                role='assistant',
                content=response_text,
                topic_name=topic_name
            )
            
            return Response({
                'response': response_text
            }, status=status.HTTP_200_OK)
            
        except Enrollment.DoesNotExist:
            return Response(
                {'error': 'Enrollment not found or access denied'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error in chat: {e}", exc_info=True)
            return Response(
                {'error': f'Failed to get chat response: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class GetChatHistoryView(APIView):
    """Get chat history for a specific enrollment"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        """
        Get all chat messages for an enrollment.
        Query params: ?enrollment_id=123
        
        Returns:
        {
            "messages": [
                {"id": 1, "role": "user", "content": "...", "topic_name": "...", "created_at": "..."},
                {"id": 2, "role": "assistant", "content": "...", "topic_name": "...", "created_at": "..."}
            ]
        }
        """
        from .models import ChatHistory, Enrollment
        from .serializers import ChatHistorySerializer
        
        enrollment_id = request.query_params.get('enrollment_id')
        
        if not enrollment_id:
            return Response(
                {'error': 'enrollment_id query parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Verify enrollment belongs to user
            enrollment = Enrollment.objects.get(id=enrollment_id, user=request.user)
            
            # Get all messages for this enrollment
            messages = ChatHistory.objects.filter(enrollment=enrollment).order_by('created_at')
            serializer = ChatHistorySerializer(messages, many=True)
            
            return Response({
                'messages': serializer.data
            }, status=status.HTTP_200_OK)
            
        except Enrollment.DoesNotExist:
            return Response(
                {'error': 'Enrollment not found or access denied'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error fetching chat history: {e}", exc_info=True)
            return Response(
                {'error': f'Failed to fetch chat history: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ClearChatHistoryView(APIView):
    """Clear all chat history for a specific enrollment"""
    permission_classes = [permissions.IsAuthenticated]
    
    def delete(self, request):
        """
        Delete all chat messages for an enrollment.
        Query params: ?enrollment_id=123
        
        Returns:
        {
            "message": "Chat history cleared successfully",
            "deleted_count": 10
        }
        """
        from .models import ChatHistory, Enrollment
        
        enrollment_id = request.query_params.get('enrollment_id')
        
        if not enrollment_id:
            return Response(
                {'error': 'enrollment_id query parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Verify enrollment belongs to user
            enrollment = Enrollment.objects.get(id=enrollment_id, user=request.user)
            
            # Delete all messages for this enrollment
            deleted_count, _ = ChatHistory.objects.filter(enrollment=enrollment).delete()
            
            return Response({
                'message': 'Chat history cleared successfully',
                'deleted_count': deleted_count
            }, status=status.HTTP_200_OK)
            
        except Enrollment.DoesNotExist:
            return Response(
                {'error': 'Enrollment not found or access denied'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error clearing chat history: {e}", exc_info=True)
            return Response(
                {'error': f'Failed to clear chat history: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
