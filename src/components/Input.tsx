import React, { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  className?: string;
  showCharCount?: boolean;
  isHighlighted?: boolean; // New prop
  onClear?: () => void; // New prop for clear button
}

const Input: React.FC<InputProps> = ({ label, error, className = '', showCharCount, isHighlighted, onClear, ...rest }) => {
  const baseStyles = 'block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-theme-primary sm:text-sm transition-all duration-200';
  const errorStyles = error ? 'border-red-500' : 'border-theme-border';
  const highlightStyles = isHighlighted ? 'border-theme-primary ring-2 ring-theme-primary/50' : '';
  const disabledStyles = rest.disabled ? 'bg-gray-100 dark:bg-slate-700/50 cursor-not-allowed opacity-70' : 'bg-theme-card text-theme-text';
  
  const value = rest.value || '';
  const valueLength = String(value).length;
  const maxLength = rest.maxLength;

  return (
    <div className={`mb-4 ${className}`}>
      <div className="flex justify-between items-baseline mb-1">
        {label && (
          <label htmlFor={rest.id || rest.name} className="block text-sm font-medium text-theme-text">
            {label}
          </label>
        )}
        {showCharCount && maxLength && (
          <span className={`text-xs ${maxLength > 0 && valueLength > maxLength ? 'text-red-500' : 'text-gray-500'}`}>
            {valueLength}/{maxLength}
          </span>
        )}
      </div>
      <div className="relative">
        <input
          className={`${baseStyles} ${errorStyles} ${highlightStyles} ${disabledStyles} ${onClear && value ? 'pr-8' : ''}`}
          {...rest}
        />
        {onClear && value && (
          <button
            type="button"
            onClick={onClear}
            className="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="Clear input"
          >
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};

export default Input;