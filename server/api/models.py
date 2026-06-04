import uuid

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


# ---------------------------------------------------------------------------
# Custom User Manager
# ---------------------------------------------------------------------------

class UserManager(BaseUserManager):
    """Manager for email-based User model (no username field)."""

    def create_user(self, email, full_name, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, full_name=full_name, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, full_name, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, full_name, password, **extra_fields)


# ===========================================================================
# 1. User
# ===========================================================================
class User(AbstractUser):
    """Custom user model – email-based login, no username."""

    username = None
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255)
    bio = models.TextField(blank=True, default='')
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)

    # Notification preferences
    notify_email = models.BooleanField(default=True)
    notify_push = models.BooleanField(default=True)
    notify_course_updates = models.BooleanField(default=False)

    # Display preferences
    language = models.CharField(max_length=20, default='en')
    theme = models.CharField(max_length=20, default='light')

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    objects = UserManager()

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'users'

    def __str__(self):
        return self.email


# ===========================================================================
# 2. LearningProfile
# ===========================================================================

class LearningProfile(models.Model):
    class LearningStyle(models.TextChoices):
        MINDMAP = 'mindmap', 'Mind Map'
        VIDEOS = 'videos', 'Videos'
        SUMMARY = 'summary', 'Summary Notes'
        BOOKS = 'books', 'Books'
        REELS = 'reels', 'Short Reels'

    class DepthPreference(models.TextChoices):
        SURFACE = 'surface', 'Surface'
        DEEP = 'deep', 'Deep'

    class PacePreference(models.TextChoices):
        SLOW = 'slow', 'Slow'
        MODERATE = 'moderate', 'Moderate'
        FAST = 'fast', 'Fast'

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name='learning_profile',
    )
    preferred_style = models.CharField(
        max_length=20, choices=LearningStyle.choices, default=LearningStyle.SUMMARY,
    )
    depth_preference = models.CharField(
        max_length=10, choices=DepthPreference.choices, default=DepthPreference.DEEP,
    )
    pace_preference = models.CharField(
        max_length=10, choices=PacePreference.choices, default=PacePreference.MODERATE,
    )
    quiz_preference = models.BooleanField(
        default=True, help_text='Whether user prefers frequent quizzes',
    )
    attention_span_minutes = models.PositiveIntegerField(
        default=25, help_text='Estimated attention span in minutes',
    )
    
    # Podcast preferences
    podcast_enabled = models.BooleanField(
        default=True, help_text='Enable audio podcast generation for topics',
    )
    podcast_auto_generate = models.BooleanField(
        default=False, help_text='Automatically generate podcasts for new topics',
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'learning_profiles'

    def __str__(self):
        return f'{self.user.email} – {self.preferred_style}'


# ===========================================================================
# 3. Course
# ===========================================================================

class Course(models.Model):
    """
    Represents both broad topics and individual sub-topics.
    
    Broad topics (is_sub_topic=False) like "AI & Machine Learning" cannot be learned directly.
    Sub-topics (is_sub_topic=True) like "Linear Regression" are the actual learnable units.
    
    When a user tries to enroll in a broad topic, the platform will suggest
    individual sub-topics they can learn instead.
    """
    CATEGORY_CHOICES = [
        ('web_dev', 'Web Development'),
        ('data_science', 'Data Science'),
        ('ai_ml', 'AI & Machine Learning'),
        ('mobile_dev', 'Mobile Development'),
        ('cloud', 'Cloud Computing'),
        ('design', 'Design'),
        ('devops', 'DevOps'),
        ('cybersecurity', 'Cybersecurity'),
        ('blockchain', 'Blockchain'),
        ('other', 'Other'),
    ]
    
    DIFFICULTY_CHOICES = [
        ('beginner', 'Beginner'),
        ('intermediate', 'Intermediate'),
        ('advanced', 'Advanced'),
    ]
    
    name = models.CharField(max_length=255, db_index=True)  # Keep for backward compatibility
    title = models.CharField(max_length=255, db_index=True, default='')
    description = models.TextField(blank=True, default='')
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default='other', db_index=True)
    difficulty_level = models.CharField(max_length=20, choices=DIFFICULTY_CHOICES, default='beginner')
    estimated_duration = models.PositiveIntegerField(
        default=60, help_text='Estimated duration in minutes'
    )
    thumbnail = models.URLField(blank=True, default='', help_text='URL to course thumbnail image')
    is_popular = models.BooleanField(default=False, db_index=True)
    
    # New fields for sub-topic structure
    is_sub_topic = models.BooleanField(
        default=True, 
        help_text='True if this is a learnable sub-topic, False if broad topic category'
    )
    parent_topic_name = models.CharField(
        max_length=255, 
        blank=True, 
        default='',
        help_text='Name of the broad topic this sub-topic belongs to (e.g., "AI & Machine Learning")'
    )
    prerequisites = models.JSONField(
        default=list,
        blank=True,
        help_text='List of prerequisite sub-topic names or IDs'
    )
    learning_objectives = models.JSONField(
        default=list,
        blank=True,
        help_text='List of specific learning objectives for this sub-topic'
    )
    
    created_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='created_courses',
        help_text='User who created this course'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'courses'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['category', 'is_popular']),
            models.Index(fields=['-created_at']),
        ]

    def __str__(self):
        return self.title or self.name


