const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const window = new JSDOM('').window;
const purify = DOMPurify(window);
const svg = `<svg viewBox="0 0 1440 820" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif">
  <rect width="1440" height="820" fill="#ffffff"/>
  <g>
    <rect x="100" y="40" width="360" height="440" rx="20" fill="#3d2f8f"/>
    <text x="280" y="90" text-anchor="middle" fill="#ffffff" font-size="26" font-weight="700">Rich content</text>
  </g>
</svg>`;

console.log("DEFAULT:", purify.sanitize(svg));
console.log("WITH USE_PROFILES SVG:", purify.sanitize(svg, { USE_PROFILES: { svg: true } }));
