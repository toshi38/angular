/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {Animator, AnimatorState, StylingEffect, Timing} from './interfaces';
import {applyReflow, applyTransition, computeStyle, now} from './util';

/**
 * This file introduces a transition animator which is designed to
 * handle multiple class/style transitions on an element at the same
 * time.
 */

/**
 * When ALL transitions are cancelled then the styling below
 * will force every transition arc to be interupted.
 */
const CANCEL_ALL_TRANSITIONS_VALUE = '0s none';

/**
 * This will force the very next styles that are applied to
 * be applied IMMEDIATELY to the element (so long as a reflow
 * is issued before the transition value is changed afterwards)
 */
const CANCEL_NEXT_TRANSITION_VALUE = '0s all';

/**
 * Special, internal-only version of StylingEffect
 * which is specific to the transition animator.
 *
 * The preComputedStyles member value (which is
 * either specific dimensional styles or any
 * styles marked with an AUTO_STYLE value) are
 * picked up by the transition animator and
 * evaluated just as the effects are processed.
 */
interface CssTransitionEffect extends StylingEffect {
  id: StylingEffect;
  preComputeStyles: string[]|null;
}

/**
 * Used to intercept all rendering-related operations
 * that occur in the animator (this is designed for
 * testing purposes).
 */
export interface RenderUtil {
  getComputedStyle(element: HTMLElement, prop: string): string;
  fireReflow(element: HTMLElement, frameCallback?: Function|null): void;
  setTimeout(fn: Function, time: number): any;
  clearTimeout(timeoutVal: any): void;
  setTransition(element: HTMLElement, value: string|null): void;
}

/**
 * Signifies that a particular style should be pre-computed
 * by the animator at the final frame of its arc so that
 * the transition can properly animate to it (think about
 * dimensional values like width/height and how hard they
 * are in CSS to animate towards).
 */
export const AUTO_STYLE = '*';

/**
 * The CssTransitionAnimator is primarily (in modern browsers) used
 * to animate CSS class (which can ONLY be animated using transitions
 * and inline style transitions together in the same animation arcs.
 *
 * CSS transitions (when interfaced with in JavaScript) do not have a
 * straightforward API. The only way to detect if a transition ends
 * (when the animation finishes) is by use of the `transitionend` event.
 * Despite the event being supported by all browsers, the behavior of
 * the event is very limited because it will only fire on CSS property
 * changes and NOT on CSS class changes. This means that to properly rely
 * on the event then each of the CSS styles need to be known (which is
 * impossible to know upfront since CSS classes are hidden within CSS
 * stylesheets and may change based on media queries and DOM state).
 *
 * Despite this limitation, the transition animator class below still
 * uses uses the `transitionend` event to detect for animations that
 * end. It will wait for the largest-timed `transitionend` event to
 * fire and capture that and then end all the transitions afterwards.
 * For this to work, all the styles are classes are applied onto the
 * element using various, comma-separated transition strings (one for
 * each style/class effect that is added to the animator).
 *
 * The reason all classes/styles on the same element are combined together
 * into the animator for the same element are due to the following reasons:
 *
 * 1. To figure out what the maximum wait time is for the full transition
 *    and then to check against that after every `transitionend` event
 *    fires.
 * 2. To setup a `setTimeout` fallback that will fire in the event that
 *    `transitionend` fails to fire (which can happen if there are no
 *    styles set to animate due to a missing class or no style changes)
 * 3. To apply the transition timing styles one by one onto the element
 *    with a reflow frame in between (this causes one set of classes/styles
 *    to animate before another which inturn allows for multiple CSS
 *    transitions to fire on a single element at the same time).
 *
 * Once the animator starts and the transitions are applied, each
 * transition string value is applied in the following way.
 *
 * 1. Apply first transition (e.g. style="transition: 1s all")
 * 2. Apply the classes and/or styles present in the queued transition
 *    (this kicks off the transition for that given styles/classes effect)
 * 3. Run a reflow (which uses measurement computation + RAF)
 * 4. Then repeat from step 1 and apply the next transition effect
 *
 * Once the classes/styles and transition strings have all been applied
 * then the player code will wait for `transitionend` and will then
 * only finish the transition animation once the longest transition
 * animation has finished (or the timer runs out).
 *
 * Only once all the transitions are finished then the underlying transition
 * style string will be removed from the element.
 */
export class CssTransitionAnimator implements Animator {
  state: AnimatorState = AnimatorState.Idle;

  private _listeners: (() => any)[] = [];
  private _queuedEffects: CssTransitionEffect[] = [];
  private _activeEffects: CssTransitionEffect[] = [];
  private _collectedClasses: {[className: string]: boolean}|null;
  private _collectedStyles: {[key: string]: any}|null;
  private _activeComputedStyles: {[key: string]: any}|null = null;
  private _captureFn: (event: AnimationEvent) => any;
  private _startTime = 0;
  private _maxTime = 0;
  private _timer: any;
  private _currentTransitionStr: string = '';
  private _waitingForFrameFns: (() => any)[] = [];
  private _lastTransitionToken: string = '';
  private _pendingFrame = false;

