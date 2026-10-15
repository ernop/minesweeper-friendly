'use strict';

//-------CELL ICONOGRAPHY-------

// The board's flag and mine glyphs, shared by every page that draws a board
// (the game, the settings page's mine-style picker, and the problems page).

// The flag's hue is the one strong hue nothing else on a board uses: not
// a count color, the red hit square and wrong-flag cross, the bomb's fuse,
// or any replay overlay, so a flag never reads as anything else.
// FLAG_COLOR is that hue at full strength (color strength 100).
const FLAG_COLOR = '#ff00ff';
const FLAG_HUE_DEGREES = 300;

// The flag styles the player chooses from (settings.flagStyle), in picker
// order. Every body spans the whole 16-unit box, so the flag size setting
// is exactly the share of the square's width the flag covers.
const FLAG_STYLES = [
  {
    id: 'classic', label: 'classic', describe: 'the classic Windows flag: a pennant on a black pole and base',
    body: (color) => '<g transform="translate(0.667 0) scale(1.3333) translate(-3.5 -3)"><path d="M9 3 L9 8.5 L3.5 5.75 Z" fill="' + color + '"/><rect x="8.4" y="3" width="1.2" height="9" fill="#000"/><rect x="5" y="11.5" width="8" height="1.5" fill="#000"/><rect x="3.5" y="13" width="11" height="2" fill="#000"/></g>',
  },
  {
    id: 'pennant', label: 'pennant', describe: 'a large pennant on its pole, all in the flag color, no black',
    body: (color) => '<path d="M12.6 0.5 L12.6 10.5 L0.5 5.5 Z" fill="' + color + '"/><rect x="12.4" y="0" width="2.2" height="16" fill="' + color + '"/>',
  },
  {
    id: 'diamond', label: 'diamond', describe: 'a solid diamond in the flag color',
    body: (color) => '<path d="M8 0 L16 8 L8 16 L0 8 Z" fill="' + color + '"/>',
  },
  {
    id: 'square', label: 'square', describe: 'a solid rounded square in the flag color',
    body: (color) => '<rect x="0.5" y="0.5" width="15" height="15" rx="2.5" fill="' + color + '"/>',
  },
  {
    id: 'ring', label: 'ring', describe: 'a thick ring in the flag color',
    body: (color) => '<circle cx="8" cy="8" r="6.2" fill="none" stroke="' + color + '" stroke-width="3.6"/>',
  },
];

// What the problems page and the judgment tool draw: they never read the
// game's settings. Also the settings defaults: the classic flag at about
// its original size (the old 0.62-wide box held a 12-unit-tall flag).
const CLASSIC_FLAG = { style: 'classic', sizePercent: 45, intensityPercent: 100 };

