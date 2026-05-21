import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { createClient } from '@supabase/supabase-js';
import {
  User,
  LearningProfile,
  Course,
  Module,
  Lesson,
  Resource,
  Enrollment,
  Question,
  QuizAttempt,
  QuizAnswer,
  ModuleProgress,
  LearningRoadmap,
  Achievement,
  UserAchievement,
  ActivityLog,
  DashboardData,
  LoginCredentials,
  RegisterData,
  AuthResponse,
  PaginatedResponse,
  CoursePlanningTask,
  CodingProblem,
  CodeSubmission,
  CodeExecutionTask,
} from '../types/api';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      // Try to read active Supabase session
      const sessionResp: any = await supabase.auth.getSession();
      const token = sessionResp?.data?.session?.access_token || localStorage.getItem('access_token');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      // fallback to localStorage token
      const token = localStorage.getItem('access_token');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Clear local auth state and redirect to login
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ============================================================================
// AUTHENTICATION API
// ============================================================================

export const authAPI = {
  register: async (data: RegisterData): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/register/', data);
    return response.data;
  },

  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login/', credentials);
    return response.data;
  },

  logout: async (refreshToken: string): Promise<void> => {
    await api.post('/auth/logout/', { refresh: refreshToken });
  },

  refreshToken: async (refreshToken: string): Promise<{ access: string }> => {
    const response = await api.post<{ access: string }>('/auth/token/refresh/', {
      refresh: refreshToken,
    });
    return response.data;
  },
};

// ============================================================================
// USER API
// ============================================================================

export const userAPI = {
  getProfile: async (): Promise<User> => {
    const response = await api.get<User>('/users/me/');
    return response.data;
  },

  updateProfile: async (data: Partial<User>): Promise<User> => {
    const response = await api.patch<User>('/users/me/', data);
    return response.data;
  },

  getLearningProfile: async (): Promise<LearningProfile> => {
    const response = await api.get<LearningProfile>('/users/me/learning-profile/');
    return response.data;
  },

  updateLearningProfile: async (data: Partial<LearningProfile>): Promise<LearningProfile> => {
    const response = await api.patch<LearningProfile>('/users/me/learning-profile/', data);
    return response.data;
  },
};

// ============================================================================
// COURSE API
// ============================================================================

export const courseAPI = {
  list: async (params?: any): Promise<PaginatedResponse<Course>> => {
    const response = await api.get<PaginatedResponse<Course>>('/courses/', { params });
    return response.data;
  },

  get: async (id: number): Promise<Course> => {
    const response = await api.get<Course>(`/courses/${id}/`);
    return response.data;
  },

  getModules: async (courseId: number): Promise<Module[]> => {
    const response = await api.get<Module[]>(`/courses/${courseId}/modules/`);
    return response.data;
  },

  getMyCreated: async (): Promise<Course[]> => {
    const response = await api.get<Course[]>('/courses/my_created/');
    return response.data;
  },

  getCourseEnrollments: async (courseId: number): Promise<any> => {
    const response = await api.get(`/courses/${courseId}/enrollments_with_curricula/`);
    return response.data;
  },

  create: async (data: Partial<Course>): Promise<Course> => {
    const response = await api.post<Course>('/courses/', data);
    return response.data;
  },

  update: async (id: number, data: Partial<Course>): Promise<Course> => {
    const response = await api.patch<Course>(`/courses/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/courses/${id}/`);
  },
};

// ============================================================================
// COURSE PLANNING API
// ============================================================================

export const coursePlanningAPI = {
  /**
   * Create a new course planning task
   * The backend will analyze if the topic is broad/narrow and create appropriate courses
   */
  create: async (data: {
    course_title: string;
    course_description: string;
    category: Course['category'];
    difficulty_level: Course['difficulty_level'];
    estimated_duration: number;
    thumbnail?: string;
  }): Promise<CoursePlanningTask> => {
    const response = await api.post<CoursePlanningTask>('/courses/plan/', data);
    return response.data;
  },

  /**
   * Check the status of a course planning task
   * Poll this endpoint to track progress
   */
  getStatus: async (taskId: string): Promise<CoursePlanningTask> => {
    const response = await api.get<CoursePlanningTask>(`/courses/plan/status/${taskId}/`);
    return response.data;
  },
};

