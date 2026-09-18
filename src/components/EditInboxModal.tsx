import React, { useState, useEffect } from 'react';
import { useInbox } from '../context/InboxContext';
import { X, Mail, Palette, Trash2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { InboxRole } from '../types';
import { ChannelBadge } from './ChannelBadge';

const BADGE_COLORS = [
  '#EF4444', // Red (Gmail)
  '#F59E0B', // Amber (Zoho)
  '#10B981', // Emerald (WhatsApp)
  '#EC4899', // Pink (Instagram)
  '#3B82F6', // Blue (Facebook)
  '#8B5CF6', // Purple
  '#6B7280', // Gray
  '#0284C7', // Sky
];

export const EditInboxModal: React.FC = () => {
  const { editingInbox, setEditingInbox, updateInbox, removeInbox, projects } = useInbox();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InboxRole>('general');
  const [isCustomRole, setIsCustomRole] = useState(false);
  const [customRoleText, setCustomRoleText] = useState('');
  const [projectId, setProjectId] = useState('');
  const [badgeColor, setBadgeColor] = useState(BADGE_COLORS[0]);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (editingInbox) {
      setName(editingInbox.name);
      setEmail(editingInbox.email);
      const standardRoles = ['support', 'admin', 'notifications', 'client', 'sales', 'billing', 'general'];
      if (editingInbox.role && !standardRoles.includes(editingInbox.role)) {
        setIsCustomRole(true);
        setCustomRoleText(editingInbox.role);
        setRole('general');
      } else {
        setIsCustomRole(false);
        setCustomRoleText('');
        setRole(editingInbox.role || 'general');
      }
      setProjectId(editingInbox.projectId);
      setBadgeColor(editingInbox.badgeColor || BADGE_COLORS[0]);
      setIsConfirmingDelete(false);
    }
  }, [editingInbox]);

  if (!editingInbox) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const finalRole = isCustomRole ? (customRoleText.trim() || 'general') : role;

    updateInbox(editingInbox.id, {
      name: name.trim(),
      email: email.trim(),
      role: finalRole,
      projectId,
      badgeColor,
    });

    setEditingInbox(null);
  };

  const handleDelete = () => {
    removeInbox(editingInbox.id);
    setEditingInbox(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <ChannelBadge channel={editingInbox.channel} size="sm" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-sans">
              Edit Inbox & Custom Name
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setEditingInbox(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Delete Confirmation Warning */}
        {isConfirmingDelete ? (
          <div className="p-4 space-y-3.5 text-xs">
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-red-800 dark:text-red-300">
                <p className="font-bold text-xs">Disconnect "{editingInbox.name || editingInbox.email}"?</p>
                <p className="text-[11px] leading-relaxed">
                  This mailbox will be unlinked from your project and its configuration removed from the database.
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
                <span>Yes, Disconnect Inbox</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-4 space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Custom Inbox Name / Display Label
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Yehuda Main, Primary Support, VIP Client Line"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email Address
              </label>
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Inbox Role / Desk
                </label>
                <select
                  value={isCustomRole ? '__custom__' : role}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setIsCustomRole(true);
                    } else {
                      setIsCustomRole(false);
                      setRole(e.target.value as InboxRole);
                    }
                  }}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="support">🎧 Support Desk</option>
                  <option value="admin">🛡️ Corporate / Admin</option>
                  <option value="notifications">🔔 Alerts & System</option>
                  <option value="client">🤝 VIP Client Direct</option>
                  <option value="sales">💼 Sales & Inquiries</option>
                  <option value="billing">💳 Billing & Invoices</option>
                  <option value="general">✉️ General Inbox</option>
                  <option value="__custom__">✨ Custom Role (Custom Type)...</option>
                </select>
                {isCustomRole && (
                  <input
                    type="text"
                    required
                    placeholder="e.g. Engineering, Founders, Legal"
                    value={customRoleText}
                    onChange={(e) => setCustomRoleText(e.target.value)}
                    className="mt-1.5 w-full px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/30 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Assigned Project
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                <Palette className="w-3.5 h-3.5" />
                Badge Color
              </label>
              <div className="flex items-center gap-2">
                {BADGE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBadgeColor(c)}
                    className={`w-6 h-6 rounded-full transition cursor-pointer ${
                      badgeColor === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-105'
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
                <span>Disconnect</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingInbox(null)}
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
