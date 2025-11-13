import React, { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  className?: string;
  showCharCount?: boolean;
  isHighlighted?: boolean; // New prop
}

const Input: React.FC<InputProps> = ({ label, error, className = '', showCharCount, isHighlighted, ...rest }) => {
  const baseStyles = 'block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-theme-primary sm:text-sm transition-all duration-200';
  const errorStyles = error ? 'border-red-500' : 'border-theme-border';
  const highlightStyles = isHighlighted ? 'border-theme-primary ring-2 ring-theme-primary/50' : '';
  const disabledStyles = rest.disabled ? 'bg-gray-100 dark:bg-slate-700/50 cursor-not-allowed opacity-70' : 'bg-theme-card text-theme-text';
  
  const valueLength = String(rest.value || '').length;
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
      <input
        className={`${baseStyles} ${errorStyles} ${highlightStyles} ${disabledStyles}`}
        {...rest}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};

export default Input;
