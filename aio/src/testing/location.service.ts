import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

export class MockLocationService {
  urlSubject = new BehaviorSubject<string>(this.initialUrl);
  currentUrl = this.urlSubject.asObservable().pipe(map(url => this.stripSlashes(url)));
  // strip off query and hash
  currentPath = this.currentUrl.pipe(map(url => url.match(/[^?#]*/)![0]));
  search = jest.fn().mockReturnValue({});
  setSearch = jest.fn();
  go = jest.fn((url: string) => this.urlSubject.next(url));
  goExternal = jest.fn();
  replace = jest.fn();
  handleAnchorClick = jest.fn()
      .mockReturnValue(false); // prevent click from causing a browser navigation

  constructor(private initialUrl: string) {}

  private stripSlashes(url: string) {
    return url.replace(/^\/+/, '').replace(/\/+(\?|#|$)/, '$1');
  }
}

