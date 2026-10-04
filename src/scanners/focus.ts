import type { Page } from 'playwright';
import type { PageCtx } from '../context';
import type { ActiveInfo } from '../browser/focus';
import type { Box, ElementEvidence } from '../types';
import { pixelDiff } from '../utils/misc';

/**
 * Focus visibility (sections 8 and 9). Used by the keyboard scanner at every Tab stop.
 *
 * How it decides:
 *  1. Compare the element's CSS before and after focus (outline, border, box-shadow, underline,
 *     background, colour, pseudo-elements, parent, and the label of a hidden checkbox or radio).
 *  2. A strong indicator (outline, border, ring, underline) must reach 3:1 against the background.
 *  3. If CSS shows no change at all, screenshots of the focused and unfocused element are compared.
 *     Identical pixels = "Focus is missing" (FAIL). Different pixels = MANUAL_REVIEW, never a pass.
 */
export class FocusJudge {
  private pending: { info: ActiveInfo; focused: Buffer; size: { w: number; h: number } }[] = [];
  private linkTotal = 0;
  private linkPlain: ActiveInfo[] = [];

  /** mode "forced": Windows High Contrast pass. Only a missing indicator is reported, under its own best-practice rule. */
  constructor(private ctx: PageCtx, private page: Page, private label = 'desktop', private mode: 'normal' | 'forced' = 'normal') {}

  private call<T>(fn: string, ...args: unknown[]): Promise<T> {
    return this.page.evaluate(([f, a]) => ((window as unknown as { __a11y: Record<string, (...x: unknown[]) => unknown> }).__a11y[f as string](...(a as unknown[]))) as never, [fn, args]) as Promise<T>;
  }

  private async clip(box: Box, size?: { w: number; h: number }): Promise<{ buf: Buffer; size: { w: number; h: number } } | null> {
    const vp = this.page.viewportSize();
    if (!vp) return null;
    const pad = 8;
    const x = Math.max(0, Math.floor(box.x - pad)), y = Math.max(0, Math.floor(box.y - pad));
    const w = size?.w ?? Math.ceil(box.width + pad * 2), h = size?.h ?? Math.ceil(box.height + pad * 2);
    const width = Math.min(w, vp.width - x), height = Math.min(h, vp.height - y);
    if (width < 4 || height < 4) return null;
    try { return { buf: await this.page.screenshot({ clip: { x, y, width, height }, animations: 'disabled', caret: 'hide' }), size: { w: width, h: height } }; } catch { return null; }
  }

  private async report(rule: string, status: false | null, info: ActiveInfo, actual: string, shot?: Buffer, vars: Record<string, string | number> = {}): Promise<void> {
    const el = await this.call<ElementEvidence | null>('evidenceOf', info.ref);
    const screenshot = shot ? this.ctx.saveShot(shot, 'focus', info.name || info.tag) : '';
    this.ctx.collector.add([{ rule, status, el: el || undefined, actual, screenshot, vars: { name: info.name, role: info.role, ...vars }, evidence: info.indicatorNote }], this.label, 'interaction');
  }

