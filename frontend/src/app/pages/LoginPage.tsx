import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import { Eye, EyeOff, BookOpen, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';

/**
 * Parse Django REST Framework field-level validation errors into readable strings.
 */
function parseApiErrors(error: any): string[] {
  if (!error) return [];
  if (typeof error === 'string') return [error];
  if (error.detail) return [error.detail];

  const messages: string[] = [];
  for (const [field, fieldErrors] of Object.entries(error)) {
    if (field === 'non_field_errors') {
      if (Array.isArray(fieldErrors)) {
        messages.push(...fieldErrors.map(String));
      } else {
        messages.push(String(fieldErrors));
      }
    } else {
      const label = field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');
      if (Array.isArray(fieldErrors)) {
        fieldErrors.forEach((msg) => messages.push(`${label}: ${msg}`));
      } else {
        messages.push(`${label}: ${fieldErrors}`);
      }
    }
  }
  return messages.length > 0 ? messages : ['Login failed. Please check your credentials.'];
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { handleLogin, isAuthenticated, loading, error, clearAuthError } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    // Redirect if already authenticated
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    // Clear error when component unmounts
    return () => {
      clearAuthError();
    };
  }, [clearAuthError]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();

    const result = await handleLogin({ email, password });
    if (result.meta.requestStatus === 'fulfilled') {
      navigate('/dashboard');
    }
  };

  const errorMessages = error ? parseApiErrors(error) : [];

  return (
    <div className="min-h-screen bg-[#f7f5f1] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-neutral-900 rounded-full mb-4 shadow-md">
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-semibold text-neutral-900 mb-2">LearnPath</h1>
          <p className="text-sm text-neutral-600">Crafted for focused, modern learning.</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-3xl shadow-sm p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-2">Welcome Back</h2>
            <p className="text-neutral-600">Login to continue your personalized learning journey</p>
          </div>

          {/* Error Messages */}
          {errorMessages.length > 0 && (
            <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                {errorMessages.length === 1 ? (
                  <p>{errorMessages[0]}</p>
                ) : (
                  <ul className="list-disc pl-4 space-y-1">
                    {errorMessages.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email / Username
              </label>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-transparent transition-all"
                required
              />
            </div>

            {/* Password Input */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-transparent transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Forgot Password */}
            <div className="text-right">
              <Link to="/forgot-password" className="text-sm text-neutral-700 hover:text-neutral-900 font-medium">
                Forgot Password?
              </Link>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-neutral-900 text-white py-3 rounded-xl font-medium hover:bg-neutral-800 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          {/* OR separator and Google button */}
          <div className="mt-4">
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-neutral-200" />
              <div className="text-sm text-neutral-500">OR</div>
              <div className="flex-1 h-px bg-neutral-200" />
            </div>

            <button
              onClick={async () => {
                // Redirect to Supabase Google OAuth
                const redirectTo = `${window.location.origin}/oauth-callback`;
                // @ts-ignore
                await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
              }}
              className="w-full border border-neutral-200 py-3 rounded-xl flex items-center justify-center gap-3 hover:bg-neutral-50 transition"
            >
              <img src="/google-icon.svg" alt="Google" className="w-5 h-5" />
              <span className="text-sm">Continue with Google</span>
            </button>
          </div>

          {/* Create Account Link */}
          <div className="mt-6 text-center">
            <p className="text-neutral-600">
              Don't have an account?{' '}
              <Link to="/signup" className="text-neutral-700 hover:text-neutral-900 font-medium">
                Create Account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
