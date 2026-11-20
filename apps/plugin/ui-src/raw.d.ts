// Vite's "?raw" imports give a file's text.
declare module "*?raw" {
  const content: string;
  export default content;
}

// Font files are inlined by Vite as data: URLs.
declare module "*.ttf" {
  const src: string;
  export default src;
}
