// Feature flags for the live MVP. Toggle these to flip whole surfaces on
// or off without ripping out the implementation — the slideshow renderer
// stays in the bundle and the /dev route keeps exercising it, but the
// production flow skips it while the design intent is still firming up.
export const FEATURES = {
  slideshow: false,
};
