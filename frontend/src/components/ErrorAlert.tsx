import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ErrorAlertProps {
  message: string | string[];
  onDismiss?: () => void;
  className?: string;
  variant?: 'error' | 'warning';
}

/**
 * Reusable error/warning alert component with dismiss functionality
 */
export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  message,
  onDismiss,
  className = '',
  variant = 'error',
}) => {
  if (!message || (Array.isArray(message) && message.length === 0)) {
    return null;
  }

  const messages = Array.isArray(message) ? message : [message];
  const bgColor = variant === 'error' ? 'bg-red-50' : 'bg-amber-50';
  const borderColor = variant === 'error' ? 'border-red-200' : 'border-amber-200';
  const iconColor = variant === 'error' ? 'text-red-600' : 'text-amber-600';
  const textColor = variant === 'error' ? 'text-red-800' : 'text-amber-800';

  return (
    <div
      className={`mb-5 p-4 ${bgColor} border ${borderColor} rounded-xl flex items-start gap-3 ${className}`}
      role="alert"
      aria-live="polite"
    >
      <AlertCircle className={`w-5 h-5 ${iconColor} flex-shrink-0 mt-0.5`} />
      <div className={`flex-1 text-sm ${textColor}`}>
        {messages.length === 1 ? (
          <p>{messages[0]}</p>
        ) : (
          <ul className="list-disc pl-4 space-y-1">
            {messages.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={`flex-shrink-0 ${iconColor} hover:opacity-70 transition-opacity`}
          aria-label="Dismiss error"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default ErrorAlert;
