import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import { Eye, EyeOff, BookOpen, Loader } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import ErrorAlert from '../../components/ErrorAlert';

export default function LoginPage() {
  const navigate = useNavigate();
  const { handleLogin, isAuthenticated, loading, error, clearAuthError } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [validationError, setValidationError] = useState('');

  /**
   * Extract error messages from the new error format
   */
  const getErrorMessages = (): string[] => {
    if (!error && !localError && !validationError) return [];

    // If local error (connectivity) exists, show it first
    const messages: string[] = [];
    if (validationError) {
      messages.push(validationError);
    }
    if (localError) {
      messages.push(localError);
    }

    // If error is a string
    if (typeof error === 'string') {
      messages.push(error);
      return messages;
    }

    // If error is an object with message and details
    if (error && typeof error === 'object') {
      // Add main message
      if (error.message) {
        messages.push(error.message);
      }

      // Add detailed field errors
      if (Array.isArray(error.details) && error.details.length > 0) {
        messages.push(...error.details);
      }

      return messages.length > 0 ? messages : ['An error occurred. Please try again.'];
    }

    return messages.length > 0 ? messages : ['An error occurred. Please try again.'];
  };

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
      setLocalError('');
    };
  }, [clearAuthError]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();
    setLocalError('');
    setValidationError('');

    if (!email.trim()) {
      setValidationError('Email / Username is required.');
      return;
    }

    if (!password.trim()) {
      setValidationError('Password is required.');
      return;
    }

    // Quick offline check
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLocalError('No internet connection. Please check your network and try again.');
      return;
    }

    const result = await handleLogin({ email, password });
    if (result.meta.requestStatus === 'fulfilled') {
      navigate('/dashboard');
    }
  };

  const errorMessages = getErrorMessages();

  // Debug: log auth errors to console for diagnosis
  useEffect(() => {
    if (error) {
      // eslint-disable-next-line no-console
      console.debug('[LoginPage] auth error in store:', error);
    }
    if (localError) {
      // eslint-disable-next-line no-console
      console.debug('[LoginPage] localError:', localError);
    }
  }, [error, localError]);

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

          {/* Error Alert */}
          <ErrorAlert
            message={errorMessages}
            onDismiss={() => {
              clearAuthError();
              setLocalError('');
              setValidationError('');
            }}
          />

          <form onSubmit={onSubmit} noValidate className="space-y-5">
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
              className="w-full bg-neutral-900 text-white py-3 rounded-xl font-medium hover:bg-neutral-800 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Logging in...</span>
                </>
              ) : (
                'Login'
              )}
            </button>
          </form>


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
