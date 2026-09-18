import React, { useState, useEffect } from 'react';
import { useInbox } from '../context/InboxContext';
import { X, FolderEdit, Palette, Trash2, AlertTriangle } from 'lucide-react';

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

export const EditProjectModal: React.FC = () => {
  const { editingProject, setEditingProject, updateProject, deleteProject } = useInbox();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (editingProject) {
      setName(editingProject.name);
      setCategory(editingProject.category || '');
      setDescription(editingProject.description || '');
      setColor(editingProject.color || COLOR_OPTIONS[0]);
      setIsConfirmingDelete(false);
    }
  }, [editingProject]);

  if (!editingProject) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    updateProject(editingProject.id, {
      name: name.trim(),
      category: category.trim() || undefined,
      description: description.trim(),
      color,
    });

    setEditingProject(null);
  };

  const handleDelete = () => {
    deleteProject(editingProject.id);
    setEditingProject(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <FolderEdit className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-sans">
              Edit Project & Custom Name
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setEditingProject(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Delete Confirmation Warning Mode */}
        {isConfirmingDelete ? (
          <div className="p-4 space-y-3.5 text-xs">
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-red-800 dark:text-red-300">
                <p className="font-bold text-xs">Permanently delete "{editingProject.name}"?</p>
                <p className="text-[11px] leading-relaxed">
                  This will delete this project, remove its assigned inboxes, and delete all associated threads and messages from the Cloudflare database. This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                className="px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Yes, Delete Project</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-4 space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Custom Project Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Apex Operations or Client Workspace"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Project Type / Category (Custom Type)
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. SaaS, E-Commerce, Consulting, Client Work, or any custom type"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Description / Scope
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Core communications, support channels, and enterprise alerts"
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

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 px-2.5 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Project</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="px-3.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-2xs transition cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
