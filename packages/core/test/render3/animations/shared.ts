/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
export async function waitForReflows(total: number = 1): Promise<any> {
  if (total) {
    const p = new Promise(resolve => { requestAnimationFrame(() => resolve()); });
    return p.then(() => waitForReflows(total - 1));
  }
  return Promise.resolve(true);
}

export function waitForTime(delay: number): Promise<any> {
  return new Promise(r => { setTimeout(() => r, delay); });
}

export function makeElement() {
  return document.createElement('div');
}

export function assertTransition(
    elementOrLog: HTMLElement | string[] | string, exps: string | string[]) {
  let str !: string;
  if (Array.isArray(exps)) {
    str = exps.join(',');
  } else {
    str = exps as string;
  }
  let valueToCompare: string;
  if (Array.isArray(elementOrLog) || typeof elementOrLog === 'string') {
    valueToCompare = elementOrLog as string;
  } else {
    valueToCompare = (elementOrLog as HTMLElement).style.transition || '';
  }
  expect(valueToCompare.replace(/\s*,\s*/g, ',').trim()).toEqual(str);
}

export function triggerTransitionEndEvent(
    element: HTMLElement, elapsedTime: number = 0, now?: number) {
  let event: AnimationEvent;
  if (typeof AnimationEvent !== 'undefined') {
    event = new AnimationEvent('transitionend', {elapsedTime});
  } else {
    event = document.createEvent('HTMLEvents') as any;
    event.initEvent('transitionend');
    (event as any).elapsedTime = elapsedTime;
  }
  (event as any).timeStamp = (now || Date.now()) + elapsedTime;
  element.dispatchEvent(event);
}

export function assertStyle(element: HTMLElement, prop: string, value: string) {
  expect((element.style as any)[prop] || '').toEqual(value);
}

export function assertClass(element: HTMLElement, name: string, exists: boolean) {
  expect(element.classList.contains(name)).toBe(exists);
}