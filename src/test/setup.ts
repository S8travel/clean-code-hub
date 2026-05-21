import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom does not implement ResizeObserver — required by cmdk / Radix UI
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom does not implement PointerEvent — required by Radix UI interactions
if (!global.PointerEvent) {
  class PointerEvent extends MouseEvent {
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
    }
  }
  (global as any).PointerEvent = PointerEvent;
}

// jsdom does not implement IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
} as any;

// cmdk calls scrollIntoView on list items; jsdom doesn't implement it
Element.prototype.scrollIntoView = () => {};
