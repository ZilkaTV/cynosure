// Millennial's Quad Cup (MQC): teams and matches of the overlay. Edit this file to change names, colours, logos or the order of the matches.
//
// A team's logo is looked up as logos/<tag in lower case>.png (then .webp, .svg, .jpg); without a file a badge with the tag is drawn.
// `crop` is the box of the logo's content inside its picture (in pixels), so pictures with a lot of empty space fill the badge;
// `blend: 'screen'` makes a black picture background see-through on the dark badge; `shape: 'round'` cuts the picture to a circle.
window.MQC_DATA = {
  title: "MILLENNIAL'S QUAD CUP",
  short: 'MQC',
  logo: { file: 'logos/mqc.webp', shape: 'round' },
  teams: {
    EXL: { name: 'EXL', color: '#ef4444' },
    CHADS: { name: 'CHADS', color: '#22c55e' },
    NRV: { name: 'NRV', color: '#06b6d4' },
    AST: { name: 'AST', color: '#a855f7' },
    CZSK: { name: 'CZSK', color: '#2d8cff', file: 'logos/czsk.png' },
    EU: { name: 'EU', color: '#2b50c9', file: 'logos/eu.png' },
    CYN: { name: 'CYN', color: '#8b5cf6', file: 'logos/cyn.webp', crop: { x: 440, y: 372, w: 1120, h: 1284 } },
    MOL: { name: 'MOL', color: '#f97316' },
    DUCK: { name: 'DUCK', color: '#eab308' },
    LBU: { name: 'LBU', color: '#f5c518', file: 'logos/lbu.webp', blend: 'screen', crop: { x: 408, y: 108, w: 760, h: 736 } },
    JR: { name: 'JR', color: '#14b8a6' },
    MARS: { name: 'MARS', color: '#d9532b', file: 'logos/mars.png', blend: 'screen', crop: { x: 44, y: 8, w: 176, h: 176 } },
    ROYS: { name: 'ROYS', color: '#ec4899' },
    NYC: { name: 'NYC', sub: 'CYN 2', color: '#7c5cd6', file: 'logos/cyn.webp', crop: { x: 440, y: 372, w: 1120, h: 1284 } },
    ITA: { name: 'ITA', color: '#16a34a' },
    LUX: { name: 'LUX', color: '#e8c45a', file: 'logos/lux.png', blend: 'screen', crop: { x: 116, y: 28, w: 524, h: 684 } },
  },
  matches: [
    { id: 1, a: 'EXL', b: 'CHADS' },
    { id: 2, a: 'NRV', b: 'AST' },
    { id: 3, a: 'CZSK', b: 'EU' },
    { id: 4, a: 'CYN', b: 'MOL' },
    { id: 5, a: 'DUCK', b: 'LBU' },
    { id: 6, a: 'JR', b: 'MARS' },
    { id: 7, a: 'ROYS', b: 'NYC' },
    { id: 8, a: 'ITA', b: 'LUX' },
  ],
}
