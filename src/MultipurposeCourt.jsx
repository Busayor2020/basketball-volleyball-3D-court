import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { jsPDF } from "jspdf";

/* =====================================================================
   HERITAGE HOMESCHOOLING, IKORODU, LAGOS
   Multipurpose Court : Basketball / Volleyball combined
   Slab 19.000 x 9.000 m
   Setting out: FIVB (volleyball, full size) + FIBA x 0.60 (basketball)
   All dimensions in metres. Origin = centre of slab, Y up.
   X = 19 m axis (set out North / South).  Z = 9 m axis.
   ===================================================================== */

/* #####################################################################
   #                                                                   #
   #   SHEET SETUP                                                     #
   #   Everything you are meant to edit lives in this one block.       #
   #                                                                   #
   #   company     : prints in the sheet head, in the footer strip,    #
   #                 and in the black band on the exported PDF.        #
   #   schoolName  : prints on the 3D signboard beside the court.      #
   #                 That signboard is layer A-SIGN and stands on its  #
   #                 own posts, so it works with the fence off.        #
   #                                                                   #
   ##################################################################### */

export const SHEET = {
  /* ---- the practice issuing the drawing ---------------------------- */
  company: "Zidmor Global Services",
  companyRole: "Architectural Design and Build",

  /* ---- the client -------------------------------------------------- */
  client: "Heritage Homeschooling",
  location: "Ikorodu, Lagos",

  /* ---- what is painted on the 3D signboard (layer A-SIGN) ---------- */
  schoolName: "HERITAGE HOMESCHOOLING",
  signSubtitle: "MULTIPURPOSE COURT  /  IKORODU, LAGOS",

  /* ---- drawing identity -------------------------------------------- */
  projectTitle: "Multipurpose Court : Basketball / Volleyball",
  drawingNo: "3D-01",
  revision: "A",
  status: "Preliminary · design intent only",
  scaleNote: "NTS · 3D projection",

  /* ---- export ------------------------------------------------------ */
  export: {
    pngLongEdge: 3840, // pixels on the long edge of the HD PNG
    pdfLongEdge: 3200, // pixels on the long edge of the image inside the PDF
    pdfJpegQuality: 0.95,
    pdfFormat: "a3", // "a4" | "a3" | "a2". A3 landscape is the sheet this is drawn for.
  },
};

/* Title block. Eight fields, laid out 4 x 2 on screen and on the sheet. */
export const SPECS = () => [
  ["Client", `${SHEET.client}, ${SHEET.location}`],
  ["Slab", "19.000 × 9.000 m · 150 mm RC"],
  ["Volleyball", "18.000 × 9.000 · FIVB · net 2.240"],
  ["Basketball", "16.800 × 9.000 · FIBA × 0.60 · rim 3.050"],
  ["Orientation", "Long axis set out north / south"],
  ["Falls", "1:100 crossfall to channel drain, south"],
  ["Finish", "3-coat acrylic hard court, sawn joints 4.75 × 4.50"],
  ["Status", SHEET.status],
];

/* Layer register. One source of truth: this drives the dropdown, the PDF
   legend, and the visibility pass. `rule` draws a divider above the row. */
export const LAYERS = [
  { k: "vb", code: "M-VOLL", name: "Volleyball", on: true },
  { k: "bb", code: "M-BASK", name: "Basketball", on: true },
  { k: "fence", code: "A-FENC", name: "Ball stop / fence", on: true },
  { k: "sign", code: "A-SIGN", name: "School signboard", on: true },
  { k: "lights", code: "E-FLDL", name: "Floodlight masts", on: true },
  { k: "site", code: "L-SITE", name: "Terrace / planting", on: true },
  { k: "dims", code: "X-DIMS", name: "Dimensions", on: true },
  { k: "free", code: "X-FREE", name: "24×15 free zone", on: false, rule: true },
];

/* ------------------------------------------------- setting out ----- */
const SLAB_L = 19.0;
const SLAB_W = 9.0;
const VB_L = 18.0;
const VB_W = 9.0;
const LW = 0.05;
const HL = LW / 2;

const S = 0.6;
const BX = (28 * S) / 2;
const KEY_D = 5.8 * S;
const KEY_HW = (4.9 * S) / 2;
const R3 = 6.75 * S;
const CORNER_Z = SLAB_W / 2 - 0.9 * S;
const RING_OFF = 1.575 * S;
const CIRC_R = 1.8 * S;
const RA_R = 1.25 * S;

const RIM_Y = 3.05;
const NET_Y = 2.24;
const APRON = 1.2;
const AP_L = SLAB_L + APRON * 2;
const AP_W = SLAB_W + APRON * 2;

const FZ_L = 24.0;
const FZ_W = 15.0;

/* signboard, layer A-SIGN. Freestanding, 450 clear of the south ball stop,
   on its own pair of posts so it reads with the fence layer switched off. */
const SIGN_W = 7.0;
const SIGN_H = 1.5;
const SIGN_Y = 3.2;
const SIGN_X = -(AP_L / 2 + 0.75);
const SIGN_POST_H = SIGN_Y + SIGN_H / 2 + 0.3;

/* Court map resolution. 200 px/m bakes a 3800 x 1800 texture, which is the
   most a 4096 texture unit takes at this slab size, and it holds up at a
   3840 px export. Drop to 150 if an older GPU complains. */
const PPM = 200;

const PAINT = {
  runoff: "#A85236",
  play: "#2C6C62",
  key: "#A85236",
  vb: "#F2EFE6",
  bb: "#F5C453",
};

const UI = {
  ink: "#171C1E",
  rule: "rgba(226,232,232,0.16)",
  text: "#C6CDCD",
  dim: "#7C8788",
  hot: "#F5C453",
  teal: "#4FA396",
};

const DATE_STR = new Date()
  .toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
  .toUpperCase();

/* ---------------------------------------------------------------- court
   The whole 19 x 9 painted surface is baked into one canvas texture.
   PPM px/m, so a 50 mm line is LW * PPM px.                            */