// ============================================================================
// MODULE API
// ============================================================================

export const moduleAPI = {
  list: async (params?: any): Promise<PaginatedResponse<Module>> => {
    const response = await api.get<PaginatedResponse<Module>>('/modules/', { params });
    return response.data;
  },

  get: async (id: number): Promise<Module> => {
    const response = await api.get<Module>(`/modules/${id}/`);
    return response.data;
  },

  getLessons: async (moduleId: number): Promise<Lesson[]> => {
    const response = await api.get<Lesson[]>(`/modules/${moduleId}/lessons/`);
    return response.data;
  },
};

// ============================================================================
// LESSON API
// ============================================================================

export const lessonAPI = {
  list: async (params?: any): Promise<PaginatedResponse<Lesson>> => {
    const response = await api.get<PaginatedResponse<Lesson>>('/lessons/', { params });
    return response.data;
  },

  get: async (id: number): Promise<Lesson> => {
    const response = await api.get<Lesson>(`/lessons/${id}/`);
    return response.data;
  },

  getResources: async (lessonId: number): Promise<Resource[]> => {
    const response = await api.get<Resource[]>(`/lessons/${lessonId}/resources/`);
    return response.data;
  },
};

// ============================================================================
// ENROLLMENT API
// ============================================================================

export const enrollmentAPI = {
  list: async (params?: any): Promise<PaginatedResponse<Enrollment>> => {
    const response = await api.get<PaginatedResponse<Enrollment>>('/enrollments/', { params });
    return response.data;
  },

  get: async (id: number): Promise<Enrollment> => {
    const response = await api.get<Enrollment>(`/enrollments/${id}/`);
    return response.data;
  },

  create: async (data: { course_id: number; learning_goals?: string }): Promise<Enrollment> => {
    const response = await api.post<Enrollment>('/enrollments/', data);
    return response.data;
  },

  getProgress: async (id: number): Promise<any> => {
    const response = await api.get(`/enrollments/${id}/progress/`);
    return response.data;
  },

  startDiagnosticQuiz: async (id: number): Promise<{ attempt_id: string; questions: Question[] }> => {
    const response = await api.post(`/enrollments/${id}/diagnostic_quiz/`);
    return response.data;
  },

  generateMindMap: async (id: number): Promise<MindMapData> => {
    const response = await api.post(`/enrollments/${id}/generate_mindmap/`);
    return response.data;
  },
};


// ============================================================================
// QUIZ API
// ============================================================================

export const quizAPI = {
  getQuestions: async (params?: any): Promise<PaginatedResponse<Question>> => {
    const response = await api.get<PaginatedResponse<Question>>('/questions/', { params });
    return response.data;
  },

  getAttempt: async (id: string): Promise<QuizAttempt> => {
    const response = await api.get<QuizAttempt>(`/quiz-attempts/${id}/`);
    return response.data;
  },

  submitQuiz: async (data: {
    attempt_id: string;
    answers: Array<{ question_id: number; selected_option: string }>;
  }): Promise<{
    score: number;
    correct_answers: number;
    total_questions: number;
    quiz_attempt: QuizAttempt;
  }> => {
    const response = await api.post('/quiz-attempts/submit/', data);
    return response.data;
  },

  getAnswers: async (attemptId: string): Promise<QuizAnswer[]> => {
    const response = await api.get<PaginatedResponse<QuizAnswer>>('/quiz-answers/', {
      params: { quiz_attempt: attemptId },
    });
    return response.data.results;
  },
};

// ============================================================================
// PROGRESS API
// ============================================================================

