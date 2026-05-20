/**
 * SYNCERA — Designer-Grade Word Document Generator
 * Professional design system with consistent typography, chapter dividers,
 * figure numbering, hero stats, refined whitespace, and proper TOC.
 *
 * Run: NODE_PATH="path/to/global/node_modules" node generate-word-docs.js
 */
'use strict'

const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  Header, Footer, AlignmentType, LevelFormat, TabStopType, TabStopPosition,
  HeadingLevel, BorderStyle, WidthType, ShadingType, VerticalAlign, PageNumber,
  PageBreak, PositionalTab, PositionalTabAlignment, PositionalTabRelativeTo,
  PositionalTabLeader,
} = require('docx')

// ════════════════════════════════════════════════════════════════════════════
// ASSETS
// ════════════════════════════════════════════════════════════════════════════
const ICON_PATH = path.join(__dirname, 'public', 'icon.png')
const SHOTS_DIR = path.join(__dirname, 'docs', 'screenshots')
const ICON_BUF  = fs.existsSync(ICON_PATH) ? fs.readFileSync(ICON_PATH) : null

const shot = (name) => {
  const p = path.join(SHOTS_DIR, `syncera-${name}.png`)
  return fs.existsSync(p) ? fs.readFileSync(p) : null
}
const SHOTS = {
  chats: shot('chats'), quicksend: shot('quicksend'), dashboard: shot('dashboard'),
  pipeline: shot('pipeline'), broadcast: shot('broadcast'), templates: shot('templates'),
  orders: shot('orders'), reminders: shot('reminders'), analytics: shot('analytics'),
  reports: shot('reports'), insights: shot('insights'),
}

// ════════════════════════════════════════════════════════════════════════════
// DESIGN SYSTEM
// ════════════════════════════════════════════════════════════════════════════
const C = {
  // Brand
  green:    '25D366',   // WhatsApp green
  greenDk:  '128C7E',
  greenLt:  'E8FFF1',
  // Neutral
  ink:      '0D1117',
  charcoal: '24292F',
  slate:    '57606A',
  muted:    '8B949E',
  border:   'D0D7DE',
  paper:    'F6F8FA',
  white:    'FFFFFF',
  // Accent (for chapter color coding)
  blue:     '0969DA',
  blueLt:   'DDF4FF',
  purple:   '8250DF',
  purpleLt: 'FBEFFF',
  orange:   'BC4C00',
  orangeLt: 'FFF1E5',
  red:      'CF222E',
  redLt:    'FFEBE9',
  yellow:   '9A6700',
}

// Page geometry (US Letter, 0.75" margins)
const PW    = 12240
const PH    = 15840
const MG    = 1080
const CW    = PW - MG * 2   // 10080 = 7"

// Typography scale (sizes in half-points; 22 = 11pt)
const T = {
  display: 96,   // 48pt — cover hero
  h1:      36,   // 18pt — chapter title
  h2:      28,   // 14pt — section
  h3:      24,   // 12pt — subsection
  body:    22,   // 11pt — paragraph
  small:   20,   // 10pt — captions
  micro:   18,   // 9pt  — footer
  tiny:    16,   // 8pt
  hero:    72,   // 36pt — pull stat
}

// Font stack
const FONT = 'Calibri'

// ════════════════════════════════════════════════════════════════════════════
// FIGURE COUNTER (global across doc)
// ════════════════════════════════════════════════════════════════════════════
let figCounter = 0
function nextFig() { return ++figCounter }
function resetFig() { figCounter = 0 }

// ════════════════════════════════════════════════════════════════════════════
// BUILDERS — primitives
// ════════════════════════════════════════════════════════════════════════════

function txt(text, opts = {}) {
  return new TextRun({ text, font: FONT, size: T.body, ...opts })
}

function P(runs, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, ...opts.spacing },
    children: Array.isArray(runs) ? runs : [runs],
    ...opts,
  })
}

function p(text, opts = {}) {
  return P([txt(text, opts.run || {})], opts)
}

function pCenter(text, opts = {}) {
  return P([txt(text, opts.run || {})], { alignment: AlignmentType.CENTER, ...opts })
}

function H1(text, color = C.ink) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 200 },
    children: [txt(text, { bold: true, size: T.h1, color })],
  })
}

function H2(text, color = C.greenDk) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140 },
    children: [txt(text, { bold: true, size: T.h2, color })],
  })
}

function H3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [txt(text, { bold: true, size: T.h3, color: C.ink })],
  })
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 60 },
    children: [txt(text)],
  })
}

function numbered(text) {
  return new Paragraph({
    numbering: { reference: 'numbers', level: 0 },
    spacing: { after: 60 },
    children: [txt(text)],
  })
}

function pageBreak() { return new Paragraph({ children: [new PageBreak()] }) }
function spacer(h = 200) { return new Paragraph({ spacing: { after: h }, children: [] }) }

function divider(color = C.green, size = 18) {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { color, space: 1, style: BorderStyle.SINGLE, size } },
    children: [],
  })
}

function thinRule(color = C.border) {
  return new Paragraph({
    spacing: { before: 100, after: 100 },
    border: { bottom: { color, space: 1, style: BorderStyle.SINGLE, size: 4 } },
    children: [],
  })
}

// ════════════════════════════════════════════════════════════════════════════
// BUILDERS — composed
// ════════════════════════════════════════════════════════════════════════════

function logo(sizePx = 64) {
  if (!ICON_BUF) return P([])
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new ImageRun({
      type: 'png', data: ICON_BUF,
      transformation: { width: sizePx, height: sizePx },
      altText: { title: 'SYNCERA', description: 'SYNCERA logo', name: 'logo' },
    })],
  })
}

// Eyebrow label: small, bold, uppercase, letter-spaced
function eyebrow(text, color = C.greenDk) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [txt(text.toUpperCase(), {
      bold: true, size: T.small, color, characterSpacing: 80,
    })],
  })
}

// Cover page — refined design with brand bar + hero + version pill
function coverPage(title, subtitle, badge = 'OFFICIAL DOCUMENTATION', accent = C.green) {
  return [
    // Top brand bar (colored block via table)
    new Table({
      width: { size: CW, type: WidthType.DXA },
      columnWidths: [CW],
      rows: [new TableRow({
        children: [new TableCell({
          borders: noBorders(),
          width: { size: CW, type: WidthType.DXA },
          shading: { fill: accent, type: ShadingType.CLEAR },
          margins: { top: 40, bottom: 40, left: 0, right: 0 },
          children: [pCenter('', { spacing: { after: 0 } })],
        })],
      })],
    }),
    spacer(1600),
    logo(140),
    pCenter(title, { run: { bold: true, size: T.display, color: C.ink }, spacing: { after: 100 } }),
    eyebrow(subtitle, accent),
    spacer(600),
    versionPill(badge, accent),
    spacer(3200),
    // Bottom strip
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      border: { top: { color: accent, space: 6, style: BorderStyle.SINGLE, size: 12 } },
      children: [txt(' ', { size: T.micro })],
    }),
    pCenter('DARKSEA NETWORK SDN BHD', { run: { bold: true, size: T.small, color: C.ink, characterSpacing: 60 } }),
    pCenter('Kuala Lumpur, Malaysia  ·  contact@example.com', { run: { size: T.small, color: C.slate } }),
    pageBreak(),
  ]
}