function buildCourtTexture(showVB, showBB) {
  const cv = document.createElement("canvas");
  cv.width = Math.round(SLAB_L * PPM);
  cv.height = Math.round(SLAB_W * PPM);
  const g = cv.getContext("2d");

  const X = (m) => (m + SLAB_L / 2) * PPM;
  const Z = (m) => (m + SLAB_W / 2) * PPM;
  const P = (m) => m * PPM;

  const line = (x1, z1, x2, z2, c, w) => {
    g.strokeStyle = c;
    g.lineWidth = P(w || LW);
    g.lineCap = "butt";
    g.beginPath();
    g.moveTo(X(x1), Z(z1));
    g.lineTo(X(x2), Z(z2));
    g.stroke();
  };

  /* base coats */
  g.fillStyle = PAINT.runoff;
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = PAINT.play;
  g.fillRect(X(-VB_L / 2), Z(-VB_W / 2), P(VB_L), P(VB_W));

  if (showBB) {
    g.fillStyle = PAINT.key;
    [1, -1].forEach((s) => {
      const x0 = Math.min(X(s * BX), X(s * BX - s * KEY_D));
      g.fillRect(x0, Z(-KEY_HW), P(KEY_D), P(KEY_HW * 2));
    });
  }

  /* sawn construction joints, 4.75 x 4.50 bays */
  g.strokeStyle = "rgba(0,0,0,0.17)";
  g.lineWidth = P(0.012);
  [-4.75, 0, 4.75].forEach((x) => {
    g.beginPath();
    g.moveTo(X(x), 0);
    g.lineTo(X(x), cv.height);
    g.stroke();
  });
  g.beginPath();
  g.moveTo(0, Z(0));
  g.lineTo(cv.width, Z(0));
  g.stroke();

  /* ---- volleyball, FIVB, lines drawn inside the 18 x 9 ---- */
  if (showVB) {
    const c = PAINT.vb;
    line(-VB_L / 2, -VB_W / 2 + HL, VB_L / 2, -VB_W / 2 + HL, c);
    line(-VB_L / 2, VB_W / 2 - HL, VB_L / 2, VB_W / 2 - HL, c);
    line(-VB_L / 2 + HL, -VB_W / 2, -VB_L / 2 + HL, VB_W / 2, c);
    line(VB_L / 2 - HL, -VB_W / 2, VB_L / 2 - HL, VB_W / 2, c);
    line(0, -VB_W / 2, 0, VB_W / 2, c);
    line(-3 + HL, -VB_W / 2, -3 + HL, VB_W / 2, c);
    line(3 - HL, -VB_W / 2, 3 - HL, VB_W / 2, c);
  }

  /* ---- basketball, FIBA x 0.60 ---- */
  if (showBB) {
    const c = PAINT.bb;
    if (!showVB) {
      line(-BX, -SLAB_W / 2 + HL, BX, -SLAB_W / 2 + HL, c);
      line(-BX, SLAB_W / 2 - HL, BX, SLAB_W / 2 - HL, c);
      line(0, -SLAB_W / 2, 0, SLAB_W / 2, c);
    }
    line(-BX, -SLAB_W / 2, -BX, SLAB_W / 2, c);
    line(BX, -SLAB_W / 2, BX, SLAB_W / 2, c);

    g.strokeStyle = c;
    g.lineWidth = P(LW);
    g.setLineDash([]);
    g.beginPath();
    g.arc(X(0), Z(0), P(CIRC_R - HL), 0, Math.PI * 2);
    g.stroke();

    [1, -1].forEach((s) => {
      const base = s * BX;
      const ftX = base - s * KEY_D;
      const ringX = s * (BX - RING_OFF);

      line(base, -KEY_HW, ftX, -KEY_HW, c);
      line(base, KEY_HW, ftX, KEY_HW, c);
      line(ftX, -KEY_HW, ftX, KEY_HW, c);

      /* free throw circle : solid toward centre court, dashed under it */
      const a = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      const b = s > 0 ? (3 * Math.PI) / 2 : Math.PI / 2;
      g.setLineDash([]);
      g.beginPath();
      g.arc(X(ftX), Z(0), P(CIRC_R), a, b);
      g.stroke();
      g.setLineDash([P(0.32), P(0.32)]);
      g.beginPath();
      g.arc(X(ftX), Z(0), P(CIRC_R), b, a + Math.PI * 2);
      g.stroke();
      g.setLineDash([]);

      /* three point line */
      const dx = Math.sqrt(R3 * R3 - CORNER_Z * CORNER_Z);
      const meetX = ringX - s * dx;
      line(base, -CORNER_Z, meetX, -CORNER_Z, c);
      line(base, CORNER_Z, meetX, CORNER_Z, c);
      const a1 = Math.atan2(-CORNER_Z, meetX - ringX);
      const a2 = Math.atan2(CORNER_Z, meetX - ringX);
      g.beginPath();
      g.arc(X(ringX), Z(0), P(R3 - HL), a1, a2, s > 0);
      g.stroke();

      /* no charge semi circle */
      line(base, -RA_R, ringX, -RA_R, c);
      line(base, RA_R, ringX, RA_R, c);
      g.beginPath();
      g.arc(X(ringX), Z(0), P(RA_R), -Math.PI / 2, Math.PI / 2, s > 0);
      g.stroke();
    });
  }

  /* granular acrylic finish, speck count and size scaled off PPM so the
     grain stays the same physical size whatever the map resolution */
  const speck = Math.round(9000 * (PPM / 150) ** 2);
  const sz = Math.max(2, Math.round((2 * PPM) / 150));
  g.globalAlpha = 0.045;
  for (let i = 0; i < speck; i++) {
    g.fillStyle = i % 2 ? "#ffffff" : "#000000";
    g.fillRect(Math.random() * cv.width, Math.random() * cv.height, sz, sz);
  }
  g.globalAlpha = 1;

  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

function tile(draw, size) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  draw(cv.getContext("2d"), size);
  return cv;
}

function meshTexture() {
  const cv = tile((g, n) => {
    g.clearRect(0, 0, n, n);
    g.strokeStyle = "rgba(206,214,214,0.95)";
    g.lineWidth = 3.5;
    for (let i = -n; i <= n * 2; i += n / 4) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + n, n);
      g.stroke();
      g.beginPath();
      g.moveTo(i, n);
      g.lineTo(i + n, 0);
      g.stroke();
    }
  }, 128);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function grassTexture() {
  const cv = tile((g, n) => {
    g.fillStyle = "#5C7746";
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = ["#4E683B", "#688352", "#56713F", "#728C58"][i % 4];
      g.fillRect(Math.random() * n, Math.random() * n, 3, 3);
    }
  }, 256);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(50, 50);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

function skyTexture(top, mid, low) {
  const cv = document.createElement("canvas");
  cv.width = 8;
  cv.height = 512;
  const g = cv.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, top);
  grd.addColorStop(0.55, mid);
  grd.addColorStop(1, low);
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 512);
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

/* Shrink the font until the string fits maxW. Lets you drop a longer school
   name into SHEET without it running off the end of the board. */
function fitText(g, text, maxW, startPx, weight, family) {
  let px = startPx;
  for (;;) {
    g.font = `${weight} ${px}px ${family}`;
    if (g.measureText(text).width <= maxW || px <= 10) break;
    px -= 2;
  }
  return px;
}

/* ------------------------------------------------ signboard face ---
   2100 x 450 is a straight 1.5x of the original 1400 x 300 artwork, so
   the board looks identical, just sharp enough to survive a 4K export. */
function signTexture(aniso) {
  const W = 2100;
  const H = 450;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d");

  const SANS = "ui-sans-serif, Helvetica, Arial, sans-serif";
  const MONO = "ui-monospace, Menlo, Consolas, monospace";

  g.fillStyle = "#1F5C54";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#F5C453";
  g.fillRect(0, 0, W, 18);

  g.fillStyle = "#F7F5EE";
  fitText(g, SHEET.schoolName, W - 144, 144, 800, SANS);
  g.fillText(SHEET.schoolName, 72, 210);

  g.fillStyle = "#8FD3C4";
  fitText(g, SHEET.signSubtitle, W - 156, 78, 600, MONO);
  g.fillText(SHEET.signSubtitle, 78, 327);

  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  if (aniso) t.anisotropy = aniso;
  return t;
}

/* Annotation sprites. LABEL_SS supersamples the text canvas without moving
   the sprite's world size: every dimension in here scales together, so the
   aspect ratio, and therefore scale.set(), is unchanged. */
const LABEL_SS = 2;