# ===========================================================================
# 4. Achievement
# ===========================================================================

class Achievement(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField()
    icon = models.CharField(
        max_length=50, help_text='Emoji or icon identifier e.g. lightning, target, fire',
    )
    criteria = models.JSONField(
        help_text='JSON criteria for auto-awarding, e.g. {"type":"modules_per_day","threshold":3}',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'achievements'

    def __str__(self):
        return self.name


# ===========================================================================
# 5. Enrollment
# ===========================================================================

class Enrollment(models.Model):
    class KnowledgeLevel(models.TextChoices):
        BEGINNER = 'beginner', 'Beginner'
        INTERMEDIATE = 'intermediate', 'Intermediate'
        ADVANCED = 'advanced', 'Advanced'

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        COMPLETED = 'completed', 'Completed'
        PAUSED = 'paused', 'Paused'
    
    class StudyMethod(models.TextChoices):
        REAL_WORLD = 'real_world', 'Real-world Examples'
        THEORY_DEPTH = 'theory_depth', 'Theory Depth'
        PROJECT_BASED = 'project_based', 'Project-Based'
        CUSTOM = 'custom', 'Custom'

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='enrollments')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='enrollments')
    learning_style_override = models.CharField(
        max_length=20,
        choices=LearningProfile.LearningStyle.choices,
        blank=True,
        default='',
        help_text='Per-course learning style override',
    )
    diagnosed_level = models.CharField(
        max_length=15,
        choices=KnowledgeLevel.choices,
        default=KnowledgeLevel.BEGINNER,
        help_text='Level determined by diagnostic assessment',
    )
    study_method_preference = models.CharField(
        max_length=20,
        choices=StudyMethod.choices,
        default=StudyMethod.REAL_WORLD,
        help_text='How the student prefers to learn (affects syllabus generation)',
    )
    custom_study_method = models.TextField(
        blank=True,
        default='',
        help_text='Custom study method description when study_method_preference is "custom"',
    )
    ai_system_prompt = models.TextField(
        blank=True,
        default='',
        help_text='AI-generated system prompt personalized to the user\'s learning style for this enrollment. '
                  'Used as the LLM system instruction for notes and audio generation (not quiz).',
    )
    assessment_questions_count = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text='Number of questions in the pre-knowledge assessment (determined by LLM based on complexity)',
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    overall_progress = models.DecimalField(
        max_digits=5, decimal_places=2, default=0.00,
        help_text='Percentage 0.00–100.00',
    )
    total_study_time_minutes = models.PositiveIntegerField(default=0)
    enrolled_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'enrollments'
        unique_together = ['user', 'course']
        indexes = [
            models.Index(fields=['user', 'status']),
        ]

    def __str__(self):
        return f'{self.user.email} → {self.course.name}'


