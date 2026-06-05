import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  FileText,
  ListChecks,
  Video,
  Headphones,
  Sparkles,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  CheckCircle2,
  MessageSquare,
  Wrench,
  Plus,
  Network,
  Code2,
  Play,
  Sparkle,
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import { codingAPI } from '../../services/api';
import type { CodingProblem, CodeSubmission, Resource } from '../../types/api';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  generateTopicContent,
  generateTopicQuiz,
  generateVideo,
  pollVideoStatus,
  fetchResources,
  selectResources,
  setActiveResourceView,
  generateCourseMindMap,
  selectMindMapData,
  selectMindMapLoading,
  generateTopicMindMap,
  selectTopicMindMapData,
  selectTopicMindMapLoading,
  generateDynamicScript,
  selectDynamicScript,
  selectDynamicScriptLoading,
  selectDynamicScriptError,
} from '../../store/slices/syllabusSlice';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { cn } from './ui/utils';
import { PodcastDialog } from './ui/podcast-dialog';
import { ChatPanel } from './ChatPanel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { MindMapViewer } from './MindMapViewer';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ui/resizable';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';

interface StudioPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface CodeRunnerState {
  problem: CodingProblem | null;
  code: string;
  loading: boolean;
  submitting: boolean;
  submission: CodeSubmission | null;
  error: string | null;
}

