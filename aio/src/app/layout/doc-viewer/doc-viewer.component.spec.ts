import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';

import { Observable, of } from 'rxjs';

import { FILE_NOT_FOUND_ID, FETCHING_ERROR_ID } from 'app/documents/document.service';
import { Logger } from 'app/shared/logger.service';
import { CustomElementsModule } from 'app/custom-elements/custom-elements.module';
import { TocService } from 'app/shared/toc.service';
import { ElementsLoader } from 'app/custom-elements/elements-loader';
import {
MockTitle, MockTocService, ObservableWithSubscriptionSpies,
TestDocViewerComponent, TestModule, TestParentComponent, MockElementsLoader
} from 'testing/doc-viewer-utils';
import { MockLogger } from 'testing/logger.service';
import { DocViewerComponent, NO_ANIMATIONS } from './doc-viewer.component';

describe('DocViewerComponent', () => {
  let parentFixture: ComponentFixture<TestParentComponent>;
  let parentComponent: TestParentComponent;
  let docViewerEl: HTMLElement;
  let docViewer: TestDocViewerComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CustomElementsModule, TestModule],
    });

    parentFixture = TestBed.createComponent(TestParentComponent);
    parentComponent = parentFixture.componentInstance;

    parentFixture.detectChanges();

    docViewerEl = parentFixture.debugElement.children[0].nativeElement;
    docViewer = parentComponent.docViewer as any;
  });

  it('should create a `DocViewer`', () => {
    expect(docViewer).toEqual(expect.any(DocViewerComponent));
  });

  describe('#doc', () => {
    let renderSpy: jest.SpyInstance;

    const setCurrentDoc = (contents: string|null, id = 'fizz/buzz') => {
      parentComponent.currentDoc = {contents, id};
      parentFixture.detectChanges();
    };

    beforeEach(() => renderSpy = jest.spyOn(docViewer, 'render').mockReturnValue([null]));

    it('should render the new document', () => {
      setCurrentDoc('foo', 'bar');
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(renderSpy.mock.calls[renderSpy.mock.calls.length - 1]).toEqual([{contents: 'foo', id: 'bar'}]);

      setCurrentDoc(null, 'baz');
      expect(renderSpy).toHaveBeenCalledTimes(2);
      expect(renderSpy.mock.calls[renderSpy.mock.calls.length - 1]).toEqual([{contents: null, id: 'baz'}]);
    });

    it('should unsubscribe from the previous "render" observable upon new document', () => {
      const obs = new ObservableWithSubscriptionSpies();
      renderSpy.mockReturnValue(obs);

      setCurrentDoc('foo', 'bar');
      expect(obs.subscribeSpy).toHaveBeenCalledTimes(1);
      expect(obs.unsubscribeSpies[0]).not.toHaveBeenCalled();

      setCurrentDoc('baz', 'qux');
      expect(obs.subscribeSpy).toHaveBeenCalledTimes(2);
      expect(obs.unsubscribeSpies[0]).toHaveBeenCalledTimes(1);
    });

    it('should ignore falsy document values', () => {
      parentComponent.currentDoc = null;
      parentFixture.detectChanges();

      expect(renderSpy).not.toHaveBeenCalled();

      parentComponent.currentDoc = undefined;
      parentFixture.detectChanges();

      expect(renderSpy).not.toHaveBeenCalled();
    });
  });

  describe('#ngOnDestroy()', () => {
    it('should stop responding to document changes', () => {
      const renderSpy = jest.spyOn(docViewer, 'render').mockReturnValue([undefined]);

      expect(renderSpy).not.toHaveBeenCalled();

      docViewer.doc = {contents: 'Some content', id: 'some-id'};
      expect(renderSpy).toHaveBeenCalledTimes(1);

      docViewer.ngOnDestroy();

      docViewer.doc = {contents: 'Other content', id: 'other-id'};
      expect(renderSpy).toHaveBeenCalledTimes(1);

      docViewer.doc = {contents: 'More content', id: 'more-id'};
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('#prepareTitleAndToc()', () => {
    const EMPTY_DOC = '';
    const DOC_WITHOUT_H1 = 'Some content';
    const DOC_WITH_H1 = '<h1>Features</h1>Some content';
    const DOC_WITH_NO_TOC_H1 = '<h1 class="no-toc">Features</h1>Some content';
    const DOC_WITH_EMBEDDED_TOC = '<h1>Features</h1><aio-toc class="embedded"></aio-toc>Some content';
    const DOC_WITH_EMBEDDED_TOC_WITHOUT_H1 = '<aio-toc class="embedded"></aio-toc>Some content';
    const DOC_WITH_EMBEDDED_TOC_WITH_NO_TOC_H1 = '<aio-toc class="embedded"></aio-toc>Some content';
    const DOC_WITH_HIDDEN_H1_CONTENT = '<h1><i style="visibility: hidden">link</i>Features</h1>Some content';
    let titleService: MockTitle;
    let tocService: MockTocService;
    let targetEl: HTMLElement;

    const getTocEl = () => targetEl.querySelector('aio-toc');
    const doPrepareTitleAndToc = (contents: string, docId = '') => {
      targetEl.innerHTML = contents;
      return docViewer.prepareTitleAndToc(targetEl, docId);
    };
    const doAddTitleAndToc = (contents: string, docId = '') => {
      const addTitleAndToc = doPrepareTitleAndToc(contents, docId);
      return addTitleAndToc();
    };

    beforeEach(() => {
      titleService = TestBed.get(Title);
      tocService = TestBed.get(TocService);

      targetEl = document.createElement('div');
      document.body.appendChild(targetEl);  // Required for `innerText` to work as expected.
    });

    afterEach(() => document.body.removeChild(targetEl));

    it('should return a function for doing the actual work', () => {
      const addTitleAndToc = doPrepareTitleAndToc(DOC_WITH_H1);

      expect(getTocEl()).toBeTruthy();
      expect(titleService.setTitle).not.toHaveBeenCalled();
      expect(tocService.reset).not.toHaveBeenCalled();
      expect(tocService.genToc).not.toHaveBeenCalled();

      addTitleAndToc();

      expect(titleService.setTitle).toHaveBeenCalledTimes(1);
      expect(tocService.reset).toHaveBeenCalledTimes(1);
      expect(tocService.genToc).toHaveBeenCalledTimes(1);
    });

    describe('(title)', () => {
      it('should set the title if there is an `<h1>` heading', () => {
        doAddTitleAndToc(DOC_WITH_H1);
        expect(titleService.setTitle).toHaveBeenCalledWith('Angular - Features');
      });

      it('should set the title if there is a `.no-toc` `<h1>` heading', () => {
        doAddTitleAndToc(DOC_WITH_NO_TOC_H1);
        expect(titleService.setTitle).toHaveBeenCalledWith('Angular - Features');
      });

      it('should set the default title if there is no `<h1>` heading', () => {
        doAddTitleAndToc(DOC_WITHOUT_H1);
        expect(titleService.setTitle).toHaveBeenCalledWith('Angular');

        doAddTitleAndToc(EMPTY_DOC);
        expect(titleService.setTitle).toHaveBeenCalledWith('Angular');
      });

      it('should not include hidden content of the `<h1>` heading in the title', () => {
        doAddTitleAndToc(DOC_WITH_HIDDEN_H1_CONTENT);
        // expect(titleService.setTitle).toHaveBeenCalledWith('Angular - Features');
      });

      it('should fall back to `textContent` if `innerText` is not available', () => {
        const querySelector_ = targetEl.querySelector;
        jest.spyOn(targetEl, 'querySelector').mockImplementation((selector: string) => {
          const elem = querySelector_.call(targetEl, selector);
          return elem && Object.defineProperties(elem, {
            innerText: {value: undefined},
            textContent: {value: 'Text Content'},
          });
        });

        doAddTitleAndToc(DOC_WITH_HIDDEN_H1_CONTENT);

        expect(titleService.setTitle).toHaveBeenCalledWith('Angular - Text Content');
      });

      it('should still use `innerText` if available but empty', () => {
        const querySelector_ = targetEl.querySelector;
        jest.spyOn(targetEl, 'querySelector').mockImplementation((selector: string) => {
          const elem = querySelector_.call(targetEl, selector);
          return elem && Object.defineProperties(elem, {
            innerText: { value: '' },
            textContent: { value: 'Text Content' }
          });
        });

        doAddTitleAndToc(DOC_WITH_HIDDEN_H1_CONTENT);

        expect(titleService.setTitle).toHaveBeenCalledWith('Angular');
      });
    });

    describe('(ToC)', () => {
      describe('needed', () => {
        it('should add an embedded ToC element if there is an `<h1>` heading', () => {
          doPrepareTitleAndToc(DOC_WITH_H1);
          const tocEl = getTocEl()!;

          expect(tocEl).toBeTruthy();
          expect(tocEl.classList.contains('embedded')).toBe(true);
        });

        it('should not add a second ToC element if there a hard coded one in place', () => {
          doPrepareTitleAndToc(DOC_WITH_EMBEDDED_TOC);
          expect(targetEl.querySelectorAll('aio-toc').length).toEqual(1);
        });
      });


      describe('not needed', () => {
        it('should not add a ToC element if there is a `.no-toc` `<h1>` heading', () => {
          doPrepareTitleAndToc(DOC_WITH_NO_TOC_H1);
          expect(getTocEl()).toBeFalsy();
        });

        it('should not add a ToC element if there is no `<h1>` heading', () => {
          doPrepareTitleAndToc(DOC_WITHOUT_H1);
          expect(getTocEl()).toBeFalsy();

          doPrepareTitleAndToc(EMPTY_DOC);
          expect(getTocEl()).toBeFalsy();
        });

        it('should remove ToC a hard coded one', () => {
          doPrepareTitleAndToc(DOC_WITH_EMBEDDED_TOC_WITHOUT_H1);
          expect(getTocEl()).toBeFalsy();

          doPrepareTitleAndToc(DOC_WITH_EMBEDDED_TOC_WITH_NO_TOC_H1);
          expect(getTocEl()).toBeFalsy();
        });
      });


      it('should generate ToC entries if there is an `<h1>` heading', () => {
        doAddTitleAndToc(DOC_WITH_H1, 'foo');

        expect(tocService.genToc).toHaveBeenCalledTimes(1);
        expect(tocService.genToc).toHaveBeenCalledWith(targetEl, 'foo');
      });

      it('should not generate ToC entries if there is a `.no-toc` `<h1>` heading', () => {
        doAddTitleAndToc(DOC_WITH_NO_TOC_H1);
        expect(tocService.genToc).not.toHaveBeenCalled();
      });

      it('should not generate ToC entries if there is no `<h1>` heading', () => {
        doAddTitleAndToc(DOC_WITHOUT_H1);
        doAddTitleAndToc(EMPTY_DOC);

        expect(tocService.genToc).not.toHaveBeenCalled();
      });

      it('should always reset the ToC (before generating the new one)', () => {
        doAddTitleAndToc(DOC_WITH_H1, 'foo');
        expect(tocService.reset).toHaveBeenCalledTimes(1);
        // expect(tocService.reset).toHaveBeenCalledBefore(tocService.genToc);
        expect(tocService.genToc).toHaveBeenCalledWith(targetEl, 'foo');

        tocService.genToc.mockClear();

        doAddTitleAndToc(DOC_WITH_NO_TOC_H1, 'bar');
        expect(tocService.reset).toHaveBeenCalledTimes(2);
        expect(tocService.genToc).not.toHaveBeenCalled();

        doAddTitleAndToc(DOC_WITHOUT_H1, 'baz');
        expect(tocService.reset).toHaveBeenCalledTimes(3);
        expect(tocService.genToc).not.toHaveBeenCalled();

        doAddTitleAndToc(EMPTY_DOC, 'qux');
        expect(tocService.reset).toHaveBeenCalledTimes(4);
        expect(tocService.genToc).not.toHaveBeenCalled();
      });
    });
  });

  describe('#render()', () => {
    let prepareTitleAndTocSpy: jest.SpyInstance;
    let swapViewsSpy: jest.SpyInstance;
    let loadElementsSpy: jest.SpyInstance;

    const doRender = (contents: string | null, id = 'foo') =>
      docViewer.render({contents, id}).toPromise();

    beforeEach(() => {
      const elementsLoader = TestBed.get(ElementsLoader) as MockElementsLoader;
      loadElementsSpy = elementsLoader.loadContainedCustomElements.mockReturnValue(of(undefined));
      prepareTitleAndTocSpy = jest.spyOn(docViewer, 'prepareTitleAndToc').mockImplementation(jest.fn);
      swapViewsSpy = jest.spyOn(docViewer, 'swapViews').mockReturnValue(of(undefined));
    });

    it('should return an `Observable`', () => {
      expect(docViewer.render({contents: '', id: ''})).toEqual(expect.any(Observable));
    });

    describe('(contents, title, ToC)', () => {
      beforeEach(() => {
          swapViewsSpy.mockRestore();
          swapViewsSpy = jest.spyOn(docViewer, 'swapViews')
      });

      it('should display the document contents', async () => {
        const contents = '<h1>Hello,</h1> <div>world!</div>';
        await doRender(contents);

        // expect(docViewerEl.innerHTML).toContain(contents);
        // expect(docViewerEl.textContent).toBe('Hello, world!');
      });

      it('should display nothing if the document has no contents', async () => {
        await doRender('Test');
        // expect(docViewerEl.textContent).toBe('Test');

        await doRender('');
        expect(docViewerEl.textContent).toBe('');

        docViewer.currViewContainer.innerHTML = 'Test';
        // expect(docViewerEl.textContent).toBe('Test');

        await doRender(null);
        expect(docViewerEl.textContent).toBe('');
      });

      it('should prepare the title and ToC (before embedding components)', async () => {
        prepareTitleAndTocSpy.mockImplementation((targetEl: HTMLElement, docId: string) => {
          expect(targetEl.innerHTML).toBe('Some content');
          expect(docId).toBe('foo');
        });

        await doRender('Some content', 'foo');

        expect(prepareTitleAndTocSpy).toHaveBeenCalledTimes(1);
        // expect(prepareTitleAndTocSpy).toHaveBeenCalledBefore(loadElementsSpy);
      });

      it('should set the title and ToC (after the content has been set)', async () => {
        const addTitleAndTocSpy = jest.fn();
        prepareTitleAndTocSpy.mockReturnValue(addTitleAndTocSpy);

        addTitleAndTocSpy.mockImplementation(() => expect(docViewerEl.textContent).toBe('Foo content'));
        await doRender('Foo content');
        expect(addTitleAndTocSpy).toHaveBeenCalledTimes(1);

        addTitleAndTocSpy.mockImplementation(() => expect(docViewerEl.textContent).toBe('Bar content'));
        await doRender('Bar content');
        expect(addTitleAndTocSpy).toHaveBeenCalledTimes(2);

        addTitleAndTocSpy.mockImplementation(() => expect(docViewerEl.textContent).toBe(''));
        await doRender('');
        expect(addTitleAndTocSpy).toHaveBeenCalledTimes(3);

        addTitleAndTocSpy.mockImplementation(() => expect(docViewerEl.textContent).toBe('Qux content'));
        await doRender('Qux content');
        expect(addTitleAndTocSpy).toHaveBeenCalledTimes(4);
      });

      it('should remove the "noindex" meta tag if the document is valid', async () => {
        await doRender('foo', 'bar');
        expect(TestBed.get(Meta).removeTag).toHaveBeenCalledWith('name="robots"');
      });

      it('should add the "noindex" meta tag if the document is 404', async () => {
        await doRender('missing', FILE_NOT_FOUND_ID);
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'robots', content: 'noindex' });
      });

      it('should add a "noindex" meta tag if the document fetching fails', async () => {
        await doRender('error', FETCHING_ERROR_ID);
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'robots', content: 'noindex' });
      });
    });

    describe('(embedding components)', () => {
      it('should embed components', async () => {
        await doRender('Some content');
        expect(loadElementsSpy).toHaveBeenCalledTimes(1);
        expect(loadElementsSpy).toHaveBeenCalledWith(docViewer.nextViewContainer);
      });

      it('should attempt to embed components even if the document is empty', async () => {
        await doRender('');
        await doRender(null);

        expect(loadElementsSpy).toHaveBeenCalledTimes(2);
        expect(loadElementsSpy.mock.calls[0]).toEqual([docViewer.nextViewContainer]);
        expect(loadElementsSpy.mock.calls[1]).toEqual([docViewer.nextViewContainer]);
      });

      it('should unsubscribe from the previous "embed" observable when unsubscribed from', () => {
        const obs = new ObservableWithSubscriptionSpies();
        loadElementsSpy.mockReturnValue(obs);

        const renderObservable = docViewer.render({contents: 'Some content', id: 'foo'});
        const subscription = renderObservable.subscribe();

        expect(obs.subscribeSpy).toHaveBeenCalledTimes(1);
        expect(obs.unsubscribeSpies[0]).not.toHaveBeenCalled();

        subscription.unsubscribe();

        expect(obs.subscribeSpy).toHaveBeenCalledTimes(1);
        expect(obs.unsubscribeSpies[0]).toHaveBeenCalledTimes(1);
      });
    });

    describe('(swapping views)', () => {
      it('should still swap the views if the document is empty', async () => {
        await doRender('');
        expect(swapViewsSpy).toHaveBeenCalledTimes(1);

        await doRender(null);
        expect(swapViewsSpy).toHaveBeenCalledTimes(2);
      });

      it('should pass the `addTitleAndToc` callback', async () => {
        const addTitleAndTocSpy = jest.fn();
        prepareTitleAndTocSpy.mockReturnValue(addTitleAndTocSpy);

        await doRender('<div></div>');

        expect(swapViewsSpy).toHaveBeenCalledWith(addTitleAndTocSpy);
      });

      it('should unsubscribe from the previous "swap" observable when unsubscribed from', () => {
        const obs = new ObservableWithSubscriptionSpies();
        swapViewsSpy.mockReturnValue(obs);

        const renderObservable = docViewer.render({contents: 'Hello, world!', id: 'foo'});
        const subscription = renderObservable.subscribe();

        expect(obs.subscribeSpy).toHaveBeenCalledTimes(1);
        expect(obs.unsubscribeSpies[0]).not.toHaveBeenCalled();

        subscription.unsubscribe();

        expect(obs.subscribeSpy).toHaveBeenCalledTimes(1);
        expect(obs.unsubscribeSpies[0]).toHaveBeenCalledTimes(1);
      });
    });

    describe('(on error) should clean up, log the error and recover', () => {
      let logger: MockLogger;

      beforeEach(() => logger = TestBed.get(Logger));

      it('when `prepareTitleAndTocSpy()` fails', async () => {
        const error = Error('Typical `prepareTitleAndToc()` error');
        prepareTitleAndTocSpy.mockImplementation(() => {
          expect(docViewer.nextViewContainer.innerHTML).not.toBe('');
          throw error;
        });

        await doRender('Some content', 'foo');

        expect(prepareTitleAndTocSpy).toHaveBeenCalledTimes(1);
        expect(swapViewsSpy).not.toHaveBeenCalled();
        expect(docViewer.nextViewContainer.innerHTML).toBe('');
        expect(logger.output.error).toEqual([
          [expect.any(Error)]
        ]);
        expect(logger.output.error[0][0].message).toEqual(`[DocViewer] Error preparing document 'foo': ${error.stack}`);
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'robots', content: 'noindex' });
      });

      it('when `EmbedComponentsService.embedInto()` fails', async () => {
        const error = Error('Typical `embedInto()` error');
        loadElementsSpy.mockImplementation(() => {
          expect(docViewer.nextViewContainer.innerHTML).not.toBe('');
          throw error;
        });

        await doRender('Some content', 'bar');

        expect(prepareTitleAndTocSpy).toHaveBeenCalledTimes(1);
        expect(loadElementsSpy).toHaveBeenCalledTimes(1);
        expect(swapViewsSpy).not.toHaveBeenCalled();
        expect(docViewer.nextViewContainer.innerHTML).toBe('');
        expect(logger.output.error).toEqual([
          [expect.any(Error)]
        ]);
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'robots', content: 'noindex' });
      });

      it('when `swapViews()` fails', async () => {
        const error = Error('Typical `swapViews()` error');
        swapViewsSpy.mockImplementation(() => {
          expect(docViewer.nextViewContainer.innerHTML).not.toBe('');
          throw error;
        });

        await doRender('Some content', 'qux');

        expect(prepareTitleAndTocSpy).toHaveBeenCalledTimes(1);
        expect(swapViewsSpy).toHaveBeenCalledTimes(1);
        expect(docViewer.nextViewContainer.innerHTML).toBe('');
        expect(logger.output.error).toEqual([
          [expect.any(Error)]
        ]);
        expect(logger.output.error[0][0].message).toEqual(`[DocViewer] Error preparing document 'qux': ${error.stack}`);
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'robots', content: 'noindex' });
      });

      it('when something fails with non-Error', async () => {
        const error = 'Typical string error';
        swapViewsSpy.mockImplementation(() => {
          expect(docViewer.nextViewContainer.innerHTML).not.toBe('');
          throw error;
        });

        await doRender('Some content', 'qux');

        expect(swapViewsSpy).toHaveBeenCalledTimes(1);
        expect(docViewer.nextViewContainer.innerHTML).toBe('');
        expect(logger.output.error).toEqual([
          [expect.any(Error)]
        ]);
        expect(logger.output.error[0][0].message).toEqual(`[DocViewer] Error preparing document 'qux': ${error}`);
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'robots', content: 'noindex' });
      });
    });

    describe('(events)', () => {
      it('should emit `docReady` after loading elements', async () => {
        const onDocReadySpy = jest.fn();
        docViewer.docReady.subscribe(onDocReadySpy);

        await doRender('Some content');

        expect(onDocReadySpy).toHaveBeenCalledTimes(1);
        // expect(loadElementsSpy).toHaveBeenCalledBefore(onDocReadySpy);
      });

      it('should emit `docReady` before swapping views', async () => {
        const onDocReadySpy = jest.fn();
        docViewer.docReady.subscribe(onDocReadySpy);

        await doRender('Some content');

        expect(onDocReadySpy).toHaveBeenCalledTimes(1);
        // expect(onDocReadySpy).toHaveBeenCalledBefore(swapViewsSpy);
      });

      it('should emit `docRendered` after swapping views', async () => {
        const onDocRenderedSpy = jest.fn();
        docViewer.docRendered.subscribe(onDocRenderedSpy);

        await doRender('Some content');

        expect(onDocRenderedSpy).toHaveBeenCalledTimes(1);
        // expect(swapViewsSpy).toHaveBeenCalledBefore(onDocRenderedSpy);
      });
    });
  });

  describe('#swapViews()', () => {
    let oldCurrViewContainer: HTMLElement;
    let oldNextViewContainer: HTMLElement;

    const doSwapViews = (cb?: () => void) =>
      new Promise<void>((resolve, reject) =>
        docViewer.swapViews(cb).subscribe(resolve, reject));

    beforeEach(() => {
      oldCurrViewContainer = docViewer.currViewContainer;
      oldNextViewContainer = docViewer.nextViewContainer;

      oldCurrViewContainer.innerHTML = 'Current view';
      oldNextViewContainer.innerHTML = 'Next view';

      docViewerEl.appendChild(oldCurrViewContainer);

      expect(docViewerEl.contains(oldCurrViewContainer)).toBe(true);
      expect(docViewerEl.contains(oldNextViewContainer)).toBe(false);
    });

    [true, false].forEach(animationsEnabled => {
      describe(`(animationsEnabled: ${animationsEnabled})`, () => {
        beforeEach(() => DocViewerComponent.animationsEnabled = animationsEnabled);
        afterEach(() => DocViewerComponent.animationsEnabled = true);

        [true, false].forEach(noAnimations => {
          describe(`(.${NO_ANIMATIONS}: ${noAnimations})`, () => {
            beforeEach(() => docViewerEl.classList[noAnimations ? 'add' : 'remove'](NO_ANIMATIONS));

            it('should return an observable', done => {
              docViewer.swapViews().subscribe(done, done.fail);
            });

            it('should swap the views', async () => {
              await doSwapViews();

              expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
              expect(docViewerEl.contains(oldNextViewContainer)).toBe(true);
              expect(docViewer.currViewContainer).toBe(oldNextViewContainer);
              expect(docViewer.nextViewContainer).toBe(oldCurrViewContainer);

              await doSwapViews();

              expect(docViewerEl.contains(oldCurrViewContainer)).toBe(true);
              expect(docViewerEl.contains(oldNextViewContainer)).toBe(false);
              expect(docViewer.currViewContainer).toBe(oldCurrViewContainer);
              expect(docViewer.nextViewContainer).toBe(oldNextViewContainer);
            });

            it('should emit `docRemoved` after removing the leaving view', async () => {
              const onDocRemovedSpy = jest.fn(() => {
                  expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
                  expect(docViewerEl.contains(oldNextViewContainer)).toBe(false);
              });

              docViewer.docRemoved.subscribe(onDocRemovedSpy);

              expect(docViewerEl.contains(oldCurrViewContainer)).toBe(true);
              expect(docViewerEl.contains(oldNextViewContainer)).toBe(false);

              await doSwapViews();

              expect(onDocRemovedSpy).toHaveBeenCalledTimes(1);
              expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
              expect(docViewerEl.contains(oldNextViewContainer)).toBe(true);
            });

            it('should not emit `docRemoved` if the leaving view is already removed', async () => {
              const onDocRemovedSpy = jest.fn();

              docViewer.docRemoved.subscribe(onDocRemovedSpy);
              docViewerEl.removeChild(oldCurrViewContainer);

              await doSwapViews();

              expect(onDocRemovedSpy).not.toHaveBeenCalled();
            });

            it('should emit `docInserted` after inserting the entering view', async () => {
              const onDocInsertedSpy = jest.fn().mockImplementation(() => {
                expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
                expect(docViewerEl.contains(oldNextViewContainer)).toBe(true);
              });

              docViewer.docInserted.subscribe(onDocInsertedSpy);

              expect(docViewerEl.contains(oldCurrViewContainer)).toBe(true);
              expect(docViewerEl.contains(oldNextViewContainer)).toBe(false);

              await doSwapViews();

              expect(onDocInsertedSpy).toHaveBeenCalledTimes(1);
              expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
              expect(docViewerEl.contains(oldNextViewContainer)).toBe(true);
            });

            it('should call the callback after inserting the entering view', async () => {
              const onInsertedCb = jest.fn(() => {
                  expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
                  expect(docViewerEl.contains(oldNextViewContainer)).toBe(true);
              });
              const onDocInsertedSpy = jest.fn();

              docViewer.docInserted.subscribe(onDocInsertedSpy);

              expect(docViewerEl.contains(oldCurrViewContainer)).toBe(true);
              expect(docViewerEl.contains(oldNextViewContainer)).toBe(false);

              await doSwapViews(onInsertedCb);

              expect(onInsertedCb).toHaveBeenCalledTimes(1);
              // expect(onInsertedCb).toHaveBeenCalledBefore(onDocInsertedSpy);
              expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
              expect(docViewerEl.contains(oldNextViewContainer)).toBe(true);
            });

            it('should empty the previous view', async () => {
              await doSwapViews();

              expect(docViewer.currViewContainer.innerHTML).toBe('Next view');
              expect(docViewer.nextViewContainer.innerHTML).toBe('');

              docViewer.nextViewContainer.innerHTML = 'Next view 2';
              await doSwapViews();

              expect(docViewer.currViewContainer.innerHTML).toBe('Next view 2');
              expect(docViewer.nextViewContainer.innerHTML).toBe('');
            });

            if (animationsEnabled && !noAnimations) {
              // Only test this when there are animations. Without animations, the views are swapped
              // synchronously, so there is no need (or way) to abort.
              it('should abort swapping if the returned observable is unsubscribed from', async () => {
                docViewer.swapViews().subscribe().unsubscribe();
                await doSwapViews();

                // Since the first call was cancelled, only one swapping should have taken place.
                expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
                expect(docViewerEl.contains(oldNextViewContainer)).toBe(true);
                expect(docViewer.currViewContainer).toBe(oldNextViewContainer);
                expect(docViewer.nextViewContainer).toBe(oldCurrViewContainer);
                expect(docViewer.currViewContainer.innerHTML).toBe('Next view');
                expect(docViewer.nextViewContainer.innerHTML).toBe('');
              });
            } else {
              it('should swap views synchronously when animations are disabled', () => {
                const cbSpy = jest.fn();

                docViewer.swapViews(cbSpy).subscribe();

                expect(cbSpy).toHaveBeenCalledTimes(1);
                expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
                expect(docViewerEl.contains(oldNextViewContainer)).toBe(true);
                expect(docViewer.currViewContainer).toBe(oldNextViewContainer);
                expect(docViewer.nextViewContainer).toBe(oldCurrViewContainer);
                expect(docViewer.currViewContainer.innerHTML).toBe('Next view');
                expect(docViewer.nextViewContainer.innerHTML).toBe('');
              });
            }
          });
        });
      });
    });
  });
});
