import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { Layers, CheckCircle2, Lock, Play, Loader2, BookOpen, AlertCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../store';
import { fetchEnrollments } from '../../store/slices/courseSlice';
import { fetchModuleProgress } from '../../store/slices/progressSlice';
import { Enrollment } from '../../types/api';

export default function ModulesPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { enrollments, loading: courseLoading } = useAppSelector((state) => state.course);
  const { moduleProgress, loading: progressLoading } = useAppSelector((state) => state.progress);
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    dispatch(fetchEnrollments({ status: 'active' }));
  }, [dispatch, isAuthenticated, navigate]);

  // Auto-select first enrollment
  useEffect(() => {
    if (enrollments.length > 0 && !selectedEnrollment) {
      setSelectedEnrollment(enrollments[0]);
    }
  }, [enrollments, selectedEnrollment]);

  // Fetch module progress when enrollment is selected
  useEffect(() => {
    if (selectedEnrollment) {
      dispatch(fetchModuleProgress({ enrollment: selectedEnrollment.id }));
    }
  }, [dispatch, selectedEnrollment]);

  const loading = courseLoading || progressLoading;

  // Determine module status from progress data
  const getModuleStatus = (moduleId: string | number): 'completed' | 'in_progress' | 'not_started' => {
    const progress = moduleProgress.find(
      (p) => String(p.module?.id) === String(moduleId) || String((p as any).module) === String(moduleId)
    );
    return progress?.status || 'not_started';
  };

  const getModuleProgressPercent = (moduleId: string | number): number => {
    const progress = moduleProgress.find(
      (p) => String(p.module?.id) === String(moduleId) || String((p as any).module) === String(moduleId)
    );
    return progress?.progress_percentage || 0;
  };

  // Get modules from the selected enrollment's course
  const modules = selectedEnrollment?.course?.modules || [];

  // Calculate overall progress
  const overallProgress = modules.length > 0
    ? Math.round(modules.reduce((acc, m) => acc + getModuleProgressPercent(m.id), 0) / modules.length)
    : 0;

  // Find the next incomplete module
  const nextModule = modules.find((m) => getModuleStatus(m.id) !== 'completed');

  if (loading && enrollments.length === 0) {
    return (
      <div className="app-shell">
        <Sidebar />
        <main className="app-main flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-700" />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="app-main">
        <div className="app-content">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-semibold text-neutral-900 mb-2">Learning Modules</h1>
            <p className="text-neutral-600 text-lg">Access all your course modules and materials</p>
          </div>

          {/* No Enrollments State */}
          {enrollments.length === 0 ? (
            <div className="surface-card p-12 text-center">
              <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold text-neutral-900 mb-2">No Active Courses</h2>
              <p className="text-neutral-600 mb-6">Enroll in a course to start learning and see your modules here.</p>
              <button
                onClick={() => navigate('/courses/popular')}
                className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-medium hover:bg-neutral-800 transition-all"
              >
                Browse Courses
              </button>
            </div>
          ) : (
            <>
              {/* Course Selector (if multiple enrollments) */}
              {enrollments.length > 1 && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Course</label>
                  <select
                    className="w-full max-w-md px-4 py-3 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                    title="Select active course"
                    value={selectedEnrollment?.id || ''}
                    onChange={(e) => {
                      const enrollment = enrollments.find((en) => String(en.id) === String(e.target.value));
                      if (enrollment) setSelectedEnrollment(enrollment);
                    }}
                  >
                    {enrollments.map((en) => (
                      <option key={en.id} value={en.id}>
                        {en.course?.title || en.course?.name || `Course #${en.course?.id}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Active Course Header */}
              <div className="surface-card p-8 mb-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-semibold text-neutral-900 mb-2">
                      {selectedEnrollment?.course?.title || selectedEnrollment?.course?.name || 'Course'}
                    </h2>
                    <p className="text-neutral-600">Currently Learning</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-neutral-600 mb-1">Progress</p>
                    <p className="text-3xl font-bold text-neutral-900">{overallProgress}%</p>
                  </div>
                </div>
                <progress
                  className="w-full h-3 [&::-webkit-progress-bar]:bg-gray-200 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:bg-gradient-to-r [&::-webkit-progress-value]:from-neutral-700 [&::-webkit-progress-value]:to-neutral-800 [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:bg-neutral-900 [&::-moz-progress-bar]:rounded-full"
                  value={overallProgress}
                  max={100}
                  aria-label="Overall course progress"
                />
              </div>

              {/* Modules List */}
              {modules.length === 0 ? (
                <div className="surface-card p-8 text-center">
                  <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-neutral-500">No modules found for this course. Modules will appear once the course is set up.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {modules.map((module, index) => {
                    const status = getModuleStatus(module.id);
                    const progressPercent = getModuleProgressPercent(module.id);
                    const isLocked = index > 0 && getModuleStatus(modules[index - 1].id) === 'not_started' && status === 'not_started';

                    return (
                      <div
                        key={module.id}
                        className={`surface-card p-6 transition-all ${isLocked ? 'opacity-60' : 'hover:shadow-xl cursor-pointer'
                          }`}
                        onClick={() => {
                          if (!isLocked && selectedEnrollment) {
                            navigate(`/course/${selectedEnrollment.id}`);
                          }
                        }}
                      >
                        <div className="flex items-center gap-6">
                          {/* Module Number & Status Icon */}
                          <div className="flex-shrink-0">
                            <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${status === 'completed'
                              ? 'bg-green-100'
                              : status === 'in_progress'
                                ? 'bg-neutral-200'
                                : 'bg-gray-100'
                              }`}>
                              {status === 'completed' ? (
                                <CheckCircle2 className="w-8 h-8 text-green-600" />
                              ) : status === 'in_progress' ? (
                                <Play className="w-8 h-8 text-neutral-700" />
                              ) : (
                                <Lock className="w-8 h-8 text-gray-400" />
                              )}
                            </div>
                          </div>

                          {/* Module Info */}
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-sm font-medium text-neutral-500">Module {module.order || index + 1}</span>
                              <span className={`px-3 py-1 rounded-lg text-xs font-medium ${status === 'completed'
                                ? 'bg-green-100 text-green-700'
                                : status === 'in_progress'
                                  ? 'bg-neutral-200 text-neutral-800'
                                  : 'bg-gray-100 text-neutral-600'
                                }`}>
                                {status === 'completed' ? 'Completed' : status === 'in_progress' ? 'In Progress' : isLocked ? 'Locked' : 'Not Started'}
                              </span>
                            </div>
                            <h3 className="text-xl font-semibold text-neutral-900 mb-2">{module.title}</h3>
                            <div className="flex items-center gap-4 text-sm text-neutral-600">
                              <span className="flex items-center gap-1">
                                <Layers className="w-4 h-4" />
                                {module.lessons_count || module.lessons?.length || 0} lessons
                              </span>
                              <span>•</span>
                              <span>{module.estimated_duration} min</span>
                            </div>
                          </div>

                          {/* Progress Bar (for in-progress modules) */}
                          {status === 'in_progress' && (
                            <div className="flex-shrink-0 w-48">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-neutral-600">Progress</span>
                                <span className="text-sm font-medium text-neutral-900">{progressPercent}%</span>
                              </div>
                              <progress
                                className="w-full h-2 [&::-webkit-progress-bar]:bg-gray-200 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:bg-neutral-900 [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:bg-neutral-900 [&::-moz-progress-bar]:rounded-full"
                                value={progressPercent}
                                max={100}
                                aria-label={`Progress for ${module.title}`}
                              />
                            </div>
                          )}

                          {/* Action Button */}
                          {!isLocked && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (selectedEnrollment) {
                                  navigate(`/course/${selectedEnrollment.id}`);
                                }
                              }}
                              className={`px-6 py-3 rounded-xl font-medium transition-all ${status === 'completed'
                                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                : 'bg-neutral-900 text-white hover:bg-neutral-800'
                                }`}
                            >
                              {status === 'completed' ? 'Review' : 'Continue'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Next Module Suggestion */}
              {nextModule && (
                <div className="mt-8 bg-neutral-900 rounded-2xl p-8 text-white">
                  <h3 className="text-2xl font-semibold mb-2">Ready for the Next Challenge?</h3>
                  <p className="text-neutral-200 mb-4">
                    {getModuleStatus(nextModule.id) === 'in_progress'
                      ? `Continue with ${nextModule.title}`
                      : `Start ${nextModule.title} to keep progressing`}
                  </p>
                  <button
                    onClick={() => {
                      if (selectedEnrollment) {
                        navigate(`/course/${selectedEnrollment.id}`);
                      }
                    }}
                    className="px-6 py-3 bg-white text-neutral-700 rounded-xl font-medium hover:bg-neutral-100 transition-all"
                  >
                    Continue Learning
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
