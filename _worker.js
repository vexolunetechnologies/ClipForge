/* ClipForge Pages worker: static asset pass-through.
   All application CSS and JavaScript are linked directly by index.html. */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};
