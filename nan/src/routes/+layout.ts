// Server output: API routes need a Node server (fullstack stream extension).
// The single page is still SSR-friendly; RQ-01 applies: the PRES identifier is
// generated client-side per session and must not be prerendered.
export const prerender = false;
export const ssr = true;