function versionPill(text, color = C.green) {
  const border = { style: BorderStyle.SINGLE, size: 6, color }
  return new Table({
    width: { size: 3000, type: WidthType.DXA },
    columnWidths: [3000],
    alignment: AlignmentType.CENTER,
    rows: [new TableRow({
      children: [new TableCell({
        borders: { top: border, bottom: border, left: border, right: border },
        width: { size: 3000, type: WidthType.DXA },
        shading: { fill: C.white, type: ShadingType.CLEAR },
        margins: { top: 120, bottom: 120, left: 280, right: 280 },
        children: [pCenter(text, { run: { bold: true, size: T.small, color, characterSpacing: 80 }, spacing: { after: 0 } })],
      })],
    })],
  })
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  return { top: none, bottom: none, left: none, right: none }
}

// Chapter divider page — full-page colored panel with chapter number
function chapterDivider(num, title, subtitle = '', accent = C.green) {
  const numStr = String(num).padStart(2, '0')
  return [
    spacer(2800),
    pCenter(`CHAPTER  ${numStr}`, { run: { bold: true, size: T.small, color: accent, characterSpacing: 120 } }),
    spacer(200),
    // Big chapter number
    pCenter(numStr, { run: { bold: true, size: 200, color: accent }, spacing: { after: 100 } }),
    spacer(200),
    pCenter(title, { run: { bold: true, size: 52, color: C.ink }, spacing: { after: 200 } }),
    subtitle ? pCenter(subtitle, { run: { size: T.h3, color: C.slate, italics: true } }) : spacer(0),
    spacer(800),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { bottom: { color: accent, space: 6, style: BorderStyle.SINGLE, size: 18 } },
      children: [txt(' ', { size: T.tiny })],
    }),
    spacer(120),
    pCenter('SYNCERA · AI MESSENGER · BUSINESS OS', { run: { size: T.tiny, color: C.muted, characterSpacing: 80 } }),
    pageBreak(),
  ]
}

// Table of Contents (manual — auto TOC requires Word to update)
function tocEntry(num, title, page, accent = C.green) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [
      txt(num, { bold: true, size: T.body, color: accent }),
      txt('   '),
      txt(title, { size: T.body, color: C.ink }),
      new TextRun({
        font: FONT, size: T.body,
        children: [
          new PositionalTab({
            alignment: PositionalTabAlignment.RIGHT,
            relativeTo: PositionalTabRelativeTo.MARGIN,
            leader: PositionalTabLeader.DOT,
          }),
        ],
      }),
      txt(`  ${page}`, { size: T.body, color: C.slate, bold: true }),
    ],
  })
}

function tocPage(title, entries) {
  return [
    spacer(400),
    eyebrow('Table of Contents'),
    pCenter(title, { run: { bold: true, size: 44, color: C.ink }, spacing: { after: 200 } }),
    thinRule(C.green),
    spacer(200),
    ...entries.map(e => tocEntry(e.num, e.title, e.page, e.accent)),
    spacer(200),
    thinRule(C.green),
    pageBreak(),
  ]
}

// Embed screenshot with figure number + caption
function figure(name, caption, sectionNum = 1) {
  const data = SHOTS[name]
  if (!data) return p(`[Missing screenshot: ${name}]`, { run: { italics: true, color: C.red } })
  const figNum = nextFig()
  const widthPx = 6.5 * 96  // 6.5" wide
  const heightPx = Math.round(widthPx * (900 / 1440))
  const border = { color: C.border, space: 1, style: BorderStyle.SINGLE, size: 4 }
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 80 },
      border: { top: border, bottom: border, left: border, right: border },
      children: [new ImageRun({
        type: 'png', data,
        transformation: { width: widthPx, height: heightPx },
        altText: { title: `Figure ${figNum}`, description: caption, name: name },
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        txt(`Figure ${figNum}.  `, { bold: true, size: T.small, color: C.greenDk }),
        txt(caption, { italics: true, size: T.small, color: C.slate }),
      ],
    }),
  ]
}

// Hero stat callout — big number + label, for impact pages
function heroStat(value, label, sub = '', color = C.green) {
  const border = { style: BorderStyle.SINGLE, size: 8, color }
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [CW],
    rows: [new TableRow({
      children: [new TableCell({
        borders: { top: border, bottom: border, left: border, right: border },
        width: { size: CW, type: WidthType.DXA },
        shading: { fill: C.paper, type: ShadingType.CLEAR },
        margins: { top: 400, bottom: 400, left: 400, right: 400 },
        children: [
          pCenter(value, { run: { bold: true, size: T.hero, color }, spacing: { after: 80 } }),
          pCenter(label.toUpperCase(), { run: { bold: true, size: T.body, color: C.ink, characterSpacing: 80 }, spacing: { after: sub ? 80 : 0 } }),
          sub ? pCenter(sub, { run: { size: T.small, color: C.slate, italics: true }, spacing: { after: 0 } }) : spacer(0),
        ],
      })],
    })],
  })
}

// Key-value spec table — professional pricing/contact style
function specTable(rows, leftWidth = 3200) {
  const rightWidth = CW - leftWidth
  const border = { style: BorderStyle.SINGLE, size: 4, color: C.border }
  const borders = { top: border, bottom: border, left: border, right: border }
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [leftWidth, rightWidth],
    rows: rows.map(([k, v], i) => new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: leftWidth, type: WidthType.DXA },
          shading: { fill: i % 2 === 0 ? C.paper : C.white, type: ShadingType.CLEAR },
          margins: { top: 140, bottom: 140, left: 200, right: 160 },
          verticalAlign: VerticalAlign.CENTER,
          children: [P([txt(k, { bold: true, size: T.small, color: C.charcoal })], { spacing: { after: 0 } })],
        }),
        new TableCell({
          borders,
          width: { size: rightWidth, type: WidthType.DXA },
          shading: { fill: i % 2 === 0 ? C.paper : C.white, type: ShadingType.CLEAR },
          margins: { top: 140, bottom: 140, left: 200, right: 160 },
          verticalAlign: VerticalAlign.CENTER,
          children: [P([txt(v, { size: T.small, color: C.ink })], { spacing: { after: 0 } })],
        }),
      ],
    })),
  })
}

// Feature grid 2-col with colored top bar per cell
function featureGrid(features, accent = C.green) {
  const col = Math.floor(CW / 2)
  const border = { style: BorderStyle.SINGLE, size: 4, color: C.border }
  const borders = { top: border, bottom: border, left: border, right: border }
  const rows = []
  for (let i = 0; i < features.length; i += 2) {
    const pair = features.slice(i, i + 2)
    while (pair.length < 2) pair.push({ title: '', desc: '' })
    rows.push(new TableRow({
      children: pair.map(f => new TableCell({
        borders: { ...borders, top: { style: BorderStyle.SINGLE, size: 24, color: accent } },
        width: { size: col, type: WidthType.DXA },
        shading: { fill: C.white, type: ShadingType.CLEAR },
        margins: { top: 200, bottom: 200, left: 240, right: 240 },
        children: [
          P([txt(f.title, { bold: true, size: T.body, color: C.ink })], { spacing: { after: 100 } }),
          P([txt(f.desc, { size: T.small, color: C.slate })], { spacing: { after: 0 } }),
        ],
      })),
    }))
  }
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [col, col],
    rows,
  })
}

