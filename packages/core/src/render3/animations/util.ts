/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {Timing} from './interfaces';

export function computeStyle(element: HTMLElement, prop: string): string {
  if (!window || !window.getComputedStyle) return '';
  const gcs = window.getComputedStyle(element) as any;
  return gcs[prop] || gcs.getPropertyValue(prop);
}

/**
 *
 * @param element
 * @param cb
 */
export function applyReflow(element: HTMLElement, cb?: ((reflow: number) => any) | null) {
  // TODO (matsko): make sure this doesn't get minified
  const w = element.clientWidth + 1;
  cb && requestAnimationFrame(() => cb(w));
}

export function now(): number {
  return window && window.performance && window.performance.now() || Date.now();
}

export function parseTimingExp(exp: string | number | Timing): Timing {
  const regex = /^(-?[\.\d]+)(m?s)(?:\s+(-?[\.\d]+)(m?s))?(?:\s+([-a-z]+(?:\(.+?\))?))?$/i;
  let duration = 0;
  let delay = 0;
  let easing: string|null = null;
  if (typeof exp === 'string') {
    const matches = exp.match(regex);
    if (matches === null) {
      return {duration: 0, delay: 0, easing: '', fill: null};
    }

    duration = _convertTimeValueToMS(parseFloat(matches[1]), matches[2]);

    const delayMatch = matches[3];
    if (delayMatch != null) {
      delay = _convertTimeValueToMS(parseFloat(delayMatch), matches[4]);
    }

    const easingVal = matches[5];
    if (easingVal) {
      easing = easingVal;
    }
  } else if (typeof exp === 'number') {
    duration = exp;
  } else {
    const t = exp as Timing;
    duration = t.duration;
    delay = t.delay || 0;
    easing = t.easing || null;
  }

  return {duration, delay, easing, fill: null};
}

const ONE_SECOND = 1000;

function _convertTimeValueToMS(value: number, unit: string): number {
  // only seconds are treated in a special way ...
  // otherwise it's assumed that milliseconds are used
  return unit == 's' ? value * ONE_SECOND : value;
}

export function applyTransition(element: HTMLElement, value: string | null) {
  value ? element.style.setProperty('transition', value) :
          element.style.removeProperty('transition');
}