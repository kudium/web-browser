import type { IApp } from '../types';
import type { Space } from '../utils/SpaceManager';
import { collectionProfile } from '../utils/collectionGroups';

type Site = [title: string, url: string];
interface DemoGroup {
  slug: string;
  name: string;
  space: string;
  collection?: string;
  display?: 'folder' | 'stack';
  separate?: boolean;
  favorite?: boolean;
  sites: Site[];
}

// Public destinations only: no fabricated accounts, private documents or logins.
const groups: DemoGroup[] = [
  {
    slug: 'social',
    name: 'Social',
    space: 'demo-personal',
    favorite: true,
    sites: [
      ['YouTube', 'https://www.youtube.com/'],
      ['Instagram', 'https://www.instagram.com/'],
      ['Reddit', 'https://www.reddit.com/'],
    ],
  },
  {
    slug: 'work',
    name: 'Work',
    space: 'demo-studio',
    favorite: true,
    sites: [
      ['Notion', 'https://www.notion.so/'],
      ['Linear', 'https://linear.app/'],
      ['Google Calendar', 'https://calendar.google.com/'],
    ],
  },
  {
    slug: 'design',
    name: 'Design',
    space: 'demo-studio',
    favorite: true,
    sites: [
      ['Figma', 'https://www.figma.com/'],
      ['Dribbble', 'https://dribbble.com/'],
      ['Behance', 'https://www.behance.net/'],
    ],
  },
  {
    slug: 'development',
    name: 'Development',
    space: 'demo-studio',
    favorite: true,
    sites: [
      ['GitHub', 'https://github.com/'],
      ['Stack Overflow', 'https://stackoverflow.com/'],
      ['MDN', 'https://developer.mozilla.org/'],
    ],
  },
  {
    slug: 'reading',
    name: 'Reading',
    space: 'demo-personal',
    favorite: true,
    sites: [
      ['Hacker News', 'https://news.ycombinator.com/'],
      ['The Verge', 'https://www.theverge.com/'],
      ['MIT Technology Review', 'https://www.technologyreview.com/'],
    ],
  },
  {
    slug: 'customer-research',
    name: 'Customer Research',
    space: 'demo-studio',
    collection: 'demo-product',
    sites: [
      ['The Mom Test', 'https://www.momtestbook.com/'],
      ['User Interviews', 'https://www.userinterviews.com/'],
      [
        'UX Research Field Guide',
        'https://www.userinterviews.com/ux-research-field-guide',
      ],
      ['Jobs to Be Done', 'https://jtbd.info/'],
    ],
  },
  {
    slug: 'product-planning',
    name: 'Product Planning',
    space: 'demo-studio',
    collection: 'demo-product',
    display: 'stack',
    sites: [
      ['Linear — Product Development', 'https://linear.app/'],
      ['Shape Up', 'https://basecamp.com/shapeup'],
      ['Productboard', 'https://www.productboard.com/'],
      ['Lenny’s Newsletter', 'https://www.lennysnewsletter.com/'],
    ],
  },
  {
    slug: 'design-inspiration',
    name: 'Design Inspiration',
    space: 'demo-studio',
    collection: 'demo-design',
    sites: [
      ['Mobbin', 'https://mobbin.com/'],
      ['Awwwards', 'https://www.awwwards.com/'],
      ['Godly', 'https://godly.website/'],
      ['Layers', 'https://layers.to/'],
      ['Minimal Gallery', 'https://minimal.gallery/'],
    ],
  },
  {
    slug: 'design-system',
    name: 'Design System',
    space: 'demo-studio',
    collection: 'demo-design',
    display: 'stack',
    sites: [
      ['Radix UI', 'https://www.radix-ui.com/'],
      ['Lucide Icons', 'https://lucide.dev/'],
      ['Google Fonts', 'https://fonts.google.com/'],
      [
        'Apple Human Interface Guidelines',
        'https://developer.apple.com/design/human-interface-guidelines/',
      ],
    ],
  },
  {
    slug: 'frontend',
    name: 'Frontend',
    space: 'demo-studio',
    collection: 'demo-engineering',
    sites: [
      ['React Documentation', 'https://react.dev/learn'],
      [
        'TypeScript Handbook',
        'https://www.typescriptlang.org/docs/handbook/intro.html',
      ],
      ['Tailwind CSS', 'https://tailwindcss.com/docs'],
      ['MDN — CSS', 'https://developer.mozilla.org/en-US/docs/Web/CSS'],
      ['web.dev', 'https://web.dev/'],
    ],
  },
  {
    slug: 'browser-platform',
    name: 'Browser Platform',
    space: 'demo-studio',
    collection: 'demo-engineering',
    display: 'stack',
    sites: [
      ['Electron Documentation', 'https://www.electronjs.org/docs/latest/'],
      ['Chrome Extensions', 'https://developer.chrome.com/docs/extensions'],
      ['WebKit', 'https://webkit.org/'],
      ['Playwright', 'https://playwright.dev/'],
    ],
  },
  {
    slug: 'release-checklist',
    name: 'Release Checklist',
    space: 'demo-studio',
    collection: 'demo-engineering',
    separate: true,
    sites: [
      [
        'GitHub Releases',
        'https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases',
      ],
      [
        'Apple Notarization',
        'https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution',
      ],
      ['Sentry', 'https://sentry.io/'],
    ],
  },
  {
    slug: 'weekend-in-tokyo',
    name: 'Tokyo Itinerary',
    space: 'demo-personal',
    collection: 'demo-travel',
    sites: [
      ['Tokyo Travel Guide', 'https://www.japan-guide.com/e/e2164.html'],
      ['GO TOKYO', 'https://www.gotokyo.org/en/'],
      ['TeamLab Planets', 'https://www.teamlab.art/e/planets/'],
      ['Google Maps', 'https://www.google.com/maps/place/Tokyo/'],
    ],
  },
  {
    slug: 'travel-bookings',
    name: 'Travel Bookings',
    space: 'demo-personal',
    collection: 'demo-travel',
    separate: true,
    display: 'stack',
    sites: [
      ['Airbnb', 'https://www.airbnb.com/'],
      ['Booking.com', 'https://www.booking.com/'],
      ['Google Flights', 'https://www.google.com/travel/flights'],
    ],
  },
  {
    slug: 'slow-sunday',
    name: 'Slow Sunday',
    space: 'demo-personal',
    collection: 'demo-reading',
    sites: [
      ['Aeon', 'https://aeon.co/'],
      ['Nautilus', 'https://nautil.us/'],
      ['Quanta Magazine', 'https://www.quantamagazine.org/'],
      ['Wikipedia — Design', 'https://en.wikipedia.org/wiki/Design'],
    ],
  },
  {
    slug: 'daily-tools',
    name: 'Daily Tools',
    space: 'demo-studio',
    display: 'stack',
    sites: [
      ['Excalidraw', 'https://excalidraw.com/'],
      ['JSON Formatter', 'https://jsonformatter.org/'],
      ['Can I Use', 'https://caniuse.com/'],
    ],
  },
];