export const progressAPI = {
  getModuleProgress: async (params?: any): Promise<PaginatedResponse<ModuleProgress>> => {
    const response = await api.get<PaginatedResponse<ModuleProgress>>('/module-progress/', {
      params,
    });
    return response.data;
  },

  updateModuleProgress: async (
    id: number,
    data: Partial<ModuleProgress>
  ): Promise<ModuleProgress> => {
    const response = await api.patch<ModuleProgress>(`/module-progress/${id}/`, data);
    return response.data;
  },

  // Lesson Progress methods
  getLessonProgressByEnrollment: async (enrollmentId: number): Promise<any[]> => {
    const response = await api.get(`/lesson-progress/by_enrollment/`, {
      params: { enrollment_id: enrollmentId },
    });
    return response.data;
  },

  markLessonComplete: async (data: {
    enrollment_id: number;
    lesson_id: number;
    is_completed: boolean;
  }): Promise<any> => {
    const response = await api.post('/lesson-progress/mark_complete/', data);
    return response.data;
  },
};

// ============================================================================
// ROADMAP API
// ============================================================================

export const roadmapAPI = {
  list: async (params?: any): Promise<PaginatedResponse<LearningRoadmap>> => {
    const response = await api.get<PaginatedResponse<LearningRoadmap>>('/learning-roadmaps/', {
      params,
    });
    return response.data;
  },

  get: async (id: number): Promise<LearningRoadmap> => {
    const response = await api.get<LearningRoadmap>(`/learning-roadmaps/${id}/`);
    return response.data;
  },

  generate: async (enrollmentId: number): Promise<LearningRoadmap> => {
    const response = await api.post<LearningRoadmap>('/learning-roadmaps/generate/', {
      enrollment_id: enrollmentId,
    });
    return response.data;
  },
};

// ============================================================================
// RESOURCE API
// ============================================================================

export const resourceAPI = {
  listByLesson: async (lessonId: number): Promise<Resource[]> => {
    const response = await api.get<PaginatedResponse<Resource>>('/resources/', {
      params: { lesson: lessonId }
    });
    return response.data.results;
  },

  get: async (id: number): Promise<Resource> => {
    const response = await api.get<Resource>(`/resources/${id}/`);
    return response.data;
  },

  createNote: async (data: {
    lesson: number;
    title: string;
    content_text: string;
  }): Promise<Resource> => {
    const response = await api.post<Resource>('/resources/', {
      ...data,
      resource_type: 'notes',
    });
    return response.data;
  },
};

// ============================================================================
// ACHIEVEMENT API
// ============================================================================

export const achievementAPI = {
  list: async (params?: any): Promise<PaginatedResponse<Achievement>> => {
    const response = await api.get<PaginatedResponse<Achievement>>('/achievements/', { params });
    return response.data;
  },

  getUserAchievements: async (params?: any): Promise<PaginatedResponse<UserAchievement>> => {
    const response = await api.get<PaginatedResponse<UserAchievement>>('/user-achievements/', {
      params,
    });
    return response.data;
  },
};

// ============================================================================
// ACTIVITY LOG API
// ============================================================================

export const activityAPI = {
  list: async (params?: any): Promise<PaginatedResponse<ActivityLog>> => {
    const response = await api.get<PaginatedResponse<ActivityLog>>('/activity-logs/', { params });
    return response.data;
  },
};

// ============================================================================
// DASHBOARD API
// ============================================================================

export const dashboardAPI = {
  get: async (): Promise<DashboardData> => {
    const response = await api.get<DashboardData>('/dashboard/');
    return response.data;
  },
};

// ============================================================================
// VIDEO GENERATION API
// ============================================================================

export const videoAPI = {
  generate: async (data: { topic: string; lesson_id?: number }): Promise<any> => {
    console.log('📡 videoAPI.generate called with:', data);
    console.log('📡 Making POST request to: /videos/generate/');
    const response = await api.post('/videos/generate/', data);
    console.log('📡 Response received:', response.data);
    return response.data;
  },

  getStatus: async (taskId: string): Promise<any> => {
    console.log('📡 Fetching video status for task:', taskId);
    const response = await api.get(`/videos/status/${taskId}/`);
    console.log('📡 Status response:', response.data);
    return response.data;
  },
};

