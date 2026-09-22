/**
 * Email Tracker & Spy Pixel Blocking Utility
 *
 * Detects and strips invisible 1x1 tracking pixels, beacon URLs,
 * and known email spy trackers (HubSpot, Mailchimp, Superhuman,
 * Yesware, Mailtrack, Streak, Mixmax, SendGrid, etc.)
 */

export interface TrackerSanitizationResult {
  cleanHtml: string;
  blockedCount: number;
  detectedTrackers: string[];
}

const KNOWN_TRACKER_DOMAINS: { pattern: RegExp; name: string }[] = [
  { pattern: /superhuman\.com\/api\/tracking/i, name: 'Superhuman Read Receipt' },
  { pattern: /mailtrack\.io\/trace/i, name: 'Mailtrack' },
  { pattern: /t\.yesware\.com/i, name: 'Yesware' },
  { pattern: /mandrillapp\.com\/track/i, name: 'Mandrill / Mailchimp' },
  { pattern: /mailchimp\.com\/track/i, name: 'Mailchimp' },
  { pattern: /list-manage\.com\/track/i, name: 'Mailchimp' },
  { pattern: /hs-analytics\.net/i, name: 'HubSpot' },
  { pattern: /hubspot\.com\/track/i, name: 'HubSpot' },
  { pattern: /t\.sidekickopen/i, name: 'HubSpot Sales' },
  { pattern: /sendgrid\.net\/wf\/open/i, name: 'SendGrid Open Tracking' },
  { pattern: /sendgrid\.net\/trk/i, name: 'SendGrid' },
  { pattern: /streak\.com\/api\/track/i, name: 'Streak CRM' },
  { pattern: /mixmax\.com\/api\/track/i, name: 'Mixmax' },
  { pattern: /salesloft\.com\/email_track/i, name: 'SalesLoft' },
  { pattern: /outreach\.io\/api\/track/i, name: 'Outreach' },
  { pattern: /bananatag\.com\/t/i, name: 'Bananatag' },
  { pattern: /litmus\.com\/track/i, name: 'Litmus' },
  { pattern: /constantcontact\.com\/track/i, name: 'Constant Contact' },
  { pattern: /campaign-archive\.com/i, name: 'Campaign Monitor' },
  { pattern: /cmail\d+\.com\/t/i, name: 'Campaign Monitor' },
  { pattern: /convertkit\.com\/open/i, name: 'ConvertKit' },
  { pattern: /activehosted\.com\/proc\.php/i, name: 'ActiveCampaign' },
  { pattern: /getresponse\.com\/open/i, name: 'GetResponse' },
  { pattern: /klaviyo\.com\/track/i, name: 'Klaviyo' },
  { pattern: /intercom-mail\.com\/via/i, name: 'Intercom' },
];

/**
 * Checks if an img tag represents a 1x1 or invisible tracking pixel.
 */
function isTrackingPixel(imgTag: string): { isTracker: boolean; reason?: string } {
  // 1. First check src attribute for known tracking patterns or tracker domains
  const srcMatch = imgTag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
  if (srcMatch) {
    const src = srcMatch[1];
    for (const tracker of KNOWN_TRACKER_DOMAINS) {
      if (tracker.pattern.test(src)) {
        return { isTracker: true, reason: tracker.name };
      }
    }

    if (/(?:open|track|pixel|beacon|receipt|wf\/open)\.(?:gif|png|jpg)/i.test(src)) {
      return { isTracker: true, reason: 'Tracker beacon image' };
    }
  }

  // 2. Check width and height attributes (0 or 1 px)
  const widthAttr = imgTag.match(/\bwidth\s*=\s*["']?([0-1])(?:px)?["']?/i);
  const heightAttr = imgTag.match(/\bheight\s*=\s*["']?([0-1])(?:px)?["']?/i);
  if (widthAttr || heightAttr) {
    return { isTracker: true, reason: '1x1 pixel dimensions' };
  }

  // 3. Check inline styles for 0px or 1px or hidden display
  const styleMatch = imgTag.match(/\bstyle\s*=\s*["']([^"']*)["']/i);
  if (styleMatch) {
    const style = styleMatch[1].toLowerCase();
    const hasTinyDimension =
      /(?:^|;)\s*(?:width|height|max-width|max-height)\s*:\s*(?:0|1)px/i.test(style);
    const isHidden =
      /(?:^|;)\s*display\s*:\s*none/i.test(style) ||
      /(?:^|;)\s*visibility\s*:\s*hidden/i.test(style) ||
      /(?:^|;)\s*opacity\s*:\s*0(?:\.0+)?(?:;|$)/i.test(style);

    if (hasTinyDimension || isHidden) {
      return { isTracker: true, reason: 'Hidden via CSS styles' };
    }
  }

  return { isTracker: false };
}

/**
 * Strips tracking pixels and spy elements from raw email HTML.
 */
export function sanitizeEmailHtml(rawHtml: string): TrackerSanitizationResult {
  if (!rawHtml) {
    return { cleanHtml: '', blockedCount: 0, detectedTrackers: [] };
  }

  let blockedCount = 0;
  const detectedTrackers: string[] = [];

  // Regex matching <img> tags
  const imgRegex = /<img\b[^>]*>/gi;

  const cleanHtml = rawHtml.replace(imgRegex, (imgTag) => {
    const check = isTrackingPixel(imgTag);
    if (check.isTracker) {
      blockedCount++;
      const reason = check.reason || 'Invisible tracking pixel';
      if (!detectedTrackers.includes(reason)) {
        detectedTrackers.push(reason);
      }
      // Replace with harmless placeholder comment so DOM layout remains clean
      return `<!-- [ProjectInbox: Blocked spy tracker: ${reason}] -->`;
    }
    return imgTag;
  });

  return {
    cleanHtml,
    blockedCount,
    detectedTrackers,
  };
}
