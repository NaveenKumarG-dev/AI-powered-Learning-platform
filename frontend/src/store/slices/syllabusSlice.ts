import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import {
  assessmentAPI,
  videoAPI,
  resourceAPI,
  enrollmentAPI,
  progressAPI,
  Syllabus,
  AssessmentQuestion,
  Resource,
  MindMapData,
  DynamicScriptResponse,
  DynamicScriptBlock,
} from '../../services/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TopicKey {
  moduleIndex: number;
  topicIndex: number;
}

function topicId(enrollmentId: string | number | null, moduleIndex: number, topicIndex: number): string {
  return `${enrollmentId}-${moduleIndex}-${topicIndex}`;
}

interface GeneratedContent {
  lessonId: string | number;
  content: string;
  generatedAt: string;
}

interface GeneratedQuiz {
  questions: AssessmentQuestion[];
  generatedAt: string;
}

interface GeneratedDynamicScript {
  lessonId: string | number;
  schemaVersion: string;
  title: string;
  overview: string;
  blocks: DynamicScriptBlock[];
  generatedAt: string;
}

interface QuizResult {
  score: string;
  scorePercent: number;
  correctCount: number;
  totalQuestions: number;
  weakAreas: string[];
}

interface VideoTask {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
}

interface RemediationItem {
  sub_topic: string;
  content: string;
  generatedAt: string;
}

export type ActiveResourceViewType = 'text' | 'video' | 'audio' | 'notes' | 'create-note' | 'dynamic-script' | 'code';

export interface ActiveResourceView {
  type: ActiveResourceViewType;
  resourceId?: string | number;
}

export interface SyllabusState {
  enrollmentId: string | number | null;
  courseName: string;
  syllabus: Syllabus | null;
  generatedByModel: string;
  loading: boolean;
  error: string | null;

  mindMapData: MindMapData | null;
  mindMapLoading: boolean;

  topicMindMapData: Record<string, MindMapData>;
  topicMindMapLoading: Record<string, boolean>;

  // Per-topic state keyed by "enrollmentId-moduleIndex-topicIndex"
  topicCompletion: Record<string, boolean>;
  generatedContent: Record<string, GeneratedContent>;
  generatedQuizzes: Record<string, GeneratedQuiz>;
  generatedDynamicScripts: Record<string, GeneratedDynamicScript>;
  quizResults: Record<string, QuizResult>;
  videoTasks: Record<string, VideoTask>;
  resources: Record<string, Resource[]>; // lessonId -> resources
  remediationContent: Record<string, RemediationItem[]>; // topicKey -> remediation notes
  activeResourceView: Record<string, ActiveResourceView>; // topicKey -> which resource is shown

  // Loading state per operation
  contentLoading: Record<string, boolean>;
  contentErrors: Record<string, string>;
  quizLoading: Record<string, boolean>;
  dynamicScriptLoading: Record<string, boolean>;
  dynamicScriptErrors: Record<string, string>;
  quizEvaluating: Record<string, boolean>;
  videoLoading: Record<string, boolean>;
  resourcesLoading: Record<string, boolean>; // lessonId -> loading
  remediationLoading: Record<string, boolean>;
}

const initialState: SyllabusState = {
  enrollmentId: null,
  courseName: '',
  syllabus: null,
  generatedByModel: '',
  loading: false,
  error: null,
  mindMapData: null,
  mindMapLoading: false,
  topicMindMapData: {},
  topicMindMapLoading: {},
  topicCompletion: {},
  generatedContent: {},
  generatedQuizzes: {},
  generatedDynamicScripts: {},
  quizResults: {},
  videoTasks: {},
  resources: {},
  remediationContent: {},
  activeResourceView: {},
  contentLoading: {},
  contentErrors: {},
  quizLoading: {},
  dynamicScriptLoading: {},
  dynamicScriptErrors: {},
  quizEvaluating: {},
  videoLoading: {},
  resourcesLoading: {},
  remediationLoading: {},
};