  constructor(
      private _element: HTMLElement, private _renderUtil?: RenderUtil|null,
      collectStyling?: boolean) {
    this._captureFn = (event: AnimationEvent) => {
      const totalTime = event.timeStamp - this._startTime;
      if (event.target === this._element) {
        event.stopPropagation();
        if (totalTime >= this._maxTime) {
          this._onAllEffectsFinished();
        }
      }
    };
    this._element.addEventListener('transitionend', this._captureFn, {capture: true});
    this._collectedClasses = collectStyling ? {} : null;
    this._collectedStyles = collectStyling ? {} : null;
  }

  onAllEffectsDone(cb: () => any) { this._listeners.push(cb); }

  addEffect(effect: StylingEffect) {
    const {classes, timing} = effect;
    const time = this._computeTransitionTime(timing);
    this._maxTime = Math.max(this._maxTime, time);

    // if and when styles are used we want to figure out what properties
    // are set to auto style animate and which ones are being removed.
    // If either is true then we need to signal the animator to pre-compute
    // the missing/auto style values once the effects are processed.
    let preComputeStyles: string[]|null = null;
    let styles: {[key: string]: any}|null = null;
    if (effect.styles) {
      styles = {};
      preComputeStyles = [];
      const props = Object.keys(effect.styles);
      for (let i = 0; i < props.length; i++) {
        const prop = props[i];
        let value = effect.styles[prop];
        if (!value || value === AUTO_STYLE) {
          if (doPreCompute(prop, value)) {
            preComputeStyles.push(prop);
            value = AUTO_STYLE;
          } else {
            value = null;
          }
        }
        styles[prop] = value;
      }
    }

    this._queuedEffects.push({
      id: effect,
      classes: classes ? {...classes} : null, styles, timing,
      preComputeStyles: (preComputeStyles && preComputeStyles !.length) ? preComputeStyles : null
    });
  }

  private _computeTransitionTime(timing: Timing) {
    // the goal is to figure out the total time of this transitions
    // when mixed together with the existing or soon-to-run transitions
    // because `transitionend` events are not 100% reliable (this is
    // explained at the top of this file). Having the total time allows
    // for a fallback timer to be scheduled/replaced so that the final
    // styling can be cleaned up and the transition can be explitly finished.
    const elapsedTimeSoFar = this.state === AnimatorState.Running ? (now() - this._startTime) : 0;
    return elapsedTimeSoFar + timing.duration + timing.delay;
  }

  finishEffect(effect: StylingEffect) { this._finishOrDestroyEffect(effect, false); }

  destroyEffect(effect: StylingEffect) { this._finishOrDestroyEffect(effect, true); }

  private _finishOrDestroyEffect(effect: StylingEffect, destroy: boolean) {
    // we wait for a frame in the event that the effect (or any other effects)
    // have been scheduled to be flushed
    this._waitForFrame(() => {
      this._applyTransition(CANCEL_NEXT_TRANSITION_VALUE);
      this._applyEffectStyling(effect, true);

      if (destroy) {
        this._waitForFrame(() => this._cleanupEffect(effect));
      } else {
        this._waitForFrame(() => {
          this._applyEffectStyling(effect);
          this._waitForFrame(() => this._cleanupEffect(effect));
        });
      }
    });
  }

  private _cleanupComputedStyles(computedStyles: string[]) {
    for (let i = 0; i < computedStyles.length; i++) {
      const prop = computedStyles[i];
      const computedValue = this._activeComputedStyles && this._activeComputedStyles[prop];
      const activeValue = (this._element.style as any)[prop];
      if (computedValue && computedValue === activeValue) {
        // if exactly the same then this means that the AUTO_STYLE was
        // the final styling for the element which means that it was never
        // intended to stick around once the animation is over
        this._activeComputedStyles ![prop] = null;
        applyStyle(this._element, prop, null);
      }
    }
  }

  private _cleanupEffect(effect: StylingEffect) {
    const effectIndex = findMatchingEffect(this._activeEffects, effect);
    if (effectIndex >= 0) {
      const activeEffect = this._activeEffects[effectIndex];
      this._activeEffects.splice(effectIndex, 1);
      if (activeEffect.preComputeStyles) {
        this._cleanupComputedStyles(activeEffect.preComputeStyles);
      }
    }

    this._flushNextEffect();
    const time = this._computeTransitionTime(effect.timing);
    if (time >= this._maxTime) {
      this._onAllEffectsFinished();
    }
  }

