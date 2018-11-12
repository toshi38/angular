import './assets/js/prettify.js' // will add window.prettyPrintOne

global['CSS'] = null;

const mock = () => {
    let storage = {};
    return {
        getItem: key => key in storage ? storage[key] : null,
        setItem: (key, value) => storage[key] = value || '',
        removeItem: key => delete storage[key],
        clear: () => storage = {},
    };
};

Object.defineProperty(window, 'localStorage', {value: mock()});
Object.defineProperty(window, 'sessionStorage', {value: mock()});
class Worker {
    constructor(stringUrl) {
        this.url = stringUrl;
        this.onmessage = () => {};
    }
    postMessage(msg) {
        this.onmessage(msg);
    }
}
Object.defineProperty(window, "Worker", { value: Worker });
Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
    value: () => {}
});
Object.defineProperty(window, "scrollBy", {
    value: () => {}
});
Object.defineProperty(document, 'doctype', {
    value: '<!DOCTYPE html>'
});
Object.defineProperty(window, 'getComputedStyle', {
    value: () => {
        return {
            display: 'none',
            appearance: ['-webkit-appearance']
        };
    }
});
/**
 * ISSUE: https://github.com/angular/material2/issues/7101
 * Workaround for JSDOM missing transform property
 */
Object.defineProperty(document.body.style, 'transform', {
    value: () => {
        return {
            enumerable: true,
            configurable: true,
        };
    },
});

Object.defineProperty(window, 'customElements', {
    value: {
        define: () => {},
        whenDefined: () => {}
    }
});