export function createDummyData(): {
  spaces: Space[];
  apps: IApp[];
  selectedId: string;
  activeSpace: string;
} {
  const spaces: Space[] = [
    {
      id: 'demo-studio',
      name: 'Studio',
      color: 'iris',
      icon: 'work',
      folders: [
        { id: 'demo-product', name: 'Product Studio' },
        { id: 'demo-design', name: 'Design Library' },
        { id: 'demo-engineering', name: 'Engineering' },
        { id: 'demo-empty', name: 'Next Project' },
      ],
    },
    {
      id: 'demo-personal',
      name: 'Personal',
      color: 'blue',
      icon: 'coffee',
      folders: [
        { id: 'demo-travel', name: 'Japan 2027' },
        { id: 'demo-reading', name: 'Reading Room' },
      ],
    },
  ];
  const apps: IApp[] = groups.flatMap((group) =>
    group.sites.map(([name, url], index) => ({
      id: `demo-${group.slug}-${index}`,
      sessionId: `demo-${group.slug}`,
      sessionName: group.name,
      sessionSlug: group.slug,
      sessionNameCustom: true,
      sessionHomeURL: group.sites[0][1],
      spaceId: group.space,
      folderId: group.collection,
      groupDisplay: group.display || 'folder',
      sessionMode:
        group.collection && !group.separate ? 'collection' : 'separate',
      sessionProfileId:
        group.collection && !group.separate
          ? collectionProfile(group.space, group.collection)
          : `demo-${group.slug}`,
      favorite: !!group.favorite,
      pinned: true,
      tabPinned: index === 0,
      name,
      url,
      icon: `https://www.google.com/s2/favicons?domain=${
        new URL(url).hostname
      }&sz=64`,
    }))
  );
  apps.forEach((tab, index) => {
    tab.position = index + 1;
  });
  const selectedId = 'demo-frontend-0';
  spaces[0].selectedAppId = selectedId;
  spaces[1].selectedAppId = 'demo-weekend-in-tokyo-0';
  return { spaces, apps, selectedId, activeSpace: spaces[0].id };
}

/** One reset per dummy launch, never on HMR or secondary window creation. */
export function seedDummyData(runId: string) {
  if (!runId || localStorage.getItem('kudiumbrowser-demo-run') === runId)
    return;
  const data = createDummyData();
  localStorage.setItem('kudiumbrowser-spaces', JSON.stringify(data.spaces));
  localStorage.setItem('user_apps', JSON.stringify(data.apps));
  localStorage.setItem('kudiumbrowser-active-space', data.activeSpace);
  localStorage.setItem('user_last_app_id', data.selectedId);
  sessionStorage.setItem('kudiumbrowser-active-space', data.activeSpace);
  sessionStorage.setItem('user_last_app_id', data.selectedId);
  localStorage.removeItem('kudiumbrowser-collapsed-folders');
  localStorage.setItem('kudiumbrowser-demo-run', runId);
}
