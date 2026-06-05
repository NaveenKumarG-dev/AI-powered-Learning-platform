import { useEffect, useCallback, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Loader2,
  Sparkles,
  BookOpen,
  ClipboardCheck,
  Lock,
  FileText,
  Play,
  Headphones,
  Save,
  X,
  ListTree,
  AlertCircle,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  generateTopicContent,
  generateDynamicScript,
  toggleTopicCompletion,
  saveLessonCompletion,
  fetchResources,
  selectResources,
  selectActiveResourceView,
  setActiveResourceView,
  createNote,
  selectTopicContentError,
  selectDynamicScript,
  selectDynamicScriptError,
  selectDynamicScriptLoading,
} from '../../store/slices/syllabusSlice';
import { codingAPI } from '../../services/api';
import { Button } from '../components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../components/ui/breadcrumb';
import { Separator } from '../components/ui/separator';
import { cn } from '../components/ui/utils';
import { TopicQuizOverlay } from '../components/TopicQuizOverlay';
import { CourseStructureDialog } from '../components/CourseStructureDialog';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import Editor from '@monaco-editor/react';

export default function TopicPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { enrollmentId, moduleIndex, topicIndex } = useParams();
  const eId = enrollmentId || null;
  const mIdx = moduleIndex ? parseInt(moduleIndex) : 0;
  const tIdx = topicIndex ? parseInt(topicIndex) : 0;
  const topicKey = `${eId}-${mIdx}-${tIdx}`;

  const {
    syllabus,
    courseName,
    generatedContent,
    contentLoading,
    topicCompletion,
  } = useAppSelector((state) => state.syllabus);

  const content = generatedContent[topicKey];
  const isLoading = !!contentLoading[topicKey];
  const isComplete = !!topicCompletion[topicKey];

  const currentModule = syllabus?.modules[mIdx];
  const currentTopic = currentModule?.topics[tIdx];

  // ─── Resources & active view from Redux ────────────────────────────────────

  const resources = useAppSelector((state) =>
    content?.lessonId ? selectResources(state, content.lessonId) : []
  );
  const activeView = useAppSelector((state) =>
    selectActiveResourceView(state, mIdx, tIdx)
  );
  const error = useAppSelector((state) =>
    selectTopicContentError(state, mIdx, tIdx)
  );
  const dynamicScript = useAppSelector((state) =>
    selectDynamicScript(state, mIdx, tIdx)
  );
  const isDynamicScriptLoading = useAppSelector((state) =>
    selectDynamicScriptLoading(state, mIdx, tIdx)
  );
  const dynamicScriptError = useAppSelector((state) =>
    selectDynamicScriptError(state, mIdx, tIdx)
  );

  // Fetch resources when content is loaded
  useEffect(() => {
    if (content?.lessonId && resources.length === 0) {
      dispatch(fetchResources(content.lessonId));
    }
  }, [content?.lessonId, dispatch, resources.length]);

  // Find the active resource data when user has selected one
  const activeResource = activeView?.resourceId
    ? resources.find((r) => r.id === activeView.resourceId)
    : null;

  const isSampleCodeResource =
    activeView?.type === 'code' && activeResource?.content_json?.mode === 'sample_code';

  useEffect(() => {
    if (isSampleCodeResource && activeResource?.content_json) {
      setSampleCodeValue(activeResource.content_json.starter_code || '');
      setSampleCodeInput(activeResource.content_json.sample_input || '');
      setSampleTerminalHistory(['Ready. Press Run to execute your code.']);
      setSampleSessionId(null);
      setSampleSessionRunning(false);
    }
  }, [isSampleCodeResource, activeResource?.id]);

  const handleRunSampleCode = async () => {
    if (!sampleCodeValue.trim()) return;
    setSampleCodeRunning(true);

    let sessionId = sampleSessionId;
    let isRunning = sampleSessionRunning;
    const pendingInput = sampleCodeInput;

    try {
      if (!sessionId || !isRunning) {
        setSampleTerminalHistory((prev) => [...prev, '$ python script.py']);
        const started = await codingAPI.startInteractiveSampleCode({
          source_code: sampleCodeValue,
        });
        sessionId = started.session_id;
        isRunning = started.is_running;

        setSampleSessionId(started.session_id);
        setSampleSessionRunning(started.is_running);

        if (started.output) {
          setSampleTerminalHistory((prev) => [...prev, started.output]);
        }
        if (!started.is_running) {
          setSampleSessionId(null);
          setSampleSessionRunning(false);
          if (started.exit_code !== null) {
            setSampleTerminalHistory((prev) => [...prev, `[process exited with code ${started.exit_code}]`]);
          }
          return;
        }
      }

      // When already running, Enter/Run sends stdin exactly like a terminal line.
      if (sessionId && (sampleSessionRunning || pendingInput.length > 0)) {
        setSampleTerminalHistory((prev) => [...prev, `> ${pendingInput}`]);
        const result = await codingAPI.sendInteractiveSampleInput({
          session_id: sessionId,
          user_input: pendingInput,
        });

        if (result.output) {
          setSampleTerminalHistory((prev) => [...prev, result.output]);
        }

        setSampleSessionRunning(result.is_running);
        if (!result.is_running) {
          setSampleSessionId(null);
          if (result.exit_code !== null) {
            setSampleTerminalHistory((prev) => [...prev, `[process exited with code ${result.exit_code}]`]);
          }
        }

        setSampleCodeInput('');
      }
    } catch (err: any) {
      const errText = err?.response?.data?.error || err?.message || 'Failed to run sample code';
      setSampleTerminalHistory((prev) => [...prev, `Traceback\n${errText}`]);
      setSampleSessionId(null);
      setSampleSessionRunning(false);
    } finally {
      setSampleCodeRunning(false);
    }
  };

  const handleStopSampleCode = async () => {
    if (!sampleSessionId) return;
    setSampleCodeRunning(true);
    try {
      const result = await codingAPI.stopInteractiveSampleCode({ session_id: sampleSessionId });
      if (result.output) {
        setSampleTerminalHistory((prev) => [...prev, result.output]);
      }
      if (result.exit_code !== null) {
        setSampleTerminalHistory((prev) => [...prev, `[process exited with code ${result.exit_code}]`]);
      }
    } catch {
      // No-op: session cleanup should be best-effort.
    } finally {
      setSampleSessionId(null);
      setSampleSessionRunning(false);
      setSampleCodeRunning(false);
    }
  };

  // ─── Create Note state ─────────────────────────────────────────────────────

  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [structureDialogOpen, setStructureDialogOpen] = useState(false);
  const [sampleCodeValue, setSampleCodeValue] = useState('');
  const [sampleCodeInput, setSampleCodeInput] = useState('');
  const [visibleDynamicBlocks, setVisibleDynamicBlocks] = useState(0);
  const [sampleCodeRunning, setSampleCodeRunning] = useState(false);
  const [sampleTerminalHistory, setSampleTerminalHistory] = useState<string[]>(['Ready. Press Run to execute your code.']);
  const [sampleSessionId, setSampleSessionId] = useState<string | null>(null);
  const [sampleSessionRunning, setSampleSessionRunning] = useState(false);
  const [dynamicCodeByBlock, setDynamicCodeByBlock] = useState<Record<number, string>>({});
  const [dynamicInputByBlock, setDynamicInputByBlock] = useState<Record<number, string>>({});
  const [dynamicCodeRunningByBlock, setDynamicCodeRunningByBlock] = useState<Record<number, boolean>>({});
  const [dynamicTerminalHistoryByBlock, setDynamicTerminalHistoryByBlock] = useState<Record<number, string[]>>({});
  const [dynamicSessionIdByBlock, setDynamicSessionIdByBlock] = useState<Record<number, string>>({});
  const [dynamicSessionRunningByBlock, setDynamicSessionRunningByBlock] = useState<Record<number, boolean>>({});
  const [quizRevealByQuestion, setQuizRevealByQuestion] = useState<Record<string, boolean>>({});
  const sampleSessionIdRef = useRef<string | null>(null);
  const dynamicSessionIdsRef = useRef<Record<number, string>>({});

  useEffect(() => {
    sampleSessionIdRef.current = sampleSessionId;
  }, [sampleSessionId]);

  useEffect(() => {
    dynamicSessionIdsRef.current = dynamicSessionIdByBlock;
  }, [dynamicSessionIdByBlock]);

  useEffect(() => {
    return () => {
      const sampleId = sampleSessionIdRef.current;
      if (sampleId) {
        codingAPI.stopInteractiveSampleCode({ session_id: sampleId }).catch(() => undefined);
      }

      Object.values(dynamicSessionIdsRef.current).forEach((sessionId) => {
        codingAPI.stopInteractiveSampleCode({ session_id: sessionId }).catch(() => undefined);
      });
    };
  }, []);

  const handleSaveNote = async () => {
    if (!content?.lessonId || !noteTitle.trim() || !noteContent.trim()) return;
    setNoteSaving(true);
    await dispatch(
      createNote({
        lessonId: content.lessonId,
        title: noteTitle.trim(),
        content: noteContent.trim(),
        moduleIndex: mIdx,
        topicIndex: tIdx,
      })
    );
    setNoteSaving(false);
    setNoteTitle('');
    setNoteContent('');
    dispatch(setActiveResourceView({ moduleIndex: mIdx, topicIndex: tIdx, view: null }));
  };

  useEffect(() => {
    if (activeView?.type !== 'dynamic-script' || !dynamicScript?.blocks?.length) {
      setVisibleDynamicBlocks(0);
      return;
    }

    setVisibleDynamicBlocks(1);
    const timer = setInterval(() => {
      setVisibleDynamicBlocks((prev) => {
        if (prev >= dynamicScript.blocks.length) {
          clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 1200);

    return () => clearInterval(timer);
  }, [activeView?.type, dynamicScript?.blocks?.length]);

  useEffect(() => {
    if (!dynamicScript?.blocks?.length) return;

    Object.values(dynamicSessionIdsRef.current).forEach((sessionId) => {
      codingAPI.stopInteractiveSampleCode({ session_id: sessionId }).catch(() => undefined);
    });

    const nextCode: Record<number, string> = {};
    const nextInput: Record<number, string> = {};
    const nextHistory: Record<number, string[]> = {};
    dynamicScript.blocks.forEach((block, idx) => {
      if (block.type === 'code') {
        nextCode[idx] = block.payload?.starter_code || block.payload?.code || 'def solve(raw_input: str) -> str:\n    return raw_input\n';
        nextInput[idx] = block.payload?.sample_input || '';
        nextHistory[idx] = ['Ready. Press Run to execute your code.'];
      }
    });

    setDynamicCodeByBlock(nextCode);
    setDynamicInputByBlock(nextInput);
    setDynamicCodeRunningByBlock({});
    setDynamicTerminalHistoryByBlock(nextHistory);
    setDynamicSessionIdByBlock({});
    setDynamicSessionRunningByBlock({});
    setQuizRevealByQuestion({});
  }, [dynamicScript?.title, dynamicScript?.blocks]);

  const handleRunDynamicCodeBlock = async (blockIdx: number) => {
    const sourceCode = dynamicCodeByBlock[blockIdx] || '';
    if (!sourceCode.trim()) return;
    setDynamicCodeRunningByBlock((prev) => ({ ...prev, [blockIdx]: true }));

    let sessionId = dynamicSessionIdByBlock[blockIdx];
    let isRunning = !!dynamicSessionRunningByBlock[blockIdx];
    const pendingInput = dynamicInputByBlock[blockIdx] || '';

    try {
      if (!sessionId || !isRunning) {
        setDynamicTerminalHistoryByBlock((prev) => ({
          ...prev,
          [blockIdx]: [...(prev[blockIdx] || []), '$ python script.py'],
        }));

        const started = await codingAPI.startInteractiveSampleCode({
          source_code: sourceCode,
        });

        sessionId = started.session_id;
        isRunning = started.is_running;

        setDynamicSessionIdByBlock((prev) => ({ ...prev, [blockIdx]: started.session_id }));
        setDynamicSessionRunningByBlock((prev) => ({ ...prev, [blockIdx]: started.is_running }));

        if (started.output) {
          setDynamicTerminalHistoryByBlock((prev) => ({
            ...prev,
            [blockIdx]: [...(prev[blockIdx] || []), started.output],
          }));
        }

        if (!started.is_running) {
          setDynamicSessionIdByBlock((prev) => {
            const next = { ...prev };
            delete next[blockIdx];
            return next;
          });
          if (started.exit_code !== null) {
            setDynamicTerminalHistoryByBlock((prev) => ({
              ...prev,
              [blockIdx]: [...(prev[blockIdx] || []), `[process exited with code ${started.exit_code}]`],
            }));
          }
          return;
        }
      }

      if (sessionId && (dynamicSessionRunningByBlock[blockIdx] || pendingInput.length > 0)) {
        setDynamicTerminalHistoryByBlock((prev) => ({
          ...prev,
          [blockIdx]: [...(prev[blockIdx] || []), `> ${pendingInput}`],
        }));

        const result = await codingAPI.sendInteractiveSampleInput({
          session_id: sessionId,
          user_input: pendingInput,
        });

        if (result.output) {
          setDynamicTerminalHistoryByBlock((prev) => ({
            ...prev,
            [blockIdx]: [...(prev[blockIdx] || []), result.output],
          }));
        }

        setDynamicSessionRunningByBlock((prev) => ({ ...prev, [blockIdx]: result.is_running }));
        if (!result.is_running) {
          setDynamicSessionIdByBlock((prev) => {
            const next = { ...prev };
            delete next[blockIdx];
            return next;
          });
          if (result.exit_code !== null) {
            setDynamicTerminalHistoryByBlock((prev) => ({
              ...prev,
              [blockIdx]: [...(prev[blockIdx] || []), `[process exited with code ${result.exit_code}]`],
            }));
          }
        }

        setDynamicInputByBlock((prev) => ({ ...prev, [blockIdx]: '' }));
      }
    } catch (err: any) {
      const errText = err?.response?.data?.error || err?.message || 'Failed to run code';
      setDynamicSessionIdByBlock((prev) => {
        const next = { ...prev };
        delete next[blockIdx];
        return next;
      });
      setDynamicSessionRunningByBlock((prev) => ({ ...prev, [blockIdx]: false }));
      setDynamicTerminalHistoryByBlock((prev) => ({
        ...prev,
        [blockIdx]: [...(prev[blockIdx] || []), `Traceback\n${errText}`],
      }));
    } finally {
      setDynamicCodeRunningByBlock((prev) => ({ ...prev, [blockIdx]: false }));
    }
  };

  const handleStopDynamicCodeBlock = async (blockIdx: number) => {
    const sessionId = dynamicSessionIdByBlock[blockIdx];
    if (!sessionId) return;

    setDynamicCodeRunningByBlock((prev) => ({ ...prev, [blockIdx]: true }));
    try {
      const result = await codingAPI.stopInteractiveSampleCode({ session_id: sessionId });
      if (result.output) {
        setDynamicTerminalHistoryByBlock((prev) => ({
          ...prev,
          [blockIdx]: [...(prev[blockIdx] || []), result.output],
        }));
      }
      if (result.exit_code !== null) {
        setDynamicTerminalHistoryByBlock((prev) => ({
          ...prev,
          [blockIdx]: [...(prev[blockIdx] || []), `[process exited with code ${result.exit_code}]`],
        }));
      }
    } finally {
      setDynamicSessionIdByBlock((prev) => {
        const next = { ...prev };
        delete next[blockIdx];
        return next;
      });
      setDynamicSessionRunningByBlock((prev) => ({ ...prev, [blockIdx]: false }));
      setDynamicCodeRunningByBlock((prev) => ({ ...prev, [blockIdx]: false }));
    }
  };

  // ─── Module unlock check ──────────────────────────────────────────────────

  const isModuleUnlocked = useCallback(
    (moduleIdx: number): boolean => {
      if (moduleIdx === 0) return true;
      if (!syllabus) return false;
      const prevMod = syllabus.modules[moduleIdx - 1];
      if (!prevMod) return false;
      // Module unlocks when all topics in previous module are completed
      for (let t = 0; t < prevMod.topics.length; t++) {
        const key = `${eId}-${moduleIdx - 1}-${t}`;
        if (!topicCompletion[key]) return false;
      }
      return true;
    },
    [syllabus, topicCompletion, eId]
  );

  // Quiz overlay state
  const [quizOverlayOpen, setQuizOverlayOpen] = useState(false);

  // ─── Navigation helpers ────────────────────────────────────────────────────

  const getPrevTopic = useCallback((): {
    mIdx: number;
    tIdx: number;
  } | null => {
    if (!syllabus) return null;
    if (tIdx > 0) return { mIdx, tIdx: tIdx - 1 };
    if (mIdx > 0) {
      const prevModule = syllabus.modules[mIdx - 1];
      return { mIdx: mIdx - 1, tIdx: prevModule.topics.length - 1 };
    }
    return null;
  }, [syllabus, mIdx, tIdx]);

  const getNextTopic = useCallback((): {
    mIdx: number;
    tIdx: number;
  } | null => {
    if (!syllabus) return null;
    // Next topic within same module
    if (currentModule && tIdx < currentModule.topics.length - 1) {
      return { mIdx, tIdx: tIdx + 1 };
    }
    // Next module — only if unlocked
    if (mIdx < syllabus.modules.length - 1 && isModuleUnlocked(mIdx + 1)) {
      return { mIdx: mIdx + 1, tIdx: 0 };
    }
    return null;
  }, [syllabus, currentModule, mIdx, tIdx, isModuleUnlocked]);

  // Whether the next module exists but is locked
  const nextModuleLocked = (() => {
    if (!syllabus || !currentModule) return false;
    // If we're on the last topic of this module and the next module exists but is locked
    if (tIdx === currentModule.topics.length - 1 && mIdx < syllabus.modules.length - 1) {
      return !isModuleUnlocked(mIdx + 1);
    }
    return false;
  })();

  const prev = getPrevTopic();
  const next = getNextTopic();

  const navigateToTopic = (target: { mIdx: number; tIdx: number }) => {
    navigate(
      `/course/${enrollmentId}/module/${target.mIdx}/topic/${target.tIdx}`
    );
  };

  // ─── Auto-generate content on first visit ─────────────────────────────────

  const handleGenerate = useCallback(() => {
    if (!eId || !currentModule || !currentTopic) return;
    dispatch(
      generateTopicContent({
        enrollmentId: eId,
        moduleId: mIdx + 1,
        topicName: currentTopic.topic_name,
        moduleIndex: mIdx,
        topicIndex: tIdx,
      })
    );
  }, [dispatch, eId, currentModule, currentTopic, mIdx, tIdx]);

  // ─── Auto-generate content on first visit ─────────────────────────────────

  useEffect(() => {
    // Auto-generate content when the topic page loads if content doesn't exist
    // Stop if there's an error to prevent infinite loops
    if (!content && !isLoading && !error && currentTopic && eId && currentModule) {
      console.log(`📚 Auto-generating content for: ${currentTopic.topic_name}`);
      handleGenerate();
    }
  }, [content, isLoading, error, currentTopic, eId, currentModule, handleGenerate]);

  useEffect(() => {
    if (!dynamicScript && !isDynamicScriptLoading && !dynamicScriptError && currentTopic && eId && currentModule) {
      dispatch(
        generateDynamicScript({
          enrollmentId: eId,
          moduleId: mIdx + 1,
          topicName: currentTopic.topic_name,
          moduleIndex: mIdx,
          topicIndex: tIdx,
        })
      );
    }
  }, [
    dispatch,
    dynamicScript,
    isDynamicScriptLoading,
    dynamicScriptError,
    currentTopic,
    eId,
    currentModule,
    mIdx,
    tIdx,
  ]);

  // ─── Auto-generate video on page load (DISABLED) ──────────────────────────
  // Video generation now only happens when user clicks "Generate Video" button

  // useEffect(() => {
  //   console.log('📹 Video auto-generation check:', {
  //     hasCurrentTopic: !!currentTopic,
  //     isVideoLoading,
  //     videoTask,
  //     hasContent: !!content,
  //   });

  //   // Don't generate if:
  //   // - No topic info available
  //   // - Video is already generating
  //   // - Video task exists and is not failed
  //   if (!currentTopic || isVideoLoading) {
  //     console.log('⏭️ Skipping video generation:', {
  //       noTopic: !currentTopic,
  //       isLoading: isVideoLoading,
  //     });
  //     return;
  //   }

  //   const shouldGenerateVideo = 
  //     !videoTask || // No video task exists yet
  //     videoTask.status === 'failed'; // Or previous attempt failed

  //   console.log('🎬 Should generate video?', shouldGenerateVideo);

  //   if (shouldGenerateVideo) {
  //     // Use topic description for video generation
  //     // Video can be generated even without content
  //     const videoSource = content?.content || currentTopic.description;

  //     if (videoSource) {
  //       console.log(`🎬 Auto-generating video for: ${currentTopic.topic_name}`);
  //       dispatch(
  //         generateVideo({
  //           topicName: currentTopic.topic_name,
  //           lessonId: content?.lessonId,
  //           moduleIndex: mIdx,
  //           topicIndex: tIdx,
  //         })
  //       );
  //     } else {
  //       console.log('❌ No video source (content or description)');
  //     }
  //   }
  // }, [
  //   currentTopic,
  //   videoTask,
  //   isVideoLoading,
  //   content,
  //   dispatch,
  //   mIdx,
  //   tIdx,
  // ]);

  // ─── Toggle completion ─────────────────────────────────────────────────────

  const handleToggleCompletion = () => {
    if (isComplete) {
      // If already complete, allow toggling off
      dispatch(toggleTopicCompletion({ moduleIndex: mIdx, topicIndex: tIdx }));
      
      // Also save to backend if we have the lesson ID
      if (content?.lessonId) {
        dispatch(saveLessonCompletion({
          enrollmentId: eId!,
          lessonId: content.lessonId,
          isCompleted: false,
          moduleIndex: mIdx,
          topicIndex: tIdx,
        }));
      }
    } else {
      // If not complete, open quiz overlay for knowledge check
      setQuizOverlayOpen(true);
    }
  };

  const handleQuizComplete = () => {
    // Called after quiz is passed (or user chooses to continue)
    // Automatically navigate to the next topic
    const nextTopic = getNextTopic();
    if (nextTopic) {
      navigateToTopic(nextTopic);
    } else {
      // If no next topic, close the overlay and stay on current page
      setQuizOverlayOpen(false);
    }
  };

  // ─── Scroll to top & reset view on topic change ─────────────────────────────

  useEffect(() => {
    window.scrollTo?.(0, 0);
    if (sampleSessionIdRef.current) {
      codingAPI.stopInteractiveSampleCode({ session_id: sampleSessionIdRef.current }).catch(() => undefined);
    }
    Object.values(dynamicSessionIdsRef.current).forEach((sessionId) => {
      codingAPI.stopInteractiveSampleCode({ session_id: sessionId }).catch(() => undefined);
    });

    // Default to dynamic script view for each topic.
    dispatch(
      setActiveResourceView({
        moduleIndex: mIdx,
        topicIndex: tIdx,
        view: { type: 'dynamic-script' },
      })
    );
    setNoteTitle('');
    setNoteContent('');
    setSampleTerminalHistory(['Ready. Press Run to execute your code.']);
    setSampleSessionId(null);
    setSampleSessionRunning(false);
    setDynamicTerminalHistoryByBlock({});
    setDynamicSessionIdByBlock({});
    setDynamicSessionRunningByBlock({});
  }, [mIdx, tIdx, dispatch]);

  // ─── Redirect if module is locked ──────────────────────────────────────────

  useEffect(() => {
    if (syllabus && !isModuleUnlocked(mIdx)) {
      navigate(`/course/${enrollmentId}`, { replace: true });
    }
  }, [syllabus, mIdx, enrollmentId, navigate, isModuleUnlocked]);

  if (!syllabus || !currentModule || !currentTopic) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-neutral-500">Topic not found</p>
      </div>
    );
  }


  // ─── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-transparent p-6 lg:p-8">
      <div className="mb-4 rounded-2xl border border-black/10 bg-white/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={`/course/${enrollmentId}`}>{courseName}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={`/course/${enrollmentId}/module/${mIdx}/topic/0`}>
                  {currentModule.module_name}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{currentTopic.topic_name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
          </Breadcrumb>

          {syllabus && eId && (
            <Button
              onClick={() => setStructureDialogOpen(true)}
              variant="outline"
              size="sm"
            >
              <ListTree className="w-4 h-4 mr-2" />
              Structure
            </Button>
          )}
        </div>
      </div>

      {/* Topic Header */}
      <div className="mb-6 rounded-2xl border border-black/10 bg-white px-6 py-5">
        <h1 className="text-3xl font-semibold text-neutral-900 mb-1">
          {currentTopic.topic_name}
        </h1>
        <p className="text-neutral-600 leading-relaxed">{currentTopic.description}</p>
      </div>

      {/* Content Area — switches between text, video, audio, notes based on activeView */}
      <div className="surface-card min-h-[400px] overflow-hidden">
        {isLoading ? (
          /* Loading state */
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-neutral-700 mb-4" />
            <p className="text-neutral-500 text-sm">
              Generating personalized content...
            </p>
            <p className="text-gray-400 text-xs mt-1">
              This may take a moment
            </p>
          </div>
        ) : error ? (
          /* Error state */
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-neutral-900 mb-2">
              Failed to generate content
            </h2>
            <p className="text-neutral-500 text-sm mb-6 max-w-md">
              {error}
            </p>
            <Button onClick={handleGenerate} size="lg" variant="outline">
              Try Again
            </Button>
          </div>
        ) : content ? (
          <>
            {/* View-type tabs (visible when resources exist) */}
            {resources.length > 0 && (
              <div className="flex items-center gap-1 px-6 pt-4 pb-2 border-b border-gray-100 overflow-x-auto">
                {/* Default text view */}
                <button
                  onClick={() =>
                    dispatch(setActiveResourceView({ moduleIndex: mIdx, topicIndex: tIdx, view: null }))
                  }
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                    !activeView
                      ? 'bg-neutral-100 text-neutral-800'
                      : 'text-neutral-500 hover:bg-neutral-50'
                  )}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Reading
                </button>

                {/* Video resources */}
                {resources
                  .filter((r) => r.resource_type === 'video')
                  .map((r) => (
                    <button
                      key={r.id}
                      onClick={() =>
                        dispatch(
                          setActiveResourceView({
                            moduleIndex: mIdx,
                            topicIndex: tIdx,
                            view: { type: 'video', resourceId: r.id },
                          })
                        )
                      }
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                        activeView?.type === 'video' && activeView.resourceId === r.id
                          ? 'bg-neutral-100 text-neutral-900'
                          : 'text-neutral-500 hover:bg-neutral-50'
                      )}
                    >
                      <Play className="w-3.5 h-3.5" />
                      {r.title.length > 25 ? r.title.slice(0, 25) + '...' : r.title}
                    </button>
                  ))}

                {/* Audio resources */}
                {resources
                  .filter((r) => r.resource_type === 'audio')
                  .map((r) => (
                    <button
                      key={r.id}
                      onClick={() =>
                        dispatch(
                          setActiveResourceView({
                            moduleIndex: mIdx,
                            topicIndex: tIdx,
                            view: { type: 'audio', resourceId: r.id },
                          })
                        )
                      }
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                        activeView?.type === 'audio' && activeView.resourceId === r.id
                          ? 'bg-neutral-100 text-neutral-800'
                          : 'text-neutral-500 hover:bg-neutral-50'
                      )}
                    >
                      <Headphones className="w-3.5 h-3.5" />
                      {r.title.length > 25 ? r.title.slice(0, 25) + '...' : r.title}
                    </button>
                  ))}

                {/* Extra note resources (user-created) */}
                {/* Notes resources (both AI-generated and user-created) */}
                {resources
                  .filter((r) => r.resource_type === 'notes')
                  .map((r) => (
                    <button
                      key={r.id}
                      onClick={() =>
                        dispatch(
                          setActiveResourceView({
                            moduleIndex: mIdx,
                            topicIndex: tIdx,
                            view: { type: 'notes', resourceId: r.id },
                          })
                        )
                      }
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                        activeView?.type === 'notes' && activeView.resourceId === r.id
                          ? 'bg-neutral-100 text-neutral-900'
                          : 'text-neutral-500 hover:bg-neutral-50'
                      )}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {r.title.length > 20 ? r.title.slice(0, 20) + '...' : r.title}
                    </button>
                  ))}

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
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                      activeView?.type === 'dynamic-script'
                        ? 'bg-neutral-100 text-neutral-900'
                        : 'text-neutral-500 hover:bg-neutral-50'
                    )}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {dynamicScript.title.length > 25 ? `${dynamicScript.title.slice(0, 25)}...` : dynamicScript.title}
                  </button>
                )}

                {resources
                  .filter((r) => r.resource_type === 'code_exercise')
                  .map((r) => (
                    <button
                      key={`code-${r.id}`}
                      onClick={() =>
                        dispatch(
                          setActiveResourceView({
                            moduleIndex: mIdx,
                            topicIndex: tIdx,
                            view: { type: 'code', resourceId: r.id },
                          })
                        )
                      }
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                        activeView?.type === 'code' && activeView.resourceId === r.id
                          ? 'bg-neutral-100 text-neutral-900'
                          : 'text-neutral-500 hover:bg-neutral-50'
                      )}
                    >
                      <Play className="w-3.5 h-3.5" />
                      {r.title.length > 25 ? `${r.title.slice(0, 25)}...` : r.title}
                    </button>
                  ))}
              </div>
            )}

            {/* ── Render the active view ─────────────────────────────── */}

            {/* Create Note Form */}
            {activeView?.type === 'create-note' ? (
              <div className="p-8 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-neutral-700" />
                    Create New Note
                  </h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      dispatch(
                        setActiveResourceView({ moduleIndex: mIdx, topicIndex: tIdx, view: null })
                      )
                    }
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <input
                  type="text"
                  placeholder="Note title..."
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-neutral-400"
                />
                <textarea
                  placeholder="Write your note in Markdown..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  rows={14}
                  className="w-full px-4 py-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-neutral-400 resize-y font-mono"
                />
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleSaveNote}
                    disabled={noteSaving || !noteTitle.trim() || !noteContent.trim()}
                    className="gap-2"
                  >
                    {noteSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save Note
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      dispatch(
                        setActiveResourceView({ moduleIndex: mIdx, topicIndex: tIdx, view: null })
                      )
                    }
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : activeView?.type === 'dynamic-script' && dynamicScript ? (
              <div className="p-8 space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900">{dynamicScript.title}</h2>
                {dynamicScript.overview && (
                  <p className="text-sm text-neutral-600">{dynamicScript.overview}</p>
                )}
                <div className="space-y-3">
                  {dynamicScript.blocks.slice(0, visibleDynamicBlocks).map((block, idx) => (
                    <div key={`${block.type}-${idx}`} className="rounded-xl border border-neutral-200 p-4 bg-neutral-50">
                      <p className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">
                        {block.type.replace('_', ' ')}
                      </p>
                      <p className="text-sm text-gray-800 font-medium mb-2">{block.prompt}</p>
                      {block.type === 'text' && (
                        <div className="prose prose-gray max-w-none text-sm markdown-content">
                          <ReactMarkdown
                            rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
                            components={{
                              h1: ({ ...props }) => <h1 className="text-2xl font-bold text-neutral-900 mt-6 mb-3" {...props} />,
                              h2: ({ ...props }) => <h2 className="text-xl font-bold text-neutral-900 mt-5 mb-2" {...props} />,
                              h3: ({ ...props }) => <h3 className="text-lg font-semibold text-neutral-900 mt-4 mb-2" {...props} />,
                              p: ({ ...props }) => <p className="text-gray-700 leading-relaxed mb-3" {...props} />,
                              code: ({ className, ...props }) => {
                                const isInline = !(className?.includes('language-') || className?.includes('hljs'));
                                if (isInline) {
                                  return <code className="markdown-inline-code" {...props} />;
                                }
                                return <code className={cn(className, 'markdown-code')} {...props} />;
                              },
                              pre: ({ ...props }) => (
                                <pre className="markdown-pre not-prose" {...props} />
                              ),
                              ul: ({ ...props }) => <ul className="list-disc ml-6 mb-3 space-y-1 text-gray-700" {...props} />,
                              ol: ({ ...props }) => <ol className="list-decimal ml-6 mb-3 space-y-1 text-gray-700" {...props} />,
                              blockquote: ({ ...props }) => <blockquote className="border-l-4 border-neutral-200 pl-4 italic my-3 text-neutral-600" {...props} />,
                            }}
                          >
                            {block.payload?.markdown || block.payload?.content || ''}
                          </ReactMarkdown>
                        </div>
                      )}
                      {block.type === 'quiz' && Array.isArray(block.payload?.questions) && (
                        <div className="space-y-2">
                          <p className="text-xs text-neutral-600">{block.payload.questions.length} questions</p>
                          {block.payload.questions.map((question: any, qIdx: number) => (
                            <div key={`${qIdx}-${question?.question || 'question'}`} className="rounded-lg border border-neutral-200 bg-white p-3">
                              <p className="text-sm font-medium text-neutral-900">Q{qIdx + 1}. {question?.question || 'Question'}</p>
                              {Array.isArray(question?.options) && question.options.length > 0 && (
                                <div className="mt-2 space-y-1.5">
                                  {question.options.map((option: string, oIdx: number) => (
                                    <div key={`${oIdx}-${option}`} className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-sm text-gray-700">
                                      <span className="font-medium text-neutral-500 mr-2">{String.fromCharCode(65 + oIdx)}.</span>
                                      {option}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {question?.correct_answer && (
                                <div className="mt-2">
                                  <button
                                    onClick={() => setQuizRevealByQuestion((prev) => ({
                                      ...prev,
                                      [`${idx}-${qIdx}`]: !prev[`${idx}-${qIdx}`],
                                    }))}
                                    className="text-xs text-neutral-700 hover:text-neutral-700"
                                  >
                                    {quizRevealByQuestion[`${idx}-${qIdx}`] ? 'Hide answer' : 'Show answer'}
                                  </button>
                                  {quizRevealByQuestion[`${idx}-${qIdx}`] && (
                                    <p className="text-xs text-neutral-800 mt-1">
                                      Answer: {question.correct_answer}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {block.type === 'code' && (
                        <div className="space-y-3">
                          <p className="text-sm text-gray-700">
                            {block.payload?.instructions || 'Edit and run this code directly below.'}
                          </p>
                          <div className="rounded-xl border border-neutral-200 overflow-hidden h-[520px] bg-white flex flex-col">
                            <div className="h-[58%] min-h-[220px] flex flex-col border-b border-neutral-200">
                              <div className="px-3 py-2 bg-neutral-50 text-xs font-medium text-neutral-600">Code</div>
                              <Editor
                                height="100%"
                                defaultLanguage="python"
                                language="python"
                                theme="vs-dark"
                                value={dynamicCodeByBlock[idx] || ''}
                                onChange={(val) => setDynamicCodeByBlock((prev) => ({ ...prev, [idx]: val || '' }))}
                                options={{
                                  minimap: { enabled: false },
                                  fontSize: 14,
                                  automaticLayout: true,
                                  wordWrap: 'on',
                                }}
                              />
                            </div>

                            <div className="h-[42%] min-h-[170px] flex flex-col p-2 bg-[#0b1220] text-[#d5e6ff]">
                              <div className="text-xs font-semibold text-[#8fb5ff] mb-1">Terminal</div>
                              <div className="flex-1 overflow-auto rounded-lg border border-[#1f2a44] p-2 bg-[#070d18] text-xs font-mono whitespace-pre-wrap">
                                {(dynamicTerminalHistoryByBlock[idx] || ['Ready. Press Run to execute your code.']).join('\n')}
                                <div className="mt-2 flex items-center gap-2 border-t border-[#1f2a44] pt-2">
                                  <span className="text-[#6de2a1]">$</span>
                                  <input
                                    value={dynamicInputByBlock[idx] || ''}
                                    onChange={(e) => setDynamicInputByBlock((prev) => ({ ...prev, [idx]: e.target.value }))}
                                    className="flex-1 bg-transparent outline-none text-xs font-mono text-[#d5e6ff]"
                                    placeholder={dynamicSessionRunningByBlock[idx] ? 'type and send to running process...' : 'optional first input after run...'}
                                  />
                                  <button
                                    onClick={() => handleRunDynamicCodeBlock(idx)}
                                    disabled={!!dynamicCodeRunningByBlock[idx] || !(dynamicCodeByBlock[idx] || '').trim()}
                                    className="px-2 py-0.5 rounded bg-[#123a70] hover:bg-[#1a4e93] text-white text-xs disabled:opacity-50"
                                  >
                                    {dynamicCodeRunningByBlock[idx] ? 'Working...' : dynamicSessionRunningByBlock[idx] ? 'Send' : 'Run'}
                                  </button>
                                  <button
                                    onClick={() => handleStopDynamicCodeBlock(idx)}
                                    disabled={!!dynamicCodeRunningByBlock[idx] || !dynamicSessionIdByBlock[idx]}
                                    className="px-2 py-0.5 rounded border border-[#2a3a5e] text-[#c8d8ff] text-xs disabled:opacity-40"
                                  >
                                    Stop
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      {block.type === 'video' && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-neutral-900">
                            {block.payload?.title || 'Video Segment'}
                          </p>
                          <p className="text-sm text-gray-700">
                            {block.payload?.description || 'Video guidance for this step will appear here.'}
                          </p>
                          {Array.isArray(block.payload?.key_points) && block.payload.key_points.length > 0 && (
                            <ul className="list-disc ml-5 text-sm text-gray-700 space-y-1">
                              {block.payload.key_points.map((point: string, pIdx: number) => (
                                <li key={`${pIdx}-${point}`}>{point}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      {block.type === 'mind_map' && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-neutral-900">
                            Root: {block.payload?.root || 'Mind Map'}
                          </p>
                          {Array.isArray(block.payload?.nodes) && block.payload.nodes.length > 0 ? (
                            <div className="space-y-1 text-sm text-gray-700">
                              {block.payload.nodes.slice(0, 12).map((node: any, nIdx: number) => (
                                <p key={`${nIdx}-${node?.id || node?.label || 'node'}`}>
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
                    </div>
                  ))}
                </div>
              </div>
            ) : activeView?.type === 'code' && activeResource ? (
              isSampleCodeResource ? (
                <div className="p-6 space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-900">
                      {activeResource.content_json?.title || activeResource.title}
                    </h2>
                    <p className="text-sm text-neutral-600 mt-1">
                      {activeResource.content_text || activeResource.content_json?.explanation || 'Edit and run the code.'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-neutral-200 overflow-hidden h-[560px] bg-white flex flex-col">
                    <div className="h-[58%] min-h-[250px] flex flex-col border-b border-neutral-200">
                      <div className="px-3 py-2 bg-neutral-50 text-xs font-medium text-neutral-600">Code Runner</div>
                      <Editor
                        height="100%"
                        defaultLanguage="python"
                        language="python"
                        theme="vs-dark"
                        value={sampleCodeValue}
                        onChange={(val) => setSampleCodeValue(val || '')}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 14,
                          automaticLayout: true,
                          wordWrap: 'on',
                        }}
                      />
                    </div>

                    <div className="h-[42%] min-h-[190px] flex flex-col p-2 bg-[#0b1220] text-[#d5e6ff]">
                      <div className="text-xs font-semibold text-[#8fb5ff] mb-1">Terminal</div>
                      <div className="flex-1 overflow-auto rounded-lg border border-[#1f2a44] p-2 bg-[#070d18] text-xs font-mono whitespace-pre-wrap">
                        {sampleTerminalHistory.join('\n')}
                        <div className="mt-2 flex items-center gap-2 border-t border-[#1f2a44] pt-2">
                          <span className="text-[#6de2a1]">$</span>
                          <input
                            value={sampleCodeInput}
                            onChange={(e) => setSampleCodeInput(e.target.value)}
                            className="flex-1 bg-transparent outline-none text-xs font-mono text-[#d5e6ff]"
                            placeholder={sampleSessionRunning ? 'type and send to running process...' : 'optional first input after run...'}
                          />
                          <button
                            onClick={handleRunSampleCode}
                            disabled={sampleCodeRunning || !sampleCodeValue.trim()}
                            className="px-2 py-0.5 rounded bg-[#123a70] hover:bg-[#1a4e93] text-white text-xs disabled:opacity-50"
                          >
                            {sampleCodeRunning ? 'Working...' : sampleSessionRunning ? 'Send' : 'Run'}
                          </button>
                          <button
                            onClick={handleStopSampleCode}
                            disabled={sampleCodeRunning || !sampleSessionId}
                            className="px-2 py-0.5 rounded border border-[#2a3a5e] text-[#c8d8ff] text-xs disabled:opacity-40"
                          >
                            Stop
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 space-y-4">
                  <h2 className="text-lg font-semibold text-neutral-900">{activeResource.title}</h2>
                  <p className="text-sm text-neutral-600">Try-yourself coding assessment with test cases.</p>
                  <Button
                    onClick={() => {
                      const problemId = activeResource.content_json?.coding_problem_id;
                      if (problemId) {
                        navigate(`/course/${enrollmentId}/module/${mIdx}/topic/${tIdx}/coding/${problemId}`);
                      }
                    }}
                    className="gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Open Compiler Page
                  </Button>
                </div>
              )
            ) : activeView?.type === 'video' && activeResource ? (
              /* ── Video player ──────────────────────────────────────── */
              <div className="p-8">
                <h2 className="text-lg font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                  <Play className="w-5 h-5 text-neutral-700" />
                  {activeResource.title}
                </h2>
                <video
                  controls
                  autoPlay
                  className="w-full rounded-xl shadow-lg"
                  src={activeResource.file_url || activeResource.file}
                >
                  Your browser does not support video playback.
                </video>
                {activeResource.duration_seconds && (
                  <p className="text-xs text-gray-400 mt-2">
                    Duration: {Math.floor(activeResource.duration_seconds / 60)}m{' '}
                    {activeResource.duration_seconds % 60}s
                  </p>
                )}
              </div>
            ) : activeView?.type === 'audio' && activeResource ? (
              /* ── Audio player ──────────────────────────────────────── */
              <div className="p-8">
                <div className="bg-neutral-100 rounded-2xl p-8 text-center">
                  <div className="w-20 h-20 bg-neutral-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Headphones className="w-10 h-10 text-neutral-700" />
                  </div>
                  <h2 className="text-lg font-semibold text-neutral-900 mb-1">
                    {activeResource.title}
                  </h2>
                  {activeResource.content_json?.person1 &&
                    activeResource.content_json?.person2 && (
                      <p className="text-sm text-neutral-500 mb-4">
                        {activeResource.content_json.person1} &{' '}
                        {activeResource.content_json.person2}
                      </p>
                    )}
                  <audio
                    controls
                    autoPlay
                    className="w-full max-w-lg mx-auto"
                    src={activeResource.file_url || activeResource.file}
                  >
                    Your browser does not support the audio element.
                  </audio>
                  {activeResource.content_json?.instruction && (
                    <p className="text-xs text-gray-400 mt-4">
                      Focus: {activeResource.content_json.instruction}
                    </p>
                  )}
                </div>
              </div>
            ) : activeView?.type === 'notes' && activeResource ? (
              /* ── Note resource view ────────────────────────────────── */
              <div className="p-8">
                <h2 className="text-lg font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-neutral-700" />
                  {activeResource.title}
                </h2>
                <div className="prose prose-gray max-w-none markdown-content">
                  <ReactMarkdown
                    rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
                    components={{
                      h1: ({ ...props }) => <h1 className="text-2xl font-bold text-neutral-900 mt-8 mb-4" {...props} />,
                      h2: ({ ...props }) => <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-3" {...props} />,
                      h3: ({ ...props }) => <h3 className="text-lg font-semibold text-neutral-900 mt-6 mb-2" {...props} />,
                      p: ({ ...props }) => <p className="text-gray-700 leading-relaxed mb-4" {...props} />,
                      code: ({ className, ...props }) => {
                        const isInline = !(className?.includes('language-') || className?.includes('hljs'));
                        if (isInline) {
                          return <code className="markdown-inline-code" {...props} />;
                        }
                        return <code className={cn(className, 'markdown-code')} {...props} />;
                      },
                      pre: ({ ...props }) => (
                        <pre className="markdown-pre not-prose" {...props} />
                      ),
                      ul: ({ ...props }) => <ul className="list-disc ml-6 mb-4 space-y-2 text-gray-700" {...props} />,
                      ol: ({ ...props }) => <ol className="list-decimal ml-6 mb-4 space-y-2 text-gray-700" {...props} />,
                      blockquote: ({ ...props }) => <blockquote className="border-l-4 border-neutral-200 pl-4 italic my-4 text-neutral-600" {...props} />,
                    }}
                  >
                    {activeResource.content_text || ''}
                  </ReactMarkdown>
                </div>
              </div>
            ) : (
              /* ── Default: text reading view ────────────────────────── */
              <div className="p-8">
                <div className="prose prose-gray max-w-none markdown-content">
                  <ReactMarkdown
                    rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
                    components={{
                      h1: ({ ...props }) => <h1 className="text-2xl font-bold text-neutral-900 mt-8 mb-4" {...props} />,
                      h2: ({ ...props }) => <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-3" {...props} />,
                      h3: ({ ...props }) => <h3 className="text-lg font-semibold text-neutral-900 mt-6 mb-2" {...props} />,
                      p: ({ ...props }) => <p className="text-gray-700 leading-relaxed mb-4" {...props} />,
                      code: ({ className, ...props }) => {
                        const isInline = !(className?.includes('language-') || className?.includes('hljs'));
                        if (isInline) {
                          return <code className="markdown-inline-code" {...props} />;
                        }
                        return <code className={cn(className, 'markdown-code')} {...props} />;
                      },
                      pre: ({ ...props }) => (
                        <pre className="markdown-pre not-prose" {...props} />
                      ),
                      ul: ({ ...props }) => <ul className="list-disc ml-6 mb-4 space-y-2 text-gray-700" {...props} />,
                      ol: ({ ...props }) => <ol className="list-decimal ml-6 mb-4 space-y-2 text-gray-700" {...props} />,
                      blockquote: ({ ...props }) => <blockquote className="border-l-4 border-neutral-200 pl-4 italic my-4 text-neutral-600" {...props} />,
                    }}
                  >
                    {content.content}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Generate CTA */
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mb-4">
              <BookOpen className="w-8 h-8 text-neutral-700" />
            </div>
            <h2 className="text-lg font-semibold text-neutral-900 mb-2">
              Ready to learn?
            </h2>
            <p className="text-neutral-500 text-sm mb-6 text-center max-w-md">
              Generate AI-powered content personalized to your learning level
              and style for &quot;{currentTopic.topic_name}&quot;.
            </p>
            <Button onClick={handleGenerate} size="lg">
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Content
            </Button>
          </div>
        )}
      </div>

      {/* Completion & Navigation */}
      <div className="mt-6">
        <Separator className="mb-6" />

        <div className="flex items-center justify-between">
          {/* Previous */}
          <div>
            {prev ? (
              <Button
                variant="outline"
                onClick={() => navigateToTopic(prev)}
                className="gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous Topic
              </Button>
            ) : (
              <div /> // spacer
            )}
          </div>

          {/* Mark Complete */}
          {content && (
            <Button
              variant={isComplete ? 'outline' : 'default'}
              onClick={handleToggleCompletion}
              className={cn(
                'gap-2',
                isComplete &&
                'border-neutral-300 text-neutral-800 hover:bg-neutral-100'
              )}
            >
              {isComplete ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Completed
                </>
              ) : (
                <>
                  <ClipboardCheck className="w-4 h-4" />
                  Take Quiz & Complete
                </>
              )}
            </Button>
          )}

          {/* Next */}
          <div>
            {next ? (
              <Button onClick={() => navigateToTopic(next)} className="gap-2">
                Next Topic
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : nextModuleLocked ? (
              <div className="flex flex-col items-end gap-1">
                <Button disabled className="gap-2 opacity-60 cursor-not-allowed">
                  <Lock className="w-4 h-4" />
                  Next Module Locked
                </Button>
                <p className="text-xs text-gray-400">
                  Complete all topics to unlock
                </p>
              </div>
            ) : (
              <Button
                onClick={() => navigate(`/course/${enrollmentId}`)}
                className="gap-2"
              >
                Back to Overview
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Quiz Overlay — triggered when user clicks "Take Quiz & Complete" */}
      {eId && content && (
        <TopicQuizOverlay
          open={quizOverlayOpen}
          onOpenChange={setQuizOverlayOpen}
          enrollmentId={eId}
          moduleIndex={mIdx}
          topicIndex={tIdx}
          onComplete={handleQuizComplete}
        />
      )}

      {/* Course Structure Dialog */}
      {syllabus && eId && (
        <CourseStructureDialog
          open={structureDialogOpen}
          onOpenChange={setStructureDialogOpen}
          syllabus={syllabus}
          courseName={courseName}
          enrollmentId={eId}
          topicCompletion={topicCompletion}
          onNavigateToTopic={(moduleIndex, topicIndex) => {
            navigate(`/course/${enrollmentId}/module/${moduleIndex}/topic/${topicIndex}`);
          }}
        />
      )}
    </div>
  );
}