# ===========================================================================
# 6. Module
# ===========================================================================

class Module(models.Model):
    class DifficultyLevel(models.TextChoices):
        BEGINNER = 'beginner', 'Beginner'
        INTERMEDIATE = 'intermediate', 'Intermediate'
        ADVANCED = 'advanced', 'Advanced'

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='modules')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    order = models.PositiveIntegerField(help_text='Position in the course sequence')
    difficulty_level = models.CharField(
        max_length=15, choices=DifficultyLevel.choices, default=DifficultyLevel.BEGINNER,
    )
    estimated_duration_minutes = models.PositiveIntegerField(default=60)
    is_generated = models.BooleanField(default=False, help_text='True if AI-generated from roadmap')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'modules'
        ordering = ['order']
        unique_together = ['course', 'order']

    def __str__(self):
        return f'{self.course.name} – {self.title}'


# ===========================================================================
# 7. Lesson
# ===========================================================================

class Lesson(models.Model):
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name='lessons')
    title = models.CharField(max_length=255)
    content = models.TextField(
        blank=True, default='', help_text='AI-generated lesson content (Markdown/HTML)',
    )
    order = models.PositiveIntegerField()
    estimated_duration_minutes = models.PositiveIntegerField(default=15)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'lessons'
        ordering = ['order']
        unique_together = ['module', 'order']

    def __str__(self):
        return f'{self.module.title} – {self.title}'


# ===========================================================================
# 7b. LessonProgress (Topic Completion Tracking)
# ===========================================================================

class LessonProgress(models.Model):
    """Track user's progress/completion status for individual lessons/topics"""
    enrollment = models.ForeignKey(
        Enrollment, on_delete=models.CASCADE, related_name='lesson_progresses',
    )
    lesson = models.ForeignKey(
        Lesson, on_delete=models.CASCADE, related_name='user_progresses',
    )
    is_completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    time_spent_minutes = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'lesson_progress'
        unique_together = ['enrollment', 'lesson']
        indexes = [
            models.Index(fields=['enrollment', 'is_completed']),
        ]

    def __str__(self):
        return f'{self.enrollment.user.email} – {self.lesson.title} ({"✓" if self.is_completed else "○"})'


# ===========================================================================
# 8. Resource
# ===========================================================================

