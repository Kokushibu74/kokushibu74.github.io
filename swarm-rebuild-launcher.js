(() => {
  "use strict";

  const brand = document.getElementById("nav-brand-intro");
  if (!brand) return;

  brand.setAttribute("aria-label", "Play the Swarm Rebuild animation");
  brand.title = "Click to rebuild this page with a swarm of cursors";

  brand.addEventListener("click", (event) => {
    event.preventDefault();
    const swarm = window.__swarmRebuild;
    if (!swarm || typeof swarm.start !== "function") {
      console.error("[swarm-rebuild] The original animation script is not available.");
      return;
    }
    if (swarm.app) swarm.stop(false);
    else swarm.start();
  });
})();
