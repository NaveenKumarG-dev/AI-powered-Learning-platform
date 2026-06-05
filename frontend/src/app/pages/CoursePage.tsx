import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  BookOpen,
  Clock,
  Layers,
  GraduationCap,
  ChevronRight,
  Sparkles,
  Lock,
  ListTree,
} from 'lucide-react';
import { useAppSelector } from '../../store';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Button } from '../components/ui/button';
import { cn } from '../components/ui/utils';
import { CourseStructureDialog } from '../components/CourseStructureDialog';

export default function CoursePage() {
  const navigate = useNavigate();
  const { enrollmentId } = useParams();
  const eId = enrollmentId || null;
  const { syllabus, courseName, topicCompletion, quizResults } = useAppSelector(
    (state) => state.syllabus
  );
  const [structureDialogOpen, setStructureDialogOpen] = useState(false);

  if (!syllabus) return null;

  const totalTopics = syllabus.modules.reduce(
    (sum, m) => sum + m.topics.length,
    0
  );
  const completedTopics = Object.values(topicCompletion).filter(Boolean).length;
  const overallProgress =
    totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  const getModuleProgress = (mIdx: number, topicsCount: number) => {
    let completed = 0;
    for (let t = 0; t < topicsCount; t++) {
      if (topicCompletion[`${eId}-${mIdx}-${t}`]) completed++;
    }
    return topicsCount > 0 ? Math.round((completed / topicsCount) * 100) : 0;
  };

  const isModuleUnlocked = (mIdx: number): boolean => {
    if (mIdx === 0) return true;
    const prevModule = syllabus!.modules[mIdx - 1];
    if (!prevModule) return false;
    // Module unlocks when all topics in previous module are completed
    for (let t = 0; t < prevModule.topics.length; t++) {
      const key = `${eId}-${mIdx - 1}-${t}`;
      if (!topicCompletion[key]) return false;
    }
    return true;
  };

  const difficultyColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'beginner':
        return 'bg-green-100 text-green-700';
      case 'intermediate':
        return 'bg-yellow-100 text-yellow-700';
      case 'advanced':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Course Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-neutral-500 mb-3">
          <Sparkles className="w-4 h-4 text-neutral-700" />
          <span>AI-Personalized Course</span>
        </div>
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-3xl font-semibold text-neutral-900 flex-1">{courseName}</h1>
          <Button
            onClick={() => setStructureDialogOpen(true)}
            variant="outline"
            className="shrink-0"
          >
            <ListTree className="w-4 h-4 mr-2" />
            View Course Structure
          </Button>
        </div>
        <div className="flex items-center gap-4 text-sm text-neutral-500">
          <Badge
            className={cn(
              'text-xs capitalize',
              difficultyColor(syllabus.difficulty_level || syllabus.knowledge_level || 'Beginner')
            )}
          >
            {syllabus.difficulty_level || syllabus.knowledge_level}
          </Badge>
          <span className="flex items-center gap-1">
            <Layers className="w-4 h-4" />
            {syllabus.total_modules} modules
          </span>
          <span className="flex items-center gap-1">
            <BookOpen className="w-4 h-4" />
            {totalTopics} topics
          </span>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="surface-card p-6 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-neutral-900">Your Progress</h2>
          <span className="text-sm text-neutral-600">
            {completedTopics}/{totalTopics} topics completed
          </span>
        </div>
        <Progress value={overallProgress} className="h-3" />
        <p className="text-sm text-neutral-600 mt-2">{overallProgress}% complete</p>
      </div>

      {/* Module Cards */}
      <div className="space-y-4">
        {syllabus.modules.map((mod, mIdx) => {
          const progress = getModuleProgress(mIdx, mod.topics.length);
          const unlocked = isModuleUnlocked(mIdx);

          return (
            <button
              key={mIdx}
              onClick={() => {
                if (!unlocked) return;
                navigate(
                  `/course/${enrollmentId}/module/${mIdx}/topic/0`
                );
              }}
              disabled={!unlocked}
              className={cn(
                 'w-full bg-white rounded-2xl border p-6 transition-all text-left group',
                 unlocked
                   ? 'border-neutral-200 hover:border-neutral-300 hover:shadow-md cursor-pointer'
                   : 'border-neutral-200 opacity-60 cursor-not-allowed'
               )}
             >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                        !unlocked
                           ? 'bg-neutral-100'
                           : progress === 100
                             ? 'bg-green-100'
                             : progress > 0
                               ? 'bg-neutral-100'
                               : 'bg-neutral-100'
                       )}
                     >
                       {!unlocked ? (
                         <Lock className="w-5 h-5 text-neutral-400" />
                       ) : progress === 100 ? (
                         <GraduationCap className="w-5 h-5 text-green-600" />
                       ) : (
                         <BookOpen
                           className={cn(
                             'w-5 h-5',
                             progress > 0 ? 'text-neutral-700' : 'text-neutral-400'
                           )}
                         />
                       )}
                    </div>
                    <div>
                      <h3 className={cn(
                         'font-semibold transition-colors',
                         unlocked
                           ? 'text-neutral-900 group-hover:text-neutral-700'
                           : 'text-neutral-400'
                       )}>
                        Module {mIdx + 1}: {mod.module_name}
                      </h3>
                      <p className="text-sm text-neutral-600 mt-0.5">
                        {!unlocked
                          ? 'Complete all topics in the previous module to unlock'
                          : mod.description}
                      </p>
                    </div>
                  </div>
                </div>
                {unlocked ? (
                   <ChevronRight className="w-5 h-5 text-neutral-400 group-hover:text-neutral-700 transition-colors mt-2 shrink-0" />
                 ) : (
                   <Lock className="w-5 h-5 text-neutral-300 mt-2 shrink-0" />
                 )}
              </div>

              {/* Module meta */}
              <div className="flex items-center gap-4 mb-3 ml-13">
                <Badge
                  className={cn(
                    'text-[10px] capitalize',
                    difficultyColor(mod.difficulty_level || syllabus.difficulty_level || 'Beginner')
                  )}
                >
                  {mod.difficulty_level || syllabus.difficulty_level || 'Beginner'}
                </Badge>
                 <span className="text-xs text-neutral-500 flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  {mod.topics.length} topics
                </span>
                 <span className="text-xs text-neutral-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {mod.estimated_duration_minutes} min
                </span>
              </div>

              {/* Module progress bar */}
              <div className="ml-13">
                <Progress value={progress} className="h-2" />
                 <p className="text-xs text-neutral-500 mt-1">
                  {progress}% complete
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Course Structure Dialog */}
      {eId && (
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