class Resource(models.Model):
    class ResourceType(models.TextChoices):
        NOTES = 'notes', 'Summary Notes'
        PDF = 'pdf', 'PDF Document'
        PPT = 'ppt', 'Presentation'
        MINDMAP = 'mindmap', 'Mind Map'
        VIDEO_SCRIPT = 'video_script', 'Video Script (JSON)'
        VIDEO = 'video', 'Video (MP4)'
        AUDIO = 'audio', 'Audio/Podcast (MP3)'
        IMAGE = 'image', 'Image (PNG)'
        REEL = 'reel', 'Short Reel'
        CODE_EXERCISE = 'code_exercise', 'Code Exercise'

    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='resources')
    resource_type = models.CharField(max_length=15, choices=ResourceType.choices)
    title = models.CharField(max_length=255)
    content_text = models.TextField(
        blank=True, default='',
        help_text='Text content (for notes, scripts, mindmap data)',
    )
    content_json = models.JSONField(
        null=True, blank=True,
        help_text='Structured content (video scripts with scenes, mindmap nodes)',
    )
    file = models.FileField(
        upload_to='resources/%Y/%m/', blank=True, null=True,
        help_text='For binary files: PDFs, PPTs, videos, audio, images',
    )
    file_size_bytes = models.PositiveIntegerField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(
        null=True, blank=True, help_text='For audio/video resources',
    )
    is_generated = models.BooleanField(default=False)
    generation_model = models.CharField(
        max_length=100, blank=True, default='',
        help_text='e.g. llama3:8b-instruct-q4_K_M, stable-diffusion-v1-5',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'resources'
        indexes = [
            models.Index(fields=['lesson', 'resource_type']),
        ]

    def __str__(self):
        return f'{self.title} ({self.resource_type})'


# ===========================================================================
# 9. Question
# ===========================================================================

class Question(models.Model):
    class Difficulty(models.TextChoices):
        EASY = 'easy', 'Easy'
        INTERMEDIATE = 'intermediate', 'Intermediate'
        DIFFICULT = 'difficult', 'Difficult'

    class QuestionType(models.TextChoices):
        DIAGNOSTIC = 'diagnostic', 'Diagnostic Assessment'
        TOPIC_QUIZ = 'topic_quiz', 'Topic Quiz'
        FINAL_QUIZ = 'final_quiz', 'Final Quiz'
        CODE_PROBLEM = 'code_problem', 'Code Problem'

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='questions')
    module = models.ForeignKey(
        Module, on_delete=models.CASCADE, related_name='questions',
        null=True, blank=True,
        help_text='Null for diagnostic questions, set for topic/final quizzes',
    )
    question_type = models.CharField(max_length=15, choices=QuestionType.choices)
    difficulty = models.CharField(max_length=15, choices=Difficulty.choices)
    question_text = models.TextField()
    options = models.JSONField(help_text='List of option strings, e.g. ["A","B","C","D"]')
    correct_answer_index = models.PositiveSmallIntegerField(
        help_text='0-based index into options list',
    )
    explanation = models.TextField(blank=True, default='', help_text='Explanation of correct answer')
    is_generated = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'questions'
        indexes = [
            models.Index(fields=['course', 'question_type']),
            models.Index(fields=['module', 'question_type']),
        ]

    def __str__(self):
        return f'[{self.question_type}] {self.question_text[:60]}'


# ===========================================================================
# 10. QuizAttempt
# ===========================================================================

class QuizAttempt(models.Model):
    class AttemptType(models.TextChoices):
        DIAGNOSTIC = 'diagnostic', 'Diagnostic Assessment'
        TOPIC_QUIZ = 'topic_quiz', 'Topic Quiz'
        FINAL_QUIZ = 'final_quiz', 'Final Quiz'

    enrollment = models.ForeignKey(
        Enrollment, on_delete=models.CASCADE, related_name='quiz_attempts',
    )
    module = models.ForeignKey(
        Module, on_delete=models.CASCADE, related_name='quiz_attempts',
        null=True, blank=True, help_text='Set for topic quizzes, null for diagnostic',
    )
    lesson = models.ForeignKey(
        Lesson, on_delete=models.CASCADE, related_name='quiz_attempts',
        null=True, blank=True, help_text='Set for topic quizzes to identify specific topic/lesson',
    )
    attempt_type = models.CharField(max_length=15, choices=AttemptType.choices)
    score_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    total_questions = models.PositiveSmallIntegerField(default=0)
    correct_answers = models.PositiveSmallIntegerField(default=0)
    time_taken_seconds = models.PositiveIntegerField(null=True, blank=True)
    weak_areas = models.JSONField(
        default=list, blank=True,
        help_text='List of weak area strings from AI evaluation',
    )
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'quiz_attempts'
        indexes = [
            models.Index(fields=['enrollment', 'attempt_type']),
        ]

    def __str__(self):
        return f'{self.enrollment} – {self.attempt_type} ({self.score_percent}%)'


# ===========================================================================
# 11. QuizAnswer
# ===========================================================================

class QuizAnswer(models.Model):
    attempt = models.ForeignKey(
        QuizAttempt, on_delete=models.CASCADE, related_name='answers',
    )
    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name='user_answers',
    )
    selected_option_index = models.SmallIntegerField(
        null=True, blank=True, help_text='Null if user skipped',
    )
    is_correct = models.BooleanField(default=False)
    response_time_seconds = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        db_table = 'quiz_answers'
        unique_together = ['attempt', 'question']

    def __str__(self):
        return f'Q{self.question_id} → {"✓" if self.is_correct else "✗"}'


