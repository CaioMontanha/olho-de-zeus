"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const cwd = process.cwd();
const root = (0, node_path_1.basename)(cwd).toLowerCase() === 'api' ? (0, node_path_1.resolve)(cwd, '..') : cwd;
try {
    const contents = (0, node_fs_1.readFileSync)((0, node_path_1.resolve)(root, '.env'), 'utf8');
    for (const line of contents.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!match || match[1] in process.env)
            continue;
        process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
}
catch { /* Local .env is optional; production should set process environment. */ }