// ─── Async Thunks ────────────────────────────────────────────────────────────

export const fetchSyllabus = createAsyncThunk(
  'syllabus/fetchSyllabus',
  async (enrollmentId: string | number, { rejectWithValue }) => {
    try {
      const response = await assessmentAPI.getSyllabus(enrollmentId);
      return response;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to fetch syllabus'
      );
    }
  }
);

export const generateCourseMindMap = createAsyncThunk(
  'syllabus/generateCourseMindMap',
  async (enrollmentId: string | number, { rejectWithValue }) => {
    try {
      const response = await enrollmentAPI.generateMindMap(enrollmentId);
      return response;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to generate mind map'
      );
    }
  }
);

export const generateTopicMindMap = createAsyncThunk(
  'syllabus/generateTopicMindMap',
  async (
    data: {
      lessonId: string | number;
      topicName: string;
      moduleIndex: number;
      topicIndex: number;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await assessmentAPI.generateTopicMindMap({
        lesson_id: data.lessonId,
        topic_name: data.topicName,
      });
      return {
        ...response,
        moduleIndex: data.moduleIndex,
        topicIndex: data.topicIndex,
      };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to generate topic mind map'
      );
    }
  }
);

export const generateTopicContent = createAsyncThunk(
  'syllabus/generateTopicContent',
  async (
    data: {
      enrollmentId: string | number;
      moduleId: string | number;
      topicName: string;
      moduleIndex: number;
      topicIndex: number;
      regenerate?: boolean;
    },
    { rejectWithValue }
  ) => {
    try {
      console.log('🚀 generateTopicContent thunk called with:', data);
      const response = await assessmentAPI.generateTopicContent({
        enrollment_id: data.enrollmentId,
        module_id: data.moduleId,
        topic_name: data.topicName,
        regenerate: data.regenerate,
      });
      return {
        ...response,
        moduleIndex: data.moduleIndex,
        topicIndex: data.topicIndex,
      };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to generate content'
      );
    }
  }
);

export const generateTopicQuiz = createAsyncThunk(
  'syllabus/generateTopicQuiz',
  async (
    data: {
      lessonId: string | number;
      topicName: string;
      moduleIndex: number;
      topicIndex: number;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await assessmentAPI.generateTopicQuiz({
        lesson_id: data.lessonId,
        topic_name: data.topicName,
      });
      return {
        ...response,
        moduleIndex: data.moduleIndex,
        topicIndex: data.topicIndex,
      };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to generate quiz'
      );
    }
  }
);

export const generateDynamicScript = createAsyncThunk(
  'syllabus/generateDynamicScript',
  async (
    data: {
      enrollmentId: string | number;
      moduleId: string | number;
      topicName: string;
      moduleIndex: number;
      topicIndex: number;
      regenerate?: boolean;
    },
    { rejectWithValue }
  ) => {
    try {
      const response: DynamicScriptResponse = await assessmentAPI.generateDynamicScript({
        enrollment_id: data.enrollmentId,
        module_id: data.moduleId,
        topic_name: data.topicName,
        regenerate: data.regenerate,
      });
      return {
        ...response,
        moduleIndex: data.moduleIndex,
        topicIndex: data.topicIndex,
      };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to generate dynamic script'
      );
    }
  }
);

export const evaluateTopicQuiz = createAsyncThunk(
  'syllabus/evaluateTopicQuiz',
  async (
    data: {
      enrollmentId: string | number;
      moduleId: string | number;
      lessonId?: string | number;
      questionIds: Array<string | number>;
      answers: string[];
      moduleIndex: number;
      topicIndex: number;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await assessmentAPI.evaluateTopicQuiz({
        enrollment_id: data.enrollmentId,
        module_id: data.moduleId,
        lesson_id: data.lessonId,
        question_ids: data.questionIds as number[], // Cast to satisfy API interface
        answers: data.answers,
      });
      return {
        ...response,
        moduleIndex: data.moduleIndex,
        topicIndex: data.topicIndex,
      };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to evaluate quiz'
      );
    }
  }
);

