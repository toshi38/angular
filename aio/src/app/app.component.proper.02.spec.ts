import { NO_ERRORS_SCHEMA, DebugElement } from "@angular/core";
import {
    inject,
    ComponentFixture,
    TestBed,
    fakeAsync,
    tick
} from "@angular/core/testing";
import { Title } from "@angular/platform-browser";
import { APP_BASE_HREF } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { MatProgressBar } from "@angular/material";
import { MatSidenav } from "@angular/material/sidenav";
import { By } from "@angular/platform-browser";

import { of, timer } from "rxjs";
import { first, mapTo } from "rxjs/operators";

import { AppComponent } from "./app.component";
import { AppModule } from "./app.module";
import { DocumentService } from "app/documents/document.service";
import { DocViewerComponent } from "app/layout/doc-viewer/doc-viewer.component";
import { Deployment } from "app/shared/deployment.service";
import { ElementsLoader } from "app/custom-elements/elements-loader";
import { GaService } from "app/shared/ga.service";
import { LocationService } from "app/shared/location.service";
import { Logger } from "app/shared/logger.service";
import { MockLocationService } from "testing/location.service";
import { MockLogger } from "testing/logger.service";
import { MockSearchService } from "testing/search.service";
import { NavigationNode } from "app/navigation/navigation.service";
import { ScrollService } from "app/shared/scroll.service";
import { SearchBoxComponent } from "app/search/search-box/search-box.component";
import { SearchResultsComponent } from "app/shared/search-results/search-results.component";
import { SearchService } from "app/search/search.service";
import { SelectComponent } from "app/shared/select/select.component";
import { TocItem, TocService } from "app/shared/toc.service";

const sideBySideBreakPoint = 992;
const hideToCBreakPoint = 800;
const startedDelay = 100;

