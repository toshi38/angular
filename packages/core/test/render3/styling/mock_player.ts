/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {Subject} from 'rxjs';

import {PlayState, Player} from '../../../src/render3/interfaces/player';

export class MockPlayer implements Player {
  status !: Subject<PlayState|string>;
  parent: Player|null = null;
  log: string[] = [];
  state: PlayState = PlayState.Pending;

  constructor(public value?: any) { this.status = new Subject<PlayState|string>(); }

  play(): void {
    if (this.state < PlayState.Paused) {
      this.status.next(this.state = PlayState.Running);
    }
  }

  pause(): void {
    if (this.state !== PlayState.Paused) {
      this.status.next(this.state = PlayState.Paused);
    }
  }

  finish(): void {
    if (this.state < PlayState.Finished) {
      this.status.next(this.state = PlayState.Finished);
    }
  }

  destroy(): void {
    if (this.state < PlayState.Destroyed) {
      this.status.next(this.state = PlayState.Destroyed);
    }
  }
}