// ============================================================================
// ASSESSMENT & PERSONALIZED LEARNING API
// ============================================================================

export interface AssessmentQuestion {
  id?: number;
  question_text: string;  // Updated to match backend
  topic: string;  // New field for topic tracking
  options: string[];  // Array of 4 options, last is "I don't know"
  correct_answer_index: number;  // Index of correct answer (0-2)
  explanation: string;  // Explanation of correct answer
  difficulty_hint: string;  // Beginner/Intermediate/Advanced
}

export interface InitialAssessmentResponse {
  question_count: number;  // LLM-determined count (5-15)
  question_count_reasoning: string;  // Why this count was chosen
  questions: AssessmentQuestion[];
}

export interface EvaluationResult {
  knowledge_level: string;
  score: string;
  weak_areas: string[];
}

export interface RoadmapTopic {
  topic_name: string;
  level: string;
  description?: string;
}

export interface Roadmap {
  topics: RoadmapTopic[];
}

export interface SyllabusTopic {
  topic_name: string;
  description: string;
  order: number;
}

export interface SyllabusModule {
  module_name: string;
  description: string;
  order?: number;
  difficulty_level?: string;
  estimated_duration_minutes?: number;
  topics: SyllabusTopic[];
}

export interface MindMapBranch {
  name: string;
  subtopics: string[];
}

export interface MindMapData {
  title: string;
  level: string;
  branches: MindMapBranch[];
}

export interface Syllabus {
  course_name: string;
  knowledge_level?: string;
  difficulty_level: string;
  total_modules: number;
  modules: SyllabusModule[];
}

export interface EnrollmentResponse {
  enrollment_id: number;
  assessment_result: {  // Updated from 'evaluation'
    knowledge_level: string;  // None/Basic/Intermediate/Advanced
    knowledge_percentage: number;
    correct_answers: number;
    incorrect_answers: number;
    dont_know_answers: number;
    total_questions: number;
    known_topics: string[];
    weak_topics: string[];
    unknown_topics: string[];
  };
  roadmap: Roadmap;  // Kept for backward compatibility
  syllabus: Syllabus;
  message: string;
}

export interface TopicContentResponse {
  lesson_id: number;
  content: string;
}

export type DynamicScriptBlockType = 'text' | 'code' | 'video' | 'mind_map' | 'quiz';

export interface DynamicScriptBlock {
  type: DynamicScriptBlockType;
  prompt: string;
  payload: Record<string, any>;
}

export interface DynamicScriptResponse {
  lesson_id: number;
  schema_version: string;
  title: string;
  overview: string;
  blocks: DynamicScriptBlock[];
}

export interface SampleCodeRunResponse {
  status: 'ok' | 'runtime_error' | 'timeout' | 'internal_error';
  stdout: string;
  stderr: string;
  error_message: string;
  runtime_ms: number;
}

export interface InteractiveSampleResponse {
  session_id: string;
  output: string;
  is_running: boolean;
  exit_code: number | null;
}

export interface TopicQuizResponse {
  questions: AssessmentQuestion[];
}

export interface QuizEvaluationResult {
  score: string;
  score_percent: number;
  correct_count: number;
  total_questions: number;
  weak_areas: string[];
}

export interface TopicEvaluationResponse {
  evaluation: QuizEvaluationResult;
  progress_updated: boolean;
  refined_roadmap?: Roadmap;
}

export interface RemediationNote {
  sub_topic: string;
  content: string;
}

export interface RemediationResponse {
  remediation_notes: RemediationNote[];
}

