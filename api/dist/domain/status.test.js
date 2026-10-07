"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const status_1 = require("./status");
(0, vitest_1.describe)('getStatus', () => { (0, vitest_1.it)('classifica falhas', () => { (0, vitest_1.expect)((0, status_1.getStatus)([{ ok: true, latency_ms: 100 }], 100)).toBe('operational'); (0, vitest_1.expect)((0, status_1.getStatus)([{ ok: false, latency_ms: 100 }], 100)).toBe('degraded'); (0, vitest_1.expect)((0, status_1.getStatus)([{ ok: false, latency_ms: 100 }, { ok: false, latency_ms: 100 }, { ok: false, latency_ms: 100 }], 100)).toBe('down'); }); (0, vitest_1.it)('classifica latência acima do dobro', () => (0, vitest_1.expect)((0, status_1.getStatus)([{ ok: true, latency_ms: 201 }], 100)).toBe('degraded')); });
