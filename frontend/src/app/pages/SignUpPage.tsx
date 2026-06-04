import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import { Eye, EyeOff, BookOpen, ArrowLeft, Loader } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import ErrorAlert from '../../components/ErrorAlert';

export default function SignUpPage() {
  const navigate = useNavigate();
  const { handleRegister, isAuthenticated, loading, error, clearAuthError } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [validationError, setValidationError] = useState('');
  const [localError, setLocalError] = useState('');

  const requiredFieldMessage = (label: string) => `${label} is required.`;

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

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    clearAuthError();
    setLocalError('');

    if (!formData.firstName.trim()) {
      setValidationError(requiredFieldMessage('First name'));
      return;
    }

    if (!formData.lastName.trim()) {
      setValidationError(requiredFieldMessage('Last name'));
      return;
    }

    if (!formData.email.trim()) {
      setValidationError(requiredFieldMessage('Email'));
      return;
    }

    if (!formData.password.trim()) {
      setValidationError(requiredFieldMessage('Password'));
      return;
    }

    if (!formData.confirmPassword.trim()) {
      setValidationError(requiredFieldMessage('Confirm password'));
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLocalError('No internet connection. Please check your network and try again.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setValidationError('Passwords do not match!');
      return;
    }

    if (formData.password.length < 8) {
      setValidationError('Password must be at least 8 characters long!');
      return;
    }

    const result = await handleRegister({
      first_name: formData.firstName,
      last_name: formData.lastName,
      email: formData.email,
      password: formData.password,
      password2: formData.confirmPassword,
    });

    if (result.meta.requestStatus === 'fulfilled') {
      navigate('/dashboard');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    if (validationError) {
      setValidationError('');
    }
  };

  const getErrorMessages = (): string[] => {
    const messages: string[] = [];

    // Add validation errors first
    if (validationError) {
      messages.push(validationError);
    }

    if (localError) {
      messages.push(localError);
    }

    // Add API errors
    if (error && typeof error === 'object') {
      if (error.message) {
        messages.push(error.message);
      }
      if (Array.isArray(error.details) && error.details.length > 0) {
        messages.push(...error.details);
      }
    } else if (typeof error === 'string') {
      messages.push(error);
    }

    return messages;
  };

  const errorMessages = getErrorMessages();

  useEffect(() => {
    if (error) {
      // eslint-disable-next-line no-console
      console.debug('[SignupPage] auth error in store:', error);
    }
    if (localError) {
      // eslint-disable-next-line no-console
      console.debug('[SignupPage] localError:', localError);
    }
  }, [error, localError]);

  return (
    <div className="min-h-screen bg-[#f7f5f1] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back Button */}
        <Link to="/" className="inline-flex items-center gap-2 text-neutral-600 hover:text-neutral-900 mb-4 transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Login</span>
        </Link>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-neutral-900 rounded-full mb-4 shadow-md">
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-semibold text-neutral-900 mb-2">LearnPath</h1>
          <p className="text-sm text-neutral-600">Build your learning identity.</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-3xl shadow-sm p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-2">Create Account</h2>
            <p className="text-neutral-600">Start your personalized learning journey today</p>
          </div>

          {/* Error Alert */}
          <ErrorAlert
            message={errorMessages}
            onDismiss={() => {
              setValidationError('');
              setLocalError('');
              clearAuthError();
            }}
          />

          <form onSubmit={handleSignUp} noValidate className="space-y-5">
            {/* First Name Input */}
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
                First Name
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                value={formData.firstName}
                onChange={handleChange}
                placeholder="Enter your first name"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-transparent transition-all"
              />
            </div>

            {/* Last Name Input */}
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">
                Last Name
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                value={formData.lastName}
                onChange={handleChange}
                placeholder="Enter your last name"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-transparent transition-all"
              />
            </div>

            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
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
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Create a password"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-transparent transition-all"
                  minLength={8}
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

            {/* Confirm Password Input */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Confirm your password"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-transparent transition-all"
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Sign Up Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-neutral-900 text-white py-3 rounded-xl font-medium hover:bg-neutral-800 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-neutral-600">
              Already have an account?{' '}
              <Link to="/" className="text-neutral-700 hover:text-neutral-900 font-medium">
                Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
