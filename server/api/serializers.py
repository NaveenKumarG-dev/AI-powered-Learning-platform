from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

from .models import (
    VideoTask, LearningProfile, Course, Module, Lesson, LessonProgress, Resource,
    Enrollment, Question, QuizAttempt, QuizAnswer, ModuleProgress,
    LearningRoadmap, Achievement, UserAchievement, ActivityLog,
    PersonalizedSyllabus, CoursePlanningTask, ChatHistory,
    CodingProblem, CodingTestCase, CodeSubmission, CodeExecutionTask,
)

User = get_user_model()


# ============================================================================
# AUTHENTICATION SERIALIZERS
# ============================================================================

class UserRegisterSerializer(serializers.ModelSerializer):
    """Serializer for user registration"""
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ('email', 'password', 'password2', 'first_name', 'last_name')
        extra_kwargs = {
            'first_name': {'required': True},
            'last_name': {'required': True}
        }

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        first_name = (validated_data.get('first_name') or '').strip()
        last_name = (validated_data.get('last_name') or '').strip()
        full_name = ' '.join(part for part in [first_name, last_name] if part)
        user = User.objects.create_user(
            email=validated_data['email'],
            full_name=full_name,
            password=validated_data['password'],
            first_name=validated_data['first_name'],
            last_name=validated_data['last_name']
        )
        # Create default learning profile
        LearningProfile.objects.create(user=user)
        return user


class LearningProfileSerializer(serializers.ModelSerializer):
    """Serializer for learning profile"""
    class Meta:
        model = LearningProfile
        fields = '__all__'
        read_only_fields = ('user',)


class UserSerializer(serializers.ModelSerializer):
    """Serializer for user profile"""
    learning_profile = LearningProfileSerializer(read_only=True)
    
    class Meta:
        model = User
        fields = (
            'id',
            'email',
            'first_name',
            'last_name',
            'full_name',
            'avatar',
            'bio',
            'date_joined',
            'is_staff',
            'learning_profile',
        )
        read_only_fields = ('id', 'email', 'date_joined', 'is_staff')



