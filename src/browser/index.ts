/**
 * Entry point of the in-page library. esbuild bundles this file and the Node side injects it,
 * so every page has window.__a11y. Scanners are called as __a11y.run('headings').
 */
import { begin, end, evidence, isVisible, refOf } from './core';
import { scanContrast } from './contrast';
import { scanHeadings, scanLandmarks, scanLists, scanPageMeta, scanTables } from './structure';
import { scanAria, scanForms, scanHidden, scanImages, scanLinks, scanNames } from './semantics';
import { carouselWatchStart, carouselWatchStop, dialogState, mutationWatchPeek, mutationWatchStart, mutationWatchStop, openDialogs, scanCarousels, scanDates, scanLinkDates, scanLive, scanModals } from './widgets';
import { LayoutOptions, layoutSnapshot, scanLayout } from './layout';
import { activeInfo, activeWithin, attrOf, blurActive, clickableCandidates, evidenceOf, focusRef, focusSnapshot, highlight, rectOf, widgetTargets } from './focus';
import { colorInventory } from './inventory';
import { centreOf, formErrorBaseline, formErrorState, formTargets, isOpen, openTargets, paginationCurrent, paginationTarget, quickText, scanMedia, stateTargets, tooltipTargets, visibleNow } from './states';

const scanners: Record<string, (arg: never) => unknown> = {
  pageMeta: scanPageMeta, headings: scanHeadings, lists: scanLists, tables: scanTables, landmarks: scanLandmarks,
  images: scanImages, names: scanNames, links: (hosts: string[]) => scanLinks(hosts), forms: scanForms, aria: scanAria, hidden: scanHidden,
  modals: scanModals, carousels: scanCarousels, live: scanLive, dates: scanDates, linkDates: scanLinkDates,
  media: scanMedia,
  contrast: (o: { borders?: boolean }) => scanContrast(o), layout: (o: LayoutOptions) => scanLayout(o),
};

const api = {
  /** Runs one DOM scanner and returns its findings, pass counts and data. */
  run(name: string, arg?: unknown) {
    const fn = scanners[name];
    if (!fn) throw new Error('Unknown scanner: ' + name);
    begin();
    const data = fn(arg as never);
    return end(data);
  },
  focusSnapshot, activeInfo, clickableCandidates, widgetTargets, focusRef, attrOf, activeWithin, evidenceOf, highlight, rectOf, blurActive,
  openDialogs, dialogState, carouselWatchStart, carouselWatchStop, mutationWatchStart, mutationWatchStop, mutationWatchPeek,
  layoutSnapshot, colorInventory,
  openTargets, isOpen, stateTargets, quickText, tooltipTargets, visibleNow, centreOf, formTargets, formErrorBaseline, formErrorState, paginationTarget, paginationCurrent,
  /** Evidence for the element an axe result points at. */
  axeEvidence(selector: string) {
    try { const el = document.querySelector(selector); return el ? evidence(el) : null; } catch { return null; }
  },
  /** Absolute URLs of every link on the page (for the crawler). */
  pageLinks(): string[] {
    return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).map((a) => a.href).filter(Boolean);
  },
  /** The page's search field, if one is visible. */
  findSearch(): string {
    const el = Array.from(document.querySelectorAll('input[type="search"], [role="searchbox"], input[name*="search" i], input[placeholder*="search" i], input[aria-label*="search" i]')).find(isVisible);
    return el ? refOf(el) : '';
  },
  /** Refs of controls that say they open a dialog. */
  dialogTriggers(max: number): string[] {
    return Array.from(document.querySelectorAll('[aria-haspopup="dialog"], [data-bs-toggle="modal"], [data-toggle="modal"]')).filter(isVisible).slice(0, max).map(refOf);
  },
};

export type A11yApi = typeof api;
(window as unknown as { __a11y: A11yApi }).__a11y = api;