# ===========================================================================
# 11b. CodingProblem
# ===========================================================================

class CodingProblem(models.Model):
    class Language(models.TextChoices):
        PYTHON = 'python', 'Python'

    class Difficulty(models.TextChoices):
        EASY = 'easy', 'Easy'
        INTERMEDIATE = 'intermediate', 'Intermediate'
        DIFFICULT = 'difficult', 'Difficult'

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='coding_problems')
    module = models.ForeignKey(
        Module,
        on_delete=models.CASCADE,
        related_name='coding_problems',
        null=True,
        blank=True,
    )
    lesson = models.ForeignKey(
        Lesson,
        on_delete=models.CASCADE,
        related_name='coding_problems',
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=255)
    problem_statement = models.TextField()
    starter_code = models.TextField(blank=True, default='')
    reference_solution = models.TextField(blank=True, default='')
    language = models.CharField(max_length=20, choices=Language.choices, default=Language.PYTHON)
    difficulty = models.CharField(max_length=15, choices=Difficulty.choices, default=Difficulty.INTERMEDIATE)
    constraints = models.JSONField(default=dict, blank=True)
    hints = models.JSONField(default=list, blank=True)
    is_generated = models.BooleanField(default=False)
    generation_model = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'coding_problems'
        indexes = [
            models.Index(fields=['course', 'language']),
            models.Index(fields=['lesson', '-created_at']),
        ]

    def __str__(self):
        return f'{self.title} ({self.language})'


# ===========================================================================
# 11c. CodingTestCase
# ===========================================================================

class CodingTestCase(models.Model):
    problem = models.ForeignKey(CodingProblem, on_delete=models.CASCADE, related_name='test_cases')
    input_data = models.TextField(blank=True, default='')
    expected_output = models.TextField(blank=True, default='')
    explanation = models.TextField(blank=True, default='')
    is_hidden = models.BooleanField(default=False)
    weight = models.DecimalField(max_digits=5, decimal_places=2, default=1.00)
    order = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'coding_test_cases'
        ordering = ['order', 'id']
        indexes = [
            models.Index(fields=['problem', 'is_hidden']),
        ]

    def __str__(self):
        visibility = 'hidden' if self.is_hidden else 'visible'
        return f'{self.problem_id} test#{self.order} ({visibility})'


# ===========================================================================
# 11d. CodeSubmission
# ===========================================================================

class CodeSubmission(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        RUNNING = 'running', 'Running'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='code_submissions')
    enrollment = models.ForeignKey(
        Enrollment,
        on_delete=models.CASCADE,
        related_name='code_submissions',
    )
    problem = models.ForeignKey(
        CodingProblem,
        on_delete=models.CASCADE,
        related_name='submissions',
    )
    language = models.CharField(max_length=20, choices=CodingProblem.Language.choices, default=CodingProblem.Language.PYTHON)
    source_code = models.TextField()
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    score_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    passed_tests = models.PositiveSmallIntegerField(default=0)
    total_tests = models.PositiveSmallIntegerField(default=0)
    feedback = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, default='')
    submitted_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'code_submissions'
        indexes = [
            models.Index(fields=['user', '-submitted_at']),
            models.Index(fields=['problem', '-submitted_at']),
            models.Index(fields=['enrollment', '-submitted_at']),
        ]

    def __str__(self):
        return f'{self.user.email} -> {self.problem_id} ({self.status})'


# ===========================================================================
# 11e. CodeExecutionTask
# ===========================================================================

class CodeExecutionTask(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PROCESSING = 'processing', 'Processing'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    submission = models.OneToOneField(
        CodeSubmission,
        on_delete=models.CASCADE,
        related_name='execution_task',
    )
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    progress_message = models.TextField(blank=True, default='')
    result_data = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'code_execution_tasks'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.submission_id} ({self.status})'