class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Custom JWT serializer to include user data"""
    def validate(self, attrs):
        data = super().validate(attrs)
        # Add custom claims
        data['user'] = UserSerializer(self.user).data
        return data


# ============================================================================
# COURSE & CONTENT SERIALIZERS
# ============================================================================

class ResourceSerializer(serializers.ModelSerializer):
    """Serializer for learning resources"""
    file_url = serializers.SerializerMethodField()
    
    class Meta:
        model = Resource
        fields = '__all__'
    
    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None


class LessonSerializer(serializers.ModelSerializer):
    """Serializer for lessons"""
    resources = ResourceSerializer(many=True, read_only=True)
    
    class Meta:
        model = Lesson
        fields = '__all__'


class ModuleSerializer(serializers.ModelSerializer):
    """Serializer for modules"""
    lessons = LessonSerializer(many=True, read_only=True)
    lessons_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Module
        fields = '__all__'
    
    def get_lessons_count(self, obj):
        return obj.lessons.count()


class CourseSerializer(serializers.ModelSerializer):
    """Serializer for courses"""
    modules = ModuleSerializer(many=True, read_only=True)
    modules_count = serializers.SerializerMethodField()
    enrolled_count = serializers.SerializerMethodField()
    created_by_email = serializers.CharField(source='created_by.email', read_only=True)
    
    class Meta:
        model = Course
        fields = '__all__'
    
    def get_modules_count(self, obj):
        return obj.modules.count()
    
    def get_enrolled_count(self, obj):
        return obj.enrollments.count()


class EnrollmentSerializer(serializers.ModelSerializer):
    """Serializer for course enrollments"""
    course = CourseSerializer(read_only=True)
    course_id = serializers.PrimaryKeyRelatedField(
        queryset=Course.objects.all(),
        source='course',
        write_only=True
    )
    
    class Meta:
        model = Enrollment
        fields = '__all__'
        read_only_fields = (
            'user', 
            'enrolled_at', 
            'completed_at', 
            'overall_progress',
            'assessment_questions_count'  # Set by system during enrollment
        )


# ============================================================================
# QUIZ & ASSESSMENT SERIALIZERS
# ============================================================================

class QuestionSerializer(serializers.ModelSerializer):
    """Serializer for quiz questions"""
    class Meta:
        model = Question
        fields = '__all__'


class QuizAnswerSerializer(serializers.ModelSerializer):
    """Serializer for quiz answers"""
    class Meta:
        model = QuizAnswer
        fields = '__all__'
        read_only_fields = ('is_correct',)


class QuizAttemptSerializer(serializers.ModelSerializer):
    """Serializer for quiz attempts"""
    answers = QuizAnswerSerializer(many=True, read_only=True)
    questions = QuestionSerializer(many=True, read_only=True)
    
    class Meta:
        model = QuizAttempt
        fields = '__all__'
        read_only_fields = ('user', 'started_at', 'submitted_at', 'score', 'total_questions')


class QuizSubmissionSerializer(serializers.Serializer):
    """Serializer for submitting quiz answers"""
    attempt_id = serializers.UUIDField()
    answers = serializers.ListField(
        child=serializers.DictField(child=serializers.CharField())
    )


# ============================================================================
# PROGRESS & ROADMAP SERIALIZERS
# ============================================================================

class ModuleProgressSerializer(serializers.ModelSerializer):
    """Serializer for module progress"""
    module = ModuleSerializer(read_only=True)
    
    class Meta:
        model = ModuleProgress
        fields = '__all__'
        read_only_fields = ('enrollment', 'module', 'started_at', 'completed_at', 'progress_percentage')


class LessonProgressSerializer(serializers.ModelSerializer):
    """Serializer for lesson/topic progress and completion"""
    lesson_title = serializers.CharField(source='lesson.title', read_only=True)
    module_id = serializers.IntegerField(source='lesson.module.id', read_only=True)
    
    class Meta:
        model = LessonProgress
        fields = ['id', 'enrollment', 'lesson', 'lesson_title', 'module_id', 
                  'is_completed', 'completed_at', 'time_spent_minutes', 
                  'created_at', 'updated_at']
        read_only_fields = ('enrollment', 'completed_at', 'created_at', 'updated_at')


class LearningRoadmapSerializer(serializers.ModelSerializer):
    """Serializer for AI-generated learning roadmaps"""
    enrollment = EnrollmentSerializer(read_only=True)
    recommended_modules = ModuleSerializer(many=True, read_only=True)
    
    class Meta:
        model = LearningRoadmap
        fields = '__all__'
        read_only_fields = ('enrollment', 'generated_at')


class PersonalizedSyllabusSerializer(serializers.ModelSerializer):
    """Serializer for personalized syllabi"""
    total_modules = serializers.ReadOnlyField()
    total_topics = serializers.ReadOnlyField()

    class Meta:
        model = PersonalizedSyllabus
        fields = ('id', 'enrollment', 'syllabus_data', 'generated_by_model',
                  'total_modules', 'total_topics', 'created_at', 'updated_at')
        read_only_fields = ('enrollment', 'created_at', 'updated_at')


class AchievementSerializer(serializers.ModelSerializer):
    """Serializer for achievements"""
    class Meta:
        model = Achievement
        fields = '__all__'


class UserAchievementSerializer(serializers.ModelSerializer):
    """Serializer for user achievements"""
    achievement = AchievementSerializer(read_only=True)
    
    class Meta:
        model = UserAchievement
        fields = '__all__'
        read_only_fields = ('user', 'earned_at')


class ActivityLogSerializer(serializers.ModelSerializer):
    """Serializer for activity logs"""
    class Meta:
        model = ActivityLog
        fields = '__all__'
        read_only_fields = ('user', 'created_at')


# ============================================================================
# VIDEO GENERATION SERIALIZERS (existing)
# ============================================================================



class VideoTaskCreateSerializer(serializers.Serializer):
    topic = serializers.CharField(max_length=255)
    lesson_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_lesson_id(self, value):
        if value is not None:
            from .models import Lesson
            if not Lesson.objects.filter(pk=value).exists():
                raise serializers.ValidationError("Lesson not found.")
        return value


class VideoTaskStatusSerializer(serializers.ModelSerializer):
    video_url = serializers.SerializerMethodField()
    task_id = serializers.CharField(source='id', read_only=True)

    class Meta:
        model = VideoTask
        fields = [
            "id",
            "task_id",
            "topic",
            "status",
            "progress_message",
            "script_data",
            "video_url",
            "duration_seconds",
            "error_message",
            "created_at",
            "completed_at",
        ]

    def get_video_url(self, obj):
        if obj.video_file:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.video_file.url)
            return obj.video_file.url
        return None


class CoursePlanningTaskSerializer(serializers.ModelSerializer):
    """Serializer for course planning tasks"""
    
    class Meta:
        model = CoursePlanningTask
        fields = [
            "id",
            "course_title",
            "course_description",
            "category",
            "difficulty_level",
            "estimated_duration",
            "thumbnail",
            "status",
            "progress_message",
            "result_data",
            "created_courses",
            "error_message",
            "created_at",
            "completed_at",
        ]
        read_only_fields = ["id", "status", "progress_message", "result_data", 
                           "created_courses", "error_message", "created_at", "completed_at"]


class ChatHistorySerializer(serializers.ModelSerializer):
    """Serializer for chat history messages"""
    
    class Meta:
        model = ChatHistory
        fields = ['id', 'enrollment', 'role', 'content', 'topic_name', 'created_at']
        read_only_fields = ['id', 'created_at']


# ============================================================================
# CODING LAB SERIALIZERS
# ============================================================================

class CodingTestCaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = CodingTestCase
        fields = ['id', 'input_data', 'expected_output', 'explanation', 'is_hidden', 'weight', 'order']


class CodingProblemSerializer(serializers.ModelSerializer):
    test_cases = serializers.SerializerMethodField()

    class Meta:
        model = CodingProblem
        fields = [
            'id',
            'course',
            'module',
            'lesson',
            'title',
            'problem_statement',
            'starter_code',
            'language',
            'difficulty',
            'constraints',
            'hints',
            'is_generated',
            'generation_model',
            'created_at',
            'updated_at',
            'test_cases',
        ]

    def get_test_cases(self, obj):
        # Hide hidden tests in learner-facing responses.
        visible = obj.test_cases.filter(is_hidden=False).order_by('order', 'id')
        return CodingTestCaseSerializer(visible, many=True).data


class GenerateCodingProblemRequestSerializer(serializers.Serializer):
    enrollment_id = serializers.IntegerField()
    module_id = serializers.IntegerField()
    topic_name = serializers.CharField(max_length=255)
    regenerate = serializers.BooleanField(required=False, default=False)


class DynamicScriptBlockSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=['text', 'code', 'video', 'mind_map', 'quiz'])
    prompt = serializers.CharField()
    payload = serializers.JSONField(required=False, default=dict)


class GenerateDynamicScriptRequestSerializer(serializers.Serializer):
    enrollment_id = serializers.IntegerField()
    module_id = serializers.IntegerField()
    topic_name = serializers.CharField(max_length=255)
    regenerate = serializers.BooleanField(required=False, default=False)


class DynamicScriptResponseSerializer(serializers.Serializer):
    lesson_id = serializers.IntegerField()
    schema_version = serializers.CharField(default='1.0')
    title = serializers.CharField()
    overview = serializers.CharField(allow_blank=True, required=False)
    blocks = DynamicScriptBlockSerializer(many=True)


class GenerateSampleCodeRequestSerializer(serializers.Serializer):
    enrollment_id = serializers.IntegerField()
    module_id = serializers.IntegerField()
    topic_name = serializers.CharField(max_length=255)
    regenerate = serializers.BooleanField(required=False, default=False)


class RunSampleCodeRequestSerializer(serializers.Serializer):
    source_code = serializers.CharField()
    raw_input = serializers.CharField(required=False, allow_blank=True, default='')


class StartInteractiveSampleSerializer(serializers.Serializer):
    source_code = serializers.CharField()


class SendInteractiveSampleInputSerializer(serializers.Serializer):
    session_id = serializers.CharField()
    user_input = serializers.CharField(required=False, allow_blank=True, default='')


class StopInteractiveSampleSerializer(serializers.Serializer):
    session_id = serializers.CharField()


class CreateCodeSubmissionSerializer(serializers.Serializer):
    enrollment_id = serializers.IntegerField()
    problem_id = serializers.IntegerField()
    source_code = serializers.CharField()
    language = serializers.ChoiceField(choices=CodingProblem.Language.choices, default=CodingProblem.Language.PYTHON)


class CodeSubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CodeSubmission
        fields = '__all__'
        read_only_fields = [
            'id',
            'user',
            'status',
            'score_percent',
            'passed_tests',
            'total_tests',
            'feedback',
            'error_message',
            'submitted_at',
            'completed_at',
        ]


class CodeExecutionTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = CodeExecutionTask
        fields = [
            'id',
            'submission',
            'status',
            'progress_message',
            'result_data',
            'error_message',
            'created_at',
            'completed_at',
        ]