// Callout box — info/warning/success styling
function callout(title, body, variant = 'info') {
  const variants = {
    info:    { color: C.blue,   bg: C.blueLt,   text: '084085' },
    success: { color: C.green,  bg: C.greenLt,  text: '0F5132' },
    warn:    { color: C.orange, bg: C.orangeLt, text: '7E2B00' },
    danger:  { color: C.red,    bg: C.redLt,    text: '7D0A14' },
  }
  const v = variants[variant] || variants.info
  const border = { style: BorderStyle.SINGLE, size: 4, color: v.color }
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [CW],
    rows: [new TableRow({
      children: [new TableCell({
        borders: { top: border, bottom: border, left: { style: BorderStyle.SINGLE, size: 36, color: v.color }, right: border },
        width: { size: CW, type: WidthType.DXA },
        shading: { fill: v.bg, type: ShadingType.CLEAR },
        margins: { top: 200, bottom: 200, left: 320, right: 240 },
        children: [
          P([txt(title, { bold: true, size: T.body, color: v.text })], { spacing: { after: 80 } }),
          P([txt(body, { size: T.small, color: v.text })], { spacing: { after: 0 } }),
        ],
      })],
    })],
  })
}

// ════════════════════════════════════════════════════════════════════════════
// HEADER & FOOTER
// ════════════════════════════════════════════════════════════════════════════

function makeHeader(docTitle = 'AI Messenger & Business OS') {
  return new Header({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      spacing: { after: 80 },
      border: { bottom: { color: C.green, space: 6, style: BorderStyle.SINGLE, size: 6 } },
      children: [
        txt('SYNCERA', { bold: true, size: T.micro, color: C.greenDk, characterSpacing: 40 }),
        txt(`   ${docTitle}`, { size: T.micro, color: C.slate }),
        txt('\tDarksea Network Sdn Bhd', { size: T.micro, color: C.slate }),
      ],
    })],
  })
}

function makeFooter() {
  return new Footer({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      children: [
        txt('© 2026 Darksea Network Sdn Bhd', { size: T.tiny, color: C.muted }),
        txt('   ·   v1.0.0', { size: T.tiny, color: C.muted }),
        txt('\t', { size: T.tiny }),
        txt('Page ', { size: T.tiny, color: C.muted }),
        new TextRun({ children: [PageNumber.CURRENT], size: T.tiny, color: C.charcoal, font: FONT, bold: true }),
        txt(' of ', { size: T.tiny, color: C.muted }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: T.tiny, color: C.muted, font: FONT }),
      ],
    })],
  })
}

// ════════════════════════════════════════════════════════════════════════════
// DOCUMENT FACTORY
// ════════════════════════════════════════════════════════════════════════════

function createDoc({ title, subject, children, docHeader }) {
  return new Document({
    creator: 'Darksea Network Sdn Bhd',
    title,
    subject,
    description: 'Official SYNCERA documentation',
    company: 'Darksea Network Sdn Bhd',
    revision: '1.0.0',
    lastModifiedBy: 'Darksea Network Sdn Bhd',
    styles: {
      default: { document: { run: { font: FONT, size: T.body, color: C.ink } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: T.h1, bold: true, color: C.ink, font: FONT },
          paragraph: { spacing: { before: 320, after: 200 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: T.h2, bold: true, color: C.greenDk, font: FONT },
          paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: T.h3, bold: true, color: C.ink, font: FONT },
          paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
      ],
    },
    numbering: {
      config: [
        { reference: 'bullets',
          levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: 'numbers',
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: PW, height: PH },
          margin: { top: 1440, right: MG, bottom: 1440, left: MG },
        },
      },
      headers: { default: makeHeader(docHeader) },
      footers: { default: makeFooter() },
      children,
    }],
  })
}

async function save(doc, name) {
  const out = path.join(__dirname, 'docs', 'word', name)
  const buf = await Packer.toBuffer(doc)
  fs.writeFileSync(out, buf)
  console.log('  OK', name, `(${(buf.length / 1024 / 1024).toFixed(2)} MB)`)
}