function label(text, size, fg, bg) {
  const fs = 46 * LABEL_SS;
  const padX = 15 * LABEL_SS;
  const padY = 12 * LABEL_SS;
  const font = `700 ${fs}px ui-monospace, Menlo, Consolas, monospace`;

  const probe = document.createElement("canvas").getContext("2d");
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + padX * 2;
  const h = fs + padY * 2;

  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d");
  g.fillStyle = bg || "rgba(18,24,26,0.88)";
  g.fillRect(0, 0, w, h);
  g.strokeStyle = fg || "#F5C453";
  g.lineWidth = 3 * LABEL_SS;
  g.strokeRect(
    1.5 * LABEL_SS,
    1.5 * LABEL_SS,
    w - 3 * LABEL_SS,
    h - 3 * LABEL_SS,
  );
  g.font = font;
  g.textBaseline = "middle";
  g.fillStyle = fg || "#F5C453";
  g.fillText(text, padX, h / 2 + 2 * LABEL_SS);

  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }),
  );
  sp.renderOrder = 999;
  sp.scale.set((w / h) * size, size, 1);
  return sp;
}

const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
function poly(pts, color, opacity) {
  const geo = new THREE.BufferGeometry().setFromPoints(pts.map(V3));
  return new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: opacity || 0.9,
      depthTest: false,
    }),
  );
}

/* ================================================================ pdf */

/* jsPDF's built-in fonts speak WinAnsi, so anything above U+00FF gets
   mangled. Fold the typographic characters down before printing. The
   middot and the multiplication sign both live under 0x100 and survive. */
const pdfSafe = (s) =>
  String(s)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "\u00B7")
    .replace(/[^\u0000-\u00FF]/g, "");

