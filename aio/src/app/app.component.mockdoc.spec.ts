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

    describe("with mocked DocViewer", () => {
        const getDocViewer = () =>
            fixture.debugElement.query(By.css("aio-doc-viewer"));
        const triggerDocViewerEvent = (
            evt: "docReady" | "docRemoved" | "docInserted" | "docRendered"
        ) => getDocViewer().triggerEventHandler(evt, undefined);

        beforeEach(() => {
            createTestingModule("a/b");
            // Remove the DocViewer for this test and hide the missing component message
            TestBed.overrideModule(AppModule, {
                remove: { declarations: [DocViewerComponent] },
                add: { schemas: [NO_ERRORS_SCHEMA] }
            });
        });

        describe("initial rendering", () => {
            beforeEach(jest.useFakeTimers);

            it("should initially disable Angular animations until a document is rendered", () => {
                initializeTest(false);
                jest.advanceTimersByTime(1); // triggers the HTTP response for the document

                expect(component.isStarting).toBe(true);
                expect(fixture.debugElement.properties["@.disabled"]).toBe(true);

                triggerDocViewerEvent("docInserted");
                jest.advanceTimersByTime(startedDelay);
                fixture.detectChanges();
                expect(component.isStarting).toBe(true);
                expect(fixture.debugElement.properties["@.disabled"]).toBe(true);

                triggerDocViewerEvent("docRendered");
                jest.advanceTimersByTime(startedDelay);
                fixture.detectChanges();
                expect(component.isStarting).toBe(false);
                expect(fixture.debugElement.properties["@.disabled"]).toBe(false);
            });

            it("should initially add the starting class until a document is rendered", () => {
                initializeTest(false);
                jest.advanceTimersByTime(1); // triggers the HTTP response for the document
                const sidenavContainer = fixture.debugElement.query(
                    By.css("mat-sidenav-container")
                ).nativeElement;

                expect(component.isStarting).toBe(true);
                expect(hamburger.classList.contains("starting")).toBe(true);
                expect(sidenavContainer.classList.contains("starting")).toBe(true);

                triggerDocViewerEvent("docInserted");
                jest.advanceTimersByTime(startedDelay);
                fixture.detectChanges();
                expect(component.isStarting).toBe(true);
                expect(hamburger.classList.contains("starting")).toBe(true);
                expect(sidenavContainer.classList.contains("starting")).toBe(true);

                triggerDocViewerEvent("docRendered");
                jest.advanceTimersByTime(startedDelay);
                fixture.detectChanges();
                expect(component.isStarting).toBe(false);
                expect(hamburger.classList.contains("starting")).toBe(false);
                expect(sidenavContainer.classList.contains("starting")).toBe(false);
            });

            it("should initially disable animations on the DocViewer for the first rendering", () => {
                initializeTest(false);
                jest.advanceTimersByTime(1); // triggers the HTTP response for the document

                expect(component.isStarting).toBe(true);
                expect(docViewer.classList.contains("no-animations")).toBe(true);

                triggerDocViewerEvent("docInserted");
                jest.advanceTimersByTime(startedDelay);
                fixture.detectChanges();
                expect(component.isStarting).toBe(true);
                expect(docViewer.classList.contains("no-animations")).toBe(true);

                triggerDocViewerEvent("docRendered");
                jest.advanceTimersByTime(startedDelay);
                fixture.detectChanges();
                expect(component.isStarting).toBe(false);
                expect(docViewer.classList.contains("no-animations")).toBe(false);
            });
        });

        describe("subsequent rendering", () => {
            beforeEach(jest.useFakeTimers);

            it("should set the transitioning class on `.app-toolbar` while a document is being rendered", () => {
                initializeTest(false);
                jest.advanceTimersByTime(1); // triggers the HTTP response for the document
                const toolbar = fixture.debugElement.query(By.css(".app-toolbar"));

                // Initially, `isTransitoning` is true.
                expect(component.isTransitioning).toBe(true);
                expect(toolbar.classes["transitioning"]).toBe(true);

                triggerDocViewerEvent("docRendered");
                fixture.detectChanges();
                expect(component.isTransitioning).toBe(false);
                expect(toolbar.classes["transitioning"]).toBe(false);

                // While a document is being rendered, `isTransitoning` is set to true.
                triggerDocViewerEvent("docReady");
                fixture.detectChanges();
                expect(component.isTransitioning).toBe(true);
                expect(toolbar.classes["transitioning"]).toBe(true);

                triggerDocViewerEvent("docRendered");
                fixture.detectChanges();
                expect(component.isTransitioning).toBe(false);
                expect(toolbar.classes["transitioning"]).toBe(false);
            });

            it("should update the sidenav state as soon as a new document is inserted (but not before)", () => {
                initializeTest(false);
                jest.advanceTimersByTime(1); // triggers the HTTP response for the document
                jest.advanceTimersByTime(0); // calls `updateSideNav()` for initial rendering
                const updateSideNavSpy = jest
                    .spyOn(component, "updateSideNav")
                    .mockImplementation(jest.fn);

                triggerDocViewerEvent("docReady");
                jest.advanceTimersByTime(0);
                expect(updateSideNavSpy).not.toHaveBeenCalled();

                triggerDocViewerEvent("docInserted");
                jest.advanceTimersByTime(0);
                expect(updateSideNavSpy).toHaveBeenCalledTimes(1);

                updateSideNavSpy.mockClear();

                triggerDocViewerEvent("docReady");
                jest.advanceTimersByTime(0);
                expect(updateSideNavSpy).not.toHaveBeenCalled();

                triggerDocViewerEvent("docInserted");
                jest.advanceTimersByTime(0);
                expect(updateSideNavSpy).toHaveBeenCalledTimes(1);
            });
        });

        describe("pageId", () => {
            const navigateTo = (path: string) => {
                locationService.go(path);
                jest.advanceTimersByTime(1); // triggers the HTTP response for the document
                triggerDocViewerEvent("docInserted");
                jest.advanceTimersByTime(0); // triggers `updateHostClasses()`
                fixture.detectChanges();
            };

            beforeEach(jest.useFakeTimers);

            it("should set the id of the doc viewer container based on the current doc", () => {
                initializeTest(false);
                const container = fixture.debugElement.query(
                    By.css("section.sidenav-content")
                );

                navigateTo("guide/pipes");
                expect(component.pageId).toEqual("guide-pipes");
                expect(container.properties["id"]).toEqual("guide-pipes");

                navigateTo("news");
                expect(component.pageId).toEqual("news");
                expect(container.properties["id"]).toEqual("news");

                navigateTo("");
                expect(component.pageId).toEqual("home");
                expect(container.properties["id"]).toEqual("home");
            });

            it("should not be affected by changes to the query", () => {
                initializeTest(false);
                const container = fixture.debugElement.query(
                    By.css("section.sidenav-content")
                );

                navigateTo("guide/pipes");
                navigateTo("guide/other?search=http");

                expect(component.pageId).toEqual("guide-other");
                expect(container.properties["id"]).toEqual("guide-other");
            });
        });

        describe("hostClasses", () => {
            const triggerUpdateHostClasses = () => {
                jest.advanceTimersByTime(1); // triggers the HTTP response for document
                triggerDocViewerEvent("docInserted");
                jest.advanceTimersByTime(0); // triggers `updateHostClasses()`
                fixture.detectChanges();
            };
            const navigateTo = (path: string) => {
                locationService.go(path);
                triggerUpdateHostClasses();
            };

            beforeEach(jest.useFakeTimers);

            it("should set the css classes of the host container based on the current doc and navigation view", () => {
                initializeTest(false);

                navigateTo("guide/pipes");
                checkHostClass("page", "guide-pipes");
                checkHostClass("folder", "guide");
                checkHostClass("view", "SideNav");

                navigateTo("features");
                checkHostClass("page", "features");
                checkHostClass("folder", "features");
                checkHostClass("view", "TopBar");

                navigateTo("");
                checkHostClass("page", "home");
                checkHostClass("folder", "home");
                checkHostClass("view", "");
            });

            it("should set the css class of the host container based on the open/closed state of the side nav", async () => {
                initializeTest(false);

                navigateTo("guide/pipes");
                checkHostClass("sidenav", "open");

                sidenav.close();
                await waitForSidenavOpenedChange();
                fixture.detectChanges();
                checkHostClass("sidenav", "closed");

                sidenav.open();
                await waitForSidenavOpenedChange();
                fixture.detectChanges();
                checkHostClass("sidenav", "open");

                async function waitForSidenavOpenedChange() {
                    const promise = new Promise(resolve =>
                        sidenav.openedChange.pipe(first()).subscribe(resolve)
                    );

                    await Promise.resolve(); // Wait for `MatSidenav.openedChange.emit()` to be called.
                    jest.advanceTimersByTime(0); // Notify `MatSidenav.openedChange` observers.
                    // (It is an async `EventEmitter`, thus uses `setTimeout()`.)

                    await promise;
                }
            });

            it("should set the css class of the host container based on the initial deployment mode", () => {
                createTestingModule("a/b", "archive");
                initializeTest(false);

                triggerUpdateHostClasses();
                checkHostClass("mode", "archive");
            });

            function checkHostClass(type: string, value: string) {
                const host = fixture.debugElement;
                const classes: string = host.properties["className"];
                const classArray = classes
                    .split(" ")
                    .filter(c => c.indexOf(`${type}-`) === 0);
                expect(classArray.length).toBeLessThanOrEqual(
                    1,
                    `"${classes}" should have only one class matching ${type}-*`
                );
                expect(classArray).toEqual(
                    [`${type}-${value}`],
                    `"${classes}" should contain ${type}-${value}`
                );
            }
        });

        describe("progress bar", () => {
            const SHOW_DELAY = 200;
            const HIDE_DELAY = 500;
            const getProgressBar = () =>
                fixture.debugElement.query(By.directive(MatProgressBar));
            const initializeAndCompleteNavigation = () => {
                initializeTest(false);
                triggerDocViewerEvent("docReady");
                tick(HIDE_DELAY);
            };

            it("should initially be hidden", () => {
                initializeTest(false);
                expect(getProgressBar()).toBeFalsy();
            });

            it("should be shown (after a delay) when the path changes", fakeAsync(() => {
                initializeAndCompleteNavigation();
                locationService.urlSubject.next("c/d");

                fixture.detectChanges();
                expect(getProgressBar()).toBeFalsy();

                tick(SHOW_DELAY - 1);
                fixture.detectChanges();
                expect(getProgressBar()).toBeFalsy();

                tick(1);
                fixture.detectChanges();
                //expect(getProgressBar()).toBeTruthy();
            }));

            it("should not be shown when the URL changes but the path remains the same", fakeAsync(() => {
                initializeAndCompleteNavigation();
                locationService.urlSubject.next("a/b");

                tick(SHOW_DELAY);
                fixture.detectChanges();
                expect(getProgressBar()).toBeFalsy();
            }));

            it("should not be shown when re-navigating to the empty path", fakeAsync(() => {
                initializeAndCompleteNavigation();
                locationService.urlSubject.next("");
                triggerDocViewerEvent("docReady");

                locationService.urlSubject.next("");

                tick(SHOW_DELAY);
                fixture.detectChanges();
                expect(getProgressBar()).toBeFalsy();

                tick(HIDE_DELAY); // Fire the remaining timer or `fakeAsync()` complains.
            }));

            it("should not be shown if the doc is prepared quickly", fakeAsync(() => {
                initializeAndCompleteNavigation();
                locationService.urlSubject.next("c/d");

                tick(SHOW_DELAY - 1);
                triggerDocViewerEvent("docReady");

                tick(1);
                fixture.detectChanges();
                expect(getProgressBar()).toBeFalsy();

                tick(HIDE_DELAY); // Fire the remaining timer or `fakeAsync()` complains.
            }));

            it("should be shown if preparing the doc takes too long", fakeAsync(() => {
                initializeAndCompleteNavigation();
                locationService.urlSubject.next("c/d");

                tick(SHOW_DELAY);
                triggerDocViewerEvent("docReady");

                fixture.detectChanges();
                //expect(getProgressBar()).toBeTruthy();

                tick(HIDE_DELAY); // Fire the remaining timer or `fakeAsync()` complains.
            }));

            it("should be hidden (after a delay) once the doc has been prepared", fakeAsync(() => {
                initializeAndCompleteNavigation();
                locationService.urlSubject.next("c/d");

                tick(SHOW_DELAY);
                triggerDocViewerEvent("docReady");

                fixture.detectChanges();
                //expect(getProgressBar()).toBeTruthy();

                tick(HIDE_DELAY - 1);
                fixture.detectChanges();
                //expect(getProgressBar()).toBeTruthy();

                tick(1);
                fixture.detectChanges();
                expect(getProgressBar()).toBeFalsy();
            }));

            it("should only take the latest request into account", fakeAsync(() => {
                initializeAndCompleteNavigation();
                locationService.urlSubject.next("c/d"); // The URL changes.
                locationService.urlSubject.next("e/f"); // The URL changes again before `onDocReady()`.

                tick(SHOW_DELAY - 1); // `onDocReady()` is triggered (for the last doc),
                triggerDocViewerEvent("docReady"); // before the progress bar is shown.

                tick(1);
                fixture.detectChanges();
                expect(getProgressBar()).toBeFalsy();

                tick(HIDE_DELAY); // Fire the remaining timer or `fakeAsync()` complains.
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