  /** Call once focus has landed on a new element. */
  async onStop(info: ActiveInfo): Promise<void> {
    await this.settle(info); // earlier elements are unfocused now
    if (!this.ctx.config.tests.focus || info.isBody || !info.known || !info.visible) return;

    if (this.mode === 'forced') {
      if (info.strong) { this.ctx.collector.pass('forced.focus-missing'); return; }
      const b = await this.call<Box | null>('rectOf', info.ref, true);
      const s = b ? await this.clip(b) : null;
      if (s) this.pending.push({ info, focused: s.buf, size: s.size });
      return;
    }
    if (info.isLink && this.ctx.config.rbi.linkFocusUnderlineAndColor) {
      this.linkTotal++;
      if (!(info.underlineOnFocus && info.colourChanged)) this.linkPlain.push(info);
    }
    const kinds = info.indicators.join(', ');
    if (info.strong) {
      if (info.indicatorRatio !== null && info.indicatorRatio < 3) {
        const box = await this.call<Box | null>('rectOf', info.ref, true);
        const shot = box ? await this.clip(box) : null;
        await this.report('focus.unclear', false, info, `Focus indicator (${kinds}) has ${info.indicatorRatio.toFixed(2)}:1 contrast against the background.`, shot?.buf, { ratio: info.indicatorRatio.toFixed(2) });
      } else if (/image/.test(info.indicatorNote)) {
        await this.report('focus.review', null, info, `Focus indicator (${kinds}) is drawn over an image, so its contrast could not be measured.`);
      } else { this.ctx.collector.pass('focus.missing'); this.ctx.collector.pass('focus.unclear'); }
      return;
    }
    if (info.indicators.length) {
      if (info.weakRatio !== null && info.weakRatio >= 3) { this.ctx.collector.pass('focus.missing'); return; }
      const box = await this.call<Box | null>('rectOf', info.ref, true);
      const shot = box ? await this.clip(box) : null;
      await this.report('focus.review', null, info, `The only change on focus is: ${kinds}${info.weakRatio !== null ? ` (old and new colour differ by ${info.weakRatio.toFixed(2)}:1)` : ''}. No outline, border, ring or underline was added.`, shot?.buf);
      return;
    }
    // No CSS change: let the pixels decide once the element loses focus.
    const box = await this.call<Box | null>('rectOf', info.ref, true);
    const shot = box ? await this.clip(box) : null;
    if (shot) this.pending.push({ info, focused: shot.buf, size: shot.size });
  }

  /**
   * Compares the focused screenshot of earlier elements with how they look now.
   * An element is left waiting while the currently focused element is right next to it,
   * because the neighbour's focus ring would show up in the comparison.
   */
  private async settle(current?: ActiveInfo): Promise<void> {
    const near = (a: Box | null, b: Box | null) => !!a && !!b && a.x < b.x + b.width + 24 && b.x < a.x + a.width + 24 && a.y < b.y + b.height + 24 && b.y < a.y + a.height + 24;
    const waiting = this.pending;
    this.pending = [];
    for (const p of waiting) {
      if (current && !current.isBody && near(p.info.box, current.box)) { this.pending.push(p); continue; }
      const box = await this.call<Box | null>('rectOf', p.info.ref, true);
      const plain = box ? await this.clip(box, p.size) : null;
      let diff = 1;
      if (plain) { try { diff = pixelDiff(p.focused, plain.buf); } catch { diff = 1; } }
      if (this.mode === 'forced') {
        if (plain && diff < 0.003) await this.report('forced.focus-missing', false, p.info, 'With forced colours on, the focused and unfocused screenshots of the element are identical.', p.focused);
        else this.ctx.collector.pass('forced.focus-missing');
        continue;
      }
      if (plain && diff < 0.003) {
        await this.report('focus.missing', false, p.info, 'No outline, border, box-shadow, underline, background or colour change on focus, and the focused and unfocused screenshots are identical.', p.focused);
      } else {
        await this.report('focus.review', null, p.info, plain
          ? `No CSS change was found on the element, its parent or its pseudo-elements, but ${(diff * 100).toFixed(1)}% of the pixels around it changed on focus. Another element may draw the indicator.`
          : 'No CSS change was found on focus, and the element could not be compared by screenshot.', p.focused);
      }
    }
    if (current && !current.isBody && waiting.length > this.pending.length) await this.call('rectOf', current.ref, true); // scroll back to the focused element
  }

  /** Call after the last Tab stop. */
  async finish(): Promise<void> {
    await this.call('blurActive');
    await this.settle();
    if (this.linkPlain.length) {
      const first = this.linkPlain[0];
      const el = await this.call<ElementEvidence | null>('evidenceOf', first.ref);
      this.ctx.collector.add([{
        rule: 'focus.link-style', status: false, el: el || undefined, count: this.linkPlain.length,
        actual: `${this.linkPlain.length} of ${this.linkTotal} links reached by Tab do not become underlined and change colour on keyboard focus, for example ${this.linkPlain.slice(0, 5).map((l) => `"${l.name.slice(0, 40)}" (${l.indicators.join(', ') || 'no change'})`).join('; ')}.`,
      }], this.label, 'interaction');
    }
    if (this.linkTotal > this.linkPlain.length) this.ctx.collector.pass('focus.link-style', this.linkTotal - this.linkPlain.length);
  }
}
