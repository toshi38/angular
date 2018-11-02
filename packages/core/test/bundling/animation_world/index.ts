/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import '@angular/core/test/bundling/util/src/reflect_metadata';

import {CommonModule} from '@angular/common';
import {Component, ElementRef, NgModule, ɵAnimatePipe as AnimatePipe, ɵPlayState as PlayState, ɵPlayer as Player, ɵPlayerHandler as PlayerHandler, ɵaddPlayer as addPlayer, ɵbindPlayerFactory as bindPlayerFactory, ɵmarkDirty as markDirty, ɵpublishDefaultGlobalUtils, ɵrenderComponent as renderComponent} from '@angular/core';
import {Observable, Subject} from 'rxjs';

@Component({
  selector: 'animation-world',
  styles: [`
  `],
  template: `
    <section>
      <header>
        <h2>Classes and Styles</h2>
      </header>
      <nav>
        <button (click)="animateWithCustomPlayer()">Animate List (custom player)</button>
        <button (click)="animateWithStyles()">Populate List (style bindings)</button>
        <button (click)="auto()">Auto Animate</button>
      </nav>
      <div class="list">
        <div
          *ngFor="let item of items" class="record"
            style="border-radius: 10px"
            (click)="updateItem(item)"
            [class]="makeClass(item.title)"
            [class.one]="item.count === 0 | animate:'1000ms ease-out'"
            [class.two]="item.count === 1 | animate:'2000ms ease-out'"
            [class.three]="item.count === 2 | animate:'1000ms ease-out'"
            [class.four]="item.count === 3 | animate:'1000ms ease-out'"
            [class.on]="item.count === 1 | animate:'500ms ease-in'"
            [class.border]="item.count === 2 | animate:'1000ms ease-out'"
            [style.color]="item.count === 1 ? 'yellow' : null"
            [style]="styles | animate:'500ms ease-out'">
          {{ item.title }}
        </div>
      </div>
    </section>

    <section>
      <header>
        <h2>Star Styles</h2>
      </header>
      <div class="box">
        <div class="header"
          [class.active]="isOpen | animate:'300ms ease-out'"
          (click)="toggleBox()">Click me ({{ isOpen ? 'open' : 'closed' }})</div>
        <div class="content" [style.height]="
          (isOpen ? null : '0px') | animate:determineBoxEasing">
          <div class="inner">
            <p>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur vitae sem accumsan, finibus libero a, feugiat dui. Ut vel vestibulum lorem. Morbi vel venenatis eros, ac rhoncus dolor. Maecenas efficitur, elit at lobortis aliquam, elit sapien commodo ipsum, sed pulvinar sapien dui eu arcu. Mauris id magna sit amet leo luctus venenatis eu ut lectus. Sed quis elit a diam sagittis volutpat nec a ex. Mauris ac mi sit amet neque vehicula elementum ut vel nunc.
            </p>
            <p>
              Quisque tempor nec nibh quis pellentesque. Proin fringilla pharetra lacus ut feugiat. Nullam cursus eros est. Nunc quis odio congue, lacinia mi ac, condimentum nisl. Ut sit amet felis condimentum, faucibus nibh in, pharetra quam. Vestibulum nec ipsum consectetur, accumsan ligula sed, finibus odio. Nulla et ex interdum, eleifend tortor in, dignissim nibh. Maecenas eu quam id quam ullamcorper efficitur vitae et neque. In ullamcorper neque et ante blandit molestie vitae quis elit. Vivamus id rutrum orci, in sollicitudin arcu. Praesent tempus dui vitae auctor facilisis.
            </p>
          </div>
        </div>
      </div>
    </section>
  `,
})
class AnimationWorldComponent {
  items: any[] = [
    {title: 1, count: 0},
    {title: 2, count: 0},
    {title: 3, count: 0},
    {title: 4, count: 0},
    {title: 5, count: 0},
    {title: 6, count: 0},
    {title: 7, count: 0},
    {title: 8, count: 0},
    {title: 9, count: 0},
  ];
  private _hostElement: HTMLElement;
  public styles: {[key: string]: any}|null = {};
  public font = '';
  private _stylesActive = false;

  constructor(element: ElementRef) { this._hostElement = element.nativeElement; }

