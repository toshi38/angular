import { Subject } from 'rxjs';
import { SearchResults } from 'app/search/interfaces';

export class MockSearchService {
  searchResults = new Subject<SearchResults>();
  initWorker = jest.fn();
  loadIndex = jest.fn();
  search = jest.fn();
}
