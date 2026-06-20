from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import (
    Achievement,
    ActivityLog,
    ChatHistory,
    Course,
    CoursePlanningTask,
    Enrollment,
    Lesson,
    LessonProgress,
    LearningProfile,
    LearningRoadmap,
    Module,
    ModuleProgress,
    PersonalizedSyllabus,
    Question,
    QuizAnswer,
    QuizAttempt,
    Resource,
    TokenUsage,
    User,
    UserAchievement,
    VideoTask,
)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('email', 'full_name', 'is_staff', 'created_at')
    search_fields = ('email', 'full_name')
    ordering = ('email',)

    # Override fieldsets since we removed username
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal Info', {'fields': ('full_name', 'bio', 'avatar')}),
        ('Preferences', {'fields': ('notify_email', 'notify_push', 'notify_course_updates', 'language', 'theme')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'full_name', 'password1', 'password2'),
        }),
    )


@admin.register(LearningProfile)
class LearningProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'preferred_style', 'depth_preference', 'pace_preference')
    list_filter = ('preferred_style', 'depth_preference', 'pace_preference')


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')
    search_fields = ('name',)


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ('name', 'icon', 'created_at')


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ('user', 'course', 'diagnosed_level', 'status', 'overall_progress', 'enrolled_at')
    list_filter = ('status', 'diagnosed_level')
    search_fields = ('user__email', 'course__name')


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ('title', 'course', 'order', 'difficulty_level', 'estimated_duration_minutes')
    list_filter = ('difficulty_level', 'is_generated')
    search_fields = ('title', 'course__name')


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ('title', 'module', 'order', 'estimated_duration_minutes')
    search_fields = ('title', 'module__title')


@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = ('title', 'lesson', 'resource_type', 'is_generated', 'created_at')
    list_filter = ('resource_type', 'is_generated')


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ('question_text_short', 'course', 'question_type', 'difficulty', 'is_generated')
    list_filter = ('question_type', 'difficulty', 'is_generated')

    @admin.display(description='Question')
    def question_text_short(self, obj):
        return obj.question_text[:80]


@admin.register(QuizAttempt)
class QuizAttemptAdmin(admin.ModelAdmin):
    list_display = ('enrollment', 'attempt_type', 'score_percent', 'correct_answers', 'total_questions', 'started_at')
    list_filter = ('attempt_type',)


@admin.register(QuizAnswer)
class QuizAnswerAdmin(admin.ModelAdmin):
    list_display = ('attempt', 'question', 'selected_option_index', 'is_correct')
    list_filter = ('is_correct',)


@admin.register(ModuleProgress)
class ModuleProgressAdmin(admin.ModelAdmin):
    list_display = ('enrollment', 'module', 'status', 'progress_percent', 'time_spent_minutes')
    list_filter = ('status',)


@admin.register(LessonProgress)
class LessonProgressAdmin(admin.ModelAdmin):
    list_display = ('enrollment', 'lesson', 'is_completed', 'completed_at', 'time_spent_minutes')
    list_filter = ('is_completed',)
    search_fields = ('enrollment__user__email', 'lesson__title')
    list_select_related = ('enrollment__user', 'lesson__module')


@admin.register(LearningRoadmap)
class LearningRoadmapAdmin(admin.ModelAdmin):
    list_display = ('enrollment', 'version', 'is_active', 'generated_by_model', 'created_at')
    list_filter = ('is_active',)


@admin.register(UserAchievement)
class UserAchievementAdmin(admin.ModelAdmin):
    list_display = ('user', 'achievement', 'earned_at')


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ('user', 'activity_type', 'title', 'created_at')
    list_filter = ('activity_type',)
    search_fields = ('user__email', 'title')


@admin.register(VideoTask)
class VideoTaskAdmin(admin.ModelAdmin):
    list_display = ('topic', 'status', 'created_at', 'completed_at')
    list_filter = ('status',)
    search_fields = ('topic',)
    readonly_fields = ('id',)


@admin.register(CoursePlanningTask)
class CoursePlanningTaskAdmin(admin.ModelAdmin):
    list_display = ('course_title', 'status', 'category', 'difficulty_level', 'created_at', 'completed_at')
    list_filter = ('status', 'category', 'difficulty_level')
    search_fields = ('course_title', 'course_description')
    readonly_fields = ('id', 'created_at')


@admin.register(PersonalizedSyllabus)
class PersonalizedSyllabusAdmin(admin.ModelAdmin):
    list_display = ('enrollment', 'generated_by_model', 'created_at')
    search_fields = ('enrollment__user__email', 'enrollment__course__name')


@admin.register(ChatHistory)
class ChatHistoryAdmin(admin.ModelAdmin):
    list_display = ('enrollment', 'role', 'topic_name', 'created_at')
    list_filter = ('role',)
    search_fields = ('enrollment__user__email', 'content', 'topic_name')
    readonly_fields = ('created_at',)


@admin.register(TokenUsage)
class TokenUsageAdmin(admin.ModelAdmin):
    list_display = ('user', 'activity_type', 'input_tokens', 'output_tokens', 'total_tokens_display', 'model_name', 'created_at')
    list_filter = ('activity_type', 'model_name')
    search_fields = ('user__email', 'model_name')
    readonly_fields = ('created_at',)
    date_hierarchy = 'created_at'

    @admin.display(description='Total Tokens')
    def total_tokens_display(self, obj):
        return obj.input_tokens + obj.output_tokens
