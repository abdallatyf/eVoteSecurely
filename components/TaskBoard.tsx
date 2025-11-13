import React, { useState, useMemo } from 'react';
import { Task, TaskStatus, AdminUser } from '../types';
import Button from './Button';
import Modal from './Modal';
import Input from './Input';
import LoadingSpinner from './LoadingSpinner';

interface TaskBoardProps {
  tasks: Task[];
  admins: AdminUser[];
  currentAdmin: AdminUser;
  onAddTask: (newTaskData: Omit<Task, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  onDeleteTask: (taskId: string) => void;
}

const TaskCard: React.FC<{
    task: Task;
    onUpdateStatus: (newStatus: TaskStatus) => void;
    onDelete: () => void;
}> = ({ task, onUpdateStatus, onDelete }) => {
    
    const getStatusBadgeClass = (status: TaskStatus) => {
        switch (status) {
            case TaskStatus.TODO: return 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-100';
            case TaskStatus.IN_PROGRESS: return 'bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-100';
            case TaskStatus.DONE: return 'bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-100';
        }
    };

    return (
        <div className="bg-theme-background p-3 rounded-md border border-theme-border space-y-2">
            <div className="flex justify-between items-start">
                <p className="font-semibold">{task.title}</p>
                <button onClick={onDelete} className="text-gray-400 hover:text-red-500 transition-colors" title="Delete Task">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>
            <p className="text-sm text-gray-500">{task.description}</p>
            <div className="text-xs text-gray-400 pt-2 border-t border-theme-border space-y-1">
                <p><strong>To:</strong> {task.assignedToName}</p>
                <p><strong>Due:</strong> {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'N/A'}</p>
            </div>
             <div className="flex items-center justify-between pt-2">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(task.status)}`}>
                    {task.status}
                </span>
                <div className="flex gap-1">
                    {task.status !== TaskStatus.TODO && (
                        <Button size="sm" variant="secondary" className="!px-1 !py-0.5" onClick={() => onUpdateStatus(TaskStatus.TODO)} title="Move to To Do">
                           {'<'}
                        </Button>
                    )}
                    {task.status !== TaskStatus.IN_PROGRESS && (
                         <Button size="sm" variant="secondary" className="!px-1 !py-0.5" onClick={() => onUpdateStatus(TaskStatus.IN_PROGRESS)} title={task.status === TaskStatus.TODO ? 'Start Task' : 'Move to In Progress'}>
                            {task.status === TaskStatus.TODO ? '▶' : '<'}
                        </Button>
                    )}
                     {task.status !== TaskStatus.DONE && (
                        <Button size="sm" variant="secondary" className="!px-1 !py-0.5" onClick={() => onUpdateStatus(TaskStatus.DONE)} title="Complete Task">
                           {'>'}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

const TaskBoard: React.FC<TaskBoardProps> = ({ tasks, admins, currentAdmin, onAddTask, onUpdateTaskStatus, onDeleteTask }) => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [assignedToId, setAssignedToId] = useState('');
    const [error, setError] = useState('');

    const columns = useMemo(() => {
        return {
            [TaskStatus.TODO]: tasks.filter(t => t.status === TaskStatus.TODO),
            [TaskStatus.IN_PROGRESS]: tasks.filter(t => t.status === TaskStatus.IN_PROGRESS),
            [TaskStatus.DONE]: tasks.filter(t => t.status === TaskStatus.DONE),
        }
    }, [tasks]);

    const handleOpenModal = () => {
        setTitle('');
        setDescription('');
        setDueDate('');
        setAssignedToId('');
        setError('');
        setIsCreateModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !assignedToId) {
            setError('Title and assignee are required.');
            return;
        }
        setIsSubmitting(true);
        setError('');
        try {
            const assignedAdmin = admins.find(a => a.id === assignedToId);
            if (!assignedAdmin) throw new Error("Selected admin not found.");

            await onAddTask({
                title,
                description,
                status: TaskStatus.TODO,
                assignedToId,
                assignedToName: assignedAdmin.fullName,
                assignedById: currentAdmin.id,
                assignedByName: currentAdmin.fullName,
                dueDate: dueDate || undefined,
            });
            setIsCreateModalOpen(false);
        } catch (err) {
            console.error(err);
            setError("Failed to create task. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div>
            <div className="flex justify-end mb-4">
                <Button variant="primary" onClick={handleOpenModal}>Create New Task</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.values(TaskStatus).map(status => (
                    <div key={status} className="bg-theme-card p-4 rounded-lg border border-theme-border">
                        <h4 className="font-bold mb-4 text-center">{status} ({columns[status].length})</h4>
                        <div className="space-y-4 min-h-[200px]">
                            {columns[status].map(task => (
                                <TaskCard 
                                    key={task.id}
                                    task={task}
                                    onUpdateStatus={(newStatus) => onUpdateTaskStatus(task.id, newStatus)}
                                    onDelete={() => onDeleteTask(task.id)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <Modal isOpen={isCreateModalOpen} onClose={() => !isSubmitting && setIsCreateModalOpen(false)} title="Create a New Task">
                 <form onSubmit={handleSubmit} className="space-y-4 p-2">
                    {error && <p className="text-red-500 text-sm text-center bg-red-100 dark:bg-red-900/20 p-2 rounded">{error}</p>}
                    <Input label="Task Title" value={title} onChange={e => setTitle(e.target.value)} required disabled={isSubmitting} />
                    <div>
                        <label htmlFor="task-description" className="block text-sm font-medium text-theme-text mb-1">Description</label>
                        <textarea id="task-description" rows={4} value={description} onChange={e => setDescription(e.target.value)} disabled={isSubmitting} className="block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-theme-primary sm:text-sm border-theme-border bg-theme-card text-theme-text" />
                    </div>
                    <Input label="Due Date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={isSubmitting} />
                     <div>
                        <label htmlFor="assign-to" className="block text-sm font-medium text-theme-text mb-1">Assign To</label>
                        <select id="assign-to" value={assignedToId} onChange={e => setAssignedToId(e.target.value)} required disabled={isSubmitting} className="block w-full px-3 py-2 border border-theme-border rounded-md shadow-sm focus:outline-none focus:ring-theme-primary sm:text-sm bg-theme-card">
                            <option value="" disabled>-- Select an Admin --</option>
                            {admins.map(admin => (
                                <option key={admin.id} value={admin.id}>{admin.fullName}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex justify-end space-x-2 mt-6">
                        <Button type="button" variant="secondary" onClick={() => setIsCreateModalOpen(false)} disabled={isSubmitting}>Cancel</Button>
                        <Button type="submit" variant="primary" disabled={isSubmitting}>
                            {isSubmitting ? <LoadingSpinner /> : 'Create Task'}
                        </Button>
                    </div>
                 </form>
            </Modal>
        </div>
    );
};

export default TaskBoard;