import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  BookOpen,
  Clock,
  Users,
  Loader2,
  AlertCircle,
  GraduationCap,
  CheckCircle,
  Copy,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Calendar
} from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import AssessmentDialog from '../components/AssessmentDialog';
import { courseAPI } from '../../services/api';
import type { Course } from '../../types/api';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

interface CourseCurriculum {
  id: string | number;
  user_identifier: string; // Anonymized like "Student #1"
  enrolled_at: string;
  knowledge_level: string;
  study_method: string;
  difficulty: string;
  syllabus: {
    course_name: string;
    difficulty_level: string;
    modules: Array<{
      module_name: string;
      module_description: string;
      topics: Array<{
        topic_name: string;
        short_description: string;
        estimated_duration_minutes: number;
      }>;
    }>;
  };
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'bg-green-100 text-green-800',
  intermediate: 'bg-yellow-100 text-yellow-800',
  advanced: 'bg-red-100 text-red-800',
};

const KNOWLEDGE_COLORS: Record<string, string> = {
  None: 'bg-gray-100 text-gray-700',
  Basic: 'bg-neutral-200 text-neutral-800',
  Intermediate: 'bg-purple-100 text-purple-700',
  Advanced: 'bg-pink-100 text-pink-700',
};

export default function CourseDetailsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [curricula, setCurricula] = useState<CourseCurriculum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCurricula, setExpandedCurricula] = useState<Set<string | number>>(new Set());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [assessmentDialogOpen, setAssessmentDialogOpen] = useState(false);
  const [curriculumToCopy, setCurriculumToCopy] = useState<CourseCurriculum | null>(null);

  useEffect(() => {
    if (courseId) {
      loadCourseData();
    }
  }, [courseId]);

  const loadCourseData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load course details
      const courseData = await courseAPI.get(courseId!);
      setCourse(courseData);

      // Load all curricula for this course
      const curriculaData = await courseAPI.getCourseEnrollments(courseId!);
      setCurricula(curriculaData.curricula || []);
    } catch (err: any) {
      console.error('Failed to load course data:', err);
      setError(err.response?.data?.error || 'Failed to load course details');
    } finally {
      setLoading(false);
    }
  };

  const toggleCurriculum = (enrollmentId: string | number) => {
    const newExpanded = new Set(expandedCurricula);
    if (newExpanded.has(enrollmentId)) {
      newExpanded.delete(enrollmentId);
    } else {
      newExpanded.add(enrollmentId);
    }
    setExpandedCurricula(newExpanded);
  };

  const toggleModule = (key: string) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedModules(newExpanded);
  };

  const handleUseCurriculum = (curriculum: CourseCurriculum) => {
    setCurriculumToCopy(curriculum);
    setShowCopyDialog(true);
  };

  const confirmUseCurriculum = () => {
    setShowCopyDialog(false);
    // Open assessment dialog to start enrollment with the selected curriculum
    setAssessmentDialogOpen(true);
  };

  const handleEnrollmentComplete = (enrollmentId: string | number) => {
    console.log('Enrollment created:', enrollmentId);
    navigate(`/course/${enrollmentId}`);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatHours = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const calculateTotalHours = (syllabus: CourseCurriculum['syllabus']) => {
    const totalMinutes = syllabus.modules.reduce((total, module) => {
      const moduleMinutes = module.topics.reduce((sum, topic) => {
        return sum + (topic.estimated_duration_minutes || 0);
      }, 0);
      return total + moduleMinutes;
    }, 0);
    return (totalMinutes / 60).toFixed(1);
  };

  if (loading) {
    return (
      <div className="app-shell">
        <Sidebar />
        <main className="app-main flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-700" />
        </main>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="app-shell">
        <Sidebar />
        <main className="app-main flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 mb-4">{error || 'Course not found'}</p>
            <Button onClick={() => navigate('/courses/popular')}>
              Back to Courses
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="app-main p-8">
        {/* Course Header */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <Badge className={DIFFICULTY_COLORS[course.difficulty_level]}>
                    {course.difficulty_level}
                  </Badge>
                  <Badge variant="outline">{course.category}</Badge>
                </div>
                <CardTitle className="text-3xl mb-2">{course.title}</CardTitle>
                <CardDescription className="text-base">
                  {course.description}
                </CardDescription>
              </div>
              {course.thumbnail && (
                <img
                  src={course.thumbnail}
                  alt={course.title}
                  className="w-32 h-32 object-cover rounded-lg ml-6"
                />
              )}
            </div>

            <div className="flex items-center gap-6 mt-4 text-sm text-neutral-600">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>{course.estimated_duration} minutes</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>{curricula.length} enrolled</span>
              </div>
              {course.modules_count && (
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  <span>{course.modules_count} modules</span>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent>
            <Button
              className="bg-neutral-900 hover:bg-neutral-800 text-white"
              onClick={() => setAssessmentDialogOpen(true)}
            >
              <GraduationCap className="w-4 h-4 mr-2" />
              Enroll in This Course
            </Button>
          </CardContent>
        </Card>

        {/* Personalized Curricula Section */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">
            Personalized Learning Paths
          </h2>
          <p className="text-neutral-600">
            Explore how other students structured their learning journey. You can adopt any curriculum that fits your goals.
          </p>
        </div>

        {curricula.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                No Enrollments Yet
              </h3>
              <p className="text-neutral-600">
                Be the first to create a personalized curriculum for this course!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {curricula.map((curriculum) => {
              const isExpanded = expandedCurricula.has(curriculum.id);

              return (
                <Card key={curriculum.id} className="overflow-hidden">
                  <CardHeader
                    className="cursor-pointer hover:bg-neutral-50 transition-colors"
                    onClick={() => toggleCurriculum(curriculum.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <CardTitle className="text-xl flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5 text-neutral-500" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-neutral-500" />
                            )}
                            {curriculum.user_identifier}
                          </CardTitle>
                          <Badge className={KNOWLEDGE_COLORS[curriculum.knowledge_level]}>
                            {curriculum.knowledge_level} Level
                          </Badge>
                        </div>

                        <div className="flex items-center gap-6 text-sm text-neutral-600">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            <span>Enrolled {formatDate(curriculum.enrolled_at)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            <span>{curriculum.syllabus.modules.length} modules</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            <span>~{calculateTotalHours(curriculum.syllabus)} hours</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            <span>{curriculum.study_method}</span>
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUseCurriculum(curriculum);
                        }}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Use This Path
                      </Button>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="border-t bg-neutral-50">
                      <div className="space-y-4 mt-4">
                        {curriculum.syllabus.modules.map((module, moduleIndex) => {
                          const moduleKey = `${curriculum.id}-${moduleIndex}`;
                          const isModuleExpanded = expandedModules.has(moduleKey);
                          const totalMinutes = module.topics.reduce(
                            (sum, topic) => sum + topic.estimated_duration_minutes,
                            0
                          );

                          return (
                            <Card key={moduleIndex} className="bg-white">
                              <CardHeader
                                className="cursor-pointer hover:bg-neutral-50 transition-colors py-4"
                                onClick={() => toggleModule(moduleKey)}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <CardTitle className="text-lg flex items-center gap-2">
                                      {isModuleExpanded ? (
                                        <ChevronDown className="w-4 h-4 text-neutral-500" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4 text-neutral-500" />
                                      )}
                                      Module {moduleIndex + 1}: {module.module_name}
                                    </CardTitle>
                                    <CardDescription className="mt-1 ml-6">
                                      {module.module_description}
                                    </CardDescription>
                                  </div>
                                  <div className="flex items-center gap-2 text-sm text-neutral-600">
                                    <Clock className="w-4 h-4" />
                                    <span>{formatHours(totalMinutes)}</span>
                                  </div>
                                </div>
                              </CardHeader>

                              {isModuleExpanded && (
                                <CardContent className="pt-0 ml-6">
                                  <div className="space-y-3">
                                    {module.topics.map((topic, topicIndex) => (
                                      <div
                                        key={topicIndex}
                                        className="flex items-start justify-between p-3 bg-neutral-50 rounded-lg"
                                      >
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-1">
                                            <CheckCircle className="w-4 h-4 text-green-600" />
                                            <h4 className="font-medium text-neutral-900">
                                              {topic.topic_name}
                                            </h4>
                                          </div>
                                          <p className="text-sm text-neutral-600 ml-6">
                                            {topic.short_description}
                                          </p>
                                        </div>
                                        <span className="text-sm text-neutral-500 whitespace-nowrap ml-4">
                                          {topic.estimated_duration_minutes} min
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </CardContent>
                              )}
                            </Card>
                          );
                        })}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Copy Curriculum Confirmation Dialog */}
      <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use This Learning Path?</DialogTitle>
            <DialogDescription>
              You're about to use {curriculumToCopy?.user_identifier}'s personalized curriculum.
              This will structure your learning based on their {curriculumToCopy?.knowledge_level} level
              approach with {curriculumToCopy?.syllabus.modules.length} modules.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-neutral-600 mb-3">
              <strong>Note:</strong> You'll still take the pre-assessment, but the system will
              consider this curriculum structure when generating your personalized syllabus.
            </p>
            {curriculumToCopy && (
              <div className="bg-neutral-100 border border-neutral-300 rounded-lg p-4">
                <div className="flex items-center gap-2 text-neutral-900 mb-2">
                  <BookOpen className="w-5 h-5" />
                  <span className="font-medium">Curriculum Preview</span>
                </div>
                <ul className="text-sm text-neutral-800 space-y-1 ml-7">
                  <li>• {curriculumToCopy.syllabus.modules.length} modules</li>
                  <li>• ~{calculateTotalHours(curriculumToCopy.syllabus)} hours total</li>
                  <li>• {curriculumToCopy.study_method} approach</li>
                  <li>• {curriculumToCopy.knowledge_level} difficulty level</li>
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCopyDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmUseCurriculum} className="bg-neutral-900 hover:bg-neutral-800">
              Continue to Assessment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assessment Dialog */}
      {course && (
        <AssessmentDialog
          open={assessmentDialogOpen}
          onOpenChange={setAssessmentDialogOpen}
          courseId={course.id}
          courseName={course.title}
          onEnrollmentComplete={handleEnrollmentComplete}
        />
      )}
    </div>
  );
}