describe("AppComponent", () => {
    let component: AppComponent;
    let fixture: ComponentFixture<AppComponent>;

    let documentService: DocumentService;
    let docViewer: HTMLElement;
    let docViewerComponent: DocViewerComponent;
    let hamburger: HTMLButtonElement;
    let locationService: MockLocationService;
    let sidenav: MatSidenav;
    let tocService: TocService;

    async function awaitDocRendered() {
        const newDocPromise = new Promise(resolve =>
            documentService.currentDocument.subscribe(resolve)
        );
        const docRenderedPromise = new Promise(resolve =>
            docViewerComponent.docRendered.subscribe(resolve)
        );

        await newDocPromise; // Wait for the new document to be fetched.
        fixture.detectChanges(); // Propagate document change to the view (i.e to `DocViewer`).
        await docRenderedPromise; // Wait for the `docRendered` event.
    }

    function initializeTest(waitForDoc = true) {
        fixture = TestBed.createComponent(AppComponent);
        component = fixture.componentInstance;

        fixture.detectChanges();
        component.onResize(sideBySideBreakPoint + 1); // wide by default

        const de = fixture.debugElement;
        const docViewerDe = de.query(By.css("aio-doc-viewer"));

        documentService = de.injector.get<DocumentService>(DocumentService);
        docViewer = docViewerDe.nativeElement;
        docViewerComponent = docViewerDe.componentInstance;
        hamburger = de.query(By.css(".hamburger")).nativeElement;
        locationService = de.injector.get<any>(LocationService);
        sidenav = de.query(By.directive(MatSidenav)).componentInstance;
        tocService = de.injector.get<TocService>(TocService);

        return waitForDoc && awaitDocRendered();
    }

    describe("with proper DocViewer", () => {
        beforeEach(async () => {
            DocViewerComponent.animationsEnabled = false;

            createTestingModule("a/b");
            await initializeTest();
        });

        afterEach(() => (DocViewerComponent.animationsEnabled = true));

        describe("click intercepting", () => {
            it("should intercept clicks on anchors and call `location.handleAnchorClick()`", inject(
                [LocationService],
                (location: LocationService) => {
                    const el = fixture.nativeElement as Element;
                    el.innerHTML = '<a href="some/local/url">click me</a>';
                    const anchorElement = el.getElementsByTagName("a")[0];
                    anchorElement.click();
                    expect(location.handleAnchorClick).toHaveBeenCalledWith(
                        anchorElement,
                        0,
                        false,
                        false
                    );
                }
            ));

            it("should intercept clicks on elements deep within an anchor tag", inject(
                [LocationService],
                (location: LocationService) => {
                    const el = fixture.nativeElement as Element;
                    el.innerHTML = '<a href="some/local/url"><div><img></div></a>';
                    const imageElement = el.getElementsByTagName("img")[0];
                    const anchorElement = el.getElementsByTagName("a")[0];
                    imageElement.click();
                    expect(location.handleAnchorClick).toHaveBeenCalledWith(
                        anchorElement,
                        0,
                        false,
                        false
                    );
                }
            ));

            it("should ignore clicks on elements without an anchor ancestor", inject(
                [LocationService],
                (location: LocationService) => {
                    const el = fixture.nativeElement as Element;
                    el.innerHTML = "<div><p><div><img></div></p></div>";
                    const imageElement = el.getElementsByTagName("img")[0];
                    imageElement.click();
                    expect(location.handleAnchorClick).not.toHaveBeenCalled();
                }
            ));
        });

        describe("restrainScrolling()", () => {
            const preventedScrolling = (currentTarget: object, deltaY: number) => {
                const evt = ({
                    deltaY,
                    currentTarget,
                    defaultPrevented: false,
                    preventDefault() {
                        this.defaultPrevented = true;
                    }
                } as any) as WheelEvent;

                component.restrainScrolling(evt);

                return evt.defaultPrevented;
            };

            it("should prevent scrolling up if already at the top", () => {
                const elem = { scrollTop: 0 };

                expect(preventedScrolling(elem, -100)).toBe(true);
                expect(preventedScrolling(elem, +100)).toBe(false);
                expect(preventedScrolling(elem, -10)).toBe(true);
            });

            it("should prevent scrolling down if already at the bottom", () => {
                const elem = { scrollTop: 100, scrollHeight: 150, clientHeight: 50 };

                expect(preventedScrolling(elem, +10)).toBe(true);
                expect(preventedScrolling(elem, -10)).toBe(false);
                expect(preventedScrolling(elem, +5)).toBe(true);

                elem.clientHeight -= 10;
                expect(preventedScrolling(elem, +5)).toBe(false);

                elem.scrollHeight -= 20;
                expect(preventedScrolling(elem, +5)).toBe(true);

                elem.scrollTop -= 30;
                expect(preventedScrolling(elem, +5)).toBe(false);
            });

            it("should not prevent scrolling if neither at the top nor at the bottom", () => {
                const elem = { scrollTop: 50, scrollHeight: 150, clientHeight: 50 };

                expect(preventedScrolling(elem, +100)).toBe(false);
                expect(preventedScrolling(elem, -100)).toBe(false);
            });
        });

        describe("aio-toc", () => {
            let tocContainer: HTMLElement | null;
            let toc: HTMLElement | null;

            const setHasFloatingToc = (hasFloatingToc: boolean) => {
                component.hasFloatingToc = hasFloatingToc;
                fixture.detectChanges();

                tocContainer = fixture.debugElement.nativeElement.querySelector(
                    ".toc-container"
                );
                toc = tocContainer && tocContainer.querySelector("aio-toc");
            };

            it("should show/hide `<aio-toc>` based on `hasFloatingToc`", () => {
                expect(tocContainer).toBeFalsy();
                expect(toc).toBeFalsy();

                setHasFloatingToc(true);
                expect(tocContainer).toBeTruthy();
                expect(toc).toBeTruthy();

                setHasFloatingToc(false);
                expect(tocContainer).toBeFalsy();
                expect(toc).toBeFalsy();
            });

            it("should have a non-embedded `<aio-toc>` element", () => {
                setHasFloatingToc(true);
                expect(toc!.classList.contains("embedded")).toBe(false);
            });

            it("should update the TOC container's `maxHeight` based on `tocMaxHeight`", () => {
                setHasFloatingToc(true);

                component.tocMaxHeight = "100";
                fixture.detectChanges();
                expect(tocContainer!.style["max-height"]).toBe("100px");

                component.tocMaxHeight = "200";
                fixture.detectChanges();
                expect(tocContainer!.style["max-height"]).toBe("200px");
            });

            it("should restrain scrolling inside the ToC container", () => {
                const restrainScrolling = jest.spyOn(component, "restrainScrolling").mockImplementation(jest.fn);
                const evt = new MouseEvent("mousewheel");

                setHasFloatingToc(true);
                expect(restrainScrolling).not.toHaveBeenCalled();

                tocContainer!.dispatchEvent(evt);
                expect(restrainScrolling).toHaveBeenCalledWith(evt);
            });

            it("should not be loaded/registered until necessary", () => {
                const loader: TestElementsLoader = fixture.debugElement.injector.get(
                    ElementsLoader
                );
                expect(loader.loadCustomElement).not.toHaveBeenCalled();

                setHasFloatingToc(true);
                expect(loader.loadCustomElement).toHaveBeenCalledWith("aio-toc");
            });
        });

        describe("footer", () => {
            it("should have version number", () => {
                const versionEl: HTMLElement = fixture.debugElement.query(
                    By.css("aio-footer")
                ).nativeElement;
                expect(versionEl.textContent).toContain(
                    TestHttpClient.versionInfo.full
                );
            });
        });

        describe("deployment banner", () => {
            it('should show a message if the deployment mode is "archive"', async () => {
                createTestingModule("a/b", "archive");
                await initializeTest();
                const banner: HTMLElement = fixture.debugElement.query(
                    By.css("aio-mode-banner")
                ).nativeElement;
                expect(banner.textContent).toContain(
                    "archived documentation for Angular v4"
                );
            });

            it('should show no message if the deployment mode is not "archive"', async () => {
                createTestingModule("a/b", "stable");
                await initializeTest();
                const banner: HTMLElement = fixture.debugElement.query(
                    By.css("aio-mode-banner")
                ).nativeElement;
                expect(banner.textContent!.trim()).toEqual("");
            });
        });

        describe("search", () => {
            describe("initialization", () => {
                it("should initialize the search worker", inject(
                    [SearchService],
                    (searchService: SearchService) => {
                        expect(searchService.initWorker).toHaveBeenCalled();
                    }
                ));
            });

            describe("click handling", () => {
                it("should intercept clicks not on the search elements and hide the search results", () => {
                    component.showSearchResults = true;
                    fixture.detectChanges();
                    // docViewer is a commonly-clicked, non-search element
                    docViewer.click();
                    expect(component.showSearchResults).toBe(false);
                });

                it('should clear "only" the search query param from the URL', () => {
                    // Mock out the current state of the URL query params
                    locationService.search.mockReturnValue({
                        a: "some-A",
                        b: "some-B",
                        search: "some-C"
                    });
                    // docViewer is a commonly-clicked, non-search element
                    docViewer.click();
                    // Check that the query params were updated correctly
                    expect(locationService.setSearch).toHaveBeenCalledWith("", {
                        a: "some-A",
                        b: "some-B",
                        search: undefined
                    });
                });

                it("should not intercept clicks on the searchResults", () => {
                    component.showSearchResults = true;
                    fixture.detectChanges();

                    const searchResults = fixture.debugElement.query(
                        By.directive(SearchResultsComponent)
                    );
                    searchResults.nativeElement.click();
                    fixture.detectChanges();

                    expect(component.showSearchResults).toBe(true);
                });

                it("should not intercept clicks om the searchBox", () => {
                    component.showSearchResults = true;
                    fixture.detectChanges();

                    const searchBox = fixture.debugElement.query(
                        By.directive(SearchBoxComponent)
                    );
                    searchBox.nativeElement.click();
                    fixture.detectChanges();

                    expect(component.showSearchResults).toBe(true);
                });
            });

            describe("keyup handling", () => {
                it("should grab focus when the / key is pressed", () => {
                    const searchBox: SearchBoxComponent = fixture.debugElement.query(
                        By.directive(SearchBoxComponent)
                    ).componentInstance;
                    jest.spyOn(searchBox, "focus").mockImplementation(jest.fn);
                    window.document.dispatchEvent(
                        new KeyboardEvent("keyup", { key: "/" })
                    );
                    fixture.detectChanges();
                    expect(searchBox.focus).toHaveBeenCalled();
                });

                it("should set focus back to the search box when the search results are displayed and the escape key is pressed", () => {
                    const searchBox: SearchBoxComponent = fixture.debugElement.query(
                        By.directive(SearchBoxComponent)
                    ).componentInstance;
                    jest.spyOn(searchBox, "focus").mockImplementation(jest.fn);
                    component.showSearchResults = true;
                    window.document.dispatchEvent(
                        new KeyboardEvent("keyup", { key: "Escape" })
                    );
                    fixture.detectChanges();
                    expect(searchBox.focus).toHaveBeenCalled();
                });
            });

            describe("showing search results", () => {
                it("should not display search results when query is empty", () => {
                    const searchService: MockSearchService = TestBed.get(SearchService);
                    searchService.searchResults.next({ query: "", results: [] });
                    fixture.detectChanges();
                    expect(component.showSearchResults).toBe(false);
                });

                it("should hide the results when a search result is selected", () => {
                    const searchService: MockSearchService = TestBed.get(SearchService);

                    const results = [
                        {
                            path: "news",
                            title: "News",
                            type: "marketing",
                            keywords: "",
                            titleWords: "",
                            deprecated: false
                        }
                    ];

                    searchService.searchResults.next({
                        query: "something",
                        results: results
                    });
                    component.showSearchResults = true;
                    fixture.detectChanges();

                    const searchResultsComponent = fixture.debugElement.query(
                        By.directive(SearchResultsComponent)
                    );
                    searchResultsComponent.triggerEventHandler("resultSelected", {});
                    fixture.detectChanges();
                    expect(component.showSearchResults).toBe(false);
                });

                it("should re-run the search when the search box regains focus", () => {
                    const doSearchSpy = jest.spyOn(component, "doSearch").mockImplementation(jest.fn);
                    const searchBox = fixture.debugElement.query(
                        By.directive(SearchBoxComponent)
                    );
                    searchBox.triggerEventHandler("onFocus", "some query");
                    expect(doSearchSpy).toHaveBeenCalledWith("some query");
                });
            });
        });

        describe("archive redirection", () => {
            it("should redirect to `docs` if deployment mode is `archive` and not at a docs page", () => {
                createTestingModule("", "archive");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).toHaveBeenCalledWith(
                    "docs"
                );

                createTestingModule("resources", "archive");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).toHaveBeenCalledWith(
                    "docs"
                );

                createTestingModule("guide/aot-compiler", "archive");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("tutorial", "archive");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("tutorial/toh-pt1", "archive");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("docs", "archive");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("api", "archive");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("api/core/getPlatform", "archive");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();
            });

            it("should not redirect if deployment mode is `next`", () => {
                createTestingModule("", "next");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("resources", "next");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("guide/aot-compiler", "next");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("tutorial", "next");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("tutorial/toh-pt1", "next");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("docs", "next");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("api", "next");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("api/core/getPlatform", "next");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();
            });

            it("should not redirect to `docs` if deployment mode is `stable`", () => {
                createTestingModule("", "stable");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("resources", "stable");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("guide/aot-compiler", "stable");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("tutorial", "stable");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("tutorial/toh-pt1", "stable");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("docs", "stable");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("api", "stable");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();

                createTestingModule("api/core/getPlatform", "stable");
                initializeTest(false);
                expect(TestBed.get(LocationService).replace).not.toHaveBeenCalled();
            });
        });
    });
});