// ════════════════════════════════════════════════════════════════════════════
// DOC 1: PRODUCT DECK
// ════════════════════════════════════════════════════════════════════════════
function buildProductDeck() {
  resetFig()
  const children = [
    ...coverPage('SYNCERA', 'AI Messenger · Business OS · For WhatsApp', 'VERSION 1.0.0 · 2026', C.green),

    ...tocPage('Product Documentation', [
      { num: '01', title: 'Executive Summary',              page: '4',  accent: C.green },
      { num: '02', title: 'Inbox & Chat Interface',         page: '6',  accent: C.green },
      { num: '03', title: 'Dashboard & Analytics',          page: '8',  accent: C.blue },
      { num: '04', title: 'Sales Pipeline',                 page: '10', accent: C.purple },
      { num: '05', title: 'Quick Send & Broadcasting',      page: '12', accent: C.orange },
      { num: '06', title: 'Templates, Orders & Reminders',  page: '15', accent: C.greenDk },
      { num: '07', title: 'Analytics, Reports & Insights',  page: '19', accent: C.blue },
      { num: '08', title: 'Complete Feature Matrix',        page: '23', accent: C.ink },
      { num: '09', title: 'Pricing & Licensing',            page: '24', accent: C.green },
      { num: '10', title: 'Expected Business Impact',       page: '26', accent: C.green },
      { num: '11', title: 'Contact & Support',              page: '28', accent: C.greenDk },
    ]),

    // CHAPTER 01
    ...chapterDivider(1, 'Executive Summary', 'The product, the problem, the solution', C.green),
    H1('01 · Executive Summary'),
    p('SYNCERA is a desktop-based AI Messenger and Business Operating System for small-to-medium enterprises (SMEs) that conduct customer communication primarily through WhatsApp. It combines a fully-featured WhatsApp Web client with an offline-capable AI auto-reply engine, customer relationship management, broadcast tools, knowledge base management, sales pipeline tracking, and professional reporting — all in a single privacy-first, locally-hosted application.'),
    p('Unlike cloud-based competitors, SYNCERA operates entirely on the user\'s own computer. No conversation data, contact records, business knowledge, or AI prompts ever leave the user\'s machine unless they explicitly enable Google Drive backup.'),
    spacer(200),

    H2('The Problem'),
    bullet('Manual reply overload — owners answer 100–500 customer messages daily, causing slow response and lost sales.'),
    bullet('Cloud dependency & privacy risk — existing automation tools route all customer data through foreign cloud servers.'),
    bullet('High recurring costs — SaaS WhatsApp tools charge RM200–RM2,000/month per seat, prohibitive for micro-businesses.'),
    spacer(200),

    H2('The Solution'),
    bullet('One-time purchase, no subscription — pay once, own forever.'),
    bullet('100% local data — database, conversations, and knowledge base stored on the user\'s PC.'),
    bullet('Local AI brain — integrates with Ollama, LM Studio, or free cloud fallback (Pollinations.ai).'),
    bullet('WhatsApp Web protocol via Baileys — mirrors a paired smartphone.'),
    bullet('Single binary installer — no setup hell, no Docker, no devops.'),
    pageBreak(),

    // CHAPTER 02
    ...chapterDivider(2, 'Inbox & Chat Interface', 'Three-pane WhatsApp-style messaging', C.green),
    H1('02 · Inbox & Chat Interface'),
    p('SYNCERA\'s three-pane layout combines a navigation sidebar, conversation list, chat view, and contextual right panel — modeled after the WhatsApp interface owners already know, with significant enhancements for business workflows.'),
    ...figure('chats', 'Main inbox — conversation list (left), active chat (center), and contact details panel (right)'),

    H2('Key Capabilities'),
    bullet('All conversations from your linked WhatsApp number, synced automatically'),
    bullet('Filter tabs: All / AI-active / Pinned'),
    bullet('Pin, archive, label, tag, note any conversation'),
    bullet('Per-conversation AI toggle in the chat header'),
    bullet('Reset AI Memory — delete only AI-generated messages'),
    bullet('Clear Chat — local-only deletion (customer\'s phone unaffected)'),
    bullet('Send images, videos, documents, emojis, and templates'),
    pageBreak(),

    // CHAPTER 03
    ...chapterDivider(3, 'Dashboard', 'Real-time business KPIs at a glance', C.blue),
    H1('03 · Dashboard'),
    p('At-a-glance KPI overview that shows every metric that matters: messages today, unread count, AI replies, total customers, revenue (paid + pending), 7-day trend chart, AI Performance gauge, quick actions, and top customers — all on a single page that updates in real-time as messages arrive.'),
    ...figure('dashboard', 'Dashboard — real-time business metrics with trend visualization'),

    H2('Metrics Displayed'),
    bullet('Messages today (in/out + response rate)'),
    bullet('Unread count (urgent indicator if more than 5)'),
    bullet('AI Replies today + AI rate percentage'),
    bullet('Total customers + active conversations'),
    bullet('Revenue: received + pending + active orders'),
    bullet('Message Trend 7 Days chart'),
    bullet('AI Performance circular gauge'),
    bullet('Quick Actions: Broadcast, AI Outreach, Orders, Reminders'),
    bullet('Top 4 customers by message volume'),
    pageBreak(),

    // CHAPTER 04
    ...chapterDivider(4, 'Sales Pipeline', 'Drag-and-drop customer journey tracking', C.purple),
    H1('04 · Sales Pipeline'),
    p('Drag-and-drop customer cards across 5 stages to visually track your sales journey from initial enquiry to closed deal. Each card links back to the source conversation, making it easy to switch from strategic Kanban view to tactical chat reply.'),
    ...figure('pipeline', 'Sales Pipeline — 5-stage drag-and-drop Kanban board'),

    H2('Pipeline Stages'),
    bullet('New Leads — first contact, needs follow-up'),
    bullet('In Support — actively being served'),
    bullet('Customer — confirmed sale'),
    bullet('VIP — top-tier, special treatment'),
    bullet('Closed — inactive, can re-engage'),
    pageBreak(),

    // CHAPTER 05
    ...chapterDivider(5, 'Quick Send & Broadcasting', 'Reach the right customers, fast', C.orange),
    H1('05 · Quick Send'),
    p('Send messages, images, or files directly to any WhatsApp number without saving as contact. Single mode for one-off messages, Bulk mode for 1000+ recipients with anti-ban delay controls.'),
    ...figure('quicksend', 'Quick Send — instant messaging without contact saving'),

    H2('Features'),
    bullet('Single number mode — type number, type message, send'),
    bullet('Bulk mode — paste 1000+ numbers, configurable delay'),
    bullet('Image / file / emoji attachments'),
    bullet('History sidebar showing last 30 sends with status'),
    bullet('Country code selector (Malaysia, Singapore, Indonesia, etc.)'),
    bullet('Auto-format Malaysian numbers (01XXXXXXXX → +601XXXXXXXX)'),
    pageBreak(),

    H1('Broadcast'),
    p('Send promotional messages or announcements to many customers at once with personalization variables. Filter recipients by label, track sent/failed counts, and respect anti-ban delay best practices.'),
    ...figure('broadcast', 'Broadcast — send personalized messages to many contacts safely'),

    H2('Features'),
    bullet('Variables: {nama}, {telefon}, {tarikh} for personalization'),
    bullet('Filter by label (e.g. "All VIP customers")'),
    bullet('Anti-spam delay controls (0ms / 300ms / 1.5s)'),
    bullet('Track sent / failed / pending counts'),

    callout('Anti-Ban Warning', 'For broadcasts exceeding 50 messages, always use 300ms+ delay. Vary message content. Never spam contacts that have not opted in. WhatsApp account suspension is irreversible.', 'warn'),
    pageBreak(),

    // CHAPTER 06
    ...chapterDivider(6, 'Templates, Orders & Reminders', 'Operational excellence tools', C.greenDk),
    H1('06 · Quick Templates'),
    p('Pre-built reply messages organized by category. Insert mid-chat via keyboard shortcut. Speeds up common replies significantly.'),
    ...figure('templates', 'Templates — pre-built replies organized by category'),

    H2('Built-in Categories'),
    bullet('Salam (greetings)'),
    bullet('Maklumat Produk (product info)'),
    bullet('Harga (pricing)'),
    bullet('Bayaran (payment)'),
    bullet('Follow Up'),
    bullet('Penghantaran (delivery)'),
    bullet('Promosi (promotion)'),
    bullet('Terima Kasih (thank you)'),
    pageBreak(),

    H1('Orders Tracking'),
    p('Record and track customer orders through 5 stages with revenue summary. Link each order to its source conversation for full context.'),
    ...figure('orders', 'Orders — track customer orders with revenue summary'),

    H2('Order Statuses'),
    bullet('New — just placed'),
    bullet('Processing — being fulfilled'),
    bullet('Shipped — out for delivery'),
    bullet('Completed — delivered & paid'),
    bullet('Cancelled — voided'),
    pageBreak(),

    H1('Reminders & Follow-Up'),
    p('Schedule follow-up reminders with desktop notifications. Never forget to chase a quote, check on a customer, or confirm a delivery. Supports one-shot or recurring schedules (daily/weekly/monthly).'),
    ...figure('reminders', 'Reminders — schedule follow-ups with desktop notifications'),
    pageBreak(),

    // CHAPTER 07
    ...chapterDivider(7, 'Analytics, Reports & Insights', 'Data-driven business decisions', C.blue),
    H1('07 · Analytics'),
    p('Detailed business performance dashboard with message analytics, AI performance metrics, customer segmentation, and top contacts.'),
    ...figure('analytics', 'Analytics — comprehensive business performance metrics'),
    pageBreak(),

    H1('Reports (PDF Export)'),
    p('Generate branded PDF reports with your company logo. Date range presets or custom ranges. Multi-company profile switching — useful for agencies serving multiple clients.'),
    ...figure('reports', 'Reports — generate branded PDF reports for business documentation'),

    H2('Report Contents'),
    bullet('Cover page with company logo'),
    bullet('Executive summary statistics'),
    bullet('Daily trend chart'),
    bullet('Top 5 customers ranking'),
    bullet('Customer segmentation breakdown'),
    bullet('Order status overview'),
    pageBreak(),

    H1('AI Insights'),
    p('Smart recommendations based on your business activity, conversion funnel visualization, and customer distribution analysis. Highlights underperforming areas and suggests improvements.'),
    ...figure('insights', 'AI Insights — smart recommendations and funnel analysis'),
    pageBreak(),

    // CHAPTER 08
    ...chapterDivider(8, 'Feature Matrix', 'Every capability at a glance', C.ink),
    H1('08 · Complete Feature Matrix'),
    p('SYNCERA includes every feature needed to run a WhatsApp-first business — no separate add-on purchases required.'),
    spacer(200),
    featureGrid([
      { title: 'AI Auto-Reply',     desc: 'Ollama, LM Studio, Pollinations.ai. Per-conversation persona.' },
      { title: 'Smart Inbox',       desc: 'WhatsApp-style chat. Full media. Pin, archive, label.' },
      { title: 'Knowledge Base',    desc: 'Unlimited entries. AI reads all active entries. BM↔EN synonyms.' },
      { title: 'Sales Pipeline',    desc: '5-stage Kanban. Drag-drop. Per-stage filtering.' },
      { title: 'Broadcast',         desc: 'Send to 1000+ contacts. Anti-ban delays. Label filtering.' },
      { title: 'Templates',         desc: 'Variable templates. Category organized. Mid-chat insertion.' },
      { title: 'Orders Tracking',   desc: '5-status workflow. Revenue summary. Linked conversations.' },
      { title: 'Reminders',         desc: 'One-shot or recurring. Desktop notifications.' },
      { title: 'Analytics',         desc: '7-day trends. AI performance. Customer segmentation.' },
      { title: 'PDF Reports',       desc: 'Branded with logo. Multi-company. Custom date ranges.' },
      { title: 'Quick Send',        desc: 'No contact save needed. Single + Bulk modes.' },
      { title: 'Drive Backup',      desc: 'OAuth 2.0 PKCE. Daily auto-backup. One-click restore.' },
      { title: 'Multi-Language',    desc: 'English + Bahasa Melayu. Instant switching.' },
      { title: 'Themes',            desc: 'Dark / Light / System. CSS variables architecture.' },
    ], C.green),
    pageBreak(),

    // CHAPTER 09
    ...chapterDivider(9, 'Pricing & Licensing', 'Pay once. Own forever.', C.green),
    H1('09 · Pricing & Licensing'),

    H2('Personal — RM 999'),
    p('One-time. For sole proprietors, freelancers, micro-businesses.'),
    bullet('1 PC activation · All features · Lifetime use'),
    bullet('Free patch updates · Email support (48h response)'),
    bullet('7-day money-back guarantee'),

    H2('Business — RM 2,499'),
    p('One-time. For SMEs with 2–5 staff sharing the system.'),
    bullet('3 PC activations · Priority support (24h)'),
    bullet('1 free 30-min onboarding call'),

    H2('Pro — RM 4,999'),
    p('One-time. For agencies, multi-staff SMEs, reseller partners.'),
    bullet('7 PC activations · White-label installer option'),
    bullet('Phone support · Quarterly check-in calls'),

    H2('Enterprise — Custom Quote'),
    p('Franchises, BPOs, agencies with 10+ deployments. Contact for details.'),
    pageBreak(),

    // CHAPTER 10
    ...chapterDivider(10, 'Expected Impact', 'Measurable business outcomes', C.green),
    H1('10 · Expected Business Impact'),
    spacer(200),
    heroStat('30 sec', 'Average Reply Time', 'Down from 4 hours with manual replies', C.green),
    spacer(240),
    heroStat('5×', 'More Enquiries Handled', 'Without hiring additional staff', C.blue),
    spacer(240),
    heroStat('30%+', 'Conversion Uplift', 'From instant first response', C.purple),
    spacer(240),
    heroStat('70%+', 'AI Coverage Rate', 'Routine questions handled automatically', C.orange),
    pageBreak(),

    // CHAPTER 11
    ...chapterDivider(11, 'Contact & Support', 'We are here to help', C.greenDk),
    H1('11 · Contact'),
    logo(80),
    pCenter('SYNCERA', { run: { bold: true, size: 40, color: C.ink } }),
    eyebrow('Crafted with precision in Malaysia'),
    spacer(200),

    specTable([
      ['Product Lead',  'Nazrin Zainal — Lead Engineer & Full-Stack Architect'],
      ['Publisher',     'Darksea Network Sdn Bhd'],
      ['Address',       'Kuala Lumpur, Malaysia'],
      ['Email',         'contact@example.com'],
      ['Web',           'darksea.network'],
      ['Hours',         'Monday–Saturday, 9 AM – 7 PM (GMT+8)'],
      ['Response SLA',  '24–48 hours business days'],
    ]),

    spacer(400),
    divider(C.green, 12),
    pCenter('END OF DOCUMENT', { run: { bold: true, size: T.small, color: C.muted, characterSpacing: 120 } }),
  ]
  return createDoc({
    title: 'SYNCERA Product Documentation',
    subject: 'Product Overview & Feature Reference',
    docHeader: 'Product Documentation',
    children,
  })
}

