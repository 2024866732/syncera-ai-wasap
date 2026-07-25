// ==UserScript==
// @name         HAFJET SPX PoC — Selector Test
// @namespace    https://hafjet.my
// @version      0.0.0
// @description  PoC template: header-scored table + container scoring + eye-icon click. NO POST.
// @author       HAFJET (M) SDN BHD
// @match        https://spx.co/*
// @match        https://*.shopee.com.my/*
// @match        https://*.shopee.co.id/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// TEMPLATE — replace CONFIG selectors based on actual SPX portal DOM.
// Run __spx_poc_run() in DevTools Console to test.
// Run __spx_poc_debug() to dump DOM structure and tune selectors.
//
// Full working version: see spx_phone_agent_poc_v2.5.user.js in repo.

(function() {
    'use strict';

    const COLUMN_PATTERNS = {
        tracking:  ['tracking', 'tracking no', 'tracking number', 'awb', 'order id', 'order'],
        name:      ['recipient', 'recipient name', 'customer', 'name', 'buyer'],
        phone:     ['phone', 'recipient phone', 'contact', 'mobile', 'tel'],
        status:    ['status', 'order status', 'state', 'collection status'],
    };

    const EYE_SELECTORS = [
        '[aria-label*="show phone" i]',
        '[aria-label*="reveal phone" i]',
        '[aria-label*="show" i]',
        '[aria-label*="reveal" i]',
        '.anticon-eye', '.anticon-eye-invisible',
        '[class*="eye" i]', 'i[class*="eye"]', 'span[class*="eye"]',
        'button[class*="icon"]:has(svg)',
        'button:has(svg[class*="eye" i])',
        'button:has([class*="eye" i])',
        'button:has(svg)',
        'svg',
    ];

    const ROW_SELECTORS_SCORED = [
        { sel: 'tr[data-row-key]',       pts: 20 },
        { sel: 'tr.ant-table-row',        pts: 15 },
        { sel: '.ant-table-tbody tr',     pts: 10 },
        { sel: 'tbody tr',                 pts: 6  },
        { sel: '[role="row"]',             pts: 8  },
        { sel: '[class*="row" i]',         pts: 5  },
        { sel: 'tr',                       pts: 1  },
    ];

    const CONTAINER_CLUES = [
        '.ant-table', '.ant-table-container', '[class*="table" i]',
        '[class*="grid" i]', '[class*="list" i]', '[class*="body" i]',
        '[class*="content" i]',
    ];

    const PENALTY_PATTERNS = [
        'header', 'scroll-bar', 'scrollbar', 'thead', 'sticky',
        'fixed', 'shadow', 'placeholder', 'filter', 'pagination',
    ];

    // ── Helpers ──
    function cleanText(el) { return (el?.textContent || el?.innerText || '').trim(); }
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function safeClassName(el) {
        if (!el) return '';
        const cn = el.className;
        if (typeof cn === 'string') return cn;
        if (cn && typeof cn.baseVal === 'string') return cn.baseVal;
        return '';
    }
    function shortTag(el) {
        if (!el) return '?';
        const tag = el.tagName.toLowerCase();
        const cn = safeClassName(el).split(' ').slice(0, 2).join('.');
        return cn ? tag + '.' + cn : tag;
    }
    function isValidTracking(t) { return /^SPXMY\d{10,15}$/i.test(t); }
    function isMaskedPhone(t) { return /\*{3,}/.test(t); }
    function isLikelyPhone(t) {
        const d = t.replace(/\D/g, '');
        if (d.length < 10 || d.length > 14) return false;
        if (/SPXMY/i.test(t)) return false;
        if (/^\d{12,18}$/.test(t) && !t.startsWith('60') && !t.startsWith('01')) return false;
        return true;
    }
    function hasTrackingNumber(row) { return /SPXMY\d{10,15}/i.test(cleanText(row)); }

    // ── Header scoring ──
    function scoreHeaderRow(headerRow) {
        const cells = headerRow.querySelectorAll('th, td');
        if (cells.length < 3) return { score: 0, mapping: {}, headers: [] };
        const mapping = { tracking: -1, name: -1, phone: -1, status: -1 };
        const headers = [];
        let score = 0;
        const w = { tracking: 5, name: 4, phone: 3, status: 2 };
        for (let i = 0; i < cells.length; i++) {
            const text = cleanText(cells[i]).toLowerCase();
            headers.push({ index: i, text });
            for (const [field, kw] of Object.entries(COLUMN_PATTERNS)) {
                if (mapping[field] >= 0) continue;
                if (kw.some(k => text.includes(k))) { mapping[field] = i; score += w[field] || 1; }
            }
        }
        if (Object.values(mapping).filter(v => v >= 0).length >= 4) score += 20;
        return { score, mapping, headers };
    }

    // ── Find header table ──
    function findTableAndHeader() {
        const tables = document.querySelectorAll('table');
        let best = null, bestScore = -1;
        for (const t of tables) {
            const hr = t.querySelector('thead tr');
            if (hr) { const r = scoreHeaderRow(hr); if (r.score > bestScore) { bestScore = r.score; best = { table: t, headerRow: hr, mapping: r.mapping, headers: r.headers }; } }
            const fr = t.querySelector('tbody tr:first-child');
            if (fr && fr !== hr) {
                const hasTh = fr.querySelectorAll('th').length >= 2;
                const hasHC = /header|heading/i.test(safeClassName(fr));
                const allBold = Array.from(fr.querySelectorAll('td')).every(td => {
                    const s = window.getComputedStyle(td);
                    return s.fontWeight === 'bold' || parseInt(s.fontWeight) >= 600;
                });
                if (hasTh || hasHC || (allBold && fr.querySelectorAll('td').length >= 3)) {
                    const r = scoreHeaderRow(fr);
                    if (r.score > bestScore) { bestScore = r.score; best = { table: t, headerRow: fr, mapping: r.mapping, headers: r.headers }; }
                }
            }
        }
        if (!best) {
            for (const t of tables) {
                const hr = t.querySelector('thead tr, tr:first-child');
                if (!hr) continue;
                if (hr.querySelectorAll('th').length >= 4 || hr.querySelectorAll('td').length >= 4) {
                    const r = scoreHeaderRow(hr);
                    best = { table: t, headerRow: hr, mapping: r.mapping, headers: r.headers };
                    break;
                }
            }
        }
        return best;
    }

    // ── Container scoring ──
    function scoreContainer(container, headerRow) {
        const cls = safeClassName(container).toLowerCase();
        let score = 0;
        const hits = {};
        let total = 0, hasSPX = false;
        for (const { sel, pts } of ROW_SELECTORS_SCORED) {
            try {
                const rows = container.querySelectorAll(sel);
                let vc = 0;
                for (const row of rows) {
                    if (row !== headerRow) { vc++; if (!hasSPX && hasTrackingNumber(row)) hasSPX = true; }
                }
                if (vc > 0) { score += vc * pts; hits[sel] = vc; total += vc; }
            } catch (e) {}
        }
        if (hasSPX) score += 30;
        let penalty = 0;
        for (const p of PENALTY_PATTERNS) { if (cls.includes(p)) penalty += 30; }
        return { score: score - penalty, penalty, selectorHits: hits, totalRows: total, hasSPXMY: hasSPX, className: cls };
    }

    function findContainer(table, headerRow) {
        const candidates = [];
        const seen = new Set();
        function add(el, src) {
            if (!el || seen.has(el)) return;
            seen.add(el);
            const r = scoreContainer(el, headerRow);
            candidates.push({ el, source: src, score: r.score, penalty: r.penalty, selectorHits: r.selectorHits, totalRows: r.totalRows, hasSPXMY: r.hasSPXMY, className: r.className });
        }
        let el = table.parentElement;
        for (let d = 1; d <= 8 && el; d++) {
            for (const clue of CONTAINER_CLUES) { try { if (el.matches(clue)) { add(el, 'parent L' + d + ' ' + clue); break; } } catch (e) {} }
            if (el.parentElement) {
                for (const sib of el.parentElement.children) {
                    if (sib !== el && sib.nodeType === 1) {
                        for (const clue of CONTAINER_CLUES) { try { if (sib.matches(clue)) { add(sib, 'sibling L' + d + ' ' + clue); break; } } catch (e) {} }
                    }
                }
            }
            el = el.parentElement;
        }
        for (const clue of CONTAINER_CLUES) { try { const c = table.closest(clue); if (c) add(c, 'closest ' + clue); } catch (e) {} }
        add(document, 'document');
        candidates.sort((a, b) => b.score - a.score);
        return { container: candidates[0].el, source: candidates[0].source + ' (score=' + candidates[0].score + ')', candidates };
    }

    function getDataRows(tableInfo) {
        const { table, headerRow } = tableInfo;
        const headerCellCount = headerRow.querySelectorAll('th, td').length;
        const headerText = cleanText(headerRow).toLowerCase();
        const { container, candidates } = findContainer(table, headerRow);

        console.log('Top containers:');
        candidates.slice(0, 5).forEach((c, i) => {
            const m = i === 0 ? '⭐' : ' #' + (i + 1);
            console.log('  ' + m + ' ' + shortTag(c.el) + ' score=' + c.score + ' rows=' + c.totalRows + ' spx=' + c.hasSPXMY);
        });

        const seen = new Set();
        const all = [];
        for (const { sel } of ROW_SELECTORS_SCORED) {
            try {
                for (const row of container.querySelectorAll(sel)) {
                    if (!seen.has(row)) { seen.add(row); all.push(row); }
                }
            } catch (e) {}
        }

        const dataRows = [];
        for (const row of all) {
            if (row === headerRow) continue;
            if (cleanText(row).toLowerCase() === headerText) continue;
            const cells = row.querySelectorAll('td, th');
            if (cells.length < 3) continue;
            if (!cleanText(row)) continue;
            const diff = Math.abs(cells.length - headerCellCount);
            if (hasTrackingNumber(row) || diff <= 3) dataRows.push(row);
        }
        return dataRows;
    }

    function extractCell(row, idx) {
        if (idx < 0) return null;
        const cells = row.querySelectorAll('td, th');
        return idx < cells.length ? cells[idx] : null;
    }

    function findEyeIcon(row, phoneCol) {
        const ctxs = [];
        if (phoneCol >= 0) { const c = extractCell(row, phoneCol); if (c) ctxs.push({ n: 'cell', el: c }); }
        ctxs.push({ n: 'row', el: row });
        for (const ctx of ctxs) {
            for (const sel of EYE_SELECTORS) {
                try { const e = ctx.el.querySelector(sel); if (e) return { selector: sel, element: e, priority: EYE_SELECTORS.indexOf(sel) }; } catch (e) {}
            }
        }
        return null;
    }

    async function runPoC(maxRows = 5) {
        console.clear();
        console.log('%cHAFJET SPX PoC — Container Scored', 'color:#00d4aa;font-weight:bold;font-size:14px');
        const ti = findTableAndHeader();
        if (!ti) { console.error('No table found! Run __spx_poc_debug()'); return; }
        console.log('Headers:', ti.headers.map(h => '[' + h.index + '] ' + h.text).join(' | '));
        for (const [f, i] of Object.entries(ti.mapping)) console.log('  ' + f + ': ' + (i >= 0 ? 'col ' + i : 'NOT FOUND'));
        const rows = getDataRows(ti);
        console.log('Data rows:', rows.length);
        if (!rows.length) { console.error('No data rows!'); return; }
        let masked = 0, revealed = 0, clear = 0, skip = 0;
        for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
            const row = rows[i];
            const track = cleanText(extractCell(row, ti.mapping.tracking));
            const name = cleanText(extractCell(row, ti.mapping.name));
            const phone = cleanText(extractCell(row, ti.mapping.phone));
            const stat = cleanText(extractCell(row, ti.mapping.status));
            console.group('Row #' + (i + 1));
            if (!isValidTracking(track)) { console.warn('Tracking INVALID:', track); skip++; console.groupEnd(); continue; }
            console.log('Tracking:', track, '| Name:', name, '| Status:', stat);
            if (isMaskedPhone(phone)) {
                console.log('Phone:', phone, '(MASKED)'); masked++;
                const eye = findEyeIcon(row, ti.mapping.phone);
                if (!eye) { console.warn('Eye NOT FOUND'); skip++; console.groupEnd(); continue; }
                eye.element.click();
                await sleep(1200);
                const after = cleanText(extractCell(row, ti.mapping.phone));
                if (!isMaskedPhone(after) && isLikelyPhone(after)) {
                    console.log('%c✅ REVEALED: ' + after, 'color:#00d4aa;font-weight:bold;font-size:16px');
                    revealed++;
                } else { console.warn('Still masked:', after); skip++; }
            } else if (isLikelyPhone(phone)) {
                console.log('Phone:', phone, '(CLEAR)'); clear++;
            } else { console.warn('Phone INVALID:', phone); skip++; }
            console.groupEnd();
        }
        console.log('SUMMARY: scanned=' + Math.min(rows.length, maxRows) + ' clear=' + clear + ' masked=' + masked + ' revealed=' + revealed + ' skip=' + skip);
        if (revealed > 0) console.log('%c🎉 SUCCESS!', 'color:#00d4aa;font-weight:bold');
    }

    function debugDOM() {
        console.clear();
        console.log('%cSPX PoC — DOM Debug', 'color:#00d4aa;font-weight:bold;font-size:14px');
        const ti = findTableAndHeader();
        if (ti) {
            const { container, candidates } = findContainer(ti.table, ti.headerRow);
            console.log('Container:', shortTag(container));
            console.log('Top 5:');
            candidates.slice(0, 5).forEach(c => console.log(' ', shortTag(c.el), 'score=' + c.score, 'rows=' + c.totalRows));
        }
        for (const { sel } of ROW_SELECTORS_SCORED) {
            try { const n = document.querySelectorAll(sel).length; if (n) console.log('  ' + sel + ' → ' + n); } catch (e) {}
        }
    }

    window.__spx_poc_run = runPoC;
    window.__spx_poc_debug = debugDOM;
    console.log('%cSPX PoC loaded — __spx_poc_run() | __spx_poc_debug()', 'color:#00d4aa');
})();
