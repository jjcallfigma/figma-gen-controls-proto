# Testing Strategy - Figma Clone

This document outlines our comprehensive testing strategy for the Figma clone application, ensuring reliability and maintainability as complexity grows.

## 🎯 Testing Philosophy

We follow a **Testing Pyramid** approach that prioritizes:

1. **Unit Tests** (70%) - Fast, isolated tests for pure functions and components
2. **Integration Tests** (20%) - Component interactions and state management
3. **E2E Tests** (10%) - Complete user workflows and critical paths

## 🏗️ Testing Architecture

### Test Organization

```
src/
├── components/
│   └── canvas/
│       ├── __tests__/
│       │   └── Canvas.test.tsx          # Integration tests
│       └── Canvas.tsx
├── core/
│   ├── state/
│   │   ├── __tests__/
│   │   │   ├── store.test.ts            # State management tests
│   │   │   └── reducer.test.ts          # Event reducer tests
│   │   └── store.ts
│   └── utils/
│       ├── __tests__/
│       │   └── coordinates.test.ts      # Coordinate utilities tests
│       └── coordinates.ts
tests/
└── e2e/
    └── canvas.spec.ts                   # End-to-end tests
```

## 📝 Test Commands

```bash
# Run all unit tests
npm test

# Run tests in watch mode during development
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Run all tests (unit + E2E)
npm run test:all
```

## 🧪 Unit Tests

### What We Test

- **Pure Functions**: Coordinate conversions, utility functions
- **Event Reducers**: State transformations from events
- **Component Logic**: Isolated component behavior

### Example: Coordinate System Tests

```typescript
describe("worldToScreen", () => {
  it("should convert world coordinates to screen coordinates", () => {
    const worldPoint = { x: 10, y: 20 };
    const viewport = { zoom: 2, panX: 100, panY: 50 };
    const result = worldToScreen(worldPoint, viewport);

    expect(result).toEqual({
      x: 10 * 2 + 100, // x * zoom + panX
      y: 20 * 2 + 50, // y * zoom + panY
    });
  });
});
```

### Key Testing Patterns

- **Arrange-Act-Assert**: Clear test structure
- **Test Edge Cases**: Empty arrays, boundary conditions, invalid inputs
- **Mock External Dependencies**: Browser APIs, DOM methods
- **Custom Matchers**: Canvas-specific assertions

## 🔗 Integration Tests

### What We Test

- **State Management**: Complete undo/redo workflows
- **Component Interactions**: Canvas rendering with state changes
- **Event Flow**: Dispatching events and resulting state changes

### Example: Undo/Redo Integration Test

```typescript
it("should create object and support undo/redo", () => {
  const store = useAppStore.getState();

  // Create object
  store.dispatch({ type: "object.created", payload: { object } });
  expect(Object.keys(store.objects)).toHaveLength(1);

  // Undo
  store.undo();
  expect(Object.keys(store.objects)).toHaveLength(0);

  // Redo
  store.redo();
  expect(Object.keys(store.objects)).toHaveLength(1);
});
```

### Key Integration Scenarios

- **Object Creation → Selection → Deletion**
- **Viewport Changes → Coordinate Recalculation**
- **Multi-step Operations → Undo → Redo**
- **State Persistence → History Limits**

## 🌐 End-to-End Tests

### What We Test

- **Complete User Workflows**: From opening app to creating objects
- **Cross-browser Compatibility**: Chrome, Firefox, Safari
- **UI Interactions**: Button clicks, keyboard shortcuts, drag & drop
- **Visual Feedback**: Proper rendering, responsive layout

### Example: Complete Workflow Test

```typescript
test("should create multiple objects and test undo/redo", async ({ page }) => {
  // Create objects
  await page.getByRole("button", { name: "Add Rectangle" }).click();
  await page.getByRole("button", { name: "Add Text" }).click();

  // Test undo/redo
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();

  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
});
```

### E2E Test Coverage

- **Core Features**: Object creation, selection, undo/redo
- **Viewport Controls**: Zoom, pan, reset
- **State Persistence**: Operations maintain state correctly
- **Error Handling**: Graceful failure recovery
- **Performance**: No UI freezing during operations

## 🎯 Testing for Canvas Applications

### Specific Challenges & Solutions

#### 1. **Coordinate System Testing**

