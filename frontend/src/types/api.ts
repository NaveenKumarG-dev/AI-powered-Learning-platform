// TypeScript interfaces matching backend models

export interface User {
  id: string | number;
  email: string;
  first_name: string;
  last_name: string;
  avatar?: string;
  bio?: string;
  total_study_time: number;
  streak_days: number;
  date_joined: string;
  learning_profile?: LearningProfile;
}

export interface LearningProfile {
  id: string | number;
  user: string | number;
  learning_style: 'visual' | 'auditory' | 'reading_writing' | 'kinesthetic';
  preferred_depth: 'beginner' | 'intermediate' | 'advanced';
  learning_pace: 'slow' | 'moderate' | 'fast';
  daily_study_time?: number;
  preferred_content_types: string[];
  focus_areas: string[];
}

export interface Course {
  id: string | number;
  name: string;  // Backward compatibility
  title: string;
  description: string;
  is_sub_topic?: boolean;
  parent_topic_name?: string | null;
  category: 'web_dev' | 'data_science' | 'ai_ml' | 'mobile_dev' | 'cloud' | 'design' | 'devops' | 'cybersecurity' | 'blockchain' | 'other';
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  estimated_duration: number;
  thumbnail?: string;
  is_popular?: boolean;
  created_at: string;
  updated_at: string;
  modules?: Module[];
  modules_count?: number;
  enrolled_count?: number;
}

export interface Module {
  id: string | number;
  course: string | number;
  title: string;
  description: string;
  order: number;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  estimated_duration: number;
  lessons?: Lesson[];
  lessons_count?: number;
}

export interface Lesson {
  id: string | number;
  module: string | number;
  title: string;
  description: string;
  content: string;
  order: number;
  duration_minutes: number;
  resources?: Resource[];
}

export interface Resource {
  id: string | number;
  lesson: string | number;
  title: string;
  resource_type: 'video' | 'pdf' | 'quiz' | 'mindmap' | 'notes' | 'audio' | 'image' | 'reel' | 'video_script' | 'ppt' | 'external_link' | 'code_exercise';
  file?: string;
  file_url?: string;
  content_text?: string;
  content_json?: any;
  external_url?: string;
  description?: string;
  duration_seconds?: number;
  is_generated?: boolean;
  created_at: string;
}

export interface SampleCodeContentJson {
  mode: 'sample_code';
  title: string;
  explanation: string;
  language: 'python';
  starter_code: string;
  sample_input?: string;
}

export interface Enrollment {
  id: string | number;
  user: string | number;
  course: Course;
  status: 'active' | 'completed' | 'paused';
  enrolled_at: string;
  completed_at?: string;
  overall_progress: number;
  learning_goals?: string;
}

export interface Question {
  id: string | number;
  course?: string | number;
  module?: string | number;
  question_type: 'diagnostic' | 'topic_quiz' | 'final_quiz';
  question_text: string;
  options: { [key: string]: string };
  correct_option: string;
  explanation?: string;
  difficulty_level: 'easy' | 'medium' | 'hard';
  created_at: string;
}

export interface QuizAttempt {
  id: string;
  user: string | number;
  enrollment?: string | number;
  quiz_type: 'diagnostic' | 'topic_quiz' | 'final_quiz';
  started_at: string;
  submitted_at?: string;
  score?: number;
  total_questions?: number;
  questions?: Question[];
  answers?: QuizAnswer[];
}

export interface QuizAnswer {
  id: string | number;
  quiz_attempt: string;
  question: string | number;
  selected_option: string;
  is_correct: boolean;
}

export interface ModuleProgress {
  id: string | number;
  enrollment: string | number;
  module: Module;
  status: 'not_started' | 'in_progress' | 'completed';
  progress_percentage: number;
  started_at?: string;
  completed_at?: string;
  last_accessed_lesson?: number;
}

export interface LearningRoadmap {
  id: number;
  enrollment: Enrollment;
  personalization_factors: { [key: string]: any };
  recommended_modules: Module[];
  ai_recommendations?: string;
  generated_at: string;
}

export interface Achievement {
  id: number;
  name: string;
  description: string;
  icon: string;
  category: 'completion' | 'streak' | 'mastery' | 'engagement';
  criteria: { [key: string]: any };
}

export interface UserAchievement {
  id: number;
  user: number;
  achievement: Achievement;
  earned_at: string;
  progress?: number;
}

export interface ActivityLog {
  id: number;
  user: number;
  activity_type: string;
  title?: string;
  description: string;
  created_at: string;
  timestamp?: string;  // kept for backward compat
  metadata?: Record<string, any>;
}

export interface DashboardData {
  user: User;
  stats: {
    total_courses: number;
    active_courses: number;
    completed_courses: number;
    average_progress: number;
    study_time_hours: number;
    streak_days: number;
    achievements_earned: number;
  };
  recent_activities: ActivityLog[];
  active_enrollments: Enrollment[];
}

// Auth types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  password2: string;
  first_name: string;
  last_name: string;
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface ApiError {
  detail?: string;
  [key: string]: any;
}

// Pagination
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// Course Planning Task
export interface CoursePlanningTask {
  id: string;
  course_title: string;
  course_description: string;
  category: Course['category'];
  difficulty_level: Course['difficulty_level'];
  estimated_duration: number;
  thumbnail: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress_message: string;
  result_data: {
    is_broad: boolean;
    total_courses: number;
    courses: Array<{
      course_name: string;
      description: string;
      difficulty: string;
      prerequisites: string[];
    }>;
  } | null;
  created_courses: string[] | null;
  error_message: string;
  created_at: string;
  completed_at: string | null;
}

export interface CodingTestCase {
  id: number;
  input_data: string;
  expected_output: string;
  explanation: string;
  is_hidden: boolean;
  weight: number;
  order: number;
}

export interface CodingProblem {
  id: number;
  course: number;
  module?: number | null;
  lesson?: number | null;
  title: string;
  problem_statement: string;
  starter_code: string;
  language: 'python';
  difficulty: 'easy' | 'intermediate' | 'difficult';
  constraints: Record<string, any>;
  hints: string[];
  is_generated: boolean;
  generation_model: string;
  created_at: string;
  updated_at: string;
  test_cases: CodingTestCase[];
}

export interface CodeSubmission {
  id: string;
  user: number;
  enrollment: number;
  problem: number;
  language: 'python';
  source_code: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  score_percent: number;
  passed_tests: number;
  total_tests: number;
  feedback: Record<string, any>;
  error_message: string;
  submitted_at: string;
  completed_at?: string | null;
}

export interface CodeExecutionTask {
  id: string;
  submission: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress_message: string;
  result_data: Record<string, any>;
  error_message: string;
  created_at: string;
  completed_at?: string | null;
}
