import { useState, useEffect } from 'react';
import { Outlet, useParams, useNavigate, useLocation } from 'react-router';
import { useAppDispatch, useAppSelector } from '../../store';
import { fetchSyllabus, fetchLessonProgress, fetchQuizAttempts } from '../../store/slices/syllabusSlice';
import { CourseOutlineSidebar } from './CourseOutlineSidebar';
import { StudioPanel } from './StudioPanel';
import { Loader2 } from 'lucide-react';

export function CourseLayout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { enrollmentId } = useParams();
  const eId = enrollmentId || null;

  const { syllabus, loading, error, enrollmentId: storedEId } = useAppSelector(
    (state) => state.syllabus
  );

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const isCodingAssessmentPage = location.pathname.includes('/coding/');

  // Fetch syllabus if not already loaded for this enrollment
  useEffect(() => {
    if (eId && (!syllabus || storedEId !== eId)) {
      dispatch(fetchSyllabus(eId)).then(() => {
        // After syllabus is loaded, fetch lesson progress and quiz attempts
        dispatch(fetchLessonProgress(eId));
        dispatch(fetchQuizAttempts(eId));
      });
    }
  }, [eId, syllabus, storedEId, dispatch]);

  // Auth check
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
    }
  }, [navigate]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f4f1eb]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-800 mx-auto mb-3" />
          <p className="text-neutral-600 text-sm">Loading your course...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f4f1eb]">
        <div className="text-center max-w-md">
          <p className="text-red-700 font-medium mb-2">
            Failed to load course
          </p>
          <p className="text-neutral-600 text-sm mb-4">{error}</p>
          <button
            onClick={() => eId && dispatch(fetchSyllabus(eId))}
            className="px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors text-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#f4f1eb] p-3 lg:p-4">
      <div className="h-full flex overflow-hidden rounded-2xl border border-black/10 bg-[#faf8f4] shadow-sm">
        {/* Left: Course Outline Sidebar */}
        <CourseOutlineSidebar
          collapsed={leftCollapsed}
          onToggle={() => setLeftCollapsed(!leftCollapsed)}
        />

        {/* Center: Main Content */}
        <main className="flex-1 overflow-y-auto border-x border-black/10">
          <Outlet />
        </main>

        {/* Right: Studio Panel (hidden on dedicated coding assessment page) */}
        {!isCodingAssessmentPage && (
          <StudioPanel
            collapsed={rightCollapsed}
            onToggle={() => setRightCollapsed(!rightCollapsed)}
          />
        )}
      </div>
    </div>
  );
}
