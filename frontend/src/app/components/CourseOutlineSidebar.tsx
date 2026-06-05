import { useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ChevronLeft,
  CheckCircle2,
  PlayCircle,
  Circle,
  Clock,
  BookOpen,
  Menu,
  Lock,
} from 'lucide-react';
import { useAppSelector } from '../../store';
import { ScrollArea } from './ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from './ui/utils';

interface CourseOutlineSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function CourseOutlineSidebar({
  collapsed,
  onToggle,
}: CourseOutlineSidebarProps) {
  const navigate = useNavigate();
  const { enrollmentId, moduleIndex, topicIndex } = useParams();
  const eId = enrollmentId || null;
  const currentModuleIdx = moduleIndex ? parseInt(moduleIndex) : -1;
  const currentTopicIdx = topicIndex ? parseInt(topicIndex) : -1;

  const {
    syllabus,
    courseName,
    topicCompletion,
    generatedContent,
    quizResults,
  } = useAppSelector((state) => state.syllabus);

  const isTopicComplete = useCallback(
    (mIdx: number, tIdx: number) => !!topicCompletion[`${eId}-${mIdx}-${tIdx}`],
    [topicCompletion, eId]
  );

  const hasContent = useCallback(
    (mIdx: number, tIdx: number) => !!generatedContent[`${eId}-${mIdx}-${tIdx}`],
    [generatedContent, eId]
  );

  const getModuleCompletionCount = useCallback(
    (mIdx: number, topicsCount: number) => {
      let completed = 0;
      for (let t = 0; t < topicsCount; t++) {
        if (isTopicComplete(mIdx, t)) completed++;
      }
      return completed;
    },
    [isTopicComplete]
  );

  /**
   * Module 0 is always unlocked.
   * Module N requires all topics in module N-1 to be completed.
   * Users can complete topics even with scores below 80% by clicking "Continue Anyway"
   */
  const isModuleUnlocked = useCallback(
    (mIdx: number) => {
      if (mIdx === 0) return true;
      if (!syllabus) return false;
      const prevModule = syllabus.modules[mIdx - 1];
      if (!prevModule) return false;
      // Module unlocks when all topics in previous module are completed
      for (let t = 0; t < prevModule.topics.length; t++) {
        const key = `${eId}-${mIdx - 1}-${t}`;
        if (!topicCompletion[key]) return false;
      }
      return true;
    },
    [syllabus, topicCompletion, eId]
  );

  if (collapsed) {
    return (
      <div className="w-14 bg-[#fcfbf9] border-r border-black/10 flex flex-col items-center pt-4 shrink-0">
        <Button variant="ghost" size="icon" onClick={onToggle}>
          <Menu className="w-5 h-5" />
        </Button>
      </div>
    );
  }

  if (!syllabus) {
    return (
      <div className="w-80 bg-[#fcfbf9] border-r border-black/10 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  // Determine default open modules — current module or first module
  const defaultOpenModules = currentModuleIdx >= 0
    ? [`module-${currentModuleIdx}`]
    : ['module-0'];

  return (
    <aside className="w-80 bg-[#fcfbf9] border-r border-black/10 flex flex-col h-full shrink-0">
      {/* Logo - Clickable to Dashboard */}
      <Link to="/dashboard" className="px-5 pt-5 pb-3 border-b border-black/10 hover:bg-black/[0.02] transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-neutral-900 rounded-xl flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-lg text-gray-900 leading-none">LearnPath</p>
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500 mt-1">Course Workspace</p>
          </div>
        </div>
      </Link>
      
      {/* Header */}
      <div className="px-5 py-4 border-b border-black/10">
        <div className="flex items-center justify-between mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="text-gray-500 hover:text-gray-700 -ml-2"
          >
            <Menu className="w-4 h-4 mr-1" />
            <span className="text-xs">Hide menu</span>
          </Button>
        </div>
        <h2 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">
          {courseName}
        </h2>
      </div>

      {/* Module/Topic List */}
      <ScrollArea className="flex-1 overflow-y-auto">
        <Accordion
          type="multiple"
          defaultValue={defaultOpenModules}
          className="px-3 py-3"
        >
          {syllabus.modules.map((mod, mIdx) => {
            const completedCount = getModuleCompletionCount(mIdx, mod.topics.length);
            const allComplete = completedCount === mod.topics.length;
            const unlocked = isModuleUnlocked(mIdx);

            return (
              <AccordionItem
                key={`module-${mIdx}`}
                value={`module-${mIdx}`}
                className="border-b-0"
                disabled={!unlocked}
              >
                <AccordionTrigger
                  className={cn(
                    'px-3 py-3 hover:no-underline rounded-xl text-left',
                    unlocked ? 'hover:bg-black/[0.03]' : 'opacity-60 cursor-not-allowed'
                  )}
                  disabled={!unlocked}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      {!unlocked ? (
                        <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                      ) : allComplete ? (
                        <CheckCircle2 className="w-4 h-4 text-neutral-700 shrink-0" />
                      ) : (
                        <BookOpen className="w-4 h-4 text-neutral-700 shrink-0" />
                      )}
                      <span className={cn(
                        'font-medium text-sm truncate',
                        unlocked ? 'text-gray-900' : 'text-gray-400'
                      )}>
                        {mod.module_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 ml-6">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {mod.difficulty_level}
                      </Badge>
                      {unlocked ? (
                        <span className="text-[10px] text-gray-400">
                          {completedCount}/{mod.topics.length} topics
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">
                          Locked — complete all topics in previous module
                        </span>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                {unlocked && (
                <AccordionContent className="pb-1">
                  <div className="space-y-1 ml-2">
                    {mod.topics.map((topic, tIdx) => {
                      const isActive =
                        currentModuleIdx === mIdx && currentTopicIdx === tIdx;
                      const completed = isTopicComplete(mIdx, tIdx);
                      const started = hasContent(mIdx, tIdx);

                      return (
                        <Link
                          key={`topic-${mIdx}-${tIdx}`}
                          to={`/course/${enrollmentId}/module/${mIdx}/topic/${tIdx}`}
                          className={cn(
                            'flex items-start gap-2.5 px-3 py-2.5 rounded-xl transition-colors text-sm group',
                            isActive
                              ? 'bg-black/[0.04] border-l-2 border-neutral-900'
                              : 'hover:bg-black/[0.02] border-l-2 border-transparent'
                          )}
                        >
                          {/* Status Icon */}
                          <div className="mt-0.5 shrink-0">
                            {completed ? (
                              <CheckCircle2 className="w-4 h-4 text-neutral-700" />
                            ) : isActive || started ? (
                              <PlayCircle className="w-4 h-4 text-neutral-700" />
                            ) : (
                              <Circle className="w-4 h-4 text-gray-300" />
                            )}
                          </div>

                          {/* Topic Info */}
                          <div className="flex-1 min-w-0">
                            <p
                              className={cn(
                                'text-sm leading-tight',
                                isActive
                                  ? 'text-neutral-900 font-medium'
                                  : completed
                                  ? 'text-gray-500'
                                  : 'text-gray-700'
                              )}
                            >
                              {topic.topic_name}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              ~5 min
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </AccordionContent>
                )}
              </AccordionItem>
            );
          })}
        </Accordion>
      </ScrollArea>

      {/* Back to Dashboard */}
       <div className="p-4 border-t border-black/10">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-gray-500 hover:text-gray-700"
          onClick={() => navigate('/dashboard')}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Dashboard
        </Button>
      </div>
    </aside>
  );
}
