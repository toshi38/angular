/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {Subject} from 'rxjs';

import {PlayState, Player} from '../../render3/interfaces/player';

import {Animator, StylingEffect, Timing} from './interfaces';

export class StylingPlayer implements Player {
  parent: Player|null = null;
  state = PlayState.Pending;
  status: Subject<PlayState|string>;
  private _effect: StylingEffect;

  constructor(
      public element: HTMLElement, private _animator: Animator, timing: Timing,
      classes: {[key: string]: any}|null, styles: {[key: string]: any}|null) {
    this.status = new Subject<PlayState|string>();
    this._effect = {timing, classes, styles};
  }

  play(): void {
    if (this.state === PlayState.Pending) {
      this._animator.addEffect(this._effect);
      this._animator.onAllEffectsDone(() => this._onFinish());
      this._animator.scheduleFlush();
      this.status.next(this.state = PlayState.Running);
    } else if (this.state === PlayState.Paused) {
      this.status.next(this.state = PlayState.Running);
    }
  }

  pause(): void {
    if (this.state === PlayState.Running) {
      this.status.next(this.state = PlayState.Paused);
    }
  }

  finish(): void {
    if (this.state < PlayState.Finished) {
      this._animator.finishEffect(this._effect);
      this._onFinish();
    }
  }

  private _onFinish() {
    if (this.state < PlayState.Finished) {
      this.status.next(this.state = PlayState.Finished);
    }
  }

  destroy(replacementPlayer?: Player|null): void {
    if (this.state < PlayState.Destroyed) {
      const removeEffect = !replacementPlayer || !(replacementPlayer instanceof StylingPlayer);
      if (removeEffect) {
        this._animator.destroyEffect(this._effect);
      }
      this._onFinish();
      this.status.next(this.state = PlayState.Destroyed);
    }
  }
}