//// test helpers ////

function createTestingModule(initialUrl: string, mode: string = "stable") {
    const mockLocationService = new MockLocationService(initialUrl);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
        imports: [AppModule],
        providers: [
            { provide: APP_BASE_HREF, useValue: "/" },
            { provide: ElementsLoader, useClass: TestElementsLoader },
            { provide: GaService, useClass: TestGaService },
            { provide: HttpClient, useClass: TestHttpClient },
            { provide: LocationService, useFactory: () => mockLocationService },
            { provide: Logger, useClass: MockLogger },
            { provide: SearchService, useClass: MockSearchService },
            {
                provide: Deployment,
                useFactory: () => {
                    const deployment = new Deployment(mockLocationService as any);
                    deployment.mode = mode;
                    return deployment;
                }
            }
        ]
    });
}

class TestElementsLoader {
    loadContainedCustomElements = jest.fn().mockReturnValue(of(undefined));

    loadCustomElement = jest.fn().mockReturnValue(Promise.resolve());
}

class TestGaService {
    locationChanged = jest.fn();
}

class TestHttpClient {
    static versionInfo = {
        raw: "4.0.0-rc.6",
        major: 4,
        minor: 0,
        patch: 0,
        prerelease: ["local"],
        build: "sha.73808dd",
        version: "4.0.0-local",
        codeName: "snapshot",
        isSnapshot: true,
        full: "4.0.0-local+sha.73808dd",
        branch: "master",
        commitSHA: "73808dd38b5ccd729404936834d1568bd066de81"
    };

