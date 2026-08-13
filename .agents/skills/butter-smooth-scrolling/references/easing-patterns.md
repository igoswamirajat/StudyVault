# Easing and Interpolation Patterns

Reference for lerp (linear interpolation) and easing functions used in butter smooth scrolling.

## Linear Interpolation (Lerp)

The core function for smooth value transitions:

```typescript
function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}
```

### Factor Values

| Factor | Feel | Use Case |
|--------|------|----------|
| 0.04-0.06 | Ultra smooth, slow | Cinematic portfolios |
| 0.08-0.10 | Very smooth | Agency websites |
| 0.10-0.14 | Balanced (default) | Most websites |
| 0.15-0.20 | Responsive | Content-heavy sites |
| 0.25-0.35 | Snappy | Interactive apps |

### Lerp Visualization

```
Target: 100, Factor: 0.1
Frame 1:  0.0 → 10.0  (+10.0)
Frame 2: 10.0 → 19.0  (+9.0)
Frame 3: 19.0 → 27.1  (+8.1)
Frame 4: 27.1 → 34.4  (+7.3)
Frame 5: 34.4 → 40.9  (+6.5)
...
Frame 20: 87.8 → 89.1  (+1.3)
Frame 30: 95.8 → 96.2  (+0.4)
```

The curve is exponential decay - fast at start, slowing as it approaches target.

## Smooth Damp (Alternative)

More natural-feeling interpolation with velocity tracking:

```typescript
interface SmoothDampState {
  velocity: number;
}

function smoothDamp(
  current: number,
  target: number,
  state: SmoothDampState,
  smoothTime: number,
  deltaTime: number,
  maxSpeed = Infinity
): number {
  const omega = 2 / smoothTime;
  const x = omega * deltaTime;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

  let change = current - target;
  const maxChange = maxSpeed * smoothTime;
  change = Math.max(-maxChange, Math.min(maxChange, change));

  const temp = (state.velocity + omega * change) * deltaTime;
  state.velocity = (state.velocity - omega * temp) * exp;

  let result = target + (change + temp) * exp;

  // Prevent overshooting
  if ((target - current > 0) === (result > target)) {
    result = target;
    state.velocity = 0;
  }

  return result;
}
```

### Usage with Smooth Damp

```typescript
const velocityRef = useRef({ velocity: 0 });
const lastTimeRef = useRef(performance.now());

function animate() {
  const now = performance.now();
  const deltaTime = (now - lastTimeRef.current) / 1000;
  lastTimeRef.current = now;

  currentScrollY.current = smoothDamp(
    currentScrollY.current,
    targetScrollY.current,
    velocityRef.current,
    0.3, // smoothTime in seconds
    deltaTime
  );

  window.scrollTo(0, currentScrollY.current);
}
```

## Easing Functions

For more control over the interpolation curve:

### Ease Out Quad

```typescript
function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
```

### Ease Out Cubic

```typescript
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
```

### Ease Out Expo

```typescript
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}
```

### Using Easing with Lerp

```typescript
// Calculate progress (0-1) based on time or distance
const progress = Math.min(1, elapsed / duration);

// Apply easing to progress
const easedProgress = easeOutCubic(progress);

// Use eased progress for position
const position = lerp(startPosition, targetPosition, easedProgress);
```

## Frame-Rate Independent Lerp

Standard lerp depends on frame rate. Use delta time for consistency:

```typescript
function frameLerp(
  current: number,
  target: number,
  smoothness: number,
  deltaTime: number
): number {
  // smoothness: lower = smoother (e.g., 5-20)
  const factor = 1 - Math.exp(-smoothness * deltaTime);
  return lerp(current, target, factor);
}

// Usage
let lastTime = performance.now();

function animate() {
  const now = performance.now();
  const deltaTime = (now - lastTime) / 1000; // Convert to seconds
  lastTime = now;

  currentScrollY.current = frameLerp(
    currentScrollY.current,
    targetScrollY.current,
    12, // smoothness
    deltaTime
  );

  window.scrollTo(0, currentScrollY.current);
}
```