function hslHex(hueDegrees, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const channel = (n) => {
    const k = (n + hueDegrees / 30) % 12;
    const value = lightness - chroma / 2 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return '#' + channel(0) + channel(8) + channel(4);
}

// Color strength 100 is FLAG_COLOR; lower strengths lose saturation and
// lighten toward the gray of a covered square at the same rate.
function flagColor(intensityPercent) {
  const strength = intensityPercent / 100;
  return hslHex(FLAG_HUE_DEGREES, strength, 0.5 + (1 - strength) * 0.25);
}

const FLAG_SVGS = new Map();

function flagSvg(styleId, intensityPercent) {
  const key = styleId + ' ' + intensityPercent;
  if (!FLAG_SVGS.has(key)) {
    const style = FLAG_STYLES.find((s) => s.id === styleId);
    if (style === undefined) throw new Error('unknown flag style: ' + styleId);
    FLAG_SVGS.set(key, '<svg viewBox="0 0 16 16" class="flag">' + style.body(flagColor(intensityPercent)) + '</svg>');
  }
  return FLAG_SVGS.get(key);
}

// A flag on a covered square spans this share of the square's width
// (style.css reads --flag-size).
function setFlagSize(sizePercent) {
  document.documentElement.style.setProperty('--flag-size', String(sizePercent / 100));
}

// The mine styles the player chooses from (settings.mineStyle), in picker
// order. Every style draws in black with white highlights on the 16-unit
// square, so it reads on the silver revealed square and on the red hit one.
// A fullSize style is drawn nearly as wide as the board square, like the
// large digits; classic keeps the original Windows proportion.
const MINE_STYLES = [
  {
    id: 'classic', label: 'classic', describe: 'the classic Windows mine: a small ball with thin spikes', fullSize: false,
    body: '<g fill="#000" stroke="#000" stroke-width="1.4"><line x1="8" y1="1" x2="8" y2="15"/><line x1="1" y1="8" x2="15" y2="8"/><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/><circle cx="8" cy="8" r="4.6" stroke="none"/></g><rect x="6" y="6" width="2" height="2" fill="#fff"/>',
  },
  {
    id: 'bold', label: 'bold', describe: 'the classic mine at heavy weight: a large ball with thick spikes filling the square', fullSize: true,
    body: '<g stroke="#000" stroke-width="2.4" stroke-linecap="round"><line x1="8" y1="1.4" x2="8" y2="14.6"/><line x1="1.4" y1="8" x2="14.6" y2="8"/><line x1="3.2" y1="3.2" x2="12.8" y2="12.8"/><line x1="12.8" y1="3.2" x2="3.2" y2="12.8"/></g><circle cx="8" cy="8" r="5.4" fill="#000"/><circle cx="6.2" cy="6.2" r="1.5" fill="#fff"/>',
  },
  {
    id: 'sea-mine', label: 'sea mine', describe: 'a large ball with six round-tipped horns', fullSize: true,
    body: '<g stroke="#000" stroke-width="2"><line x1="8" y1="1.8" x2="8" y2="14.2"/><line x1="13.37" y1="4.9" x2="2.63" y2="11.1"/><line x1="13.37" y1="11.1" x2="2.63" y2="4.9"/></g><g fill="#000"><circle cx="8" cy="8" r="5.2"/><circle cx="8" cy="1.8" r="1.6"/><circle cx="13.37" cy="4.9" r="1.6"/><circle cx="13.37" cy="11.1" r="1.6"/><circle cx="8" cy="14.2" r="1.6"/><circle cx="2.63" cy="11.1" r="1.6"/><circle cx="2.63" cy="4.9" r="1.6"/></g><circle cx="6.2" cy="6.4" r="1.4" fill="#fff"/>',
  },
  {
    id: 'bomb', label: 'bomb', describe: 'a round cartoon bomb with a lit fuse', fullSize: true,
    body: '<circle cx="7" cy="9.4" r="5.6" fill="#000"/><path d="M10.18 6.22 L11.67 4.73" stroke="#000" stroke-width="3.2"/><path d="M11.67 4.73 Q12.4 2.6 13.9 2.1" fill="none" stroke="#000" stroke-width="1"/><path d="M13.90 0.10 L14.24 1.27 L15.31 0.69 L14.73 1.76 L15.90 2.10 L14.73 2.44 L15.31 3.51 L14.24 2.93 L13.90 4.10 L13.56 2.93 L12.49 3.51 L13.07 2.44 L11.90 2.10 L13.07 1.76 L12.49 0.69 L13.56 1.27 Z" fill="#ff6a00"/><circle cx="13.9" cy="2.1" r="0.8" fill="#ffe100"/><circle cx="5" cy="7.4" r="1.5" fill="#fff"/>',
  },
  {
    id: 'star', label: 'star', describe: 'a solid eight-point star filling the square', fullSize: true,
    body: '<path d="M8.00 0.40 L9.65 4.03 L13.37 2.63 L11.97 6.35 L15.60 8.00 L11.97 9.65 L13.37 13.37 L9.65 11.97 L8.00 15.60 L6.35 11.97 L2.63 13.37 L4.03 9.65 L0.40 8.00 L4.03 6.35 L2.63 2.63 L6.35 4.03 Z" fill="#000"/><circle cx="6.6" cy="6.6" r="1.3" fill="#fff"/>',
  },
];

const WRONG_FLAG_CROSS = '<path d="M2 2 L14 14 M14 2 L2 14" fill="none" stroke="#ff0000" stroke-width="2"/>';
const MINE_STYLE_SVGS = new Map(MINE_STYLES.map((style) => {
  const open = '<svg viewBox="0 0 16 16"' + (style.fullSize ? ' class="mine-full-size">' : '>');
  return [style.id, {
    mine: open + style.body + '</svg>',
    wrongFlag: open + style.body + WRONG_FLAG_CROSS + '</svg>',
  }];
}));

function mineStyleSvgs(styleId) {
  const svgs = MINE_STYLE_SVGS.get(styleId);
  if (svgs === undefined) throw new Error('unknown mine style: ' + styleId);
  return svgs;
}

// A mine, and a flag on a square that held none: the mine crossed out.
function mineSvg(styleId) {
  return mineStyleSvgs(styleId).mine;
}

function wrongFlagSvg(styleId) {
  return mineStyleSvgs(styleId).wrongFlag;
}