    static docVersions: NavigationNode[] = [
        { title: "v2", url: "https://v2.angular.io" }
    ];

    // tslint:disable:quotemark
    navJson = {
        TopBar: [
            {
                url: "features",
                title: "Features"
            },
            {
                url: "no-title",
                title: "No Title"
            }
        ],
        SideNav: [
            {
                title: "Core",
                tooltip: "Learn the core capabilities of Angular",
                children: [
                    {
                        url: "guide/pipes",
                        title: "Pipes",
                        tooltip: "Pipes transform displayed values within a template."
                    },
                    {
                        url: "guide/bags",
                        title: "Bags",
                        tooltip: "Pack your bags for a code adventure."
                    }
                ]
            },
            {
                url: "api",
                title: "API",
                tooltip: "Details of the Angular classes and values."
            }
        ],
        docVersions: TestHttpClient.docVersions,

        __versionInfo: TestHttpClient.versionInfo
    };

    get(url: string) {
        let data;
        if (/navigation\.json/.test(url)) {
            data = this.navJson;
        } else {
            const match = /generated\/docs\/(.+)\.json/.exec(url)!;
            const id = match[1]!;
            // Make up a title for test purposes
            const title = id
                .split("/")
                .pop()!
                .replace(/^([a-z])/, (_, letter) => letter.toUpperCase());
            const h1 = id === "no-title" ? "" : `<h1 class="no-toc">${title}</h1>`;
            const contents = `${h1}<h2 id="#somewhere">Some heading</h2>`;
            data = { id, contents };
        }

        // Preserve async nature of `HttpClient`.
        return timer(1).pipe(mapTo(data));
    }
}
