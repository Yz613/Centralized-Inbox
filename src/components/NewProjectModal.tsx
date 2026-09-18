import React, { useState } from 'react';
import { useInbox } from '../context/InboxContext';
import { X, FolderPlus, Palette } from 'lucide-react';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COLOR_OPTIONS = [
  '#4F46E5', // Indigo
  '#059669', // Emerald
  '#D97706', // Amber
  '#DC2626', // Red
  '#7C3AED', // Violet
  '#0284C7', // Sky Blue
  '#DB2777', // Pink
  '#475569', // Slate
];

export const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, onClose }) => {
  const { addProject } = useInbox();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLOR_OPTIONS[0]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    addProject({
      name: name.trim(),
      category: category.trim() || undefined,
      description: description.trim() || 'Project unified inbox',
      color,
    });

    setName('');
    setCategory('');
    setDescription('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 w-full max-w-md overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-sans">
              Create New Project
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Project Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Horizon Mobile App"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Project Type / Category (Custom Type)
            </label>
            <input
              type="text"
              placeholder="e.g. SaaS, E-Commerce, Consulting, Client Work, or any custom type"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Description / Scope
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Inboxes for support, admin billing, and beta tester feedback"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
              <Palette className="w-3.5 h-3.5" />
              Project Theme Color
            </label>
            <div className="flex items-center gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition cursor-pointer ${
                    color === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-2xs transition cursor-pointer"
            >
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
