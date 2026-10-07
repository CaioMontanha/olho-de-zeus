"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStatus = getStatus;
function getStatus(checks, baseLatency) { const last = checks.slice(-5); const failures = last.filter(c => !c.ok).length; if (failures >= 3)
    return 'down'; if (failures >= 1 || last.reduce((a, c) => a + c.latency_ms, 0) / Math.max(1, last.length) > baseLatency * 2)
    return 'degraded'; return 'operational'; }
