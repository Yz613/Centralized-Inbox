import React from 'react';
import { ChannelType, InboxRole } from '../types';
import { Mail, MessageCircle, Instagram, Facebook, Shield, Headphones, Bell, DollarSign, UserCheck, Briefcase } from 'lucide-react';

interface ChannelBadgeProps {
  channel: ChannelType;
  role?: InboxRole;
  showRole?: boolean;
  size?: 'sm' | 'md';
  customEmail?: string;
}

export const ChannelBadge: React.FC<ChannelBadgeProps> = ({
  channel,
  role,
  showRole = false,
  size = 'md',
  customEmail,
}) => {
  const getChannelDetails = (ch: ChannelType) => {
    switch (ch) {
      case 'gmail':
        return {
          label: 'Gmail',
          bgColor: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
          icon: <Mail className={size === 'sm' ? 'w-3 h-3 text-red-600' : 'w-3.5 h-3.5 text-red-600'} />,
          dotColor: 'bg-red-500',
        };
      case 'zoho':
        return {
          label: 'Zoho Mail',
          bgColor: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
          icon: <Mail className={size === 'sm' ? 'w-3 h-3 text-amber-600' : 'w-3.5 h-3.5 text-amber-600'} />,
          dotColor: 'bg-amber-500',
        };
      case 'whatsapp':
        return {
          label: 'WhatsApp',
          bgColor: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
          icon: <MessageCircle className={size === 'sm' ? 'w-3 h-3 text-emerald-600' : 'w-3.5 h-3.5 text-emerald-600'} />,
          dotColor: 'bg-emerald-500',
        };
      case 'instagram':
        return {
          label: 'Instagram',
          bgColor: 'bg-pink-50 text-pink-800 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-900',
          icon: <Instagram className={size === 'sm' ? 'w-3 h-3 text-pink-600' : 'w-3.5 h-3.5 text-pink-600'} />,
          dotColor: 'bg-pink-500',
        };
      case 'facebook':
        return {
          label: 'Facebook',
          bgColor: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
          icon: <Facebook className={size === 'sm' ? 'w-3 h-3 text-blue-600' : 'w-3.5 h-3.5 text-blue-600'} />,
          dotColor: 'bg-blue-500',
        };
      default:
        return {
          label: 'IMAP Mail',
          bgColor: 'bg-slate-100 text-slate-800 border-slate-200',
          icon: <Mail className="w-3.5 h-3.5 text-slate-600" />,
          dotColor: 'bg-slate-500',
        };
    }
  };

  const getRoleDetails = (r?: InboxRole) => {
    switch (r) {
      case 'admin':
        return {
          label: 'Admin',
          icon: <Shield className="w-2.5 h-2.5 mr-1 text-purple-600" />,
          badgeClass: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300',
        };
      case 'support':
        return {
          label: 'Support',
          icon: <Headphones className="w-2.5 h-2.5 mr-1 text-blue-600" />,
          badgeClass: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300',
        };
      case 'notifications':
        return {
          label: 'Alerts',
          icon: <Bell className="w-2.5 h-2.5 mr-1 text-slate-600" />,
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
        };
      case 'billing':
        return {
          label: 'Billing',
          icon: <DollarSign className="w-2.5 h-2.5 mr-1 text-emerald-600" />,
          badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
        };
      case 'sales':
        return {
          label: 'Sales',
          icon: <Briefcase className="w-2.5 h-2.5 mr-1 text-indigo-600" />,
          badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300',
        };
      case 'client':
        return {
          label: 'Client Direct',
          icon: <UserCheck className="w-2.5 h-2.5 mr-1 text-teal-600" />,
          badgeClass: 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300',
        };
      default:
        return null;
    }
  };

  const chDetails = getChannelDetails(channel);
  const roleDetails = role ? getRoleDetails(role) : null;

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <span
        className={`inline-flex items-center gap-1 font-medium rounded border ${chDetails.bgColor} ${
          size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
        }`}
      >
        {chDetails.icon}
        <span>{chDetails.label}</span>
        {customEmail && (
          <span className="font-normal opacity-80 truncate max-w-[140px]">
            • {customEmail}
          </span>
        )}
      </span>

      {showRole && roleDetails && (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border ${roleDetails.badgeClass}`}
        >
          {roleDetails.icon}
          {roleDetails.label}
        </span>
      )}
    </div>
  );
};
