/** Every fact the pages repeat lives here, so the copy can't drift apart. */
export const SITE = {
  name: 'CouchPad',
  url: 'https://couchpad.tv',
  tagline: 'Scan. Sit. Play.',
  description:
    'CouchPad turns your TV into a retro console and everyone’s phone into the controller. Scan a QR code, no app to install. Free on Android TV, Pro is a one-time $5.99.',
  /** The web version (TV host in a browser + phone controller). */
  appUrl: 'https://app.couchpad.tv',
  playUrl: 'https://play.google.com/store/apps/details?id=com.tunisolutions.couch',
  /** Closed-test opt-in page on Google Play (the /testing page links it). */
  testingUrl: 'https://play.google.com/apps/testing/com.tunisolutions.couch',
  developer: 'Tuni Solutions',
  /** Support address. Also used inside the Markdown pages as {{email}}. */
  email: 'contact@couchpad.tv',
  proPrice: '$5.99',
  legalUpdated: '19 October 2026',
} as const;

export const NAV = [
  { href: '/#how', label: 'How it works', seat: 1 },
  { href: '/#try', label: 'Try it', seat: 2 },
  { href: '/#pads', label: 'Controllers', seat: 3 },
  { href: '/#pro', label: 'Pro', seat: 4 },
  { href: '/#faq', label: 'Questions', seat: 0 },
] as const;