# ===========================================================================
# 12. ModuleProgress
# ===========================================================================

class ModuleProgress(models.Model):
    class Status(models.TextChoices):
        LOCKED = 'locked', 'Locked'
        IN_PROGRESS = 'in_progress', 'In Progress'
        COMPLETED = 'completed', 'Completed'

    enrollment = models.ForeignKey(
        Enrollment, on_delete=models.CASCADE, related_name='module_progresses',
    )
    module = models.ForeignKey(
        Module, on_delete=models.CASCADE, related_name='user_progresses',
    )
    status = models.CharField(
        max_length=15, choices=Status.choices, default=Status.LOCKED,
    )
    progress_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    time_spent_minutes = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'module_progress'
        unique_together = ['enrollment', 'module']

    def __str__(self):
        return f'{self.enrollment} – {self.module.title} ({self.status})'


# ===========================================================================
# 13. LearningRoadmap
# ===========================================================================

class LearningRoadmap(models.Model):
    enrollment = models.ForeignKey(
        Enrollment, on_delete=models.CASCADE, related_name='roadmaps',
    )
    version = models.PositiveIntegerField(
        default=1, help_text='Increments when roadmap is refined after quiz',
    )
    roadmap_data = models.JSONField(
        help_text='Full roadmap JSON: {"topics": [{"topic_name": "", "level": ""}]}',
    )
    generated_by_model = models.CharField(max_length=100, default='llama3:8b-instruct-q4_K_M')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'learning_roadmaps'
        indexes = [
            models.Index(fields=['enrollment', 'is_active']),
        ]
        ordering = ['-version']

    def __str__(self):
        return f'{self.enrollment} – v{self.version}'


# ===========================================================================
# 13b. PersonalizedSyllabus  (per-enrollment AI-generated course structure)
# ===========================================================================

class PersonalizedSyllabus(models.Model):
    """
    Stores a fully personalized course syllabus generated by Ollama
    after the initial assessment quiz. Each enrollment gets its own
    syllabus so two users in the same course can have different content.

    syllabus_data JSON schema:
    {
        "course_name": "...",
        "knowledge_level": "beginner|intermediate|advanced",
        "total_modules": N,
        "modules": [
            {
                "module_name": "Module Title",
                "description": "What this module covers...",
                "order": 1,
                "difficulty_level": "beginner|intermediate|advanced",
                "estimated_duration_minutes": 30,
                "topics": [
                    {
                        "topic_name": "Topic Title",
                        "description": "What the learner will study...",
                        "order": 1
                    },
                    ...
                ]
            },
            ...
        ]
    }
    """
    enrollment = models.OneToOneField(
        Enrollment, on_delete=models.CASCADE, related_name='syllabus',
    )
    syllabus_data = models.JSONField(
        help_text='Full personalized syllabus JSON with modules and topics',
    )
    generated_by_model = models.CharField(
        max_length=100, default='phi3:mini',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'personalized_syllabi'
        verbose_name_plural = 'Personalized syllabi'

    def __str__(self):
        return f'Syllabus for {self.enrollment}'

    @property
    def total_modules(self) -> int:
        return len(self.syllabus_data.get('modules', []))

    @property
    def total_topics(self) -> int:
        return sum(
            len(m.get('topics', []))
            for m in self.syllabus_data.get('modules', [])
        )


# ===========================================================================
# 14. UserAchievement
# ===========================================================================

class UserAchievement(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='achievements')
    achievement = models.ForeignKey(
        Achievement, on_delete=models.CASCADE, related_name='user_achievements',
    )
    earned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'user_achievements'
        unique_together = ['user', 'achievement']

    def __str__(self):
        return f'{self.user.email} – {self.achievement.name}'


# ===========================================================================
# 15. ActivityLog
# ===========================================================================

class ActivityLog(models.Model):
    class ActivityType(models.TextChoices):
        MODULE_COMPLETED = 'module_completed', 'Module Completed'
        COURSE_STARTED = 'course_started', 'Course Started'
        ASSESSMENT_PASSED = 'assessment_passed', 'Assessment Passed'
        QUIZ_COMPLETED = 'quiz_completed', 'Quiz Completed'
        ACHIEVEMENT_EARNED = 'achievement_earned', 'Achievement Earned'
        COURSE_COMPLETED = 'course_completed', 'Course Completed'

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='activity_logs')
    activity_type = models.CharField(max_length=25, choices=ActivityType.choices)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    metadata = models.JSONField(
        null=True, blank=True,
        help_text='Extra context e.g. {"score": 85, "course_id": 1}',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'activity_logs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
        ]

    def __str__(self):
        return f'{self.user.email} – {self.title}'


