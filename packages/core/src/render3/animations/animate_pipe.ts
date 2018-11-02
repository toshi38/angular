/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {Pipe} from '../../metadata/directives';
import {NgModule} from '../../metadata/ng_module';
import {BindingType, Player} from '../../render3/interfaces/player';
import {bindPlayerFactory} from '../../render3/styling/player_factory';

import {CssTransitionAnimator} from './css_transition_animator';
import {Animator, AnimatorState, Timing} from './interfaces';
import {StylingPlayer} from './styling_player';
import {parseTimingExp} from './util';

/**
 * The AnimatePipe pipe is designed to be used alongside [style]
 * and [class] bindings and will produce an animation that will
 * kick animate the change in styling (both styles and classes)
 * using either web-animations (for styles) and transitions
 * (for both styles and classes).
 *
 * The AnimatePipe class is designed to run in two phases:
 *
 * 1. During compile execution (when the template is parsed)
 * 2. During styling rendering (after the [style] and [class]
 *    bindings have diffed and evaluated themslves)
 *
 * After styling rendering is executed then the provided player
 * factory function will run and the animation player is returned.
 *
 * Styling in Angular fully then relies on the player to manage
 * the diffed/evaluated style values in the player code itself. This
 * means that if a player uses web-animations or transitions then
 * it will rely on that technology to keep the styling on the element.
 * In other words, Angular will not setup an event listener to figure
 * out when the player finishes its rendering and then apply the styles
 * or classes to the element directly.
 *
 * Note that there is zero logic in the code below that will decide
 * if an animation is run based on application structure logic. (This
 * logic will be handled on a higher level via the component
 * PlayerHandler interface.)
 */

@Pipe({name: 'animate', pure: true})
export class AnimatePipe {
  transform(value: string|boolean|null|undefined|{[key: string]: any}, timingExp: string|number) {
    const timing = parseTimingExp(timingExp);
    return bindPlayerFactory(
        (element: HTMLElement, type: BindingType, values: {[key: string]: any},
         isFirstRender: boolean, previousPlayer: Player | null) => {
          const styles = type === BindingType.Style ? values : null;
          const classes = type === BindingType.Class ? values : null;
          return invokeStylingAnimation(element, classes, styles, timing);
        },
        value);
  }
}

// a WeakMap is used because it avoids the need to rely on a callback
// handler to detect when each element is removed since a weak map will
// automatically update its key state when an element is not referenced.
const ANIMATOR_MAP = new WeakMap<HTMLElement, Animator>();

export function invokeStylingAnimation(
    element: HTMLElement, classes: {[className: string]: boolean} | null,
    styles: {[key: string]: any} | null, timing: Timing): Player {
  let animator = ANIMATOR_MAP.get(element);
  if (!animator || animator.state === AnimatorState.Destroyed) {
    ANIMATOR_MAP.set(element, animator = new CssTransitionAnimator(element));
  }
  return new StylingPlayer(element, animator, timing, classes, styles);
}

@NgModule({declarations: [AnimatePipe]})
export class AnimatePipeModule {
}