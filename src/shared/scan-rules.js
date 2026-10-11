/* What counts as a video worth filing, shared by the desktop scanner
   (src/main/scan.js) and the web build's (src/web/folders.js). */

export const VIDEO = /\.(mkv|mp4|m4v|avi|mov|wmv|webm|ts|m2ts|flv|mpg|mpeg|ogv|3gp)$/i
// Samples and extras aren't episodes; they'd each become a card.
export const SKIP_FILE = /(^|[\s._-])(sample|trailer)([\s._-]|$)/i
// Windows' own screen-recording folders hold captures, not shows: a 27 MB
// "After.mp4" in there would otherwise become the film After (2019).
export const SKIP_DIR =
  /^(\$recycle\.bin|system volume information|node_modules|\..*|samples?|extras?|featurettes?|captures|screen recordings|camera roll|saved pictures|screenshots)$/i
export const MAX_DEPTH = 6
// Under this it's a clip or a sample, not an episode (a 3 MB "m2-res_720p.mp4").
export const MIN_BYTES = 15 * 1024 * 1024
