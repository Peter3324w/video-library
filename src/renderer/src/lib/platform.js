// True in the web build (vite.web.config.mjs sets it), undefined on desktop.
// A build-time constant, so the branches it guards drop out of the other bundle.
export const WEB = import.meta.env.VITE_TARGET === 'web'