// ════════════════════════════════════════════════════════════════════════════
// DOC 2: USER GUIDE
// ════════════════════════════════════════════════════════════════════════════
function buildUserGuide() {
  resetFig()
  const children = [
    ...coverPage('SYNCERA', 'User Guide & Installation Manual', 'VERSION 1.0.0 · USER MANUAL', C.blue),

    ...tocPage('User Guide', [
      { num: '01', title: 'System Requirements',  page: '4',  accent: C.blue },
      { num: '02', title: 'Installation',         page: '6',  accent: C.blue },
      { num: '03', title: 'First-Time Setup',     page: '9',  accent: C.green },
      { num: '04', title: 'Daily Usage',          page: '13', accent: C.green },
      { num: '05', title: 'Feature Walkthrough',  page: '15', accent: C.purple },
      { num: '06', title: 'Troubleshooting',      page: '20', accent: C.orange },
      { num: '07', title: 'Best Practices',       page: '22', accent: C.greenDk },
      { num: '08', title: 'Support',              page: '24', accent: C.green },
    ]),

    ...chapterDivider(1, 'System Requirements', 'Minimum and recommended specifications', C.blue),
    H1('01 · System Requirements'),
    H2('Minimum'),
    specTable([
      ['OS',       'Windows 10 (64-bit) version 1809 or later'],
      ['CPU',      'Intel Core i3 / AMD Ryzen 3 (2 cores, 2.0 GHz)'],
      ['RAM',      '4 GB'],
      ['Storage',  '500 MB + approximately 50 MB per 10,000 messages'],
      ['Display',  '1366 × 768 minimum'],
      ['Network',  'Internet for WhatsApp & cloud AI fallback'],
    ]),

    H2('Recommended'),
    specTable([
      ['OS',       'Windows 11 (64-bit)'],
      ['CPU',      'Intel Core i5 / AMD Ryzen 5 (4 cores, 3.0 GHz+)'],
      ['RAM',      '8 GB (16 GB if running Ollama locally)'],
      ['Storage',  'SSD with 5 GB+ free space'],
      ['Display',  '1920 × 1080 or higher'],
    ]),
    pageBreak(),

    ...chapterDivider(2, 'Installation', 'Six steps to get SYNCERA running', C.blue),
    H1('02 · Installation'),

    H2('Step 1 — Download'),
    p('Obtain the installer file from your authorized reseller or via the download link sent after purchase.'),
    p('File: SYNCERA-Setup-1.0.0-x64.exe (approximately 72 MB)'),

    H2('Step 2 — Run Installer'),
    numbered('Double-click SYNCERA-Setup-1.0.0-x64.exe.'),
    numbered('If Windows SmartScreen appears, click "More info" → "Run anyway".'),
    numbered('The NSIS installer wizard launches.'),

    H2('Step 3 — License Agreement'),
    p('Read the End User License Agreement (EULA). Click "I Agree" to proceed.'),

    H2('Step 4 — Choose Installation Location'),
    p('Default: C:\\Users\\<YourName>\\AppData\\Local\\Programs\\SYNCERA\\'),
    p('You may change this. The default location requires no administrator rights.'),

    H2('Step 5 — Install'),
    p('Installer creates Desktop and Start Menu shortcuts, and an uninstall entry. Takes 30–90 seconds.'),

    H2('Step 6 — First Launch'),
    p('Double-click the SYNCERA Desktop icon. The splash screen displays for 10 seconds, then the main window opens.'),
    pageBreak(),

    ...chapterDivider(3, 'First-Time Setup', 'Connect WhatsApp and configure AI', C.green),
    H1('03 · First-Time Setup'),

    H2('A. Connect WhatsApp'),
    numbered('The QR Login screen appears.'),
    numbered('On your phone: WhatsApp → Settings → Linked Devices → Link a Device.'),
    numbered('Point your phone camera at the QR code shown in SYNCERA.'),
    numbered('After successful link, SYNCERA shows your connection badge.'),
    numbered('History sync begins automatically (downloading past messages).'),

    callout('Recommendation', 'Use a dedicated business WhatsApp number, not your personal one. WhatsApp allows up to 4 linked devices per number.', 'info'),

    H2('B. Inbox Overview'),
    p('Once connected, the Inbox displays your conversations.'),
    ...figure('chats', 'Main inbox showing imported conversations with active chat'),

    H2('C. Configure Business Profile'),
    numbered('Click the Settings icon at the bottom of the left navigation.'),
    numbered('Open the Profile section.'),
    numbered('Fill in: Business Name, Currency, AI Brain (business profile), Default AI Persona.'),
    numbered('Click Save.'),

    H2('D. Configure AI Backend'),
    numbered('Open Settings → AI Settings.'),
    numbered('SYNCERA auto-detects: Ollama, LM Studio, Pollinations.ai.'),
    numbered('Select Default AI Backend and Default Model.'),
    numbered('Adjust Reply Delay (recommended: 2–5 seconds).'),
    numbered('Toggle "Auto-Enable AI for New Customers" ON if desired.'),
    pageBreak(),

    ...chapterDivider(4, 'Daily Usage', 'Sending, receiving, and managing chats', C.green),
    H1('04 · Daily Usage'),

    H2('Sending Messages'),
    bullet('Type in input box, press Enter to send.'),
    bullet('Shift+Enter for new line.'),
    bullet('Paperclip — attach image, video, document (max 20 MB).'),
    bullet('Emoji picker with categories.'),
    bullet('Templates — insert pre-built messages.'),

    H2('AI Controls'),
    p('Toggle "AI Active" button in chat header to enable AI auto-reply for that specific conversation. A blue banner displays "AI auto-reply is active" when enabled.'),

    H2('Keyboard Shortcuts'),
    specTable([
      ['Ctrl+B',       'Toggle Inbox collapse'],
      ['Enter',        'Send message'],
      ['Shift+Enter',  'New line in message'],
      ['Esc',          'Close modal / cancel picker'],
    ]),
    pageBreak(),

    ...chapterDivider(5, 'Feature Walkthrough', 'A tour of every section', C.purple),
    H1('05 · Feature Walkthrough'),

    H2('Dashboard'),
    p('Real-time KPI overview at your fingertips.'),
    ...figure('dashboard', 'Dashboard with KPIs, trends, and quick actions'),
    pageBreak(),

    H2('Quick Send'),
    p('Send messages to any number without saving as contact.'),
    ...figure('quicksend', 'Quick Send — Single and Bulk modes'),
    pageBreak(),

    H2('Sales Pipeline'),
    p('Visual Kanban for tracking customers across stages.'),
    ...figure('pipeline', 'Drag-drop pipeline with 5 stages'),
    pageBreak(),

    H2('Reports (PDF)'),
    p('Generate branded reports for documentation.'),
    ...figure('reports', 'Live preview with company profile and date range selection'),

    callout('Anti-Ban Reminder', 'When broadcasting more than 50 messages, always use 300ms+ delay. Vary message content. Never spam contacts that have not opted in.', 'warn'),
    pageBreak(),

    ...chapterDivider(6, 'Troubleshooting', 'Common issues and solutions', C.orange),
    H1('06 · Troubleshooting'),

    H2('Connection Issues'),
    H3('QR code will not appear'),
    numbered('Check internet connection.'),
    numbered('Settings → Disconnect WA (with delete auth).'),
    numbered('Restart SYNCERA.'),

    H3('Stuck on "Connecting..."'),
    p('Wait 30–60 seconds. If still stuck, delete %APPDATA%\\syncera\\wa-auth\\ and re-scan QR.'),

    H2('AI Issues'),
    H3('AI not replying'),
    p('Check: AI enabled on conversation? Auto-enable global setting ON? AI backend running? Conversation is not a group?'),

    H3('AI replies are slow'),
    p('Use smaller model (e.g. llama3.2:1b — 1.3 GB). Lower Max Length to 300–500 tokens. Consider GPU acceleration.'),

    H2('Performance'),
    H3('App is slow'),
    p('Causes: database has 50k+ messages, running on HDD, or low RAM. Solutions: upgrade RAM, use SSD, clear chats on inactive conversations.'),
    pageBreak(),

    ...chapterDivider(7, 'Best Practices', 'Get the most out of SYNCERA', C.greenDk),
    H1('07 · Best Practices'),

    H2('For AI Quality'),
    bullet('Write a DETAILED business profile (200–500 words).'),
    bullet('Add 50+ KB entries covering products, prices, FAQs.'),
    bullet('Use formal "Encik/Cik" addressing in persona.'),
    bullet('Set reply delay to 2–4 seconds (mimics human typing).'),

    H2('For Anti-Ban'),
    bullet('Do not send identical messages to >50 contacts at once.'),
    bullet('Vary message templates slightly.'),
    bullet('Use 1.5s+ delay for bulk sends.'),

    H2('For Data Safety'),
    bullet('Enable daily Drive Backup.'),
    bullet('Do not share %APPDATA%\\syncera\\ folder.'),
    bullet('Test restore on a secondary machine quarterly.'),
    pageBreak(),

    ...chapterDivider(8, 'Support', 'We are here to help', C.green),
    H1('08 · Need Help?'),
    specTable([
      ['Email',           'contact@example.com'],
      ['Response Time',   '24–48 hours business days'],
      ['Hours',           'Monday–Saturday, 9 AM – 7 PM (GMT+8)'],
      ['Subject Format',  '[SUPPORT] Brief description'],
    ]),
    spacer(400),
    divider(C.green, 12),
    logo(60),
    pCenter('Thank you for choosing SYNCERA.', { run: { size: T.body, italics: true, color: C.slate } }),
  ]
  return createDoc({
    title: 'SYNCERA User Guide',
    subject: 'Installation and User Manual',
    docHeader: 'User Guide',
    children,
  })
}