export const generateVideo = createAsyncThunk(
  'syllabus/generateVideo',
  async (
    data: {
      topicName: string;
      lessonId?: string | number;
      moduleIndex: number;
      topicIndex: number;
    },
    { rejectWithValue }
  ) => {
    try {
      console.log('🎥 generateVideo thunk called with:', data);
      const response = await videoAPI.generate({
        topic: data.topicName,
        lesson_id: data.lessonId as number, // Cast to satisfy API interface
      });
      console.log('✅ Video API response:', response);
      return {
        taskId: response.task_id,
        moduleIndex: data.moduleIndex,
        topicIndex: data.topicIndex,
      };
    } catch (error: any) {
      console.error('❌ Video generation failed:', error);
      return rejectWithValue(
        error.response?.data?.error || 'Failed to start video generation'
      );
    }
  }
);

export const pollVideoStatus = createAsyncThunk(
  'syllabus/pollVideoStatus',
  async (
    data: {
      taskId: string;
      moduleIndex: number;
      topicIndex: number;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await videoAPI.getStatus(data.taskId);
      console.log('📊 Video status poll response:', response);
      return {
        ...response,
        taskId: data.taskId,
        moduleIndex: data.moduleIndex,
        topicIndex: data.topicIndex,
      };
    } catch (error: any) {
      console.error('❌ Video status poll failed:', error);
      return rejectWithValue(
        error.response?.data?.error || 'Failed to check video status'
      );
    }
  }
);

export const fetchResources = createAsyncThunk(
  'syllabus/fetchResources',
  async (lessonId: string | number, { rejectWithValue }) => {
    try {
      const resources = await resourceAPI.listByLesson(lessonId);
      return { lessonId, resources };
    } catch (error: any) {
      console.error('❌ Failed to fetch resources:', error);
      return rejectWithValue(
        error.response?.data?.error || 'Failed to fetch resources'
      );
    }
  }
);

export const generateRemediationContent = createAsyncThunk(
  'syllabus/generateRemediationContent',
  async (
    data: {
      enrollmentId: string | number;
      lessonId: string | number;
      topicName: string;
      weakAreas: string[];
      moduleIndex: number;
      topicIndex: number;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await assessmentAPI.generateRemediationContent({
        enrollment_id: data.enrollmentId,
        lesson_id: data.lessonId,
        topic_name: data.topicName,
        weak_areas: data.weakAreas,
      });
      return {
        ...response,
        moduleIndex: data.moduleIndex,
        topicIndex: data.topicIndex,
      };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to generate remediation content'
      );
    }
  }
);

export const createNote = createAsyncThunk(
  'syllabus/createNote',
  async (
    data: {
      lessonId: string | number;
      title: string;
      content: string;
      moduleIndex: number;
      topicIndex: number;
    },
    { rejectWithValue }
  ) => {
    try {
      const resource = await resourceAPI.createNote({
        lesson: data.lessonId,
        title: data.title,
        content_text: data.content,
      });
      return {
        resource,
        lessonId: data.lessonId,
        moduleIndex: data.moduleIndex,
        topicIndex: data.topicIndex,
      };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to create note'
      );
    }
  }
);

export const fetchLessonProgress = createAsyncThunk(
  'syllabus/fetchLessonProgress',
  async (enrollmentId: string | number, { rejectWithValue }) => {
    try {
      const progress = await progressAPI.getLessonProgressByEnrollment(enrollmentId);
      return { enrollmentId, progress };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to fetch lesson progress'
      );
    }
  }
);

export const saveLessonCompletion = createAsyncThunk(
  'syllabus/saveLessonCompletion',
  async (
    data: {
      enrollmentId: string | number;
      lessonId: string | number;
      isCompleted: boolean;
      moduleIndex: number;
      topicIndex: number;
    },
    { rejectWithValue }
  ) => {
    try {
      await progressAPI.markLessonComplete({
        enrollment_id: data.enrollmentId,
        lesson_id: data.lessonId,
        is_completed: data.isCompleted,
      });
      return {
        enrollmentId: data.enrollmentId,
        moduleIndex: data.moduleIndex,
        topicIndex: data.topicIndex,
        isCompleted: data.isCompleted,
      };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to save lesson completion'
      );
    }
  }
);