```typescript
// Test both coordinate spaces
it("should convert between world and screen coordinates", () => {
  const worldPoint = { x: 25, y: 35 };
  const screenPoint = worldToScreen(worldPoint, viewport);
  const backToWorld = screenToWorld(screenPoint, viewport);

  expect(backToWorld.x).toBeCloseTo(worldPoint.x);
  expect(backToWorld.y).toBeCloseTo(worldPoint.y);
});
```

#### 2. **Event Sourcing Testing**

```typescript
// Test event application is reversible
it("should handle event reversal correctly", () => {
  const initialState = createState();
  const event = createEvent("object.created", { object });

  const afterEvent = applyEvent(initialState, event);
  const afterUndo = undoEvent(afterEvent);

  expect(afterUndo).toEqual(initialState);
});
```

#### 3. **DOM Performance Testing**

```typescript
// Test large numbers of objects
it("should handle 1000+ objects without performance degradation", () => {
  const start = performance.now();

  // Create many objects
  for (let i = 0; i < 1000; i++) {
    store.dispatch(createObjectEvent());
  }

  const end = performance.now();
  expect(end - start).toBeLessThan(1000); // < 1 second
});
```

#### 4. **Visual Regression Prevention**

```typescript
// E2E visual testing
test("should render objects correctly at different zoom levels", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add Rectangle" }).click();
  await page.screenshot({ path: "rectangle-normal.png" });

  await page.getByRole("button", { name: "Zoom In" }).click();
  await page.screenshot({ path: "rectangle-zoomed.png" });

  // Compare screenshots (if using visual regression testing)
});
```

## 📊 Test Coverage Goals

### Coverage Targets

- **Overall Coverage**: 80%+
- **Core Utils**: 95%+ (coordinate conversions, state reducers)
- **State Management**: 90%+ (critical for undo/redo reliability)
- **Components**: 70%+ (focus on logic, not just rendering)

### Critical Coverage Areas

- **All event reducers**: Must be 100% tested
- **Coordinate conversions**: Essential for dual coordinate system
- **Undo/redo logic**: Core feature reliability
- **State selectors**: Data access layer

## 🔧 Testing Setup & Configuration

### Jest Configuration Highlights

- **Module Resolution**: Path aliases (`@/` → `src/`)
- **Transform Ignore**: Handle ES modules in dependencies
- **Custom Matchers**: Canvas-specific assertions
- **Mock Setup**: Browser APIs, ResizeObserver, PointerEvents

### Playwright Configuration

- **Multi-browser**: Chrome, Firefox, Safari
- **Parallel Execution**: Faster test runs
- **Auto-retry**: Handle flaky network conditions
- **Screenshots**: Capture failures for debugging

## 🚀 Best Practices

### 1. **Test Naming**

```typescript
// ✅ Good: Descriptive and specific
it(
  "should convert world coordinates to screen coordinates with 2x zoom and offset"
);

// ❌ Bad: Vague and unclear
it("should work correctly");
```

### 2. **Test Independence**

```typescript
// ✅ Good: Reset state before each test
beforeEach(() => {
  resetStore();
});

// ❌ Bad: Tests depend on each other
```

### 3. **Mock Strategy**

```typescript
// ✅ Good: Mock external dependencies, test internal logic
jest.mock("nanoid", () => ({ nanoid: () => "test-id" }));

// ❌ Bad: Mock everything, test nothing
```

### 4. **Async Testing**

```typescript
// ✅ Good: Proper async handling
await waitFor(() => {
  expect(screen.getByText("Updated")).toBeInTheDocument();
});

// ❌ Bad: Race conditions
expect(screen.getByText("Updated")).toBeInTheDocument();
```

## 🔄 Continuous Integration

### Pre-commit Hooks

- Run unit tests
- Check test coverage
- Lint test files

### CI Pipeline

1. **Unit Tests**: Fast feedback on every commit
2. **Integration Tests**: Verify component interactions
3. **E2E Tests**: Full workflow validation (critical paths only)
4. **Coverage Reports**: Track coverage trends

## 📈 Testing Metrics

### What We Track

- **Test Coverage**: Lines, branches, functions
- **Test Performance**: Execution time trends
- **Flaky Tests**: Identification and remediation
- **Coverage Trends**: Ensure coverage doesn't regress

### Success Metrics

- **All Tests Pass**: Green builds required for merge
- **Coverage Maintained**: No decrease below thresholds
- **Fast Feedback**: Unit tests < 30s, E2E < 5min
- **Low Flakiness**: < 1% flaky test rate

This testing strategy ensures our Figma clone remains reliable, maintainable, and performs well as we add complex canvas interactions and features.
