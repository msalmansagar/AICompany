import '@testing-library/jest-dom';

// jsdom does not implement ResizeObserver. Fluent UI MessageBar uses it
// via useMessageBarReflow. This stub prevents the constructor error in tests.
// All existing and new tests that render a MessageBar benefit from this fix.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
