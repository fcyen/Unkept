// Pure geometry for the onboarding tour overlay.
//
// Kept free of React and the DOM so the placement rules are unit-testable:
// every function here takes plain rects ({ top, left, width, height }) and a
// viewport ({ width, height }) and returns plain rects. The Tour component
// measures real elements and feeds the numbers in.

// Gap between the spotlit element and the tooltip.
export const TOOLTIP_GAP = 14;
// Minimum distance from the tooltip to any viewport edge.
export const VIEWPORT_PAD = 12;
// How far the spotlight cut-out is inflated beyond the element itself.
export const SPOTLIGHT_PAD = 8;

const SIDES = ['bottom', 'top', 'right', 'left'];

function clamp(value, min, max) {
  if (max < min) return min; // degenerate viewport — pin to min rather than invert
  return Math.min(max, Math.max(min, value));
}

function rectOf(top, left, width, height) {
  return {
    top,
    left,
    width: Math.max(0, width),
    height: Math.max(0, height),
    bottom: top + Math.max(0, height),
    right: left + Math.max(0, width),
  };
}

/**
 * The cut-out the scrim leaves around an anchor element: the element's rect
 * inflated by `pad` and clamped to the viewport, so an element that sits
 * flush against an edge doesn't produce a hole hanging off-screen.
 */
export function spotlightRect(rect, viewport, pad = SPOTLIGHT_PAD) {
  if (!rect) return null;
  const top = clamp(rect.top - pad, 0, viewport.height);
  const left = clamp(rect.left - pad, 0, viewport.width);
  const bottom = clamp(rect.top + rect.height + pad, 0, viewport.height);
  const right = clamp(rect.left + rect.width + pad, 0, viewport.width);
  return rectOf(top, left, right - left, bottom - top);
}

/**
 * The four scrim panels that surround a hole. Four solid panels beat one
 * full-screen overlay with a masked hole: the hole is genuinely empty, so
 * the user can still interact with the element the step is talking about
 * (drag the photo, tap a chapter pill) while the tour is up.
 *
 * With no hole, returns a single full-viewport panel.
 */
export function scrimPanels(hole, viewport) {
  if (!hole) return [rectOf(0, 0, viewport.width, viewport.height)];
  return [
    rectOf(0, 0, viewport.width, hole.top),                                   // above
    rectOf(hole.bottom, 0, viewport.width, viewport.height - hole.bottom),    // below
    rectOf(hole.top, 0, hole.left, hole.height),                              // left
    rectOf(hole.top, hole.right, viewport.width - hole.right, hole.height),   // right
  ];
}

/** Space available for a tooltip on each side of the hole. */
export function availableSpace(hole, viewport) {
  return {
    bottom: viewport.height - hole.bottom - TOOLTIP_GAP - VIEWPORT_PAD,
    top: hole.top - TOOLTIP_GAP - VIEWPORT_PAD,
    right: viewport.width - hole.right - TOOLTIP_GAP - VIEWPORT_PAD,
    left: hole.left - TOOLTIP_GAP - VIEWPORT_PAD,
  };
}

/**
 * Pick which side of the hole the tooltip goes on. Tries the step's preferred
 * side first, then the remaining sides in a fixed order, and falls back to the
 * roomiest side when none fits outright. Returns 'center' when there is no
 * anchor, or when the tooltip cannot fit beside the hole at all.
 */
export function choosePlacement(hole, size, viewport, preferred = 'bottom') {
  if (!hole) return 'center';
  if (size.width + VIEWPORT_PAD * 2 > viewport.width) return 'center';
  if (size.height + VIEWPORT_PAD * 2 > viewport.height) return 'center';

  const space = availableSpace(hole, viewport);
  const needed = (side) => (side === 'top' || side === 'bottom' ? size.height : size.width);
  const order = [preferred, ...SIDES.filter((s) => s !== preferred)];

  for (const side of order) {
    if (space[side] >= needed(side)) return side;
  }

  // Nothing fits cleanly — take the side with the most room left over, scored
  // against what that side needs so a tall tooltip prefers a wide gap.
  let best = order[0];
  let bestScore = -Infinity;
  for (const side of order) {
    const score = space[side] - needed(side);
    if (score > bestScore) { bestScore = score; best = side; }
  }
  return best;
}

/**
 * Final tooltip position. Always clamped inside the viewport, so a tooltip
 * anchored to an element near an edge slides along rather than overflowing.
 *
 * @returns {{ top:number, left:number, placement:string }}
 */
export function placeTooltip(hole, size, viewport, preferred = 'bottom') {
  const placement = choosePlacement(hole, size, viewport, preferred);

  if (placement === 'center') {
    return {
      placement,
      top: clamp((viewport.height - size.height) / 2, VIEWPORT_PAD,
        viewport.height - size.height - VIEWPORT_PAD),
      left: clamp((viewport.width - size.width) / 2, VIEWPORT_PAD,
        viewport.width - size.width - VIEWPORT_PAD),
    };
  }

  const maxLeft = viewport.width - size.width - VIEWPORT_PAD;
  const maxTop = viewport.height - size.height - VIEWPORT_PAD;
  const centreX = hole.left + hole.width / 2 - size.width / 2;
  const centreY = hole.top + hole.height / 2 - size.height / 2;

  let top;
  let left;
  if (placement === 'bottom') {
    top = hole.bottom + TOOLTIP_GAP;
    left = centreX;
  } else if (placement === 'top') {
    top = hole.top - TOOLTIP_GAP - size.height;
    left = centreX;
  } else if (placement === 'right') {
    top = centreY;
    left = hole.right + TOOLTIP_GAP;
  } else {
    top = centreY;
    left = hole.left - TOOLTIP_GAP - size.width;
  }

  return {
    placement,
    top: clamp(top, VIEWPORT_PAD, maxTop),
    left: clamp(left, VIEWPORT_PAD, maxLeft),
  };
}