  get determineBoxEasing() {
    if (this.isOpen) {
      return '500ms ease-out';
    }
    return '2000ms ease-in';
  }

  updateItem(item: any) {
    const MAX_COUNT = 4;
    item.count = ++item.count % MAX_COUNT;
    markDirty(this);
  }

  public isOpen = false;
  toggleBox() {
    this.isOpen = !this.isOpen;
    markDirty(this);
  }

  makeClass(index: string) { return `record-${index}`; }

  auto() {
    for (let i = 0; i < 7; i++) {
      const index = Math.floor(Math.random() * this.items.length);
      const item = this.items[index];
      item.count = Math.floor(Math.random() * 4);
    }
    markDirty(this);
  }

  animateWithStyles() {
    if (this._stylesActive) {
      this.styles = {};
      this.font = '';
      this._stylesActive = false;
    } else {
      this.styles = {transform: 'rotate(20deg)'};
      this.font = '100px';
      this._stylesActive = true;
    }
    markDirty(this);
  }

  animateWithCustomPlayer() {
    const elements = this._hostElement.querySelectorAll('div.record') as any as HTMLElement[];
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const delay = i * 100;
      const player = buildAnimationPlayer(element, 'fadeInOut', `500ms ease-out ${delay}ms both`);
      addPlayer(element, player);
    }
  }
}

@NgModule({declarations: [AnimationWorldComponent, AnimatePipe], imports: [CommonModule]})
class AnimationWorldModule {
}


function buildAnimationPlayer(element: HTMLElement, animationName: string, time: string): Player {
  return new SimpleKeyframePlayer(element, animationName, time);
}

class SimpleKeyframePlayer implements Player {
  status !: Observable<PlayState|string>;
  state = PlayState.Pending;
  parent: Player|null = null;
  private _animationStyle: string = '';
  private _listeners: {[stateName: string]: (() => any)[]} = {};

  constructor(private _element: HTMLElement, private _animationName: string, time: string) {
    this._animationStyle = `${time} ${_animationName}`;
    this.status = new Subject<PlayState|string>();
  }

  private _start() {
    (this._element as any).style.animation = this._animationStyle;
    const animationFn = (event: AnimationEvent) => {
      if (event.animationName == this._animationName) {
        this._element.removeEventListener('animationend', animationFn);
        this.finish();
      }
    };
    this._element.addEventListener('animationend', animationFn);
  }
  addEventListener(state: PlayState|string, cb: () => any): void {
    const key = state.toString();
    const arr = this._listeners[key] = (this._listeners[key] || []);
    arr.push(cb);
  }
  play(): void {
    if (this.state <= PlayState.Pending) {
      this._start();
    }
    if (this.state != PlayState.Running) {
      setAnimationPlayState(this._element, 'running');
      this.state = PlayState.Running;
      this._emit(this.state);
    }
  }
  pause(): void {
    if (this.state != PlayState.Paused) {
      setAnimationPlayState(this._element, 'paused');
      this.state = PlayState.Paused;
      this._emit(this.state);
    }
  }
  finish(): void {
    if (this.state < PlayState.Finished) {
      this._element.style.animation = '';
      this.state = PlayState.Finished;
      this._emit(this.state);
    }
  }
  destroy(): void {
    if (this.state < PlayState.Destroyed) {
      this.finish();
      this.state = PlayState.Destroyed;
      this._emit(this.state);
    }
  }
  capture(): any {}
  private _emit(state: PlayState) {
    const arr = this._listeners[state.toString()] || [];
    arr.forEach(cb => cb());
  }
}

function setAnimationPlayState(element: HTMLElement, state: string) {
  element.style.animationPlayState = state;
}

class MyPlayerHandler implements PlayerHandler {
  private _players: Player[] = [];

  flushPlayers() {
    this._players.forEach(player => {
      if (!player.parent && player.state === PlayState.Pending) {
        player.play();
      }
    });
    this._players.length = 0;
  }

  queuePlayer(player: Player): void { this._players.push(player); }
}

const playerHandler = new MyPlayerHandler();
renderComponent(AnimationWorldComponent, {playerHandler});

ɵpublishDefaultGlobalUtils();