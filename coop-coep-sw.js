// This service worker is a workaround for GitHub Pages, which doesn't send the
// necessary headers for SharedArrayBuffer to work.
//
// It acts as a simple proxy that intercepts requests and adds the headers.
// See: https://dev.to/stefnotch/enabling-coop-coep-without-touching-the-server-2d3n

self.addEventListener("fetch", (event) => {
  // We only need to modify the headers for the main page document.
  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // Fetch the original response from the network.
          const response = await fetch(event.request);

          // Create a new Headers object so we can modify it.
          const headers = new Headers(response.headers);

          // Set the required headers for SharedArrayBuffer.
          headers.set("Cross-Origin-Opener-Policy", "same-origin");
          headers.set("Cross-Origin-Embedder-Policy", "require-corp");

          // Return a new response with the modified headers.
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        } catch (error) {
          // If the fetch fails, just return the error.
          console.error("Service Worker fetch failed:", error);
          return error;
        }
      })()
    );
  }
});