// ════════════════════════════════════════════════════════════════════════════
// DOC 3: LEGAL
// ════════════════════════════════════════════════════════════════════════════
function buildLegal() {
  resetFig()
  const children = [
    ...coverPage('SYNCERA', 'EULA · Terms of Service · Privacy Policy', 'LEGAL DOCUMENTATION', C.ink),

    ...tocPage('Legal Documentation', [
      { num: 'I',   title: 'End User License Agreement (EULA)',  page: '4',  accent: C.ink },
      { num: 'II',  title: 'Terms of Service',                   page: '7',  accent: C.ink },
      { num: 'III', title: 'Privacy Policy',                     page: '10', accent: C.ink },
      { num: '',    title: 'Acknowledgment',                     page: '13', accent: C.green },
    ]),

    ...chapterDivider('I', 'End User License Agreement', 'Software license terms', C.ink),
    H1('Part I · End User License Agreement (EULA)'),
    callout('Copyright Notice', 'Copyright © 2026 Darksea Network Sdn Bhd. Developed by Nazrin Zainal. All Rights Reserved.', 'info'),

    H2('1. Grant of License'),
    p('Darksea Network Sdn Bhd ("Licensor") grants you a non-exclusive, non-transferable license to install and use one copy of the Software on a single computer per valid license purchased. The Software is licensed, not sold.'),

    H2('2. Restrictions'),
    p('You may NOT:'),
    bullet('Copy, modify, or create derivative works of the Software'),
    bullet('Reverse-engineer, decompile, disassemble, or extract source code'),
    bullet('Rent, lease, sublicense, sell, redistribute, or transfer to any third party'),
    bullet('Remove or alter any proprietary notices, labels, or marks'),
    bullet('Use the Software for unlawful purposes including spam, phishing, or violation of WhatsApp\'s Terms of Service'),

    H2('3. User Data & Privacy'),
    p('The Software stores all data locally on your computer. Licensor does NOT collect, transmit, or have access to your business data.'),

    H2('4. WhatsApp Disclaimer'),
    p('SYNCERA is an unofficial client using the WhatsApp Web protocol via the open-source Baileys library. WhatsApp is a trademark of Meta Platforms, Inc. SYNCERA is not affiliated with, endorsed by, or sponsored by WhatsApp or Meta. Account suspension or termination by WhatsApp is a risk you accept by using this Software.'),

    H2('5. Disclaimer of Warranties'),
    p('THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.'),

    H2('6. Limitation of Liability'),
    p('IN NO EVENT SHALL LICENSOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OR INABILITY TO USE THE SOFTWARE.'),

    H2('7. AI-Generated Content'),
    p('The Software uses Artificial Intelligence to generate replies. AI output may contain errors, inaccuracies, or content that does not reflect your business policies. You are solely responsible for reviewing AI-generated messages before they are sent and for any consequences arising from such messages.'),

    H2('8. Termination'),
    p('This Agreement is effective until terminated. Your rights under this license will terminate automatically without notice if you fail to comply with any term.'),

    H2('9. Governing Law'),
    p('This Agreement shall be governed by the laws of Malaysia. Any dispute shall be submitted to the exclusive jurisdiction of the courts of Malaysia.'),
    pageBreak(),

    ...chapterDivider('II', 'Terms of Service', 'Commercial terms and service rules', C.ink),
    H1('Part II · Terms of Service'),

    H2('1. Acceptance of Terms'),
    p('By purchasing, downloading, installing, or using the Services, you agree to be bound by these Terms. You must be at least 18 years old, or the age of majority in your jurisdiction, to use the Services.'),

    H2('2. Payment'),
    p('All prices are in Malaysian Ringgit (MYR / RM) unless otherwise specified. Payment is due in full at the time of purchase. You are responsible for all applicable taxes.'),

    H2('3. Refund Policy'),
    p('7-Day Money-Back Guarantee: You may request a full refund within 7 days of purchase if the Software fails to install on a supported configuration, a documented feature is materially non-functional, and you provide reasonable diagnostic information.'),
    p('Refunds are NOT available for: requests after 7 days, software successfully installed and used for more than 20 hours, custom KB packs once delivered, training sessions once attended, or white-label setup fees.'),

    H2('4. Updates & Support'),
    bullet('Patches (1.0.x): Free for all license holders, indefinitely'),
    bullet('Minor updates (1.x to 1.y): Free for v1.x license holders'),
    bullet('Major updates (1.x to 2.x): May require paid upgrade at 50% off'),
    bullet('Email support: 48-hour response, included with all licenses'),

    H2('5. User Responsibilities'),
    p('You agree NOT to use the Software for spam, harassment, fraud, or any violation of WhatsApp\'s Terms of Service. You are solely responsible for the content of messages sent, obtaining consent from customers, and compliance with all applicable laws.'),

    H2('6. WhatsApp Compliance'),
    p('You acknowledge that automation of WhatsApp messaging may violate WhatsApp\'s Terms of Service. Your account is at risk of suspension. Company expressly disclaims liability for such suspensions.'),

    H2('7. AI Disclaimer'),
    p('The Software uses AI to generate replies. AI output may contain factual errors, misinterpret customer messages, or generate inappropriate, off-brand, or culturally insensitive content. You are solely responsible for reviewing AI-generated content. Company is not liable for financial losses, reputational damage, or legal disputes arising from AI replies.'),

    H2('8. Limitation of Liability'),
    p('Company\'s total liability shall not exceed the amount you paid for the license in the 12 months preceding the claim.'),

    H2('9. Governing Law & Disputes'),
    p('Governed by the laws of Malaysia. Disputes shall be resolved through: (1) good-faith negotiation, (2) mediation through the Asian International Arbitration Centre (AIAC) in Kuala Lumpur, (3) litigation in the courts of Kuala Lumpur.'),

    H2('10. Changes to Terms'),
    p('Company may update these Terms at any time. Material changes will be communicated via email, in-Software notice, or posting on darksea.network.'),
    pageBreak(),

    ...chapterDivider('III', 'Privacy Policy', 'PDPA + GDPR compliant data practices', C.ink),
    H1('Part III · Privacy Policy'),
    callout('Summary', 'We do NOT collect your business data. All conversations, contacts, and KB entries stay on your computer. We never sell your data. You control optional features (Drive backup, cloud AI) that may transmit data externally.', 'success'),

    H2('1. Information We Collect'),
    H3('At Purchase'),
    p('Name, email, phone (optional), business name (optional), Malaysian IC / SSM (optional for tax invoice), billing address, payment method information (processed by payment processors — we do NOT store full card numbers).'),

    H3('NOT Collected'),
    p('We do NOT collect: customer conversations, contacts list, knowledge base content, AI personas or prompts, message content, WhatsApp authentication keys, Google Drive data, media files.'),

    H2('2. Third-Party Data Flows (User-Controlled)'),
    specTable([
      ['WhatsApp connection',     'Encrypted messages → WhatsApp / Meta servers'],
      ['Pollinations.ai backend', 'AI prompt + KB context (if enabled)'],
      ['Ollama / LM Studio',      'Stays on your PC — never transmitted'],
      ['Google Drive Backup',     'Database file → your Google Drive only'],
      ['DuckDuckGo AI search',    'Search query → DuckDuckGo (if enabled)'],
    ]),

    H2('3. Data Retention'),
    specTable([
      ['Purchase records',          '7 years (tax compliance)'],
      ['Email correspondence',      '3 years'],
      ['License keys',              'Indefinite (for support)'],
      ['Marketing email list',      'Until you unsubscribe'],
      ['Local Software data (yours)', 'Forever — you control it'],
    ]),

    H2('4. Your Rights (PDPA & GDPR)'),
    bullet('Right of Access — request a copy of personal data we hold'),
    bullet('Right of Correction — request correction of inaccurate data'),
    bullet('Right of Deletion — request deletion of your personal data'),
    bullet('Right to Data Portability — request data in portable format'),
    bullet('Right to Object — object to processing for marketing'),
    bullet('Right to Withdraw Consent — at any time for opt-in features'),
    bullet('Right to Complain — lodge complaints with PDP Malaysia or EU DPA'),
    p('To exercise your rights, email contact@example.com with subject "[PRIVACY] Data Request — <type>".'),

    H2('5. International Transfers'),
    p('Service providers (Stripe, Cloudflare) may process data outside Malaysia under appropriate safeguards (Standard Contractual Clauses, adequacy decisions, provider certifications). Your Software-stored data does NOT transfer internationally — it stays on your device.'),

    H2('6. AI & Automated Decision Making'),
    p('The Software uses AI to generate suggested replies. This is a tool, not an automated decision-maker — you (the User) review and decide whether to send AI-generated content. We do NOT use AI to make decisions about you (credit scoring, eligibility, etc).'),

    H2('7. Regulatory Compliance'),
    bullet('Malaysia (PDPA 2010) — this Policy serves as our PDPA Privacy Notice'),
    bullet('European Union (GDPR) — your rights under GDPR Articles 15-22 summarized'),
    bullet('Singapore (PDPA Singapore) — equivalent rights apply'),

    H2('8. Contact for Privacy Matters'),
    p('Data Protection Officer (acting): Nazrin Zainal'),
    p('Email: contact@example.com — Subject: [PRIVACY] Data Request'),
    pageBreak(),

    H1('Acknowledgment'),
    p('By installing, copying, or otherwise using the SYNCERA Software, you acknowledge that you have read, understood, and agree to be bound by:'),
    bullet('The End User License Agreement (Part I)'),
    bullet('The Terms of Service (Part II)'),
    bullet('The Privacy Policy (Part III)'),
    spacer(400),
    callout('Customer Signature (for paper records)', 'Name: ________________________________________________________\n\nDate: ________________________________________________________\n\nSignature: ____________________________________________________', 'info'),
    spacer(400),
    divider(C.ink, 12),
    pCenter('DARKSEA NETWORK SDN BHD', { run: { bold: true, size: T.body, color: C.ink, characterSpacing: 80 } }),
    pCenter('Kuala Lumpur, Malaysia  ·  contact@example.com', { run: { size: T.small, color: C.slate } }),
  ]
  return createDoc({
    title: 'SYNCERA Legal Documentation',
    subject: 'EULA, Terms of Service, Privacy Policy',
    docHeader: 'Legal Documentation',
    children,
  })
}

