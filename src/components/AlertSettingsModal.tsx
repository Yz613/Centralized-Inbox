import React, { useState, useEffect } from 'react';
import { useInbox } from '../context/InboxContext';
import {
  Bell,
  BellOff,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Smartphone,
  X,
  Volume2,
  RotateCw,
  Info,
} from 'lucide-react';
import { showForegroundNotification, playNotificationChime } from '../utils/webPushClient';

interface AlertSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AlertSettingsModal: React.FC<AlertSettingsModalProps> = ({ isOpen, onClose }) => {
  const {
    notificationsEnabled,
    phoneAlertsOn,
    notificationHint,
    enableNotifications,
    retryBackgroundAlerts,
    disableNotifications,
  } = useInbox();

  const [isSubscribing, setIsSubscribing] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [isBrave, setIsBrave] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      const brave = Boolean(
        'brave' in navigator ||
        ua.includes('Brave') ||
        (navigator as any).brave?.isBrave
      );
      setIsBrave(brave);
      setIsIos(/iPhone|iPad|iPod/i.test(ua));
      setIsAndroid(/Android/i.test(ua));
    }
  }, []);

  if (!isOpen) return null;

  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';

  const handleEnable = async () => {
    setIsSubscribing(true);
    try {
      await enableNotifications();
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleRetryPush = async () => {
    setIsSubscribing(true);
    try {
      await retryBackgroundAlerts();
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleSendTest = async () => {
    playNotificationChime();
    setTestSent(true);
    await showForegroundNotification(
      'Unified Inbox Test',
      'Alerts are working properly on this device!',
      'test-mail-alert'
    );
    setTimeout(() => setTestSent(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[#1f1f1f] dark:text-slate-100">
                Mail Alerts & Notifications
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">Device alert preferences</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Status Overview Card */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Browser Permission:</span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                  permission === 'granted'
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : permission === 'denied'
                    ? 'bg-red-100 text-red-900 border border-red-300'
                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}
              >
                {permission === 'granted' ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                    <span>Allowed</span>
                  </>
                ) : permission === 'denied' ? (
                  <>
                    <AlertTriangle className="w-3 h-3 text-red-700" />
                    <span>Blocked</span>
                  </>
                ) : (
                  <span>Action Needed</span>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Background Push Service:</span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                  phoneAlertsOn
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : notificationsEnabled
                    ? 'bg-blue-100 text-blue-900 border border-blue-300'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {phoneAlertsOn ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                    <span>Active on Device</span>
                  </>
                ) : notificationsEnabled ? (
                  <span>In-Tab Active</span>
                ) : (
                  <span>Disabled</span>
                )}
              </span>
            </div>
          </div>

          {/* Brave Android Guided Card */}
          {isBrave && isAndroid && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-amber-950/40 dark:to-orange-950/20 border border-amber-300/80 dark:border-amber-700 space-y-2">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold">
                <Shield className="w-4 h-4 text-orange-600 shrink-0" />
                <span className="text-xs sm:text-sm">Brave Android Alert Setup</span>
              </div>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[11px] sm:text-xs">
                Brave on Android does not have the desktop Google Services switch. To allow notifications on your phone:
              </p>
              <ol className="list-decimal pl-4 space-y-1.5 text-slate-800 dark:text-slate-200 text-[11px] font-medium">
                <li>Tap the <strong>lock / tune icon</strong> on the left of the address bar (URL) at the top.</li>
                <li>Tap <strong>Permissions</strong> and set <strong>Notifications</strong> to <strong>Allowed</strong>.</li>
                <li>In your phone's <strong>Settings → Apps → Brave → Notifications</strong>, ensure notifications are turned <strong>ON</strong>.</li>
              </ol>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold pt-1">
                ✓ In-app alerts and audio chimes work immediately while this page is open in Brave!
              </p>
            </div>
          )}

          {/* Brave Desktop Guided Card */}
          {isBrave && !isAndroid && !isIos && !phoneAlertsOn && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-amber-950/40 dark:to-orange-950/20 border border-amber-300/80 dark:border-amber-700 space-y-2">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold">
                <Shield className="w-4 h-4 text-orange-600 shrink-0" />
                <span className="text-xs sm:text-sm">Brave Desktop Push Setup</span>
              </div>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[11px] sm:text-xs">
                To receive background alerts when Brave is closed:
              </p>
              <ol className="list-decimal pl-4 space-y-1 text-slate-800 dark:text-slate-200 text-[11px] font-medium">
                <li>Click Brave menu (<strong>⋮</strong>) → <strong>Settings</strong></li>
                <li>Click <strong>Brave Shields & privacy</strong></li>
                <li>Turn ON <strong className="text-orange-900 dark:text-orange-300">"Use Google services for push messaging"</strong></li>
                <li>Relaunch Brave and tap <strong>Activate Push Alerts</strong> below.</li>
              </ol>
            </div>
          )}

          {/* iPhone / iOS Note */}
          {isIos && (
            <div className="p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 text-slate-700 dark:text-slate-300 space-y-1 text-[11px]">
              <div className="flex items-center gap-1.5 font-bold text-blue-900 dark:text-blue-300">
                <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                <span>iPhone / iOS Setup Note:</span>
              </div>
              <p>
                Apple requires web apps to be added to your Home Screen to receive notifications. Tap Share (<strong className="text-blue-700">↑</strong>) → <strong>Add to Home Screen</strong>, then launch from your home screen.
              </p>
            </div>
          )}

          {/* Hint from engine if any */}
          {notificationHint && (
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 flex items-start gap-2 text-[11px]">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="leading-snug">{notificationHint}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            {!phoneAlertsOn ? (
              <button
                type="button"
                onClick={handleEnable}
                disabled={isSubscribing}
                className="w-full py-2.5 px-4 rounded-xl bg-[#0b57d0] hover:bg-[#0842a0] text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60"
              >
                {isSubscribing ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>Connecting…</span>
                  </>
                ) : (
                  <>
                    <Bell className="w-4 h-4" />
                    <span>Activate Push Alerts</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => disableNotifications()}
                className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:text-slate-300 dark:bg-slate-800 font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <BellOff className="w-4 h-4 text-slate-500" />
                <span>Turn Off Alerts</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSendTest}
              className="w-full py-2 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 text-[#1f1f1f] dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs"
            >
              <Volume2 className={`w-4 h-4 text-blue-600 ${testSent ? 'animate-bounce' : ''}`} />
              <span>{testSent ? 'Test notification sent!' : 'Send Test Notification'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
