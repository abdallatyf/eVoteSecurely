import React, { useState } from 'react';
import { Task, TaskStatus } from '../types';

interface MyTasksPanelProps {
  tasks: Task[];
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
}

const MyTasksPanel: React.FC<MyTasksPanelProps> = ({ tasks, onUpdateTaskStatus }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const getStatusBadgeClass = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.TODO:
        return 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-100';
      case TaskStatus.IN_PROGRESS:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-100';
      case TaskStatus.DONE:
        return 'bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-100';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const incompleteTasks = tasks.filter(t => t.status !== TaskStatus.DONE);
  
  if (tasks.length === 0) return null;

  return (
    <div className="bg-theme-card p-4 rounded-lg shadow-md border border-theme-border mb-6">
      <button onClick={() => setIsExpanded(!isExpanded)} className="w-full flex justify-between items-center text-left p-2 -m-2 rounded-md hover:bg-theme-secondary/10 transition-colors">
        <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">My Assigned Tasks</h3>
            {incompleteTasks.length > 0 && (
                 <span className="text-sm bg-theme-primary text-white font-bold rounded-full h-6 w-6 flex items-center justify-center">{incompleteTasks.length}</span>
            )}
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && (
        <div className="mt-4 space-y-3">
          {tasks.length > 0 ? (
            tasks.map(task => (
              <div key={task.id} className="p-3 bg-theme-background rounded-md border border-theme-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="font-semibold">{task.title}</p>
                  <p className="text-xs text-gray-500">
                    Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'N/A'} • 
                    From: {task.assignedByName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(task.status)}`}>
                        {task.status}
                    </span>
                    <select
                        value={task.status}
                        onChange={(e) => onUpdateTaskStatus(task.id, e.target.value as TaskStatus)}
                        className="text-xs block px-2 py-1 border border-theme-border rounded-md shadow-sm focus:outline-none focus:ring-theme-primary bg-theme-card"
                    >
                        {Object.values(TaskStatus).map(status => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                    </select>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">You have no assigned tasks.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default MyTasksPanel;