// ════════════════════════════════════════════════════════════════════════════
// DOC 4: SALES ONE-PAGER (brochure style)
// ════════════════════════════════════════════════════════════════════════════
function buildSalesOnePager() {
  resetFig()
  const children = [
    // Cover-ish opening
    spacer(200),
    logo(96),
    pCenter('SYNCERA', { run: { bold: true, size: 64, color: C.ink }, spacing: { after: 80 } }),
    eyebrow('AI Messenger · Business OS · For WhatsApp'),
    spacer(100),

    // Hero screenshot
    ...figure('dashboard', 'SYNCERA Dashboard — real-time business overview'),

    // Hook
    pCenter('Stop typing the same WhatsApp replies 200 times a day.', { run: { bold: true, size: 30, color: C.ink }, spacing: { after: 60 } }),
    pCenter('Let your AI do it.', { run: { bold: true, size: 30, color: C.greenDk }, spacing: { after: 240 } }),

    p('SYNCERA is a one-time-purchase Windows desktop app that automates WhatsApp customer service for Malaysian SMEs. AI replies in your customers\' language, using YOUR product info, YOUR prices, YOUR personality.'),

    callout('No monthly fees · No cloud · No setup hell', 'Pay once. Own forever. All data stays on your PC.', 'success'),
    pageBreak(),

    H2('Built For'),
    bullet('Electrical / plumbing / aircond / hardware shops'),
    bullet('Beauty salons, spas, clinics'),
    bullet('Online sellers (Shopee / Lazada / Instagram)'),
    bullet('Catering, cloud kitchens, F&B'),
    bullet('Service trades (repair, installation)'),
    bullet('Anyone replying to 100+ WhatsApp customers daily'),

    H2('What\'s Included'),
    featureGrid([
      { title: 'AI Auto-Reply',  desc: 'Ollama, LM Studio, or free cloud AI' },
      { title: 'Smart Inbox',    desc: 'WhatsApp-style, filters, search' },
      { title: 'Knowledge Base', desc: 'AI reads your products & prices' },
      { title: 'Sales Pipeline', desc: 'Drag-drop Kanban (Lead → VIP)' },
      { title: 'Broadcast',      desc: 'Send to 1000+ contacts safely' },
      { title: 'PDF Reports',    desc: 'Branded with your company logo' },
    ], C.green),
    pageBreak(),

    H2('Pipeline & Workflow'),
    ...figure('pipeline', 'Sales Pipeline — drag customers across stages'),

    H2('Pricing'),
    specTable([
      ['Personal — RM 999',   '1 PC · All features · Lifetime · Best for solo'],
      ['Business — RM 2,499', '3 PCs · Priority support · 30-min onboarding'],
      ['Pro — RM 4,999',      '7 PCs · White-label · Phone support'],
      ['Enterprise — Custom', 'Unlimited · Custom dev · SLA · On-site training'],
    ]),
    callout('All one-time. No subscription. Lifetime use. 7-day money-back guarantee.', 'Free patch updates  ·  Email support included  ·  Made in Malaysia', 'success'),

    H2('Real Impact'),
    P([
      txt('Before:  ', { bold: true, color: C.red }),
      txt('4 hours daily replying customers, lost sales, owner exhausted.'),
    ]),
    P([
      txt('After:   ', { bold: true, color: C.greenDk }),
      txt('30-second response, 5× more enquiries, 30%+ conversion uplift, 70% AI coverage.'),
    ], { spacing: { after: 200 } }),

    H2('Get Started'),
    numbered('Email: contact@example.com — Subject: [ORDER] SYNCERA <tier>'),
    numbered('Or reply "Saya nak SYNCERA" via WhatsApp for invoice'),
    numbered('Or reply "Demo" for a free 30-min live walkthrough'),

    spacer(400),
    divider(C.green, 12),
    logo(50),
    pCenter('DARKSEA NETWORK SDN BHD', { run: { bold: true, size: T.body, color: C.ink, characterSpacing: 80 }, spacing: { after: 60 } }),
    pCenter('Kuala Lumpur, Malaysia  ·  Developer: Nazrin Zainal', { run: { size: T.small, color: C.slate } }),
    pCenter('darksea.network  ·  contact@example.com', { run: { size: T.small, color: C.slate } }),
  ]
  return createDoc({
    title: 'SYNCERA — Sales One-Pager',
    subject: 'Product brochure',
    docHeader: 'Sales One-Pager',
    children,
  })
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('SYNCERA Word Generator — Designer Edition\n')
  console.log('Screenshots:')
  for (const [k, b] of Object.entries(SHOTS)) {
    console.log(`  ${b ? 'OK' : '--'} ${k.padEnd(10)} ${b ? (b.length / 1024).toFixed(0) + ' KB' : ''}`)
  }
  console.log('\nGenerating documents...')

  await save(buildProductDeck(),   '1-SYNCERA-Product-Deck.docx')
  await save(buildUserGuide(),     '2-SYNCERA-User-Guide.docx')
  await save(buildLegal(),         '3-SYNCERA-Legal-EULA-ToS-Privacy.docx')
  await save(buildSalesOnePager(), '4-SYNCERA-Sales-OnePager.docx')

  console.log('\nDone.')
}

main().catch(err => { console.error(err); process.exit(1) })