export const fetchQuizAttempts = createAsyncThunk(
  'syllabus/fetchQuizAttempts',
  async (enrollmentId: string | number, { rejectWithValue }) => {
    try {
      const attempts = await assessmentAPI.getQuizAttempts(enrollmentId);
      return { enrollmentId, attempts };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to fetch quiz attempts'
      );
    }
  }
);

// ─── Slice ───────────────────────────────────────────────────────────────────

const syllabusSlice = createSlice({
  name: 'syllabus',
  initialState,
  reducers: {
    clearSyllabus: () => initialState,
    toggleTopicCompletion: (state, action: PayloadAction<TopicKey>) => {
      const key = topicId(state.enrollmentId, action.payload.moduleIndex, action.payload.topicIndex);
      state.topicCompletion[key] = !state.topicCompletion[key];
    },
    markTopicComplete: (state, action: PayloadAction<TopicKey>) => {
      const key = topicId(state.enrollmentId, action.payload.moduleIndex, action.payload.topicIndex);
      state.topicCompletion[key] = true;
    },
    setSyllabusFromEvaluation: (
      state,
      action: PayloadAction<{
        enrollmentId: string | number;
        courseName: string;
        syllabus: Syllabus;
      }>
    ) => {
      state.enrollmentId = action.payload.enrollmentId;
      state.courseName = action.payload.courseName;
      state.syllabus = action.payload.syllabus;
    },
    setActiveResourceView: (
      state,
      action: PayloadAction<{
        moduleIndex: number;
        topicIndex: number;
        view: ActiveResourceView | null;
      }>
    ) => {
      const key = topicId(state.enrollmentId, action.payload.moduleIndex, action.payload.topicIndex);
      if (action.payload.view) {
        state.activeResourceView[key] = action.payload.view;
      } else {
        delete state.activeResourceView[key];
      }
    },
  },
  extraReducers: (builder) => {
    // fetchSyllabus
    builder
      .addCase(fetchSyllabus.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSyllabus.fulfilled, (state, action) => {
        state.loading = false;
        state.enrollmentId = action.payload.enrollment_id;
        state.courseName = action.payload.course_name;
        state.syllabus = action.payload.syllabus;
        state.generatedByModel = action.payload.generated_by_model;
      })
      .addCase(fetchSyllabus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // generateTopicContent
    builder
      .addCase(generateTopicContent.pending, (state, action) => {
        const key = topicId(state.enrollmentId, action.meta.arg.moduleIndex, action.meta.arg.topicIndex);
        state.contentLoading[key] = true;
      })
      .addCase(generateTopicContent.fulfilled, (state, action) => {
        const key = topicId(state.enrollmentId, action.payload.moduleIndex, action.payload.topicIndex);
        state.contentLoading[key] = false;
        state.generatedContent[key] = {
          lessonId: action.payload.lesson_id,
          content: action.payload.content,
          generatedAt: new Date().toISOString(),
        };
      })
      .addCase(generateTopicContent.rejected, (state, action) => {
        const key = topicId(state.enrollmentId, action.meta.arg.moduleIndex, action.meta.arg.topicIndex);
        state.contentLoading[key] = false;
        state.contentErrors[key] = action.payload as string;
      });

    // generateTopicQuiz
    builder
      .addCase(generateTopicQuiz.pending, (state, action) => {
        const key = topicId(state.enrollmentId, action.meta.arg.moduleIndex, action.meta.arg.topicIndex);
        state.quizLoading[key] = true;
      })
      .addCase(generateTopicQuiz.fulfilled, (state, action) => {
        const key = topicId(state.enrollmentId, action.payload.moduleIndex, action.payload.topicIndex);
        state.quizLoading[key] = false;
        state.generatedQuizzes[key] = {
          questions: action.payload.questions,
          generatedAt: new Date().toISOString(),
        };
      })
      .addCase(generateTopicQuiz.rejected, (state, action) => {
        const key = topicId(state.enrollmentId, action.meta.arg.moduleIndex, action.meta.arg.topicIndex);
        state.quizLoading[key] = false;
      });

    // generateDynamicScript
    builder
      .addCase(generateDynamicScript.pending, (state, action) => {
        const key = topicId(state.enrollmentId, action.meta.arg.moduleIndex, action.meta.arg.topicIndex);
        state.dynamicScriptLoading[key] = true;
        delete state.dynamicScriptErrors[key];
      })
      .addCase(generateDynamicScript.fulfilled, (state, action) => {
        const key = topicId(state.enrollmentId, action.payload.moduleIndex, action.payload.topicIndex);
        state.dynamicScriptLoading[key] = false;
        state.generatedDynamicScripts[key] = {
          lessonId: action.payload.lesson_id,
          schemaVersion: action.payload.schema_version,
          title: action.payload.title,
          overview: action.payload.overview,
          blocks: action.payload.blocks,
          generatedAt: new Date().toISOString(),
        };
      })
      .addCase(generateDynamicScript.rejected, (state, action) => {
        const key = topicId(state.enrollmentId, action.meta.arg.moduleIndex, action.meta.arg.topicIndex);
        state.dynamicScriptLoading[key] = false;
        state.dynamicScriptErrors[key] = action.payload as string;
      });

    // evaluateTopicQuiz
    builder
      .addCase(evaluateTopicQuiz.pending, (state, action) => {
        const key = topicId(state.enrollmentId, action.meta.arg.moduleIndex, action.meta.arg.topicIndex);
        state.quizEvaluating[key] = true;
      })
      .addCase(evaluateTopicQuiz.fulfilled, (state, action) => {
        const key = topicId(state.enrollmentId, action.payload.moduleIndex, action.payload.topicIndex);
        state.quizEvaluating[key] = false;
        state.quizResults[key] = {
          score: action.payload.evaluation.score,
          scorePercent: action.payload.evaluation.score_percent,
          correctCount: action.payload.evaluation.correct_count,
          totalQuestions: action.payload.evaluation.total_questions,
          weakAreas: action.payload.evaluation.weak_areas,
        };
      })
      .addCase(evaluateTopicQuiz.rejected, (state, action) => {
        const key = topicId(state.enrollmentId, action.meta.arg.moduleIndex, action.meta.arg.topicIndex);
        state.quizEvaluating[key] = false;
      });

    // generateVideo
    builder
      .addCase(generateVideo.pending, (state, action) => {
        const key = topicId(state.enrollmentId, action.meta.arg.moduleIndex, action.meta.arg.topicIndex);
        state.videoLoading[key] = true;
      })
      .addCase(generateVideo.fulfilled, (state, action) => {
        const key = topicId(state.enrollmentId, action.payload.moduleIndex, action.payload.topicIndex);
        state.videoLoading[key] = false;
        state.videoTasks[key] = {
          taskId: action.payload.taskId,
          status: 'pending',
        };
      })
      .addCase(generateVideo.rejected, (state, action) => {
        const key = topicId(state.enrollmentId, action.meta.arg.moduleIndex, action.meta.arg.topicIndex);
        state.videoLoading[key] = false;
      });

    // pollVideoStatus
    builder.addCase(pollVideoStatus.fulfilled, (state, action) => {
      const key = topicId(state.enrollmentId, action.payload.moduleIndex, action.payload.topicIndex);
      const existing = state.videoTasks[key];
      console.log('🔄 Updating video task for key:', key);
      console.log('📦 Payload:', action.payload);
      console.log('🎯 Current task:', existing);

      if (existing) {
        existing.status = action.payload.status;
        console.log('📝 Updated status to:', action.payload.status);

        if (action.payload.status === 'completed') {
          existing.videoUrl = action.payload.video_url;
          console.log('✅ Video completed! URL:', action.payload.video_url);
        }
        if (action.payload.status === 'failed') {
          existing.error = action.payload.error_message || action.payload.error || 'Video generation failed';
          console.log('❌ Video failed:', existing.error);
        }
      } else {
        console.warn('⚠️ No existing video task found for key:', key);
      }
    });

    // fetchResources
    builder
      .addCase(fetchResources.pending, (state, action) => {
        state.resourcesLoading[action.meta.arg] = true;
      })
      .addCase(fetchResources.fulfilled, (state, action) => {
        state.resourcesLoading[action.payload.lessonId] = false;
        state.resources[action.payload.lessonId] = action.payload.resources;
      })
      .addCase(fetchResources.rejected, (state, action) => {
        state.resourcesLoading[action.meta.arg] = false;
      });

    // generateRemediationContent
    builder
      .addCase(generateRemediationContent.pending, (state, action) => {
        const key = topicId(state.enrollmentId, action.meta.arg.moduleIndex, action.meta.arg.topicIndex);
        state.remediationLoading[key] = true;
      })
      .addCase(generateRemediationContent.fulfilled, (state, action) => {
        const key = topicId(state.enrollmentId, action.payload.moduleIndex, action.payload.topicIndex);
        state.remediationLoading[key] = false;
        const notes = action.payload.remediation_notes.map((note: any) => ({
          sub_topic: note.sub_topic,
          content: note.content,
          generatedAt: new Date().toISOString(),
        }));
        // Append to existing remediation notes (don't overwrite)
        const existing = state.remediationContent[key] || [];
        state.remediationContent[key] = [...existing, ...notes];
      })
      .addCase(generateRemediationContent.rejected, (state, action) => {
        const key = topicId(state.enrollmentId, action.meta.arg.moduleIndex, action.meta.arg.topicIndex);
        state.remediationLoading[key] = false;
      });

    // createNote — add the new resource into the resources array for the lesson
    builder
      .addCase(createNote.fulfilled, (state, action) => {
        const { resource, lessonId } = action.payload;
        const existing = state.resources[lessonId] || [];
        state.resources[lessonId] = [...existing, resource];
      });

    // fetchLessonProgress — load completion status from backend
    builder
      .addCase(fetchLessonProgress.fulfilled, (state, action) => {
        const { enrollmentId, progress } = action.payload;
        // progress is an array of { enrollment, lesson, is_completed, lesson_title, module_id }
        progress.forEach((item: any) => {
          // We need to find the module and topic indices from the lesson
          // For now, we'll store by lesson ID and reconstruct the key when needed
          if (!state.syllabus) return;
          
          // Find the module and topic indices for this lesson
          let found = false;
          state.syllabus.modules.forEach((module, mIdx) => {
            module.topics.forEach((topic, tIdx) => {
              // Assuming topic has a lesson_id or we match by title
              // This is simplified - you may need to adjust based on your data structure
              if (topic.topic_name === item.lesson_title) {
                const key = topicId(enrollmentId, mIdx, tIdx);
                state.topicCompletion[key] = item.is_completed;
                found = true;
              }
            });
          });
        });
      });

    // saveLessonCompletion — update local state after saving to backend
    builder
      .addCase(saveLessonCompletion.fulfilled, (state, action) => {
        const { enrollmentId, moduleIndex, topicIndex, isCompleted } = action.payload;
        const key = topicId(enrollmentId, moduleIndex, topicIndex);
        state.topicCompletion[key] = isCompleted;
      });

    // fetchQuizAttempts — populate quiz results from database
    builder
      .addCase(fetchQuizAttempts.fulfilled, (state, action) => {
        const { enrollmentId, attempts } = action.payload;
        
        // attempts is an array of { id, enrollment, module, lesson, score_percent, ... }
        // We need to map lesson.id to moduleIndex/topicIndex using generatedContent
        attempts.forEach((attempt: any) => {
          if (!attempt.lesson?.id || !state.syllabus) return;
          
          // Find the topic by matching lesson ID in generatedContent
          Object.entries(state.generatedContent).forEach(([topicKey, content]) => {
            if (content.lessonId === attempt.lesson.id) {
              // This is the correct topic for this quiz attempt
              state.quizResults[topicKey] = {
                score: `${attempt.correct_answers}/${attempt.total_questions}`,
                scorePercent: parseFloat(attempt.score_percent),
                correctCount: attempt.correct_answers,
                totalQuestions: attempt.total_questions,
                weakAreas: attempt.weak_areas || [],
              };
            }
          });
        });
      });

    // generateCourseMindMap
    builder
      .addCase(generateCourseMindMap.pending, (state) => {
        state.mindMapLoading = true;
      })
      .addCase(generateCourseMindMap.fulfilled, (state, action) => {
        state.mindMapLoading = false;
        state.mindMapData = action.payload;
      })
      .addCase(generateCourseMindMap.rejected, (state, action) => {
        state.mindMapLoading = false;
        state.error = action.payload as string;
      });

    // generateTopicMindMap
    builder
      .addCase(generateTopicMindMap.pending, (state, action) => {
        const key = topicId(state.enrollmentId, action.meta.arg.moduleIndex, action.meta.arg.topicIndex);
        state.topicMindMapLoading[key] = true;
      })
      .addCase(generateTopicMindMap.fulfilled, (state, action) => {
        const key = topicId(state.enrollmentId, action.payload.moduleIndex, action.payload.topicIndex);
        state.topicMindMapLoading[key] = false;
        state.topicMindMapData[key] = action.payload;
      })
      .addCase(generateTopicMindMap.rejected, (state, action) => {
        const key = topicId(state.enrollmentId, action.meta.arg.moduleIndex, action.meta.arg.topicIndex);
        state.topicMindMapLoading[key] = false;
      });
  },
});

export const {
  clearSyllabus,
  toggleTopicCompletion,
  markTopicComplete,
  setSyllabusFromEvaluation,
  setActiveResourceView,
} = syllabusSlice.actions;

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectTopicContent = (
  state: { syllabus: SyllabusState },
  moduleIndex: number,
  topicIndex: number
) => state.syllabus.generatedContent[topicId(state.syllabus.enrollmentId, moduleIndex, topicIndex)];

export const selectTopicQuiz = (
  state: { syllabus: SyllabusState },
  moduleIndex: number,
  topicIndex: number
) => state.syllabus.generatedQuizzes[topicId(state.syllabus.enrollmentId, moduleIndex, topicIndex)];

export const selectDynamicScript = (
  state: { syllabus: SyllabusState },
  moduleIndex: number,
  topicIndex: number
) => state.syllabus.generatedDynamicScripts[topicId(state.syllabus.enrollmentId, moduleIndex, topicIndex)] || null;

export const selectDynamicScriptLoading = (
  state: { syllabus: SyllabusState },
  moduleIndex: number,
  topicIndex: number
) => !!state.syllabus.dynamicScriptLoading[topicId(state.syllabus.enrollmentId, moduleIndex, topicIndex)];

export const selectDynamicScriptError = (
  state: { syllabus: SyllabusState },
  moduleIndex: number,
  topicIndex: number
) => state.syllabus.dynamicScriptErrors[topicId(state.syllabus.enrollmentId, moduleIndex, topicIndex)] || null;

export const selectQuizResult = (
  state: { syllabus: SyllabusState },
  moduleIndex: number,
  topicIndex: number
) => state.syllabus.quizResults[topicId(state.syllabus.enrollmentId, moduleIndex, topicIndex)];

export const selectVideoTask = (
  state: { syllabus: SyllabusState },
  moduleIndex: number,
  topicIndex: number
) => state.syllabus.videoTasks[topicId(state.syllabus.enrollmentId, moduleIndex, topicIndex)];

export const selectResources = (
  state: { syllabus: SyllabusState },
  lessonId: number
) => state.syllabus.resources[lessonId] || [];

export const selectIsTopicComplete = (
  state: { syllabus: SyllabusState },
  moduleIndex: number,
  topicIndex: number
) => !!state.syllabus.topicCompletion[topicId(state.syllabus.enrollmentId, moduleIndex, topicIndex)];

export const selectRemediationContent = (
  state: { syllabus: SyllabusState },
  moduleIndex: number,
  topicIndex: number
) => state.syllabus.remediationContent[topicId(state.syllabus.enrollmentId, moduleIndex, topicIndex)] || [];

export const selectTopicContentError = (
  state: { syllabus: SyllabusState },
  moduleIndex: number,
  topicIndex: number
) => state.syllabus.contentErrors[topicId(state.syllabus.enrollmentId, moduleIndex, topicIndex)];

export const selectRemediationLoading = (
  state: { syllabus: SyllabusState },
  moduleIndex: number,
  topicIndex: number
) => !!state.syllabus.remediationLoading[topicId(state.syllabus.enrollmentId, moduleIndex, topicIndex)];

/**
 * A module is unlocked if:
 *  - It is module 0 (always unlocked), OR
 *  - ALL topics in the previous module are completed
 * 
 * Note: Users can complete topics even with scores below 80% by clicking "Continue Anyway"
 */
export const selectIsModuleUnlocked = (
  state: { syllabus: SyllabusState },
  moduleIndex: number
): boolean => {
  if (moduleIndex === 0) return true;

  const { syllabus, topicCompletion, enrollmentId } = state.syllabus;
  if (!syllabus) return false;

  const prevModule = syllabus.modules[moduleIndex - 1];
  if (!prevModule) return false;

  // Every topic in the previous module must be completed
  for (let t = 0; t < prevModule.topics.length; t++) {
    const key = topicId(enrollmentId, moduleIndex - 1, t);
    if (!topicCompletion[key]) return false;
  }

  return true;
};

/**
 * Returns the best (highest) quiz score percent for the given module,
 * looking at all topic-level quizResults within that module.
 * Returns undefined if no quiz has been taken yet.
 */
export const selectModuleBestScore = (
  state: { syllabus: SyllabusState },
  moduleIndex: number
): number | undefined => {
  const { syllabus, quizResults, enrollmentId } = state.syllabus;
  if (!syllabus) return undefined;
  const mod = syllabus.modules[moduleIndex];
  if (!mod) return undefined;

  let best: number | undefined;
  for (let t = 0; t < mod.topics.length; t++) {
    const result = quizResults[topicId(enrollmentId, moduleIndex, t)];
    if (result) {
      if (best === undefined || result.scorePercent > best) {
        best = result.scorePercent;
      }
    }
  }
  return best;
};

export const selectActiveResourceView = (
  state: { syllabus: SyllabusState },
  moduleIndex: number,
  topicIndex: number
): ActiveResourceView | null =>
  state.syllabus.activeResourceView[topicId(state.syllabus.enrollmentId, moduleIndex, topicIndex)] || null;

export const selectMindMapData = (state: { syllabus: SyllabusState }) => state.syllabus.mindMapData;
export const selectMindMapLoading = (state: { syllabus: SyllabusState }) => state.syllabus.mindMapLoading;

export const selectTopicMindMapData = (state: { syllabus: SyllabusState }, moduleIndex: number, topicIndex: number) =>
  state.syllabus.topicMindMapData[topicId(state.syllabus.enrollmentId, moduleIndex, topicIndex)] || null;
export const selectTopicMindMapLoading = (state: { syllabus: SyllabusState }, moduleIndex: number, topicIndex: number) =>
  !!state.syllabus.topicMindMapLoading[topicId(state.syllabus.enrollmentId, moduleIndex, topicIndex)];

export default syllabusSlice.reducer;
