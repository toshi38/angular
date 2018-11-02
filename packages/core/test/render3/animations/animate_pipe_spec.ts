/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {NgModule} from '@angular/core/src/core';
import {BoundPlayerFactory} from '@angular/core/src/render3/styling/player_factory';

import {AnimatePipe} from '../../../src/render3/animations/animate_pipe';
import {StylingPlayer} from '../../../src/render3/animations/styling_player';
import {BindingType} from '../../../src/render3/interfaces/player';
import {makeElement} from './shared';

describe('AnimatePipe', () => {
  it('should produce return a PlayerFactory when the pipe is executed', () => {
    const pipe = new AnimatePipe();
    const result = pipe.transform('foo', 0) as BoundPlayerFactory<string>;
    expect(result instanceof BoundPlayerFactory).toBeTruthy();

    const {value, fn} = result;
    expect(value).toEqual('foo');
    expect(typeof fn).toEqual('function');
  });

  it('should return an instanceof a StylingPlayer when only classes are used', () => {
    const player = buildClassPlayer(makeElement(), {active: true}, '1000ms') as StylingPlayer;
    expect(player instanceof StylingPlayer).toBeTruthy();
  });

  it('should return an instanceof a StylingPlayer when only styles are used', () => {
    const player = buildStylesPlayer(makeElement(), {width: '100px'}, '1000ms') as StylingPlayer;
    expect(player instanceof StylingPlayer).toBeTruthy();
  });
});

@NgModule({declarations: [AnimatePipe]})
class SomeModule {
}

function buildClassPlayer(
    element: HTMLElement, classes: {[key: string]: boolean}, duration: string) {
  const result = new AnimatePipe().transform(classes, duration);
  const fn = (result as BoundPlayerFactory<{[key: string]: boolean}>).fn;
  return fn(element, BindingType.Class, classes, false, null);
}

function buildStylesPlayer(element: HTMLElement, styles: {[key: string]: any}, duration: string) {
  const result =
      new AnimatePipe().transform(styles, duration) as BoundPlayerFactory<{[key: string]: any}>;
  return result.fn(element, BindingType.Style, styles, false, null);
}