export function StudioPanel({ collapsed, onToggle }: StudioPanelProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { enrollmentId, moduleIndex, topicIndex } = useParams();
  const eId = enrollmentId || null;
  const mIdx = moduleIndex ? parseInt(moduleIndex) : -1;
  const tIdx = topicIndex ? parseInt(topicIndex) : -1;
  const topicKey = `${eId}-${mIdx}-${tIdx}`;
  const isTopicView = mIdx >= 0 && tIdx >= 0;

  const {
    syllabus,
    generatedContent,
    generatedQuizzes,
    videoTasks,
    contentLoading,
    quizLoading,
    videoLoading,
  } = useAppSelector((state) => state.syllabus);

  const content = generatedContent[topicKey];
  const quiz = generatedQuizzes[topicKey];
  const videoTask = videoTasks[topicKey];
  const isContentLoading = !!contentLoading[topicKey];
  const isQuizLoading = !!quizLoading[topicKey];
  const isVideoLoading = !!videoLoading[topicKey];
  const dynamicScript = useAppSelector((state) =>
    isTopicView ? selectDynamicScript(state, mIdx, tIdx) : null
  );
  const isDynamicScriptLoading = useAppSelector((state) =>
    isTopicView ? selectDynamicScriptLoading(state, mIdx, tIdx) : false
  );
  const dynamicScriptError = useAppSelector((state) =>
    isTopicView ? selectDynamicScriptError(state, mIdx, tIdx) : null
  );

  // Get resources from database
  const resources = useAppSelector((state) =>
    content?.lessonId ? selectResources(state, content.lessonId) : []
  );

  // Quiz answer state
  const [podcastDialogOpen, setPodcastDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'studio' | 'chat'>('studio');
  const [generatedPodcast, setGeneratedPodcast] = useState<{
    audioUrl: string;
    personas: { person1: string; person2: string };
    scenario: string;
    generatedAt: string;
  } | null>(null);

  const mindMapData = useAppSelector(selectMindMapData);
  const isMindMapLoading = useAppSelector(selectMindMapLoading);
  const [mindMapDialogOpen, setMindMapDialogOpen] = useState(false);
  const [activeMindMapData, setActiveMindMapData] = useState<any>(null); // Course or Topic
  const [activeMindMapTitle, setActiveMindMapTitle] = useState('Mind Map');
  const [codingProblem, setCodingProblem] = useState<CodingProblem | null>(null);
  const [codingLoading, setCodingLoading] = useState(false);
  const [codingDialogOpen, setCodingDialogOpen] = useState(false);
  const [codingError, setCodingError] = useState<string | null>(null);
  const [sampleCodeLoading, setSampleCodeLoading] = useState(false);
  const [sampleCodeError, setSampleCodeError] = useState<string | null>(null);
  const [dynamicScriptDialogOpen, setDynamicScriptDialogOpen] = useState(false);
  const [runnerStateByBlock, setRunnerStateByBlock] = useState<Record<number, CodeRunnerState>>({});

  // Topic specific mind map state
  const topicMindMapData = useAppSelector(state => isTopicView ? selectTopicMindMapData(state, mIdx, tIdx) : null);
  const isTopicMindMapLoading = useAppSelector(state => isTopicView ? selectTopicMindMapLoading(state, mIdx, tIdx) : false);

  const handleGenerateMindMap = useCallback(() => {
    if (!eId) return;
    dispatch(generateCourseMindMap(eId));
  }, [dispatch, eId]);

  // Poll video status
  useEffect(() => {
    if (!videoTask || !isTopicView) return;
    if (videoTask.status === 'completed' || videoTask.status === 'failed') return;

    const interval = setInterval(() => {
      dispatch(
        pollVideoStatus({
          taskId: videoTask.taskId,
          moduleIndex: mIdx,
          topicIndex: tIdx,
        })
      );
    }, 5000);

    return () => clearInterval(interval);
  }, [videoTask, dispatch, mIdx, tIdx, isTopicView]);

  // Fetch resources when content is loaded
  useEffect(() => {
    if (content?.lessonId && resources.length === 0) {
      dispatch(fetchResources(content.lessonId));
    }
  }, [content?.lessonId, dispatch, resources.length]);

  // Refetch resources when video completes
  useEffect(() => {
    if (videoTask?.status === 'completed' && content?.lessonId) {
      // Wait a bit for the resource to be created in the database
      const timer = setTimeout(() => {
        dispatch(fetchResources(content.lessonId));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [videoTask?.status, content?.lessonId, dispatch]);

  const currentTopic = syllabus?.modules[mIdx]?.topics[tIdx];
  const currentModule = syllabus?.modules[mIdx];

  // ─── Handler Functions ─────────────────────────────────────────────────────

  const handleGenerateContent = useCallback((regenerate: boolean = false) => {
    if (!eId || !currentModule || !currentTopic) return;
    dispatch(
      generateTopicContent({
        enrollmentId: eId,
        moduleId: mIdx + 1,
        topicName: currentTopic.topic_name,
        moduleIndex: mIdx,
        topicIndex: tIdx,
        regenerate,
      })
    );
  }, [dispatch, eId, currentModule, currentTopic, mIdx, tIdx]);

  const handleGenerateQuiz = useCallback(() => {
    if (!content || !currentTopic) return;
    dispatch(
      generateTopicQuiz({
        lessonId: content.lessonId,
        topicName: currentTopic.topic_name,
        moduleIndex: mIdx,
        topicIndex: tIdx,
      })
    );
  }, [dispatch, content, currentTopic, mIdx, tIdx]);

  const handleGenerateVideo = useCallback(() => {
    console.log('🎬 handleGenerateVideo called');
    console.log('📍 currentTopic:', currentTopic);
    console.log('📍 mIdx:', mIdx, 'tIdx:', tIdx);
    console.log('📍 content:', content);

    if (!currentTopic) {
      console.error('❌ currentTopic is undefined, cannot generate video');
      return;
    }

    console.log('✅ Dispatching generateVideo with:', {
      topicName: currentTopic.topic_name,
      lessonId: content?.lessonId,
      moduleIndex: mIdx,
      topicIndex: tIdx,
    });

    dispatch(
      generateVideo({
        topicName: currentTopic.topic_name,
        lessonId: content?.lessonId,
        moduleIndex: mIdx,
        topicIndex: tIdx,
      })
    );
  }, [dispatch, currentTopic, content, mIdx, tIdx]);

  const handleGeneratePodcast = useCallback(() => {
    if (!content) return;
    setPodcastDialogOpen(true);
  }, [content]);

  const handleGenerateTopicMindMap = useCallback(() => {
    if (!content || !currentTopic) return;
    dispatch(
      generateTopicMindMap({
        lessonId: content.lessonId,
        topicName: currentTopic.topic_name,
        moduleIndex: mIdx,
        topicIndex: tIdx,
      })
    );
  }, [dispatch, content, currentTopic, mIdx, tIdx]);

  const handleGenerateCodingAssessment = useCallback(async () => {
    if (!eId || !currentTopic) return;

    setCodingLoading(true);
    setCodingError(null);

    try {
      const problem = await codingAPI.generateProblem({
        enrollment_id: eId,
        module_id: mIdx + 1,
        topic_name: currentTopic.topic_name,
        regenerate: !!codingProblem,
      });

      setCodingProblem(problem);
      if (mIdx >= 0 && tIdx >= 0) {
        navigate(`/course/${eId}/module/${mIdx}/topic/${tIdx}/coding/${problem.id}`);
      } else {
        setCodingDialogOpen(true);
      }

      if (problem.lesson) {
        dispatch(fetchResources(problem.lesson));
      } else if (content?.lessonId) {
        dispatch(fetchResources(content.lessonId));
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        'Failed to generate coding assessment';
      setCodingError(message);
    } finally {
      setCodingLoading(false);
    }
  }, [eId, currentTopic, mIdx, codingProblem, content?.lessonId, dispatch]);

  const handleGenerateDynamicScript = useCallback(async () => {
    if (!eId || !currentTopic) return;

    const action = await dispatch(
      generateDynamicScript({
        enrollmentId: eId,
        moduleId: mIdx + 1,
        topicName: currentTopic.topic_name,
        moduleIndex: mIdx,
        topicIndex: tIdx,
        regenerate: !!dynamicScript,
      })
    );

    if (generateDynamicScript.fulfilled.match(action)) {
      dispatch(
        setActiveResourceView({
          moduleIndex: mIdx,
          topicIndex: tIdx,
          view: { type: 'dynamic-script' },
        })
      );
      setRunnerStateByBlock({});
      dispatch(fetchResources(action.payload.lesson_id));
    }
  }, [dispatch, eId, currentTopic, mIdx, tIdx, dynamicScript]);

  const handleGenerateSampleCode = useCallback(async () => {
    if (!eId || !currentTopic) return;

    setSampleCodeLoading(true);
    setSampleCodeError(null);
    try {
      const resource = await codingAPI.generateSampleCode({
        enrollment_id: eId,
        module_id: mIdx + 1,
        topic_name: currentTopic.topic_name,
      });

      if (resource.lesson) {
        dispatch(fetchResources(resource.lesson));
      } else if (content?.lessonId) {
        dispatch(fetchResources(content.lessonId));
      }

      dispatch(
        setActiveResourceView({
          moduleIndex: mIdx,
          topicIndex: tIdx,
          view: { type: 'code', resourceId: resource.id },
        })
      );
    } catch (error: any) {
      setSampleCodeError(
        error?.response?.data?.error || error?.message || 'Failed to generate sample code'
      );
    } finally {
      setSampleCodeLoading(false);
    }
  }, [eId, currentTopic, mIdx, content?.lessonId, dispatch]);

  const getRunnerState = useCallback(
    (blockIndex: number): CodeRunnerState => {
      return (
        runnerStateByBlock[blockIndex] || {
          problem: null,
          code: '',
          loading: false,
          submitting: false,
          submission: null,
          error: null,
        }
      );
    },
    [runnerStateByBlock]
  );

  const prepareCodeRunner = useCallback(
    async (blockIndex: number, prompt: string) => {
      if (!eId || !currentTopic) return;

      setRunnerStateByBlock((prev) => ({
        ...prev,
        [blockIndex]: {
          ...getRunnerState(blockIndex),
          loading: true,
          error: null,
        },
      }));

      try {
        const problem = await codingAPI.generateProblem({
          enrollment_id: eId,
          module_id: mIdx + 1,
          topic_name: `${currentTopic.topic_name} - ${prompt.slice(0, 80)}`,
          regenerate: false,
        });

        setRunnerStateByBlock((prev) => ({
          ...prev,
          [blockIndex]: {
            ...getRunnerState(blockIndex),
            loading: false,
            problem,
            code: problem.starter_code || '',
            submission: null,
            error: null,
          },
        }));
      } catch (error: any) {
        setRunnerStateByBlock((prev) => ({
          ...prev,
          [blockIndex]: {
            ...getRunnerState(blockIndex),
            loading: false,
            error:
              error?.response?.data?.error ||
              error?.message ||
              'Failed to initialize code runner',
          },
        }));
      }
    },
    [eId, currentTopic, mIdx, getRunnerState]
  );

  const runCodeBlock = useCallback(
    async (blockIndex: number) => {
      if (!eId) return;
      const current = getRunnerState(blockIndex);
      if (!current.problem || !current.code.trim()) return;

      setRunnerStateByBlock((prev) => ({
        ...prev,
        [blockIndex]: {
          ...current,
          submitting: true,
          error: null,
        },
      }));

      try {
        const result = await codingAPI.submitCode({
          enrollment_id: eId,
          problem_id: current.problem.id,
          source_code: current.code,
          language: 'python',
        });

        setRunnerStateByBlock((prev) => ({
          ...prev,
          [blockIndex]: {
            ...getRunnerState(blockIndex),
            submitting: false,
            submission: result.submission,
            error: null,
          },
        }));
      } catch (error: any) {
        setRunnerStateByBlock((prev) => ({
          ...prev,
          [blockIndex]: {
            ...getRunnerState(blockIndex),
            submitting: false,
            error: error?.response?.data?.error || error?.message || 'Failed to run code',
          },
        }));
      }
    },
    [eId, getRunnerState]
  );

  const updateCodeBlockSource = useCallback((blockIndex: number, code: string) => {
    setRunnerStateByBlock((prev) => ({
      ...prev,
      [blockIndex]: {
        ...getRunnerState(blockIndex),
        code,
      },
    }));
  }, [getRunnerState]);

  const summarizeError = (raw: string): string => {
    if (!raw) return 'Execution failed.';
    const syntax = raw.match(/SyntaxError:\s*(.+)/i);
    if (syntax?.[1]) return `SyntaxError: ${syntax[1]}`;
    const attribute = raw.match(/AttributeError:\s*(.+)/i);
    if (attribute?.[1]) return `AttributeError: ${attribute[1]}`;
    const typeErr = raw.match(/TypeError:\s*(.+)/i);
    if (typeErr?.[1]) return `TypeError: ${typeErr[1]}`;
    const valueErr = raw.match(/ValueError:\s*(.+)/i);
    if (valueErr?.[1]) return `ValueError: ${valueErr[1]}`;
    return raw.split('\n').filter(Boolean).slice(-1)[0] || 'Execution failed.';
  };

  const handleOpenCodingResource = useCallback(async (resource: Resource) => {
    const problemId = resource.content_json?.coding_problem_id;
    if (!problemId) return;

    setCodingLoading(true);
    setCodingError(null);
    try {
      const problem = await codingAPI.getProblem(problemId);
      setCodingProblem(problem);
      if (eId !== null && mIdx >= 0 && tIdx >= 0) {
        navigate(`/course/${eId}/module/${mIdx}/topic/${tIdx}/coding/${problem.id}`);
      } else {
        setCodingDialogOpen(true);
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        'Failed to open coding assessment';
      setCodingError(message);
    } finally {
      setCodingLoading(false);
    }
  }, []);

  const openMindMapDialog = (data: any, title: string) => {
    setActiveMindMapData(data);
    setActiveMindMapTitle(title);
    setMindMapDialogOpen(true);
  };

  // Reset podcast when topic changes
  useEffect(() => {
    setGeneratedPodcast(null);
    setRunnerStateByBlock({});
    setDynamicScriptDialogOpen(false);
  }, [topicKey]);

  // ─── Collapsed state ──────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <div className="w-14 bg-[#fcfbf9] border-l border-black/10 flex flex-col items-center pt-4 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="text-gray-500 hover:text-gray-900 hover:bg-gray-100"
        >
          <PanelRightOpen className="w-5 h-5" />
        </Button>
      </div>
    );
  }

  // ─── Tool card component ───────────────────────────────────────────────────

  const ToolCard = ({
    icon: Icon,
    label,
    bgColor,
    hasData,
    isLoading,
    onGenerate,
    disabled,
    children,
  }: {
    icon: React.ElementType;
    label: string;
    bgColor: string;
    hasData: boolean;
    isLoading: boolean;
    onGenerate: () => void;
    disabled?: boolean;
    children?: React.ReactNode;
  }) => {
    return (
      <div className={cn('rounded-2xl border border-black/10 p-3.5 space-y-3.5 shadow-sm', bgColor)}>
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-neutral-900 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-900">{label}</p>
            {hasData && (
              <p className="text-[10px] text-neutral-500">Generated</p>
            )}
          </div>
          {hasData && (
            <CheckCircle2 className="w-4 h-4 text-neutral-700" />
          )}
        </div>

        {/* Content */}
        {hasData && (
          <div className="bg-neutral-100 rounded-lg p-3 space-y-3">
            {children}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-4 text-neutral-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Generating...</span>
          </div>
        )}

        {/* Generate Button - Always show when not loading */}
        {!isLoading && !disabled && (
          <Button
            size="sm"
            onClick={onGenerate}
            className="w-full bg-neutral-900 hover:bg-neutral-800 text-white border-0"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {hasData ? `Generate New ${label}` : `Generate ${label}`}
          </Button>
        )}

        {!isLoading && disabled && (
          <Button
            size="sm"
            disabled
            className="w-full bg-neutral-200 text-neutral-500 border-0 cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Generate {label}
          </Button>
        )}
      </div>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <aside className="w-[22rem] bg-[#fcfbf9] border-l border-black/10 flex flex-col h-full shrink-0">
      {/* Header with Tab Toggle */}
      <div className="p-4 border-b border-black/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1 bg-black/[0.04] rounded-xl p-0.5">
            <button
              onClick={() => setActiveTab('studio')}
              className={cn(
                 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                activeTab === 'studio'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Wrench className="w-3.5 h-3.5" />
              Studio
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                activeTab === 'chat'
                  ? 'bg-neutral-900 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat
            </button>
          </div>
           <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 h-7 w-7"
          >
            <PanelRightClose className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Chat Tab */}
      {activeTab === 'chat' ? (
        <ChatPanel
          context={content?.content || ''}
          topicName={currentTopic?.topic_name || ''}
          courseName={syllabus?.course_name || ''}
          hasContent={!!content}
          enrollmentId={eId ?? undefined}
        />
      ) : (
        /* Studio Tab */
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-3">
            {!isTopicView ? (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-xl p-3 mb-4 border border-gray-100">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                    Course Overview
                  </p>
                  <p className="text-sm text-gray-900 font-medium">
                    {syllabus?.course_name || 'Course Dashboard'}
                  </p>
                </div>

                <ToolCard
                  icon={Network}
                  label="Course Mind Map"
                  bgColor="bg-white"
                  hasData={!!mindMapData}
                  isLoading={isMindMapLoading}
                  onGenerate={handleGenerateMindMap}
                />

                {mindMapData && (
                  <div className="pt-4 border-t border-gray-100 space-y-2">
                    <button
                      onClick={() => setMindMapDialogOpen(true)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                    >
                      <Network className="w-4 h-4 text-neutral-700 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate">
                          Course Mind Map
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {mindMapData.level}
                        </p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Current topic info */}
                <div className="bg-gray-50 rounded-xl p-3 mb-4 border border-gray-100">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                    Current Topic
                  </p>
                  <p className="text-sm text-gray-900 font-medium">
                    {currentTopic?.topic_name || 'Unknown Topic'}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">Generate</p>
                </div>
                {/* Tool Cards Grid */}
                <ToolCard
                  icon={FileText}
                  label="Notes"
                  bgColor="bg-white"
                  hasData={!!content}
                  isLoading={isContentLoading}
                  onGenerate={() => handleGenerateContent(!!content)}
                />

                <ToolCard
                  icon={ListChecks}
                  label="Quiz"
                  bgColor="bg-white"
                  hasData={!!quiz}
                  isLoading={isQuizLoading}
                  onGenerate={handleGenerateQuiz}
                  disabled={!content}
                />

                <ToolCard
                  icon={Video}
                  label="Video"
                  bgColor="bg-white"
                  hasData={
                    videoTask?.status === 'completed' ||
                    resources.some(r => r.resource_type === 'video')
                  }
                  isLoading={
                    isVideoLoading ||
                    videoTask?.status === 'pending' ||
                    videoTask?.status === 'processing'
                  }
                  onGenerate={handleGenerateVideo}
                />

                <ToolCard
                  icon={Headphones}
                  label="Podcast"
                  bgColor="bg-white"
                  hasData={
                    !!generatedPodcast ||
                    resources.some(r => r.resource_type === 'audio')
                  }
                  isLoading={false}
                  onGenerate={handleGeneratePodcast}
                  disabled={!content}
                />

                <ToolCard
                  icon={Network}
                  label="Mind Map"
                  bgColor="bg-white"
                  hasData={!!topicMindMapData}
                  isLoading={isTopicMindMapLoading}
                  onGenerate={handleGenerateTopicMindMap}
                  disabled={!content}
                />

                <ToolCard
                  icon={Code2}
                  label="Try Yourself"
                  bgColor="bg-white"
                  hasData={
                    !!codingProblem ||
                    resources.some((r) => r.resource_type === 'code_exercise')
                  }
                  isLoading={codingLoading}
                  onGenerate={handleGenerateCodingAssessment}
                >
                  {codingProblem && (
                    <p className="text-[11px] text-neutral-700 line-clamp-2">
                      {codingProblem.title}
                    </p>
                  )}
                  {codingError && (
                    <p className="text-[11px] text-red-700">{codingError}</p>
                  )}
                </ToolCard>

                <ToolCard
                  icon={Code2}
                  label="Sample Code"
                  bgColor="bg-white"
                  hasData={resources.some((r) => r.resource_type === 'code_exercise' && r.content_json?.mode === 'sample_code')}
                  isLoading={sampleCodeLoading}
                  onGenerate={handleGenerateSampleCode}
                  disabled={!content}
                >
                  {sampleCodeError && <p className="text-[11px] text-red-700">{sampleCodeError}</p>}
                </ToolCard>

                <ToolCard
                  icon={Sparkle}
                  label="Dynamic Script"
                  bgColor="bg-white"
                  hasData={!!dynamicScript && dynamicScript.blocks.length > 0}
                  isLoading={isDynamicScriptLoading}
                  onGenerate={handleGenerateDynamicScript}
                >
                  {dynamicScript && (
                    <>
                      <p className="text-[11px] text-neutral-800 line-clamp-1">
                        {dynamicScript.title}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        {dynamicScript.blocks.length} block{dynamicScript.blocks.length === 1 ? '' : 's'}
                      </p>
                    </>
                  )}
                  {dynamicScriptError && (
                    <p className="text-[11px] text-red-700">{dynamicScriptError}</p>
                  )}
                </ToolCard>

                 {/* Generated Content list */}
                  {(content || quiz || videoTask || generatedPodcast || dynamicScript || resources.length > 0) && (
                  <div className="pt-4 border-t border-black/10 space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] text-neutral-500 uppercase tracking-[0.14em]">
                        Generated Resources
                      </p>
                      {/* Create Note button */}
                      {content && (
                        <button
                          onClick={() =>
                            dispatch(
                              setActiveResourceView({
                                moduleIndex: mIdx,
                                topicIndex: tIdx,
                                view: { type: 'create-note' },
                              })
                            )
                          }
                          className="flex items-center gap-1 text-[10px] text-neutral-700 hover:text-neutral-900 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          New Note
                        </button>
                      )}
                    </div>

                    {/* Notes — click to switch center view to text reading */}
                    {content && (
                      <button
                        onClick={() =>
                          dispatch(
                            setActiveResourceView({
                              moduleIndex: mIdx,
                              topicIndex: tIdx,
                              view: null,
                            })
                          )
                        }
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                      >
                        <FileText className="w-4 h-4 text-neutral-700 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">
                            {currentTopic?.topic_name} - Notes
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {content.generatedAt
                              ? new Date(content.generatedAt).toLocaleDateString()
                              : ''}
                          </p>
                        </div>
                      </button>
                    )}

                    {/* Topic Mind Map */}
                    {topicMindMapData && (
                      <button
                        onClick={() => openMindMapDialog(topicMindMapData, `${currentTopic?.topic_name} - Mind Map`)}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-50 transition-colors text-left"
                      >
                        <Network className="w-4 h-4 text-neutral-700 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">
                            {currentTopic?.topic_name} - Mind Map
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {topicMindMapData.level}
                          </p>
                        </div>
                      </button>
                    )}

                    {/* All notes (AI-generated and user-created) */}
                    {resources
                      .filter((r) => r.resource_type === 'notes')
                      .map((resource) => (
                        <button
                          key={resource.id}
                          onClick={() =>
                            dispatch(
                              setActiveResourceView({
                                moduleIndex: mIdx,
                                topicIndex: tIdx,
                                view: { type: 'notes', resourceId: resource.id },
                              })
                            )
                          }
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                        >
                          <FileText className="w-4 h-4 text-neutral-700 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 truncate">
                              {resource.title}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {resource.created_at
                                ? new Date(resource.created_at).toLocaleDateString()
                                : ''}
                            </p>
                          </div>
                        </button>
                      ))}

                    {quiz && (
                      <div className="w-full flex items-center gap-3 p-2 rounded-lg bg-gray-50 border border-gray-100">
                        <ListChecks className="w-4 h-4 text-neutral-700 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">
                            {currentTopic?.topic_name} - Quiz
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {quiz.generatedAt
                              ? new Date(quiz.generatedAt).toLocaleDateString()
                              : ''}
                          </p>
                        </div>
                      </div>
                    )}

                    {dynamicScript && (
                      <button
                        onClick={() =>
                          dispatch(
                            setActiveResourceView({
                              moduleIndex: mIdx,
                              topicIndex: tIdx,
                              view: { type: 'dynamic-script' },
                            })
                          )
                        }
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                      >
                        <Sparkle className="w-4 h-4 text-neutral-700 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">
                            {dynamicScript.title}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {dynamicScript.blocks.length} block{dynamicScript.blocks.length === 1 ? '' : 's'}
                          </p>
                        </div>
                      </button>
                    )}

                    {/* Video resources — click to switch center to video player */}
                    {resources
                      .filter((r) => r.resource_type === 'video')
                      .map((resource) => (
                        <button
                          key={resource.id}
                          onClick={() =>
                            dispatch(
                              setActiveResourceView({
                                moduleIndex: mIdx,
                                topicIndex: tIdx,
                                view: { type: 'video', resourceId: resource.id },
                              })
                            )
                          }
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                        >
                          <Video className="w-4 h-4 text-neutral-700 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 truncate">
                              {resource.title}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {resource.created_at
                                ? new Date(resource.created_at).toLocaleDateString()
                                : 'Generated'}
                            </p>
                          </div>
                        </button>
                      ))}
                    {/* Fallback to videoTask for in-progress videos */}
                    {videoTask?.status === 'completed' &&
                      resources.filter((r) => r.resource_type === 'video').length === 0 && (
                        <div className="w-full flex items-center gap-3 p-2 rounded-lg bg-gray-50 border border-gray-100">
                          <Video className="w-4 h-4 text-neutral-700 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 truncate">
                              {currentTopic?.topic_name} - Video
                            </p>
                            <p className="text-[10px] text-gray-500">Generated</p>
                          </div>
                        </div>
                      )}

                    {/* Audio/Podcast resources — click to switch center to audio player */}
                    {resources
                      .filter((r) => r.resource_type === 'audio')
                      .map((resource) => (
                        <button
                          key={resource.id}
                          onClick={() =>
                            dispatch(
                              setActiveResourceView({
                                moduleIndex: mIdx,
                                topicIndex: tIdx,
                                view: { type: 'audio', resourceId: resource.id },
                              })
                            )
                          }
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                        >
                          <Headphones className="w-4 h-4 text-neutral-700 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 truncate">
                              {resource.title}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {resource.created_at
                                ? new Date(resource.created_at).toLocaleDateString()
                                : 'Generated'}
                            </p>
                          </div>
                        </button>
                      ))}
                    {/* Fallback to generatedPodcast for session state */}
                    {generatedPodcast &&
                      resources.filter((r) => r.resource_type === 'audio').length === 0 && (
                        <div className="w-full flex items-center gap-3 p-2 rounded-lg bg-gray-50 border border-gray-100">
                          <Headphones className="w-4 h-4 text-neutral-700 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 truncate">
                              {currentTopic?.topic_name} - Podcast
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {generatedPodcast.generatedAt
                                ? new Date(
                                  generatedPodcast.generatedAt
                                ).toLocaleDateString()
                                : 'Generated'}
                            </p>
                          </div>
                        </div>
                      )}

                    {/* Code exercises */}
                    {resources
                      .filter((r) => r.resource_type === 'code_exercise')
                      .map((resource) => (
                        <button
                          key={resource.id}
                          onClick={() => {
                            if (resource.content_json?.mode === 'sample_code') {
                              dispatch(
                                setActiveResourceView({
                                  moduleIndex: mIdx,
                                  topicIndex: tIdx,
                                  view: { type: 'code', resourceId: resource.id },
                                })
                              );
                            } else {
                              handleOpenCodingResource(resource);
                            }
                          }}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                        >
                          <Code2 className="w-4 h-4 text-neutral-700 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 truncate">
                              {resource.title}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {resource.created_at
                                ? new Date(resource.created_at).toLocaleDateString()
                                : 'Generated'}
                            </p>
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Podcast Dialog */}
      {content && currentTopic && (
        <PodcastDialog
          open={podcastDialogOpen}
          onOpenChange={setPodcastDialogOpen}
          content={content.content}
          topicName={currentTopic.topic_name}
          lessonId={content.lessonId}
          enrollmentId={eId ?? undefined}
          onPodcastGenerated={(data) => setGeneratedPodcast(data)}
          onComplete={() => {
            // Refetch resources after podcast generation
            if (content?.lessonId) {
              dispatch(fetchResources(content.lessonId));
            }
          }}
        />
      )}

      {/* Mind Map Dialog */}
      <Dialog open={mindMapDialogOpen} onOpenChange={setMindMapDialogOpen}>
        <DialogContent className="!max-w-none !w-screen !h-screen !p-0 overflow-hidden flex flex-col bg-[#E8EAED] border-0 !rounded-none !translate-x-[-50%] !translate-y-[-50%] !top-[50%] !left-[50%]">
          <DialogHeader className="p-6 border-b border-gray-300 bg-white flex-shrink-0">
            <DialogTitle className="text-xl font-bold items-center gap-2 flex text-gray-800">
              <Network className="w-5 h-5 text-neutral-700" />
              {activeMindMapTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto relative">
            {activeMindMapData && <MindMapViewer data={activeMindMapData} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Coding Assessment Dialog */}
      <Dialog open={codingDialogOpen} onOpenChange={setCodingDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-neutral-700" />
              Coding Assessment
            </DialogTitle>
          </DialogHeader>

          {codingProblem ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{codingProblem.title}</h3>
                <p className="text-sm text-gray-600 mt-1">Difficulty: {codingProblem.difficulty}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-800 mb-2">Problem</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{codingProblem.problem_statement}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-800 mb-2">Starter Code</p>
                <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-4 overflow-x-auto">
                  <code>{codingProblem.starter_code}</code>
                </pre>
              </div>

              {codingProblem.test_cases?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-800 mb-2">Sample Test Cases</p>
                  <div className="space-y-2">
                    {codingProblem.test_cases.map((test, idx) => (
                      <div key={test.id} className="rounded-lg border border-gray-200 p-3">
                        <p className="text-xs font-semibold text-gray-500 mb-1">Case {idx + 1}</p>
                        <p className="text-xs text-gray-700"><span className="font-medium">Input:</span> {test.input_data || '(empty)'}</p>
                        <p className="text-xs text-gray-700"><span className="font-medium">Expected:</span> {test.expected_output || '(empty)'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {eId && codingProblem && (
                <Button
                  className="w-full bg-neutral-900 hover:bg-neutral-800"
                  onClick={() => {
                    setCodingDialogOpen(false);
                    navigate(`/course/${eId}/module/${mIdx}/topic/${tIdx}/coding/${codingProblem.id}`);
                  }}
                >
                  Open Compiler Page
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No coding assessment generated yet.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Dynamic Script Dialog */}
      <Dialog open={dynamicScriptDialogOpen} onOpenChange={setDynamicScriptDialogOpen}>
        <DialogContent className="!max-w-none !w-[95vw] !h-[92vh] !p-0 overflow-hidden flex flex-col bg-white border border-gray-200">
          <DialogHeader className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <DialogTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Sparkle className="w-5 h-5 text-neutral-700" />
              {dynamicScript?.title || 'Dynamic Script'}
            </DialogTitle>
            {dynamicScript?.overview && (
              <p className="text-sm text-gray-600 mt-1">{dynamicScript.overview}</p>
            )}
          </DialogHeader>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-5">
              {(dynamicScript?.blocks || []).map((block, blockIndex) => {
                const runner = getRunnerState(blockIndex);
                const testResults = Array.isArray(runner.submission?.feedback?.test_results)
                  ? runner.submission?.feedback?.test_results
                  : [];
                const failedTests = testResults.filter((t: any) => !t.passed);

                return (
                  <section key={`${block.type}-${blockIndex}`} className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Block {blockIndex + 1}</p>
                        <h4 className="text-sm font-semibold text-gray-900">
                          {block.type.replace('_', ' ').toUpperCase()}
                        </h4>
                      </div>
                      <span className="text-[11px] px-2 py-1 rounded-md bg-gray-100 text-gray-600">{block.type}</span>
                    </div>

                    <p className="text-sm text-gray-700">{block.prompt}</p>

                    {block.type === 'text' && (
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
                        <div className="prose prose-gray max-w-none text-sm">
                          <ReactMarkdown
                            rehypePlugins={[rehypeHighlight]}
                            components={{
                              h1: ({ ...props }) => <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-3" {...props} />,
                              h2: ({ ...props }) => <h2 className="text-xl font-bold text-gray-900 mt-5 mb-2" {...props} />,
                              h3: ({ ...props }) => <h3 className="text-lg font-semibold text-gray-900 mt-4 mb-2" {...props} />,
                              p: ({ ...props }) => <p className="text-gray-700 leading-relaxed mb-3" {...props} />,
                              code: ({ ...props }) => {
                                const { className } = props;
                                const isInline = !className?.includes('language-');
                                if (isInline) {
                                  return <code className="bg-gray-100 text-pink-600 px-1.5 py-0.5 rounded text-sm" {...props} />;
                                }
                                return <code className={cn(className, 'font-mono')} {...props} />;
                              },
                              pre: ({ ...props }) => (
                                <pre className="bg-[#1e1e1e] text-[#d4d4d4] rounded-xl p-4 overflow-x-auto my-4 text-sm not-prose border border-gray-800 shadow-lg" {...props} />
                              ),
                              ul: ({ ...props }) => <ul className="list-disc ml-6 mb-3 space-y-1 text-gray-700" {...props} />,
                              ol: ({ ...props }) => <ol className="list-decimal ml-6 mb-3 space-y-1 text-gray-700" {...props} />,
                              blockquote: ({ ...props }) => <blockquote className="border-l-4 border-gray-200 pl-4 italic my-3 text-gray-600" {...props} />,
                            }}
                          >
                            {block.payload?.markdown || block.payload?.content || 'No text payload provided.'}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {block.type === 'video' && (
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
                        <p className="text-sm font-medium text-gray-900">{block.payload?.title || 'Video Outline'}</p>
                        <p className="text-sm text-gray-700">{block.payload?.description || 'No description provided.'}</p>
                        {Array.isArray(block.payload?.key_points) && block.payload.key_points.length > 0 && (
                          <ul className="list-disc ml-5 text-sm text-gray-700 space-y-1">
                            {block.payload.key_points.map((point: string, idx: number) => (
                              <li key={`${idx}-${point}`}>{point}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {block.type === 'mind_map' && (
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
                        <p className="text-sm font-medium text-gray-900">Root: {block.payload?.root || 'Mind Map Root'}</p>
                        {Array.isArray(block.payload?.nodes) && block.payload.nodes.length > 0 ? (
                          <div className="space-y-1 text-sm text-gray-700">
                            {block.payload.nodes.slice(0, 12).map((node: any, idx: number) => (
                              <p key={`${idx}-${node?.id || node?.label || 'node'}`}>
                                • {node?.label || 'Node'}
                                {node?.parent_id ? ` (parent: ${node.parent_id})` : ''}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-700">No nodes provided.</p>
                        )}
                      </div>
                    )}

                    {block.type === 'quiz' && (
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-3">
                        {Array.isArray(block.payload?.questions) && block.payload.questions.length > 0 ? (
                          block.payload.questions.map((question: any, qIdx: number) => (
                            <div key={`${qIdx}-${question?.question || 'question'}`} className="rounded-md bg-white border border-gray-200 p-3">
                              <p className="text-sm font-medium text-gray-900">Q{qIdx + 1}. {question?.question}</p>
                              {Array.isArray(question?.options) && (
                                <ul className="list-disc ml-5 mt-2 text-sm text-gray-700 space-y-1">
                                  {question.options.map((opt: string, oIdx: number) => (
                                    <li key={`${oIdx}-${opt}`}>{opt}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-gray-700">No quiz questions provided.</p>
                        )}
                      </div>
                    )}

                    {block.type === 'code' && (
                      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900">
                            {block.payload?.title || 'Interactive Coding Block'}
                          </p>
                          {!runner.problem ? (
                            <Button
                              size="sm"
                              onClick={() => prepareCodeRunner(blockIndex, block.prompt)}
                              disabled={runner.loading}
                              className="bg-neutral-900 hover:bg-neutral-800"
                            >
                              {runner.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Initialize Runner'}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => runCodeBlock(blockIndex)}
                              disabled={runner.submitting || !runner.code.trim()}
                              className="bg-neutral-900 hover:bg-neutral-800 gap-2"
                            >
                              {runner.submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                              Run
                            </Button>
                          )}
                        </div>

                        {runner.error && (
                          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
                            {runner.error}
                          </p>
                        )}

                        {runner.problem && (
                          <div className="h-[420px] rounded-lg overflow-hidden border border-neutral-200 bg-white">
                            <ResizablePanelGroup direction="horizontal">
                              <ResizablePanel defaultSize={60} minSize={35}>
                                <div className="h-full flex flex-col">
                                  <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 text-xs text-gray-600 font-medium">
                                    Editor
                                  </div>
                                  <Editor
                                    height="100%"
                                    defaultLanguage="python"
                                    language="python"
                                    theme="vs-dark"
                                    value={runner.code}
                                    onChange={(value) => updateCodeBlockSource(blockIndex, value ?? '')}
                                    options={{
                                      minimap: { enabled: false },
                                      fontSize: 14,
                                      lineHeight: 22,
                                      tabSize: 4,
                                      insertSpaces: true,
                                      automaticLayout: true,
                                      scrollBeyondLastLine: false,
                                      wordWrap: 'on',
                                    }}
                                  />
                                </div>
                              </ResizablePanel>
                              <ResizableHandle withHandle />
                              <ResizablePanel defaultSize={40} minSize={25}>
                                <div className="h-full flex flex-col">
                                  <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 text-xs text-gray-600 font-medium">
                                    Output
                                  </div>
                                  <div className="flex-1 overflow-auto p-3 space-y-3">
                                    {runner.submission ? (
                                      <>
                                        <div className="rounded-md border border-gray-200 p-2 text-sm text-gray-700">
                                          {runner.submission.passed_tests}/{runner.submission.total_tests} tests passed ({runner.submission.score_percent}%)
                                        </div>
                                        {failedTests.length > 0 && (
                                          <div className="space-y-2">
                                            {failedTests.map((test: any, idx: number) => (
                                              <div key={`${idx}-${test?.test_case_id || 'failed'}`} className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                                                <p className="font-medium">Failed test {idx + 1}</p>
                                                {test?.error_message && <p className="mt-1">{summarizeError(test.error_message)}</p>}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <p className="text-sm text-gray-500">Run code to see output.</p>
                                    )}
                                  </div>
                                </div>
                              </ResizablePanel>
                            </ResizablePanelGroup>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}

              {!dynamicScript && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  Generate a Dynamic Script from Studio to see interactive blocks here.
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