export const assessmentAPI = {
  generateInitialAssessment: async (data: {
    course_id: number;
    course_name: string;
  }): Promise<InitialAssessmentResponse> => {
    const response = await api.post<InitialAssessmentResponse>(
      '/assessment/initial/',
      data
    );
    return response.data;
  },

  evaluateAssessment: async (data: {
    course_id: number;
    course_name: string;
    questions: AssessmentQuestion[];
    answers: number[];  // Changed to number[] (indices 0-3)
    study_method: 'real_world' | 'theory_depth' | 'project_based' | 'custom';
    custom_study_method?: string;  // Required when study_method is 'custom'
    learning_style?: 'mindmap' | 'videos' | 'summary' | 'books' | 'reels';  // User's chosen learning style
  }): Promise<EnrollmentResponse> => {
    const response = await api.post<EnrollmentResponse>(
      '/assessment/evaluate/',
      data
    );
    return response.data;
  },

  generateTopicContent: async (data: {
    enrollment_id: number;
    module_id: number;
    topic_name: string;
    regenerate?: boolean;
  }): Promise<TopicContentResponse> => {
    const response = await api.post<TopicContentResponse>(
      '/assessment/topic/content/',
      data
    );
    return response.data;
  },

  generateTopicQuiz: async (data: {
    lesson_id: number;
    topic_name: string;
  }): Promise<TopicQuizResponse> => {
    const response = await api.post<TopicQuizResponse>(
      '/assessment/topic/quiz/',
      data
    );
    return response.data;
  },

  generateDynamicScript: async (data: {
    enrollment_id: number;
    module_id: number;
    topic_name: string;
    regenerate?: boolean;
  }): Promise<DynamicScriptResponse> => {
    const response = await api.post<DynamicScriptResponse>(
      '/assessment/topic/dynamic-script/',
      data
    );
    return response.data;
  },

  evaluateTopicQuiz: async (data: {
    enrollment_id: number;
    module_id: number;
    lesson_id?: number;
    question_ids: number[];
    answers: string[];
  }): Promise<TopicEvaluationResponse> => {
    const response = await api.post<TopicEvaluationResponse>(
      '/assessment/topic/evaluate/',
      data
    );
    return response.data;
  },

  getQuizAttempts: async (enrollmentId: number): Promise<any[]> => {
    const response = await api.get('/quiz-attempts/by_enrollment/', {
      params: { enrollment_id: enrollmentId },
    });
    return response.data;
  },

  generateTopicMindMap: async (data: {
    lesson_id: number;
    topic_name: string;
  }): Promise<MindMapData> => {
    const response = await api.post<MindMapData>(
      '/assessment/topic/mindmap/',
      data
    );
    return response.data;
  },

  generateRemediationContent: async (data: {
    enrollment_id: number;
    lesson_id: number;
    topic_name: string;
    weak_areas: string[];
  }): Promise<RemediationResponse> => {
    const response = await api.post<RemediationResponse>(
      '/assessment/topic/remediation/',
      data
    );
    return response.data;
  },

  getSyllabus: async (enrollmentId: number): Promise<{
    enrollment_id: number;
    course_name: string;
    syllabus: Syllabus;
    generated_by_model: string;
    total_modules: number;
    total_topics: number;
    created_at: string;
  }> => {
    const response = await api.get(`/assessment/syllabus/${enrollmentId}/`);
    return response.data;
  },
};

// ============================================================================
// CODING LAB API
// ============================================================================

