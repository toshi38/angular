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

        it("should create", () => {
            expect(component).toBeDefined();
        });

        describe("hasFloatingToc", () => {
            it("should initially be false", () => {
                const fixture2 = TestBed.createComponent(AppComponent);
                const component2 = fixture2.componentInstance;

                expect(component2.hasFloatingToc).toBe(false);
            });

            it("should be false on narrow screens", () => {
                component.onResize(hideToCBreakPoint - 1);

                tocService.tocList.next([{}, {}, {}] as TocItem[]);
                expect(component.hasFloatingToc).toBe(false);

                tocService.tocList.next([]);
                expect(component.hasFloatingToc).toBe(false);

                tocService.tocList.next([{}, {}, {}] as TocItem[]);
                expect(component.hasFloatingToc).toBe(false);
            });

            it("should be true on wide screens unless the toc is empty", () => {
                component.onResize(hideToCBreakPoint + 1);

                tocService.tocList.next([{}, {}, {}] as TocItem[]);
                expect(component.hasFloatingToc).toBe(true);

                tocService.tocList.next([]);
                expect(component.hasFloatingToc).toBe(false);

                tocService.tocList.next([{}, {}, {}] as TocItem[]);
                expect(component.hasFloatingToc).toBe(true);
            });

            it("should be false when toc is empty", () => {
                tocService.tocList.next([]);

                component.onResize(hideToCBreakPoint + 1);
                expect(component.hasFloatingToc).toBe(false);

                component.onResize(hideToCBreakPoint - 1);
                expect(component.hasFloatingToc).toBe(false);

                component.onResize(hideToCBreakPoint + 1);
                expect(component.hasFloatingToc).toBe(false);
            });

            it("should be true when toc is not empty unless the screen is narrow", () => {
                tocService.tocList.next([{}, {}, {}] as TocItem[]);

                component.onResize(hideToCBreakPoint + 1);
                expect(component.hasFloatingToc).toBe(true);

                component.onResize(hideToCBreakPoint - 1);
                expect(component.hasFloatingToc).toBe(false);

                component.onResize(hideToCBreakPoint + 1);
                expect(component.hasFloatingToc).toBe(true);
            });
        });

        describe("isSideBySide", () => {
            it("should be updated on resize", () => {
                component.onResize(sideBySideBreakPoint - 1);
                expect(component.isSideBySide).toBe(false);

                component.onResize(sideBySideBreakPoint + 1);
                expect(component.isSideBySide).toBe(true);
            });
        });

        describe("onScroll", () => {
            it("should update `tocMaxHeight` accordingly", () => {
                component.tocMaxHeight = "";
                component.onScroll();

                //expect(component.tocMaxHeight).toMatch(/^\d+\.\d{2}$/);
            });
        });

        describe("SideNav", () => {
            const navigateTo = (path: string) => {
                locationService.go(path);
                component.updateSideNav();
                fixture.detectChanges();
            };
            const resizeTo = (width: number) => {
                component.onResize(width);
                fixture.detectChanges();
            };
            const toggleSidenav = () => {
                hamburger.click();
                fixture.detectChanges();
            };

            describe("when side-by-side (wide)", () => {
                beforeEach(() => resizeTo(sideBySideBreakPoint + 1)); // side-by-side

                it("should open when navigating to a guide page (guide/pipes)", () => {
                    navigateTo("guide/pipes");
                    expect(sidenav.opened).toBe(true);
                });

                it("should open when navigating to an api page", () => {
                    navigateTo("api/a/b/c/d");
                    expect(sidenav.opened).toBe(true);
                });

                it("should be closed when navigating to a marketing page (features)", () => {
                    navigateTo("features");
                    expect(sidenav.opened).toBe(false);
                });

                describe("when manually closed", () => {
                    beforeEach(() => {
                        navigateTo("guide/pipes");
                        toggleSidenav();
                    });

                    it("should be closed", () => {
                        expect(sidenav.opened).toBe(false);
                    });

                    it("should stay closed when navigating from one guide page to another", () => {
                        navigateTo("guide/bags");
                        expect(sidenav.opened).toBe(false);
                    });

                    it("should stay closed when navigating from a guide page to api page", () => {
                        navigateTo("api");
                        expect(sidenav.opened).toBe(false);
                    });

                    it("should reopen when navigating to market page and back to guide page", () => {
                        navigateTo("features");
                        navigateTo("guide/bags");
                        expect(sidenav.opened).toBe(true);
                    });
                });
            });

            describe("when NOT side-by-side (narrow)", () => {
                beforeEach(() => resizeTo(sideBySideBreakPoint - 1)); // NOT side-by-side

                it("should be closed when navigating to a guide page (guide/pipes)", () => {
                    navigateTo("guide/pipes");
                    expect(sidenav.opened).toBe(false);
                });

                it("should be closed when navigating to an api page", () => {
                    navigateTo("api/a/b/c/d");
                    expect(sidenav.opened).toBe(false);
                });

                it("should be closed when navigating to a marketing page (features)", () => {
                    navigateTo("features");
                    expect(sidenav.opened).toBe(false);
                });

                describe("when manually opened", () => {
                    beforeEach(() => {
                        navigateTo("guide/pipes");
                        toggleSidenav();
                    });

                    it("should be open", () => {
                        expect(sidenav.opened).toBe(true);
                    });

                    it("should close when clicking in gray content area overlay", () => {
                        const sidenavBackdrop = fixture.debugElement.query(
                            By.css(".mat-drawer-backdrop")
                        ).nativeElement;
                        sidenavBackdrop.click();
                        fixture.detectChanges();
                        expect(sidenav.opened).toBe(false);
                    });

                    it("should close when navigating to another guide page", () => {
                        navigateTo("guide/bags");
                        expect(sidenav.opened).toBe(false);
                    });

                    it("should close when navigating to api page", () => {
                        navigateTo("api");
                        expect(sidenav.opened).toBe(false);
                    });

                    it("should close again when navigating to market page", () => {
                        navigateTo("features");
                        expect(sidenav.opened).toBe(false);
                    });
                });
            });

            describe("when changing side-by-side (narrow --> wide)", () => {
                const sidenavDocs = ["api/a/b/c/d", "guide/pipes"];
                const nonSidenavDocs = ["features", "about"];

                sidenavDocs.forEach(doc => {
                    it(`should open when on a sidenav doc (${doc})`, () => {
                        resizeTo(sideBySideBreakPoint - 1);

                        navigateTo(doc);
                        expect(sidenav.opened).toBe(false);

                        resizeTo(sideBySideBreakPoint + 1);
                        expect(sidenav.opened).toBe(true);
                    });
                });

                nonSidenavDocs.forEach(doc => {
                    it(`should remain closed when on a non-sidenav doc (${doc})`, () => {
                        resizeTo(sideBySideBreakPoint - 1);

                        navigateTo(doc);
                        expect(sidenav.opened).toBe(false);

                        resizeTo(sideBySideBreakPoint + 1);
                        expect(sidenav.opened).toBe(false);
                    });
                });

                describe("when manually opened", () => {
                    sidenavDocs.forEach(doc => {
                        it(`should remain opened when on a sidenav doc (${doc})`, () => {
                            resizeTo(sideBySideBreakPoint - 1);

                            navigateTo(doc);
                            toggleSidenav();
                            expect(sidenav.opened).toBe(true);

                            resizeTo(sideBySideBreakPoint + 1);
                            expect(sidenav.opened).toBe(true);
                        });
                    });

                    nonSidenavDocs.forEach(doc => {
                        it(`should close when on a non-sidenav doc (${doc})`, () => {
                            resizeTo(sideBySideBreakPoint - 1);

                            navigateTo(doc);
                            toggleSidenav();
                            expect(sidenav.opened).toBe(true);

                            resizeTo(sideBySideBreakPoint + 1);
                            expect(sidenav.opened).toBe(false);
                        });
                    });
                });
            });

            describe("when changing side-by-side (wide --> narrow)", () => {
                const sidenavDocs = ["api/a/b/c/d", "guide/pipes"];
                const nonSidenavDocs = ["features", "about"];

                sidenavDocs.forEach(doc => {
                    it(`should close when on a sidenav doc (${doc})`, () => {
                        navigateTo(doc);
                        expect(sidenav.opened).toBe(true);

                        resizeTo(sideBySideBreakPoint - 1);
                        expect(sidenav.opened).toBe(false);
                    });
                });

                nonSidenavDocs.forEach(doc => {
                    it(`should remain closed when on a non-sidenav doc (${doc})`, () => {
                        navigateTo(doc);
                        expect(sidenav.opened).toBe(false);

                        resizeTo(sideBySideBreakPoint - 1);
                        expect(sidenav.opened).toBe(false);
                    });
                });
            });
        });

        describe("SideNav version selector", () => {
            let selectElement: DebugElement;
            let selectComponent: SelectComponent;

            async function setupSelectorForTesting(mode?: string) {
                createTestingModule("a/b", mode);
                await initializeTest();
                component.onResize(sideBySideBreakPoint + 1); // side-by-side
                selectElement = fixture.debugElement.query(
                    By.directive(SelectComponent)
                );
                selectComponent = selectElement.componentInstance;
            }

            it("should select the version that matches the deploy mode", async () => {
                await setupSelectorForTesting();
                expect(selectComponent.selected.title).toContain("stable");
                await setupSelectorForTesting("next");
                expect(selectComponent.selected.title).toContain("next");
                await setupSelectorForTesting("archive");
                expect(selectComponent.selected.title).toContain("v4");
            });

            it("should add the current raw version string to the selected version", async () => {
                await setupSelectorForTesting();
                expect(selectComponent.selected.title).toContain(
                    `(v${component.versionInfo.raw})`
                );
                await setupSelectorForTesting("next");
                expect(selectComponent.selected.title).toContain(
                    `(v${component.versionInfo.raw})`
                );
                await setupSelectorForTesting("archive");
                expect(selectComponent.selected.title).toContain(
                    `(v${component.versionInfo.raw})`
                );
            });

            // Older docs versions have an href
            it("should navigate when change to a version with a url", async () => {
                await setupSelectorForTesting();
                const versionWithUrlIndex = component.docVersions.findIndex(
                    v => !!v.url
                );
                const versionWithUrl = component.docVersions[versionWithUrlIndex];
                selectElement.triggerEventHandler("change", {
                    option: versionWithUrl,
                    index: versionWithUrlIndex
                });
                expect(locationService.go).toHaveBeenCalledWith(versionWithUrl.url);
            });

            it("should not navigate when change to a version without a url", async () => {
                await setupSelectorForTesting();
                const versionWithoutUrlIndex = component.docVersions.length;
                const versionWithoutUrl = (component.docVersions[
                    versionWithoutUrlIndex
                    ] = { title: "foo" });
                selectElement.triggerEventHandler("change", {
                    option: versionWithoutUrl,
                    index: versionWithoutUrlIndex
                });
                expect(locationService.go).not.toHaveBeenCalled();
            });
        });

        describe("currentDocument", () => {
            const navigateTo = async (path: string) => {
                locationService.go(path);
                await awaitDocRendered();
            };

            it("should display a guide page (guide/pipes)", async () => {
                await navigateTo("guide/pipes");
                expect(docViewer.textContent).toMatch(/Pipes/i);
            });

            it("should display the api page", async () => {
                await navigateTo("api");
                expect(docViewer.textContent).toMatch(/API/i);
            });

            it("should display a marketing page", async () => {
                await navigateTo("features");
                expect(docViewer.textContent).toMatch(/Features/i);
            });

            it("should update the document title", async () => {
                const titleService = TestBed.get(Title);
                jest.spyOn(titleService, "setTitle").mockImplementation(jest.fn);

                await navigateTo("guide/pipes");
                expect(titleService.setTitle).toHaveBeenCalledWith("Angular - Pipes");
            });

            it("should update the document title, with a default value if the document has no title", async () => {
                const titleService = TestBed.get(Title);
                jest.spyOn(titleService, "setTitle").mockImplementation(jest.fn);

                await navigateTo("no-title");
                expect(titleService.setTitle).toHaveBeenCalledWith("Angular");
            });
        });

        describe("auto-scrolling", () => {
            const scrollDelay = 500;
            let scrollService: ScrollService;
            let scrollSpy: jest.SpyInstance;
            let scrollToTopSpy: jest.SpyInstance;

            beforeEach(() => {
                scrollService = fixture.debugElement.injector.get<ScrollService>(
                    ScrollService
                );
                scrollSpy = jest
                    .spyOn(scrollService, "scroll")
                    .mockImplementation(jest.fn);
                scrollToTopSpy = jest
                    .spyOn(scrollService, "scrollToTop")
                    .mockImplementation(jest.fn);
            });

            it("should not scroll immediately when the docId (path) changes", () => {
                locationService.go("guide/pipes");
                // deliberately not calling `fixture.detectChanges` because don't want `onDocInserted`
                expect(scrollSpy).not.toHaveBeenCalled();
                expect(scrollToTopSpy).not.toHaveBeenCalled();
            });

            it("should scroll when just the hash changes (# alone)", () => {
                locationService.go("guide/pipes");
                locationService.go("guide/pipes#somewhere");
                expect(scrollSpy).toHaveBeenCalled();
            });

            it("should scroll when just the hash changes (/#)", () => {
                locationService.go("guide/pipes");
                locationService.go("guide/pipes/#somewhere");
                expect(scrollSpy).toHaveBeenCalled();
            });

            it("should scroll again when navigating to the same hash twice in succession", () => {
                locationService.go("guide/pipes");
                locationService.go("guide/pipes#somewhere");
                locationService.go("guide/pipes#somewhere");
                expect(scrollSpy.mock.calls.length).toBe(2);
            });

            it("should scroll when navigating to the same path", () => {
                locationService.go("guide/pipes");
                scrollSpy.mockClear();

                locationService.go("guide/pipes");
                expect(scrollSpy).toHaveBeenCalledTimes(1);
            });

            it("should scroll when re-nav to the empty path", () => {
                locationService.go("");
                scrollSpy.mockClear();

                locationService.go("");
                expect(scrollSpy).toHaveBeenCalledTimes(1);
            });

            it("should scroll to top when call `onDocRemoved` directly", () => {
                scrollToTopSpy.mockClear();

                component.onDocRemoved();
                expect(scrollToTopSpy).toHaveBeenCalled();
            });

            it("should scroll after a delay when call `onDocInserted` directly", fakeAsync(() => {
                component.onDocInserted();
                expect(scrollSpy).not.toHaveBeenCalled();

                tick(scrollDelay);
                expect(scrollSpy).toHaveBeenCalled();
            }));

            it("should scroll (via `onDocInserted`) when finish navigating to a new doc", fakeAsync(() => {
                expect(scrollToTopSpy).not.toHaveBeenCalled();

                locationService.go("guide/pipes");
                tick(1); // triggers the HTTP response for the document
                fixture.detectChanges(); // triggers the event that calls `onDocInserted`

                expect(scrollToTopSpy).toHaveBeenCalled();
                expect(scrollSpy).not.toHaveBeenCalled();

                tick(scrollDelay);
                expect(scrollSpy).toHaveBeenCalled();
            }));
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
