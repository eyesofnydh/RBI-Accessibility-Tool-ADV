/** Shared types. Used by both the Node side and the in-page (browser) code. */

/** true = pass, false = fail, null = needs manual review. */
export type Status = true | false | null;
export type Level = 'A' | 'AA' | 'AAA' | 'Project' | 'Best practice';
export type Severity = 'Critical' | 'Serious' | 'Moderate' | 'Minor';
/** How sure the tool is. "probable" fails are heuristic but strong enough to log. */
export type Confidence = 'confirmed' | 'probable' | 'manual';

export type Category =
  | 'Color Contrast' | 'Keyboard' | 'Focus' | 'Responsive' | 'Zoom' | 'Images' | 'ARIA'
  | 'Forms' | 'Headings' | 'Tables' | 'Lists' | 'Screen Reader' | 'Modals'
  | 'Dynamic Content' | 'Links' | 'Landmarks' | 'Page' | 'Carousel';

export interface Box { x: number; y: number; width: number; height: number }

/** Everything recorded about the element an issue is raised on (requirement section 40). */
export interface ElementEvidence {
  ref: string;
  selector: string;
  xpath: string;
  tag: string;
  role: string;
  name: string;
  text: string;
  html: string;
  computedStyle: Record<string, string>;
  boundingBox: Box | null;
  section: string;
}

/** What a scanner emits. The pipeline turns it into a full Finding. */
export interface RawFinding {
  rule: string;
  status: false | null;
  el?: ElementEvidence;
  actual: string;
  evidence?: string;
  /** Values for the bug-sentence template, e.g. { ratio: '3.72', required: 4.5 }. */
  vars?: Record<string, string | number>;
  severity?: Severity;
  confidence?: Confidence;
  screenshot?: string;
  /** Where it was seen: "desktop", "360x256", "zoom 200%". */
  context?: string;
  /** How many elements this one finding stands for (aggregated findings). */
  count?: number;
  source?: 'custom' | 'axe' | 'interaction';
  /** Filled for axe findings, which carry their own rule metadata. */
  meta?: Partial<RuleMeta>;
}

export interface RuleMeta {
  id: string;
  /** Issue type, written the way the RBI audit sheet words it. */
  title: string;
  wcag: string;
  category: Category;
  severity: Severity;
  expected: string;
  fix: string;
  /** Bug sentence template. {name} {actual} and any vars are replaced. */
  bug?: string;
  /** Why the tool raises this (shown with every issue). */
  why: string;
  /** Matching sentence from the RBI regression list, if any. */
  regression?: string;
  /** Not a strict WCAG requirement: reported, but kept out of the WCAG verdict. */
  level?: 'Project' | 'Best practice';
  /** What the tester must do when the status is null. */
  manual?: string;
  confidence?: Confidence;
}

export interface Finding {
  id: string;
  rule: string;
  status: false | null;
  result: 'FAIL' | 'MANUAL_REVIEW';
  confidence: Confidence;
  wcag: string;
  wcagName: string;
  level: Level;
  category: Category;
  severity: Severity;
  issue: string;
  bugSentence: string;
  url: string;
  page: string;
  section: string;
  context: string;
  selector: string;
  xpath: string;
  element: string;
  role: string;
  name: string;
  text: string;
  html: string;
  computedStyle: Record<string, string>;
  boundingBox: Box | null;
  actual: string;
  expected: string;
  evidence: string;
  why: string;
  screenshot: string;
  recommendation: string;
  steps: string[];
  manualInstruction: string;
  regression: string;
  source: 'custom' | 'axe' | 'interaction';
  count: number;
  /** Id of the issue group this finding belongs to (the same issue on several pages is one group). */
  group?: string;
}

/** One distinct issue. The same header problem on 40 pages is one group with 40 occurrences. */
export interface IssueGroup {
  id: string;
  rule: string;
  issue: string;
  bugSentence: string;
  status: false | null;
  severity: Severity;
  wcag: string;
  level: Level;
  category: Category;
  selector: string;
  context: string;
  pages: number;
  occurrences: number;
  urls: string[];
  firstId: string;
  screenshot: string;
}

export interface ContrastRow {
  url?: string;
  ref: string;
  selector: string;
  check: string;
  text: string;
  foregroundCss: string;
  backgroundCss: string;
  foreground: string;
  background: string;
  foregroundRgb: string;
  backgroundRgb: string;
  fontSize: string;
  fontWeight: string;
  largeText: boolean | null;
  contrastRatio: number | null;
  requiredRatio: number;
  wcag: string;
  status: Status;
  note: string;
  /** Opens the WebAIM contrast checker with these two colours. */
  webaim: string;
}

export interface ColorSource { stylesheet: string; selector: string; property: string; variable: string }
export interface ColorEntry {
  color: string;
  raw: string[];
  variables: string[];
  sources: ColorSource[];
  occurrences: number;
  usedBy: number;
  usedAs: string[];
}

export interface FocusStop {
  step: number;
  ref: string;
  selector: string;
  name: string;
  role: string;
  tag: string;
  boundingBox: Box | null;
  inViewport: boolean;
  visible: boolean;
  obscuredBy: string;
  indicator: string[];
  screenshot?: string;
}

export interface PageSummary {
  url: string;
  title: string;
  passed: number;
  failed: number;
  manualReview: number;
  projectFailed: number;
  /** false = failures found; null = no automatic failures but manual reviews are pending; true = nothing failed and nothing pending. */
  wcagAA: boolean | null;
  error?: string;
}

export interface PageResult {
  url: string;
  slug: string;
  title: string;
  summary: PageSummary;
  findings: Finding[];
  /** Passed-check counts per rule. */
  passes: Record<string, number>;
  contrast: ContrastRow[];
  focusOrder: FocusStop[];
  headingTree: string;
  landmarkTree: string;
  tables: unknown[];
  links: unknown[];
  images: unknown[];
  liveRegions: unknown[];
  ariaSnapshotFile: string;
  screenshots: Record<string, string>;
  lighthouseScore: number | null;
  durationMs: number;
  /** How many of each feature the page has (dialogs, carousels, tables ...). Drives the manual checklist. */
  features: Record<string, number>;
  errors: string[];
}

export interface RunResult {
  tool: string;
  version: string;
  standard: string;
  startedAt: string;
  finishedAt: string;
  browser: string;
  baseUrl: string;
  pages: PageResult[];
  totals: {
    pages: number; passed: number; failed: number; manualReview: number; projectFailed: number;
    score: number; wcagAA: boolean | null;
    bySeverity: Record<string, number>; byLevel: Record<string, number>;
    /** failed = WCAG A/AA failures; project = RBI project-rule and best-practice failures. */
    byCategory: Record<string, { passed: number; failed: number; manualReview: number; project: number }>;
  };
  colors: ColorEntry[];
  issueGroups: IssueGroup[];
  manualChecklist: { area: string; item: string; how: string; pages: string[] }[];
  rules: Record<string, RuleMeta>;
}
