import { Home, BookOpen, TrendingUp, Layers, Settings, LogOut, User, Star, Shield } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth';

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, handleLogout } = useAuth();

  const menuItems = [
    { icon: Home, label: 'Dashboard', path: '/dashboard' },
    { icon: BookOpen, label: 'My Courses', path: '/my-courses' },
    { icon: Star, label: 'Popular Courses', path: '/courses/popular' },
    { icon: TrendingUp, label: 'Progress', path: '/progress' },
    { icon: Layers, label: 'Modules', path: '/modules' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  // Check if user is staff/admin – backend returns is_staff on the user object
  const isStaff = (user as any)?.is_staff === true;

  const onLogout = async () => {
    await handleLogout();
    navigate('/login');
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-72 border-r border-neutral-200 bg-white/90 backdrop-blur-sm flex flex-col">
      <Link to="/dashboard" className="px-6 py-7 border-b border-neutral-200/80 hover:bg-neutral-50/80 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-neutral-900 text-white flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="font-semibold tracking-tight text-lg text-neutral-900 leading-none">LearnPath</span>
            <p className="text-[11px] uppercase tracking-[0.16em] text-neutral-500 mt-1">AI Learning Studio</p>
          </div>
        </div>
      </Link>

      {/* User Profile Section */}
      {user && (
        <div className="px-6 py-4 border-b border-neutral-200/80">
          <div className="flex items-center gap-3">
            {user.avatar ? (
              <img src={user.avatar} alt={user.first_name} className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 bg-neutral-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-neutral-600" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">
                {user.first_name} {user.last_name}
              </p>
              <p className="text-xs text-neutral-500 truncate">{user.email}</p>
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 px-4 py-5 space-y-2">
        <h2 className="px-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500 font-semibold">
          Quick Access
        </h2>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path ||
            (item.path === '/my-courses' && location.pathname.startsWith('/course/'));

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${isActive
                  ? 'bg-neutral-900 text-white shadow-sm'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm">{item.label}</span>
            </Link>
          );
        })}

        {/* Admin section – only visible to staff users */}
        {isStaff && (
          <>
            <h2 className="px-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500 font-semibold mt-4">
              Admin
            </h2>
            <Link
              to="/admin-dashboard"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                location.pathname === '/admin-dashboard'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span className="text-sm font-medium">Admin Dashboard</span>
            </Link>
          </>
        )}
      </nav>

      <div className="p-4 border-t border-neutral-200/80">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-rose-700 hover:bg-rose-50 transition-all w-full"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm">Logout</span>
        </button>
      </div>
    </aside>
  );
}