  private _applyEffectStyling(
      effect: StylingEffect, revert?: boolean, preComputedStyles?: {[key: string]: any}|null) {
    effect.classes &&
        applyClassChanges(this._element, effect.classes, revert, this._collectedClasses);
    effect.styles &&
        applyStyleChanges(
            this._element, effect.styles, null, revert, preComputedStyles, this._collectedStyles);
  }

  private _waitForFrame(cb?: () => any) {
    if (!this._pendingFrame) {
      this._pendingFrame = true;
      let flushFn: Function;
      handleReflow(this._element, flushFn = () => {
        this._pendingFrame = false;
        // this is eagerly assigned to avoid having
        // the frames grow (those are scheduled later)
        const length = this._waitingForFrameFns.length;
        for (let i = 0; i < length; i++) {
          this._waitingForFrameFns.shift() !();
        }
        if (this._waitingForFrameFns.length && !this._pendingFrame) {
          this._pendingFrame = true;
          handleReflow(this._element, flushFn, this._renderUtil);
        } else {
          this._pendingFrame = false;
        }
      }, this._renderUtil);
    }
    cb && this._waitingForFrameFns.push(cb);
  }

  private _computeStyles(effect: CssTransitionEffect) {
    const computeStyles = effect.preComputeStyles !;
    const duration = effect.timing.duration;
    const currentStyles: {[key: string]: any} = {};
    computeStyles.forEach(prop => {
      currentStyles[prop] = handleComputeStyle(this._element, prop, this._renderUtil);
      this._element.style.removeProperty(prop);
    });

    const propToBlock = computeStyles.length == 1 ? computeStyles[0] : 'all';
    const timing = {duration, delay: -duration, easing: null, fill: null};
    const transitionPrefix =
        this._currentTransitionStr + (this._currentTransitionStr.length ? ', ' : '');
    const transitionStr = transitionPrefix + buildTransitionStr(timing, propToBlock);
    setTransition(this._element, transitionStr, this._renderUtil);

    const computedStyles: {[key: string]: any} = {};
    computeStyles.forEach(prop => {
      computedStyles ![prop] = handleComputeStyle(this._element, prop, this._renderUtil);
      this._element.style.setProperty(prop, currentStyles[prop]);
    });

    handleReflow(this._element, null, this._renderUtil);
    return computedStyles;
  }

  /**
   * This method is responsible for applying each styles/class effect
   * onto the element with its associated transition timing string.
   *
   * The main point to take from this is that each effect MUST be applied
   * in between reflows so that the browser can kick off each style/class
   * rendering. Otherwise if everything is applied at once synchronously
   * then each subsequent class/style effect would be animated after the
   * last transition style is applied.
   *
   * It's pretty uncommon that multiple classes/styles are applied with
   * different transition timing values. Therefore it's only when this
   * occurs that reflows + requestAnimationFrame calls are used.
   */
  private _flushNextEffect() {
    this.state = AnimatorState.ProcessingEffects;

    if (this._queuedEffects.length) {
      const effect = this._queuedEffects.shift() !;
      const computedStyles = effect.preComputeStyles ? this._computeStyles(effect) : null;
      const transitionToken = buildTransitionStr(effect.timing, 'all');
      if (computedStyles || transitionToken != this._lastTransitionToken) {
        this._applyTransition(transitionToken);
        if (computedStyles) {
          this._activeComputedStyles =
              Object.assign(this._activeComputedStyles || {}, computedStyles);
        }
      }
      this._applyEffectStyling(effect, false, computedStyles);
      this._activeEffects.push(effect);
    }

    // all the effects have been applied ... Now set the element
    // into place so that a follow-up transition can be applied
    if (this._queuedEffects.length) {
      handleReflow(this._element, () => this._flushNextEffect(), this._renderUtil);
    } else {
      this.state = AnimatorState.Running;
    }
  }

  private _applyTransition(transitionToken: string) {
    this._lastTransitionToken = transitionToken;
    const transitionPrefix =
        this._currentTransitionStr + (this._currentTransitionStr.length ? ', ' : '');
    this._currentTransitionStr = transitionPrefix + transitionToken;
    setTransition(this._element, this._currentTransitionStr, this._renderUtil);
  }

  private _updateTimer() {
    // Sometimes a transition animation may not animate anything at all
    // due to missing classes or there being zero change in styling (
    // the element already has the same styling that is being animated).
    // There is no way for JS code to detect for this and the ONLY way
    // to gaurantee that the player finishes is to setup a timer that acts
    // as a fallback incase this happens. The reason way the variable below
    // has an extra buffer value is because the browser usually isn't quick
    // enough to trigger a transition and fire the ending callback in the
    // exact amount of time that the transition lasts for (therefore the
    // buffer allows for the animation to properly do its job in time).
    if (this._timer) {
      this._renderUtil ? this._renderUtil.clearTimeout(this._timer) : clearTimeout(this._timer);
    }

    const HALF_A_SECOND = 500;
    const maxTimeWithBuffer = this._maxTime + HALF_A_SECOND;
    const cb = () => this._onAllEffectsFinished();
    this._timer = this._renderUtil ? this._renderUtil.setTimeout(cb, maxTimeWithBuffer) :
                                     setTimeout(cb, maxTimeWithBuffer);
  }