export const codingAPI = {
  generateProblem: async (data: {
    enrollment_id: number;
    module_id: number;
    topic_name: string;
    regenerate?: boolean;
  }): Promise<CodingProblem> => {
    const response = await api.post<CodingProblem>('/coding/problems/generate/', data);
    return response.data;
  },

  getProblem: async (problemId: number): Promise<CodingProblem> => {
    const response = await api.get<CodingProblem>(`/coding/problems/${problemId}/`);
    return response.data;
  },

  submitCode: async (data: {
    enrollment_id: number;
    problem_id: number;
    source_code: string;
    language?: 'python';
  }): Promise<{ submission: CodeSubmission; task: CodeExecutionTask }> => {
    const response = await api.post<{ submission: CodeSubmission; task: CodeExecutionTask }>(
      '/coding/submissions/',
      {
        ...data,
        language: data.language || 'python',
      }
    );
    return response.data;
  },

  getTaskStatus: async (taskId: string): Promise<CodeExecutionTask> => {
    const response = await api.get<CodeExecutionTask>(`/coding/tasks/${taskId}/`);
    return response.data;
  },

  getSubmissionResult: async (submissionId: string): Promise<CodeSubmission> => {
    const response = await api.get<CodeSubmission>(`/coding/submissions/${submissionId}/result/`);
    return response.data;
  },

  generateSampleCode: async (data: {
    enrollment_id: number;
    module_id: number;
    topic_name: string;
    regenerate?: boolean;
  }): Promise<Resource> => {
    const response = await api.post<Resource>('/coding/samples/generate/', data);
    return response.data;
  },

  runSampleCode: async (data: {
    source_code: string;
    raw_input?: string;
  }): Promise<SampleCodeRunResponse> => {
    const response = await api.post<SampleCodeRunResponse>('/coding/samples/run/', data);
    return response.data;
  },

  startInteractiveSampleCode: async (data: {
    source_code: string;
  }): Promise<InteractiveSampleResponse> => {
    const response = await api.post<InteractiveSampleResponse>('/coding/samples/interactive/start/', data);
    return response.data;
  },

  sendInteractiveSampleInput: async (data: {
    session_id: string;
    user_input?: string;
  }): Promise<InteractiveSampleResponse> => {
    const response = await api.post<InteractiveSampleResponse>('/coding/samples/interactive/input/', data);
    return response.data;
  },

  stopInteractiveSampleCode: async (data: {
    session_id: string;
  }): Promise<InteractiveSampleResponse> => {
    const response = await api.post<InteractiveSampleResponse>('/coding/samples/interactive/stop/', data);
    return response.data;
  },
};

// ============================================================================
// PODCAST API
// ============================================================================

export const podcastAPI = {
  generatePersonaOptions: async (text: string): Promise<{
    options: Array<{ person1: string; person2: string }>;
  }> => {
    const response = await api.post('/podcast/personas/', { text });
    return response.data;
  },

  generateScenarioOptions: async (
    text: string,
    personas?: { person1: string; person2: string }
  ): Promise<{
    options: string[];
  }> => {
    const response = await api.post('/podcast/scenarios/', {
      text,
      personas,
    });
    return response.data;
  },

  generatePodcast: async (data: {
    text: string;
    instruction?: string;
    person1?: string;
    person2?: string;
    lesson_id?: number;
    topic_name?: string;
    enrollment_id?: number;  // Pass enrollment to apply personalized system prompt
  }): Promise<{
    audio_url: string;
    message: string;
  }> => {
    const response = await api.post('/podcast/generate/', data);
    return response.data;
  },
};

// ============================================================================
// RAG CHATBOT API
// ============================================================================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id?: number;
  topic_name?: string;
  created_at?: string;
}

export interface ChatResponse {
  response: string;
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
}

export const chatAPI = {
  sendMessage: async (data: {
    message: string;
    context: string;
    topic_name: string;
    course_name: string;
    enrollment_id: number;
  }): Promise<ChatResponse> => {
    const response = await api.post<ChatResponse>('/chat/', data);
    return response.data;
  },
  
  getChatHistory: async (enrollmentId: number): Promise<ChatHistoryResponse> => {
    const response = await api.get<ChatHistoryResponse>('/chat/history/', {
      params: { enrollment_id: enrollmentId }
    });
    return response.data;
  },
  
  clearChatHistory: async (enrollmentId: number): Promise<{ message: string; deleted_count: number }> => {
    const response = await api.delete('/chat/clear/', {
      params: { enrollment_id: enrollmentId }
    });
    return response.data;
  },
};

// Re-export types for convenience
export type {
  User,
  LearningProfile,
  Course,
  Module,
  Lesson,
  Resource,
  Enrollment,
  Question,
  QuizAttempt,
  ModuleProgress,
  LearningRoadmap,
  DashboardData,
  PaginatedResponse,
  CodingProblem,
  CodeSubmission,
  CodeExecutionTask,
};

export default api;