## Performance Optimization

### Threshold Detection

Stop animation when difference is imperceptible:

```typescript
const THRESHOLD = 0.5; // pixels

function shouldContinue(current: number, target: number): boolean {
  return Math.abs(target - current) > THRESHOLD;
}
```

### Debouncing Wheel Events

Prevent excessive calculations:

```typescript
const wheelBuffer = { deltaY: 0, pending: false };

function handleWheel(e: WheelEvent) {
  e.preventDefault();
  wheelBuffer.deltaY += e.deltaY;

  if (!wheelBuffer.pending) {
    wheelBuffer.pending = true;
    requestAnimationFrame(() => {
      targetScrollY.current += wheelBuffer.deltaY;
      wheelBuffer.deltaY = 0;
      wheelBuffer.pending = false;
      startAnimation();
    });
  }
}
```

### RAF Optimization

Avoid starting multiple animation loops:

```typescript
let rafId: number | null = null;

function startAnimation() {
  if (rafId === null) {
    rafId = requestAnimationFrame(animate);
  }
}

function stopAnimation() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function animate() {
  // ... update scroll ...

  if (shouldContinue(currentScrollY, targetScrollY)) {
    rafId = requestAnimationFrame(animate);
  } else {
    rafId = null;
  }
}
```

## Common Presets

### Cinematic Agency

```tsx
<ButterScroll lerp={0.06} sensitivity={0.8} />
```

### Balanced Default

```tsx
<ButterScroll lerp={0.12} sensitivity={1.0} />
```

### Responsive App

```tsx
<ButterScroll lerp={0.20} sensitivity={1.2} />
```

### Quick Portfolio

```tsx
<ButterScroll lerp={0.15} sensitivity={1.0} />
```

## Browser Considerations

### Safari

Safari has its own momentum scrolling. Consider:

```typescript
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

if (isSafari) {
  // Use higher lerp for Safari
  options.lerp = Math.max(options.lerp, 0.15);
}
```

### Firefox

Firefox wheel events have different deltaY values:

```typescript
// Normalize across browsers
const normalizedDelta =
  e.deltaMode === 1
    ? e.deltaY * 20 // Line mode (Firefox)
    : e.deltaY; // Pixel mode (Chrome, Safari)
```

### High Refresh Rate Displays

Adjust for 120Hz+ displays:

```typescript
const refreshRate = 1000 / 60; // Assume 60fps baseline
const actualFrameTime = deltaTime * 1000;
const frameRatio = actualFrameTime / refreshRate;

// Adjust lerp for frame rate
const adjustedLerp = 1 - Math.pow(1 - options.lerp, frameRatio);
```

## Touch-Specific Patterns

### Velocity Tracking for Momentum

```typescript
const touchVelocity = useRef(0);
const lastTouchTime = useRef(0);

function handleTouchMove(e: TouchEvent) {
  const now = performance.now();
  const deltaTime = now - lastTouchTime.current;
  const deltaY = lastTouchY.current - e.touches[0].clientY;

  // Calculate velocity (pixels per ms)
  touchVelocity.current = deltaY / deltaTime;

  lastTouchTime.current = now;
  lastTouchY.current = e.touches[0].clientY;
}

function handleTouchEnd() {
  // Apply momentum based on velocity
  const momentum = touchVelocity.current * 150; // multiplier
  targetScrollY.current = clampScroll(targetScrollY.current + momentum);
}
```

### Rubber Band Effect at Boundaries

```typescript
function rubberBand(value: number, min: number, max: number): number {
  if (value < min) {
    const overshoot = min - value;
    return min - overshoot * 0.3; // Reduce overshoot by 70%
  }
  if (value > max) {
    const overshoot = value - max;
    return max + overshoot * 0.3;
  }
  return value;
}
```