  private _onAllEffectsFinished() {
    if (this.state >= AnimatorState.Running && this.state <= AnimatorState.Exiting) {
      if (this._activeComputedStyles) {
        this._cleanupComputedStyles(Object.keys(this._activeComputedStyles));
        this._activeComputedStyles = null;
      }
      this._maxTime = 0;
      this._currentTransitionStr = '';
      this._lastTransitionToken = '';
      this._activeEffects.length = 0;
      setTransition(this._element, null, this._renderUtil);
      this.state = AnimatorState.Idle;
      for (let i = 0; i < this._listeners.length; i++) {
        this._listeners[i]();
      }
      this._listeners.length = 0;
    }
  }

  scheduleFlush() {
    if (this.state !== AnimatorState.WaitingForFlush) {
      this._waitForFrame(() => this.flushEffects());
    }
  }

  flushEffects(): boolean {
    if (this.state !== AnimatorState.ProcessingEffects && this._queuedEffects.length) {
      this._startTime = now();
      this._flushNextEffect();
      this._updateTimer();
      return true;
    }
    return false;
  }

  finishAll() {
    setTransition(this._element, CANCEL_ALL_TRANSITIONS_VALUE);
    this.state = AnimatorState.Exiting;
    handleReflow(this._element, () => this._onAllEffectsFinished(), this._renderUtil);
  }

  destroy() {
    if (this.state < AnimatorState.Exiting) {
      this.state = AnimatorState.Exiting;
      setTransition(this._element, CANCEL_ALL_TRANSITIONS_VALUE, this._renderUtil);
      this._element.removeEventListener('transitionend', this._captureFn);

      handleReflow(this._element, () => {
        this._onAllEffectsFinished();
        this.state = AnimatorState.Destroyed;
        this._collectedClasses && applyClassChanges(this._element, this._collectedClasses, true);
        this._collectedStyles &&
            applyStyleChanges(this._element, this._collectedStyles, null, true, null);
      }, this._renderUtil);
    }
  }
}

function applyClassChanges(
    element: HTMLElement, classes: {[key: string]: boolean}, revert?: boolean,
    store?: {[key: string]: any} | null) {
  Object.keys(classes).forEach(className => {
    const bool = classes[className];
    element.classList.toggle(className, revert ? !bool : bool);
    if (store) {
      store[className] = revert ? false : true;
    }
  });
}

function applyStyleChanges(
    element: HTMLElement, styles: {[key: string]: any}, backupStyles: {[key: string]: any} | null,
    revert?: boolean, preComputedStyles?: {[key: string]: any} | null,
    store?: {[key: string]: any} | null) {
  Object.keys(styles).forEach(prop => {
    let value = revert ? (backupStyles && backupStyles[prop]) : styles[prop];
    if (value && value === AUTO_STYLE) {
      value = preComputedStyles && preComputedStyles[prop] || '';
    }
    applyStyle(element, prop, value);
    if (store) {
      store[prop] = value || null;
    }
  });
}

function applyStyle(element: HTMLElement, prop: string, value: string | null) {
  if (value) {
    element.style.setProperty(prop, value);
  } else {
    element.style.removeProperty(prop);
  }
}

function buildTransitionStr(timing: Timing, props: string): string {
  return `${timing.duration}ms ${props} ${timing.delay}ms${timing.easing ? (' ' + timing.easing) : ''}`;
}

function setTransition(element: HTMLElement, value: string | null, renderUtil?: RenderUtil | null) {
  if (renderUtil) {
    renderUtil.setTransition(element, value);
  } else {
    applyTransition(element, value);
  }
}

function doPreCompute(prop: string, value: string) {
  if (value === AUTO_STYLE) return true;
  switch (prop) {
    case 'width':
    case 'height':
      return true;
  }
  return false;
}

function handleReflow(element: HTMLElement, cb?: Function | null, renderUtil?: RenderUtil | null) {
  renderUtil ? renderUtil.fireReflow(element, cb) : applyReflow(element, cb as any);
}

function handleComputeStyle(
    element: HTMLElement, prop: string, renderUtil?: RenderUtil | null): string {
  return renderUtil ? renderUtil.getComputedStyle(element, prop) : computeStyle(element, prop);
}

function findMatchingEffect(effects: CssTransitionEffect[], effect: StylingEffect): number {
  for (let i = 0; i < effects.length; i++) {
    if (effects[i].id === effect) return i;
  }
  return -1;
}