function drawSheet(doc, shot, state) {
  const { view, sun, lay } = state;
  const T = pdfSafe;

  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const X0 = 20; // wider left margin, binding edge
  const Y0 = 10;
  const X1 = PW - 10;
  const Y1 = PH - 10;

  const INKC = [23, 28, 30];
  const RULEC = [190, 200, 200];
  const DIMC = [116, 128, 130];
  const TEALC = [37, 96, 87];
  const HOTC = [168, 82, 54];

  const HEAD = Y0 + 22;
  const TB = Y1 - 65;
  const ROW = 21;
  const LEGW = 68;
  const CSY = Y1 - 23;
  const GX = X0 + LEGW;

  doc.setProperties({
    title: `${SHEET.projectTitle} : ${SHEET.drawingNo} Rev ${SHEET.revision}`,
    subject: `${SHEET.client}, ${SHEET.location}`,
    author: SHEET.company,
    creator: SHEET.company,
    keywords: "multipurpose court, basketball, volleyball, FIVB, FIBA",
  });

  /* paper */
  doc.setFillColor(253, 253, 251);
  doc.rect(0, 0, PW, PH, "F");

  /* frame */
  doc.setDrawColor(...INKC);
  doc.setLineWidth(0.7);
  doc.rect(X0, Y0, X1 - X0, Y1 - Y0);

  /* ---------- header ---------------------------------------------- */
  doc.setLineWidth(0.35);
  doc.line(X0, HEAD, X1, HEAD);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...INKC);
  doc.text(T(SHEET.projectTitle.toUpperCase()), X0 + 5, Y0 + 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...DIMC);
  doc.text(T(`${SHEET.client}   ·   ${SHEET.location}`), X0 + 5, Y0 + 17.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...TEALC);
  doc.text(T(SHEET.company.toUpperCase()), X1 - 5, Y0 + 10, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...DIMC);
  doc.text(T(SHEET.companyRole), X1 - 5, Y0 + 14.8, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...INKC);
  doc.text(
    T(
      `DRG ${SHEET.drawingNo}    REV ${SHEET.revision}    ${SHEET.scaleNote.toUpperCase()}    ${DATE_STR}`,
    ),
    X1 - 5,
    Y0 + 19.5,
    { align: "right" },
  );

  /* ---------- the 3D view, fitted and centred --------------------- */
  const PAD = 4;
  const bw = X1 - X0 - PAD * 2;
  const bh = TB - HEAD - PAD * 2;
  const ar = shot.w / shot.h;
  let iw = bw;
  let ih = bw / ar;
  if (ih > bh) {
    ih = bh;
    iw = bh * ar;
  }
  const ix = X0 + (X1 - X0 - iw) / 2;
  const iy = HEAD + (TB - HEAD - ih) / 2;
  doc.addImage(shot.url, shot.fmt, ix, iy, iw, ih, "view3d", "FAST");
  doc.setDrawColor(...RULEC);
  doc.setLineWidth(0.25);
  doc.rect(ix, iy, iw, ih);

  /* ---------- title block ----------------------------------------- */
  doc.setDrawColor(...INKC);
  doc.setLineWidth(0.35);
  doc.line(X0, TB, X1, TB);
  doc.setDrawColor(...RULEC);
  doc.setLineWidth(0.2);
  doc.line(GX, TB, GX, Y1);

  /* layer legend, reflecting exactly what was on when you exported */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor(...DIMC);
  doc.text("LAYERS", X0 + 3, TB + 5);

  let ly = TB + 11;
  LAYERS.forEach((l) => {
    const on = !!lay[l.k];
    if (on) {
      doc.setFillColor(...HOTC);
      doc.rect(X0 + 3, ly - 2.2, 2.2, 2.2, "F");
    } else {
      doc.setDrawColor(...RULEC);
      doc.setLineWidth(0.2);
      doc.rect(X0 + 3, ly - 2.2, 2.2, 2.2);
    }
    doc.setFont("helvetica", on ? "bold" : "normal");
    doc.setFontSize(6);
    doc.setTextColor(...(on ? INKC : DIMC));
    doc.text(T(l.code), X0 + 7.5, ly);
    doc.setFont("helvetica", "normal");
    doc.text(T(l.name), X0 + 23, ly);
    ly += 6.4;
  });

  /* spec grid */
  const GW = X1 - GX;
  const CW = GW / 4;
  SPECS().forEach(([k, v], i) => {
    const c = i % 4;
    const r = Math.floor(i / 4);
    const x = GX + c * CW;
    const y = TB + r * ROW;
    doc.setDrawColor(...RULEC);
    doc.setLineWidth(0.2);
    doc.rect(x, y, CW, ROW);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(...DIMC);
    doc.text(T(k.toUpperCase()), x + 3, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...INKC);
    doc.text(doc.splitTextToSize(T(v), CW - 6), x + 3, y + 10.5);
  });

  /* ---------- prepared by band ------------------------------------ */
  doc.setFillColor(...INKC);
  doc.rect(GX, CSY, X1 - GX, Y1 - CSY, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor(142, 154, 154);
  doc.text("PREPARED BY", GX + 3, CSY + 6);

  doc.setFontSize(14);
  doc.setTextColor(246, 244, 238);
  doc.text(T(SHEET.company.toUpperCase()), GX + 3, CSY + 17);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor(142, 154, 154);
  doc.text("ISSUE", X1 - 3, CSY + 6, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(246, 244, 238);
  doc.text(
    T(
      `${SHEET.drawingNo}  ·  REV ${SHEET.revision}  ·  ${DATE_STR}  ·  ${view.toUpperCase()} / ${sun.toUpperCase()}`,
    ),
    X1 - 3,
    CSY + 16,
    { align: "right" },
  );
}

/* ------------------------------------------------------- download --- */
const dataURLToBlob = (u) => {
  const [head, b64] = u.split(",");
  const mime = (head.match(/:(.*?);/) || [, "application/octet-stream"])[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

/* A 4K PNG data URL runs to tens of megabytes and some browsers refuse to
   download a URL that long. Hand them a blob instead. */
const saveDataURL = (url, name) => {
  const blobURL = URL.createObjectURL(dataURLToBlob(url));
  const a = document.createElement("a");
  a.href = blobURL;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobURL), 5000);
};

const slug = (s) =>
  String(s)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
const stampNow = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

/* ================================================================== */
export default function MultipurposeCourt() {
  const mount = useRef(null);
  const R = useRef({});
  const [view, setView] = useState("corner");
  const [sun, setSun] = useState("midday");
  const [busy, setBusy] = useState("");
  const [lay, setLay] = useState(() =>
    Object.fromEntries(LAYERS.map((l) => [l.k, l.on])),
  );

  const toggle = (k) => setLay((p) => ({ ...p, [k]: !p[k] }));

  /* ---------------------------------------------------------- build */
  useEffect(() => {
    const el = mount.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 800);

    /* preserveDrawingBuffer keeps the frame readable after render, which is
       what makes toDataURL reliable instead of intermittently blank. */
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.display = "block";
    /* setSize is called with updateStyle=false, so pin the CSS size here or
       the canvas lays out at its buffer size and overflows the sheet on any
       display with devicePixelRatio > 1. It also means the export resize is
       invisible on screen. */
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    const aniso = renderer.capabilities.getMaxAnisotropy();

    /* sky */
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 32, 16),
      new THREE.MeshBasicMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    scene.add(sky);

    /* lights */
    const hemi = new THREE.HemisphereLight(0xbcd6e8, 0x4a5a3c, 0.65);
    scene.add(hemi);
    const sunL = new THREE.DirectionalLight(0xffffff, 2.4);
    sunL.castShadow = true;
    sunL.shadow.mapSize.set(2048, 2048);
    const sc = sunL.shadow.camera;
    sc.left = -22;
    sc.right = 22;
    sc.top = 18;
    sc.bottom = -18;
    sc.near = 1;
    sc.far = 90;
    sunL.shadow.bias = -0.0006;
    sunL.shadow.normalBias = 0.02;
    scene.add(sunL, sunL.target);

    /* ground */
    const gTex = grassTexture();
    gTex.anisotropy = aniso;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({ map: gTex, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    /* apron + slab */
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(AP_L, 0.09, AP_W),
      new THREE.MeshStandardMaterial({ color: 0x8f9694, roughness: 0.92 }),
    );
    apron.position.y = 0.045;
    apron.receiveShadow = true;
    scene.add(apron);

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(SLAB_L, 0.16, SLAB_W),
      new THREE.MeshStandardMaterial({ color: 0xb0aca2, roughness: 0.95 }),
    );
    slab.position.y = 0.08;
    slab.castShadow = true;
    slab.receiveShadow = true;
    scene.add(slab);

    const court = new THREE.Mesh(
      new THREE.PlaneGeometry(SLAB_L, SLAB_W),
      new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.02 }),
    );
    court.rotation.x = -Math.PI / 2;
    court.position.y = 0.1605;
    court.receiveShadow = true;
    scene.add(court);
    R.current.court = court;
    R.current.aniso = aniso;

    /* channel drain along the low side */
    const drain = new THREE.Mesh(
      new THREE.BoxGeometry(AP_L, 0.1, 0.28),
      new THREE.MeshStandardMaterial({
        color: 0x3c4446,
        roughness: 0.7,
        metalness: 0.3,
      }),
    );
    drain.position.set(0, 0.05, AP_W / 2 + 0.14);
    scene.add(drain);

    const steel = new THREE.MeshStandardMaterial({
      color: 0xd9dcda,
      roughness: 0.42,
      metalness: 0.75,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x2b3335,
      roughness: 0.6,
      metalness: 0.4,
    });

    /* ---------------- volleyball net (posts sit OFF the slab) ------ */
    const vbG = new THREE.Group();
    [-1, 1].forEach((s) => {
      const p = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.065, 2.62, 16),
        steel,
      );
      p.position.set(0, 1.31, s * 5.0);
      p.castShadow = true;
      vbG.add(p);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.19, 0.1, 16),
        dark,
      );
      base.position.set(0, 0.09, s * 5.0);
      vbG.add(base);
    });
    const netCv = tile((g, n) => {
      g.clearRect(0, 0, n, n);
      g.strokeStyle = "rgba(24,28,28,0.95)";
      g.lineWidth = 4;
      for (let i = 0; i <= n; i += n / 8) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, n);
        g.stroke();
        g.beginPath();
        g.moveTo(0, i);
        g.lineTo(n, i);
        g.stroke();
      }
    }, 64);
    const netTex = new THREE.CanvasTexture(netCv);
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    netTex.repeat.set(95, 10);
    netTex.anisotropy = aniso;
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(9.5, 1.0),
      new THREE.MeshStandardMaterial({
        map: netTex,
        transparent: true,
        alphaTest: 0.18,
        side: THREE.DoubleSide,
        roughness: 0.9,
      }),
    );
    net.rotation.y = Math.PI / 2;
    net.position.set(0, NET_Y - 0.5, 0);
    vbG.add(net);
    [1, -1].forEach((s) => {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.07, 9.5),
        new THREE.MeshStandardMaterial({ color: 0xf4f2ea, roughness: 0.8 }),
      );
      band.position.set(0, NET_Y - (s > 0 ? 0.035 : 0.965), 0);
      vbG.add(band);
    });
    [-1, 1].forEach((s) => {
      const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 1.8, 8),
        new THREE.MeshStandardMaterial({ color: 0xe4552f, roughness: 0.6 }),
      );
      ant.position.set(0, NET_Y - 0.1, s * 4.5);
      vbG.add(ant);
    });
    scene.add(vbG);
    R.current.vbG = vbG;

    /* ---------------- basketball goals ---------------------------- */
    const bbG = new THREE.Group();
    const bbTexCv = document.createElement("canvas");
    bbTexCv.width = 720;
    bbTexCv.height = 420;
    {
      const g = bbTexCv.getContext("2d");
      g.scale(2, 2);
      g.fillStyle = "#F7F7F4";
      g.fillRect(0, 0, 360, 210);
      g.strokeStyle = "#1D2B32";
      g.lineWidth = 8;
      g.strokeRect(10, 10, 340, 190);
      g.lineWidth = 7;
      g.strokeRect(133, 112, 94, 66);
    }
    const bbTex = new THREE.CanvasTexture(bbTexCv);
    bbTex.encoding = THREE.sRGBEncoding;
    bbTex.anisotropy = aniso;

    const hoopNetCv = tile((g, n) => {
      g.clearRect(0, 0, n, n);
      g.strokeStyle = "rgba(248,248,244,0.98)";
      g.lineWidth = 5;
      for (let i = -n; i <= n * 2; i += n / 6) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + n * 0.5, n);
        g.stroke();
        g.beginPath();
        g.moveTo(i, n);
        g.lineTo(i + n * 0.5, 0);
        g.stroke();
      }
    }, 64);
    const hoopNetTex = new THREE.CanvasTexture(hoopNetCv);
    hoopNetTex.wrapS = hoopNetTex.wrapT = THREE.RepeatWrapping;
    hoopNetTex.repeat.set(4, 1);

    [1, -1].forEach((s) => {
      const postX = s * (SLAB_L / 2 + 0.55);
      const boardX = s * (BX - 1.2 * S);
      const ringX = s * (BX - RING_OFF);

      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.11, 3.55, 16),
        steel,
      );
      post.position.set(postX, 1.775, 0);
      post.castShadow = true;
      bbG.add(post);

      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.12, 0.55),
        dark,
      );
      foot.position.set(postX, 0.06, 0);
      bbG.add(foot);

      const armLen = Math.abs(postX - boardX) - 0.03;
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, armLen, 12),
        steel,
      );
      arm.rotation.z = Math.PI / 2;
      arm.position.set((postX + boardX) / 2, 3.5, 0);
      arm.castShadow = true;
      bbG.add(arm);

      const brace = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 1.5, 10),
        steel,
      );
      brace.position.set(postX - s * 0.45, 2.95, 0);
      brace.rotation.z = (s * Math.PI) / 4;
      bbG.add(brace);

      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 1.05, 1.8),
        new THREE.MeshStandardMaterial({
          map: bbTex,
          roughness: 0.22,
          metalness: 0.05,
        }),
      );
      board.position.set(boardX + s * 0.025, 3.425, 0);
      board.castShadow = true;
      bbG.add(board);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.2255, 0.016, 10, 36),
        new THREE.MeshStandardMaterial({
          color: 0xe4552f,
          roughness: 0.35,
          metalness: 0.6,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(ringX, RIM_Y, 0);
      ring.castShadow = true;
      bbG.add(ring);

      const hn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2255, 0.15, 0.4, 20, 1, true),
        new THREE.MeshStandardMaterial({
          map: hoopNetTex,
          transparent: true,
          alphaTest: 0.25,
          side: THREE.DoubleSide,
          roughness: 0.95,
        }),
      );
      hn.position.set(ringX, RIM_Y - 0.2, 0);
      bbG.add(hn);
    });
    scene.add(bbG);
    R.current.bbG = bbG;

    /* ---------------- fence : layer A-FENC ------------------------- */
    const fenceG = new THREE.Group();
    const fx = AP_L / 2 + 0.3;
    const fz = AP_W / 2 + 0.3;
    const mTex = meshTexture();
    mTex.anisotropy = aniso;

    const run = (x1, z1, x2, z2, h) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const ang = Math.atan2(z2 - z1, x2 - x1);
      const t = mTex.clone();
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(len / 0.55, h / 0.55);
      t.anisotropy = aniso;
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(len, h),
        new THREE.MeshStandardMaterial({
          map: t,
          transparent: true,
          alphaTest: 0.22,
          side: THREE.DoubleSide,
          roughness: 0.75,
          metalness: 0.25,
          color: 0xa9b2b0,
        }),
      );
      panel.position.set((x1 + x2) / 2, h / 2, (z1 + z2) / 2);
      panel.rotation.y = -ang;
      fenceG.add(panel);

      const n = Math.max(2, Math.round(len / 3));
      for (let i = 0; i <= n; i++) {
        const p = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.05, h, 10),
          steel,
        );
        p.position.set(
          x1 + ((x2 - x1) * i) / n,
          h / 2,
          z1 + ((z2 - z1) * i) / n,
        );
        p.castShadow = true;
        fenceG.add(p);
      }
      [h - 0.06, h * 0.5, 0.12].forEach((y) => {
        const rail = new THREE.Mesh(
          new THREE.CylinderGeometry(0.026, 0.026, len, 8),
          steel,
        );
        rail.rotation.z = Math.PI / 2;
        rail.rotation.y = -ang;
        rail.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
        fenceG.add(rail);
      });
    };

    run(-fx, -fz, -fx, fz, 4.5);
    run(fx, -fz, fx, fz, 4.5);
    run(-fx, -fz, fx, -fz, 3.0);
    run(-fx, fz, -2.2, fz, 3.0);
    run(2.2, fz, fx, fz, 3.0);
    scene.add(fenceG);
    R.current.fenceG = fenceG;

    /* ---------------- school signboard : layer A-SIGN ---------------
       Was bolted to the south ball stop, which meant it vanished with the
       fence. It is now a freestanding board on its own pair of posts, set
       450 outside the fence line, so A-SIGN and A-FENC are independent in
       both directions: either can be on with the other off.            */
    const signG = new THREE.Group();
    {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, SIGN_H, SIGN_W),
        new THREE.MeshStandardMaterial({
          map: signTexture(aniso),
          roughness: 0.6,
        }),
      );
      panel.position.set(SIGN_X, SIGN_Y, 0);
      panel.castShadow = true;
      panel.receiveShadow = true;
      signG.add(panel);

      /* posts sit just behind the board so the face stays clean */
      const px = SIGN_X - 0.11;
      const pz = SIGN_W / 2 - 0.4;

      [-1, 1].forEach((s) => {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.085, SIGN_POST_H, 14),
          steel,
        );
        post.position.set(px, SIGN_POST_H / 2, s * pz);
        post.castShadow = true;
        signG.add(post);

        const foot = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.1, 0.42),
          dark,
        );
        foot.position.set(px, 0.05, s * pz);
        foot.receiveShadow = true;
        signG.add(foot);
      });

      /* head and sill rails */
      [SIGN_POST_H - 0.07, SIGN_Y - SIGN_H / 2 - 0.14].forEach((y) => {
        const rail = new THREE.Mesh(
          new THREE.CylinderGeometry(0.028, 0.028, SIGN_W - 0.2, 8),
          steel,
        );
        rail.rotation.x = Math.PI / 2;
        rail.position.set(px, y, 0);
        rail.castShadow = true;
        signG.add(rail);
      });
    }
    scene.add(signG);
    R.current.signG = signG;

    /* ---------------- floodlights ---------------------------------- */
    const lightG = new THREE.Group();
    const heads = [];
    [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ].forEach(([a, b]) => {
      const x = a * (AP_L / 2 + 0.9);
      const z = b * (AP_W / 2 + 0.9);
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.115, 8, 14),
        steel,
      );
      mast.position.set(x, 4, z);
      mast.castShadow = true;
      lightG.add(mast);
      const cross = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 1.2),
        dark,
      );
      cross.position.set(x, 7.95, z);
      lightG.add(cross);
      [-0.4, 0.4].forEach((o) => {
        const head = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.12, 0.34),
          new THREE.MeshStandardMaterial({
            color: 0x2b3335,
            roughness: 0.5,
            metalness: 0.5,
            emissive: 0x000000,
          }),
        );
        head.position.set(x - a * 0.16, 7.82, z + o);
        head.rotation.z = a * 0.5;
        lightG.add(head);
        heads.push(head);
      });
      const pl = new THREE.PointLight(0xfff0d2, 0, 30, 2);
      pl.position.set(x - a * 1.2, 7.5, z);
      lightG.add(pl);
      heads.push(pl);
    });
    scene.add(lightG);
    R.current.lightG = lightG;
    R.current.heads = heads;

    /* ---------------- site context --------------------------------- */
    const siteG = new THREE.Group();
    const conc = new THREE.MeshStandardMaterial({
      color: 0xa8a49a,
      roughness: 0.95,
    });
    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(11, 0.42, 0.85), conc);
      step.position.set(0, 0.21 + i * 0.42, -(fz + 1.0 + i * 0.85));
      step.castShadow = true;
      step.receiveShadow = true;
      siteG.add(step);
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(11, 0.06, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x2f6c62, roughness: 0.7 }),
      );
      seat.position.set(0, 0.45 + i * 0.42, -(fz + 1.0 + i * 0.85));
      siteG.add(seat);
    }
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(11.4, 0.1, 3.4),
      new THREE.MeshStandardMaterial({
        color: 0xdcdfd8,
        roughness: 0.6,
        metalness: 0.2,
      }),
    );
    canopy.position.set(0, 3.1, -(fz + 2.0));
    canopy.rotation.x = -0.09;
    canopy.castShadow = true;
    siteG.add(canopy);
    [-5.2, 0, 5.2].forEach((x) => {
      const c = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 3.1, 10),
        steel,
      );
      c.position.set(x, 1.55, -(fz + 3.5));
      c.castShadow = true;
      siteG.add(c);
    });

    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const trees = [
      [-16, -11],
      [-13, 12],
      [16, 11],
      [14, -13],
      [20, 3],
      [-20, 2],
      [7, 15],
      [-6, -15],
    ];
    trees.forEach(([x, z]) => {
      const t = new THREE.Group();
      const h = 3.4 + rnd() * 2.2;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.17, h, 8),
        new THREE.MeshStandardMaterial({ color: 0x5c4a36, roughness: 1 }),
      );
      trunk.position.y = h / 2;
      trunk.castShadow = true;
      t.add(trunk);
      for (let i = 0; i < 3; i++) {
        const r = 1.1 + rnd() * 0.7;
        const b = new THREE.Mesh(
          new THREE.IcosahedronGeometry(r, 0),
          new THREE.MeshStandardMaterial({
            color: [0x3f5c33, 0x4a6b3b, 0x557844][i],
            roughness: 1,
            flatShading: true,
          }),
        );
        b.position.set(
          (rnd() - 0.5) * 1.3,
          h - 0.3 + i * 0.75,
          (rnd() - 0.5) * 1.3,
        );
        b.castShadow = true;
        t.add(b);
      }
      t.position.set(x, 0, z);
      t.rotation.y = rnd() * 6.28;
      siteG.add(t);
    });
    scene.add(siteG);
    R.current.siteG = siteG;

    /* ---------------- annotation layer ----------------------------- */
    const dimG = new THREE.Group();
    const INK = 0x101a1d;
    const oy = 0.03;
    const dz = AP_W / 2 + 1.6;
    dimG.add(
      poly(
        [
          [-SLAB_L / 2, oy, dz],
          [SLAB_L / 2, oy, dz],
        ],
        INK,
      ),
    );
    [-SLAB_L / 2, SLAB_L / 2].forEach((x) => {
      dimG.add(
        poly(
          [
            [x, oy, SLAB_W / 2],
            [x, oy, dz + 0.35],
          ],
          INK,
          0.5,
        ),
      );
      dimG.add(
        poly(
          [
            [x - 0.18, oy, dz - 0.18],
            [x + 0.18, oy, dz + 0.18],
          ],
          INK,
        ),
      );
    });
    const dxl = label("19.000", 0.62);
    dxl.position.set(0, 0.5, dz);
    dimG.add(dxl);

    const dx2 = -(SLAB_L / 2) - 1.6;
    dimG.add(
      poly(
        [
          [dx2, oy, -SLAB_W / 2],
          [dx2, oy, SLAB_W / 2],
        ],
        INK,
      ),
    );
    [-SLAB_W / 2, SLAB_W / 2].forEach((z) => {
      dimG.add(
        poly(
          [
            [-SLAB_L / 2, oy, z],
            [dx2 - 0.35, oy, z],
          ],
          INK,
          0.5,
        ),
      );
      dimG.add(
        poly(
          [
            [dx2 - 0.18, oy, z - 0.18],
            [dx2 + 0.18, oy, z + 0.18],
          ],
          INK,
        ),
      );
    });
    const dzl = label("9.000", 0.62);
    dzl.position.set(dx2, 0.5, 0);
    dimG.add(dzl);

    const n1 = label("NET 2.240", 0.42);
    n1.position.set(0, NET_Y + 0.55, 4.5);
    dimG.add(n1);
    const n2 = label("RIM 3.050", 0.42, "#E4552F");
    n2.position.set(BX - RING_OFF, RIM_Y + 0.75, 0);
    dimG.add(n2);
    const n3 = label("VB 18.000 x 9.000 FIVB", 0.42, "#F2EFE6");
    n3.position.set(-5.5, 0.9, -2.2);
    dimG.add(n3);
    const n4 = label("BB 16.800 x 9.000  FIBA x 0.60", 0.42);
    n4.position.set(5.2, 0.9, 2.4);
    dimG.add(n4);

    /* north point : long axis set out north / south */
    const nCv = document.createElement("canvas");
    nCv.width = 256;
    nCv.height = 300;
    {
      const g = nCv.getContext("2d");
      g.clearRect(0, 0, 256, 300);
      g.fillStyle = "rgba(244,244,238,0.72)";
      g.beginPath();
      g.arc(128, 180, 86, 0, 6.29);
      g.fill();
      g.strokeStyle = "#101A1D";
      g.lineWidth = 4;
      g.beginPath();
      g.arc(128, 180, 76, 0, 6.29);
      g.stroke();
      g.fillStyle = "#101A1D";
      g.beginPath();
      g.moveTo(128, 114);
      g.lineTo(155, 246);
      g.lineTo(128, 219);
      g.closePath();
      g.fill();
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(128, 114);
      g.lineTo(101, 246);
      g.lineTo(128, 219);
      g.closePath();
      g.stroke();
      g.font = "800 58px ui-monospace, Menlo, monospace";
      g.textAlign = "center";
      g.fillText("N", 128, 76);
    }
    const nTex = new THREE.CanvasTexture(nCv);
    nTex.encoding = THREE.sRGBEncoding;
    const north = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 2.34),
      new THREE.MeshBasicMaterial({
        map: nTex,
        transparent: true,
        depthTest: false,
      }),
    );
    north.rotation.x = -Math.PI / 2;
    north.rotation.z = -Math.PI / 2;
    north.position.set(-13.5, 0.04, -7.2);
    north.renderOrder = 998;
    dimG.add(north);
    scene.add(dimG);
    R.current.dimG = dimG;

    /* ---------------- recommended free zone ------------------------ */
    const freeG = new THREE.Group();
    const fzPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(FZ_L, FZ_W),
      new THREE.MeshBasicMaterial({
        color: 0xf5c453,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
    );
    fzPlane.rotation.x = -Math.PI / 2;
    fzPlane.position.y = 0.015;
    freeG.add(fzPlane);
    const fzRing = [
      [-FZ_L / 2, 0.05, -FZ_W / 2],
      [FZ_L / 2, 0.05, -FZ_W / 2],
      [FZ_L / 2, 0.05, FZ_W / 2],
      [-FZ_L / 2, 0.05, FZ_W / 2],
      [-FZ_L / 2, 0.05, -FZ_W / 2],
    ];
    const dl = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(fzRing.map(V3)),
      new THREE.LineDashedMaterial({
        color: 0xf5c453,
        dashSize: 0.45,
        gapSize: 0.3,
        depthTest: false,
      }),
    );
    dl.computeLineDistances();
    freeG.add(dl);
    const fl = label(
      "RECOMMENDED 24.000 x 15.000  /  FIVB 3.000 FREE ZONE",
      0.6,
    );
    fl.position.set(0, 1.3, -FZ_W / 2);
    freeG.add(fl);
    scene.add(freeG);
    R.current.freeG = freeG;

    /* ---------------- camera + orbit ------------------------------- */
    const cam = { r: 24, th: -0.95, ph: 1.02, tx: 0, ty: 1.2, tz: 0 };
    const goal = { ...cam };
    R.current.goal = goal;
    const apply = () => {
      const sp = Math.sin(cam.ph),
        cp = Math.cos(cam.ph);
      camera.position.set(
        cam.tx + cam.r * sp * Math.sin(cam.th),
        cam.ty + cam.r * cp,
        cam.tz + cam.r * sp * Math.cos(cam.th),
      );
      camera.lookAt(cam.tx, cam.ty, cam.tz);
    };

    const ptrs = new Map();
    let last = null,
      pinch = 0;
    const dn = (e) => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      last = { x: e.clientX, y: e.clientY };
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const mv = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) goal.r = THREE.MathUtils.clamp(goal.r * (pinch / d), 7, 80);
        pinch = d;
        return;
      }
      if (!last) return;
      goal.th -= (e.clientX - last.x) * 0.005;
      goal.ph = THREE.MathUtils.clamp(
        goal.ph - (e.clientY - last.y) * 0.004,
        0.045,
        1.51,
      );
      last = { x: e.clientX, y: e.clientY };
    };
    const up = (e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = 0;
      if (!ptrs.size) last = null;
    };
    const wh = (e) => {
      e.preventDefault();
      goal.r = THREE.MathUtils.clamp(goal.r * (1 + e.deltaY * 0.0012), 7, 80);
    };
    const cv = renderer.domElement;
    cv.addEventListener("pointerdown", dn);
    cv.addEventListener("pointermove", mv);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", wh, { passive: false });

    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const L = THREE.MathUtils.lerp;
      cam.r = L(cam.r, goal.r, 0.09);
      cam.ph = L(cam.ph, goal.ph, 0.09);
      cam.ty = L(cam.ty, goal.ty, 0.09);
      let d = goal.th - cam.th;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      cam.th += d * 0.09;
      apply();
      renderer.render(scene, camera);
    };
    loop();

    R.current.scene = scene;
    R.current.camera = camera;
    R.current.sky = sky;
    R.current.hemi = hemi;
    R.current.sunL = sunL;
    R.current.renderer = renderer;
    R.current.mount = el;

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener("pointerdown", dn);
      cv.removeEventListener("pointermove", mv);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
      cv.removeEventListener("wheel", wh);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material)
          [].concat(o.material).forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
      });
      renderer.dispose();
      if (renderer.domElement.parentNode)
        renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, []);

  /* markings */
  useEffect(() => {
    const c = R.current.court;
    if (!c) return;
    if (c.material.map) c.material.map.dispose();
    const t = buildCourtTexture(lay.vb, lay.bb);
    t.anisotropy = R.current.aniso || 1;
    c.material.map = t;
    c.material.needsUpdate = true;
  }, [lay.vb, lay.bb]);

  /* layers */
  useEffect(() => {
    const r = R.current;
    if (!r.vbG) return;
    r.vbG.visible = lay.vb;
    r.bbG.visible = lay.bb;
    r.fenceG.visible = lay.fence;
    r.signG.visible = lay.sign;
    r.lightG.visible = lay.lights;
    r.siteG.visible = lay.site;
    r.dimG.visible = lay.dims;
    r.freeG.visible = lay.free;
  }, [lay]);

  /* views */
  useEffect(() => {
    const g = R.current.goal;
    if (!g) return;
    const P = {
      plan: { r: 23, th: 0, ph: 0.055, ty: 0 },
      aerial: { r: 30, th: -0.72, ph: 0.62, ty: 0.6 },
      corner: { r: 24, th: -0.95, ph: 1.02, ty: 1.2 },
      baseline: { r: 18.5, th: Math.PI / 2, ph: 1.3, ty: 1.6 },
    }[view];
    Object.assign(g, P);
  }, [view]);

  /* sun */
  useEffect(() => {
    const r = R.current;
    if (!r.sunL) return;
    const P = {
      morning: {
        p: [3, 8, 24],
        i: 2.0,
        c: 0xffe9c4,
        h: 0.6,
        hc: 0xbcd6e8,
        sky: ["#4C86BE", "#AECBE0", "#E6E2D2"],
        e: 1.05,
      },
      midday: {
        p: [2.5, 27, 5],
        i: 2.7,
        c: 0xffffff,
        h: 0.75,
        hc: 0xc8dcec,
        sky: ["#2F6FAE", "#9DC3DE", "#E9EDE6"],
        e: 1.02,
      },
      evening: {
        p: [-4, 6.5, -22],
        i: 1.9,
        c: 0xffb469,
        h: 0.45,
        hc: 0xd8b48c,
        sky: ["#2E4C74", "#C9805A", "#F0C489"],
        e: 1.12,
      },
      floodlit: {
        p: [-4, 9, -24],
        i: 0.16,
        c: 0x8fa8c8,
        h: 0.22,
        hc: 0x40597a,
        sky: ["#0C1526", "#1B2E4A", "#33465E"],
        e: 1.25,
      },
    }[sun];
    r.sunL.position.set(...P.p);
    r.sunL.target.position.set(0, 0, 0);
    r.sunL.target.updateMatrixWorld();
    r.sunL.intensity = P.i;
    r.sunL.color.setHex(P.c);
    r.hemi.intensity = P.h;
    r.hemi.color.setHex(P.hc);
    r.renderer.toneMappingExposure = P.e;
    if (r.sky.material.map) r.sky.material.map.dispose();
    r.sky.material.map = skyTexture(...P.sky);
    r.sky.material.needsUpdate = true;
    (r.heads || []).forEach((h) => {
      if (h.isPointLight) h.intensity = sun === "floodlit" ? 4.2 : 0;
      else h.material.emissive.setHex(sun === "floodlit" ? 0xfff2d6 : 0x000000);
    });
  }, [sun]);

  /* -------------------------------------------------------- capture
     Blow the drawing buffer up, render one frame, read it, put everything
     back. All synchronous, so the animation loop never sees the big size,
     and the canvas CSS size is pinned at 100% so nothing moves on screen. */
  const captureHD = (longEdge, mime, quality) => {
    const r = R.current;
    const el = r.mount;
    const { renderer, scene, camera, sunL } = r;
    if (!renderer || !el) throw new Error("The view is not ready yet.");

    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    const cap = Math.min(renderer.capabilities.maxTextureSize || 4096, 8192);
    const s = Math.max(
      1,
      Math.min(longEdge / Math.max(w, h), cap / Math.max(w, h)),
    );
    const ow = Math.round(w * s);
    const oh = Math.round(h * s);

    const prevDpr = renderer.getPixelRatio();
    const prevSM = sunL.shadow.mapSize.x;
    const bigSM = Math.min(4096, cap);

    /* sharper shadows for the print, then straight back down */
    if (bigSM > prevSM) {
      if (sunL.shadow.map) {
        sunL.shadow.map.dispose();
        sunL.shadow.map = null;
      }
      sunL.shadow.mapSize.set(bigSM, bigSM);
    }

    renderer.setPixelRatio(1);
    renderer.setSize(ow, oh, false);
    camera.aspect = ow / oh;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL(mime, quality);

    if (bigSM > prevSM) {
      if (sunL.shadow.map) {
        sunL.shadow.map.dispose();
        sunL.shadow.map = null;
      }
      sunL.shadow.mapSize.set(prevSM, prevSM);
    }
    renderer.setPixelRatio(prevDpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    return { url, w: ow, h: oh, fmt: mime === "image/png" ? "PNG" : "JPEG" };
  };

  const fileBase = () =>
    `${slug(SHEET.client)}_${slug(SHEET.drawingNo)}_Rev${slug(SHEET.revision)}_${view}-${sun}_${stampNow()}`;

  const runExport = async (kind) => {
    if (busy) return;
    setBusy(kind);
    /* let the button repaint before the main thread goes away */
    await new Promise((r) => setTimeout(r, 60));
    try {
      if (kind === "png") {
        const shot = captureHD(SHEET.export.pngLongEdge, "image/png");
        saveDataURL(shot.url, `${fileBase()}.png`);
      } else {
        /* JPEG for the sheet: jsPDF embeds it as DCTDecode with no re-encode,
           so the file stays small enough to email and the render stays clean */
        const shot = captureHD(
          SHEET.export.pdfLongEdge,
          "image/jpeg",
          SHEET.export.pdfJpegQuality,
        );
        const doc = new jsPDF({
          orientation: "landscape",
          unit: "mm",
          format: SHEET.export.pdfFormat,
          compress: true,
        });
        drawSheet(doc, shot, { view, sun, lay });
        doc.save(`${fileBase()}.pdf`);
      }
    } catch (e) {
      console.error(e);
      window.alert(`Export failed: ${e && e.message ? e.message : e}`);
    } finally {
      setBusy("");
    }
  };

  /* ------------------------------------------------------------- UI */
  const Layer = ({ k, code, name }) => (
    <button
      onClick={() => toggle(k)}
      className="flex w-full items-center gap-2 py-[3px] text-left"
    >
      <span
        className="h-[9px] w-[9px] shrink-0 border"
        style={{
          borderColor: lay[k] ? UI.hot : "rgba(198,205,205,0.4)",
          background: lay[k] ? UI.hot : "transparent",
        }}
      />
      <span
        className="w-[52px] shrink-0 tracking-[0.09em]"
        style={{ color: lay[k] ? UI.hot : UI.dim }}
      >
        {code}
      </span>
      <span
        className="truncate tracking-[0.05em]"
        style={{ color: lay[k] ? UI.text : UI.dim }}
      >
        {name}
      </span>
    </button>
  );

  const Chip = ({ on, onClick, children }) => (
    <button
      onClick={onClick}
      className="border px-2 py-[5px] tracking-[0.11em] transition-colors"
      style={{
        borderColor: on ? UI.hot : UI.rule,
        color: on ? UI.ink : UI.text,
        background: on ? UI.hot : "transparent",
      }}
    >
      {children}
    </button>
  );

  const F = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

  return (
    <div
      className="flex min-h-screen w-full justify-center p-3 sm:p-6"
      style={{ background: UI.ink, fontFamily: F }}
    >
      <div
        className="flex w-full max-w-6xl flex-col border"
        style={{ borderColor: UI.rule }}
      >
        {/* sheet head */}
        <div
          className="flex items-baseline justify-between gap-3 border-b px-3 py-2"
          style={{ borderColor: UI.rule }}
        >
          <div className="min-w-0">
            <div
              className="truncate text-[13px] font-extrabold uppercase leading-none tracking-[0.14em] sm:text-[15px]"
              style={{
                color: "#F2F5F4",
                fontFamily: "ui-sans-serif, Helvetica, Arial, sans-serif",
              }}
            >
              {SHEET.projectTitle}
            </div>
            <div
              className="mt-1 truncate text-[9px] uppercase tracking-[0.22em]"
              style={{ color: UI.dim }}
            >
              {SHEET.client} &nbsp;·&nbsp; {SHEET.location}
            </div>
          </div>
          <div
            className="hidden shrink-0 text-right text-[9px] uppercase leading-tight tracking-[0.16em] sm:block"
            style={{ color: UI.dim }}
          >
            <div
              className="text-[10px] font-extrabold"
              style={{ color: "#F2F5F4" }}
            >
              {SHEET.company}
            </div>
            <div style={{ color: UI.teal }}>19.000 × 9.000 m</div>
            <div>
              Drawing {SHEET.drawingNo} &nbsp;/&nbsp; Rev {SHEET.revision}
            </div>
          </div>
        </div>

        {/* viewport */}
        <div
          className="relative w-full overflow-hidden"
          style={{ height: "clamp(340px, 62vh, 620px)" }}
        >
          <div ref={mount} className="absolute inset-0" />

          {/* layer panel */}
          <div
            className="absolute left-2 top-2 w-[176px] border p-2 text-[9px] uppercase backdrop-blur-sm sm:left-3 sm:top-3"
            style={{ borderColor: UI.rule, background: "rgba(16,21,23,0.82)" }}
          >
            <div
              className="mb-1 border-b pb-1 tracking-[0.2em]"
              style={{ borderColor: UI.rule, color: UI.dim }}
            >
              Layers
            </div>
            {LAYERS.map((l) => (
              <React.Fragment key={l.k}>
                {l.rule && (
                  <div
                    className="my-1 border-t pt-1"
                    style={{ borderColor: UI.rule }}
                  />
                )}
                <Layer k={l.k} code={l.code} name={l.name} />
              </React.Fragment>
            ))}
          </div>

          {/* view + sun */}
          <div className="absolute right-2 top-2 flex flex-col items-end gap-1 text-[8px] uppercase sm:right-3 sm:top-3">
            <div className="flex gap-1">
              {["plan", "aerial", "corner", "baseline"].map((v) => (
                <Chip key={v} on={view === v} onClick={() => setView(v)}>
                  {v}
                </Chip>
              ))}
            </div>
            <div className="flex gap-1">
              {["morning", "midday", "evening", "floodlit"].map((s) => (
                <Chip key={s} on={sun === s} onClick={() => setSun(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </div>

          <div
            className="pointer-events-none absolute bottom-2 left-2 text-[8px] uppercase tracking-[0.16em] sm:left-3"
            style={{ color: UI.dim }}
          >
            Drag to orbit &nbsp;·&nbsp; scroll or pinch to zoom
          </div>

          {/* export : captures exactly the view and lighting on screen */}
          <div className="absolute bottom-2 right-2 flex gap-1 text-[8px] uppercase sm:bottom-3 sm:right-3">
            <button
              onClick={() => runExport("png")}
              disabled={!!busy}
              className="border px-2 py-[5px] tracking-[0.11em] transition-colors disabled:opacity-40"
              style={{
                borderColor: UI.rule,
                color: UI.text,
                background: "rgba(16,21,23,0.86)",
              }}
            >
              {busy === "png" ? "Rendering..." : "HD PNG"}
            </button>
            <button
              onClick={() => runExport("pdf")}
              disabled={!!busy}
              className="border px-2 py-[5px] font-bold tracking-[0.11em] transition-colors disabled:opacity-40"
              style={{ borderColor: UI.hot, color: UI.ink, background: UI.hot }}
            >
              {busy === "pdf" ? "Building..." : "PDF sheet"}
            </button>
          </div>
        </div>

        {/* title block */}
        <div
          className="grid grid-cols-2 border-t text-[8px] uppercase sm:grid-cols-4"
          style={{ borderColor: UI.rule }}
        >
          {SPECS().map(([k, v]) => (
            <div
              key={k}
              className="border-b border-r px-2 py-[6px]"
              style={{ borderColor: UI.rule }}
            >
              <div className="tracking-[0.2em]" style={{ color: UI.dim }}>
                {k}
              </div>
              <div
                className="mt-[2px] normal-case tracking-[0.03em]"
                style={{ color: UI.text }}
              >
                {v}
              </div>
            </div>
          ))}
        </div>

        {/* prepared by */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[8px] uppercase tracking-[0.16em]"
          style={{ color: UI.dim }}
        >
          <div>
            Prepared by{" "}
            <span className="font-extrabold" style={{ color: UI.hot }}>
              {SHEET.company}
            </span>
          </div>
          <div>
            {SHEET.scaleNote} &nbsp;·&nbsp; {DATE_STR} &nbsp;·&nbsp; {view} /{" "}
            {sun}
          </div>
        </div>
      </div>
    </div>
  );
}