# ===========================================================================
# 16. VideoTask
# ===========================================================================

class VideoTask(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PROCESSING = 'processing', 'Processing'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lesson = models.ForeignKey(
        Lesson, on_delete=models.SET_NULL, related_name='video_tasks',
        null=True, blank=True, help_text='Optional link to a lesson',
    )
    topic = models.CharField(max_length=255)
    status = models.CharField(
        max_length=15, choices=Status.choices, default=Status.PENDING,
    )
    progress_message = models.TextField(blank=True, default='')
    script_data = models.JSONField(
        null=True, blank=True, help_text='Generated script JSON from Ollama',
    )
    video_file = models.FileField(
        upload_to='videos/', blank=True, null=True,
        help_text='Final generated video file',
    )
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    error_message = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'video_tasks'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.topic} ({self.status})'


# ===========================================================================
# 18. CoursePlanningTask
# ===========================================================================

class CoursePlanningTask(models.Model):
    """
    Tracks AI-powered course planning tasks.
    Analyzes whether a topic is broad/narrow and generates appropriate course structure.
    """
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PROCESSING = 'processing', 'Processing'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course_title = models.CharField(max_length=255, help_text='Title of the course/topic to plan')
    course_description = models.TextField(help_text='Description of what should be covered')
    category = models.CharField(
        max_length=50, choices=Course.CATEGORY_CHOICES, default='other',
    )
    difficulty_level = models.CharField(
        max_length=20, choices=Course.DIFFICULTY_CHOICES, default='beginner',
    )
    estimated_duration = models.PositiveIntegerField(
        default=60, help_text='Estimated duration in minutes',
    )
    thumbnail = models.URLField(blank=True, default='', help_text='URL to course thumbnail')
    status = models.CharField(
        max_length=15, choices=Status.choices, default=Status.PENDING,
    )
    progress_message = models.TextField(blank=True, default='')
    result_data = models.JSONField(
        null=True, blank=True, 
        help_text='Complete course plan result from LLM (is_broad, courses, etc.)',
    )
    created_courses = models.JSONField(
        null=True, blank=True,
        help_text='IDs of courses created from this plan',
    )
    error_message = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'course_planning_tasks'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.course_title} ({self.status})'


# ===========================================================================
# 19. ChatHistory
# ===========================================================================

class ChatHistory(models.Model):
    """
    Stores chat message history for each enrollment.
    Each enrollment gets its own separate chat history.
    """
    class Role(models.TextChoices):
        USER = 'user', 'User'
        ASSISTANT = 'assistant', 'Assistant'

    enrollment = models.ForeignKey(
        Enrollment, on_delete=models.CASCADE, related_name='chat_messages',
        help_text='The enrollment this chat message belongs to',
    )
    role = models.CharField(
        max_length=10, choices=Role.choices,
        help_text='Whether this is a user message or assistant response',
    )
    content = models.TextField(help_text='The actual message content')
    topic_name = models.CharField(
        max_length=255, blank=True, default='',
        help_text='Optional: Which topic was being discussed',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'chat_history'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['enrollment', 'created_at']),
        ]

    def __str__(self):
        return f'{self.enrollment.user.email} - {self.role} - {self.created_at}'
