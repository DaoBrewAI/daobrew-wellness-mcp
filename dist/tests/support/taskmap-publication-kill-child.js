"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const native_refresh_service_js_1 = require("../../src/engine/taskmap/native-refresh-service.js");
const source_contracts_js_1 = require("../../src/engine/taskmap/source-contracts.js");
async function stall(input) {
    (0, node_fs_1.writeFileSync)(input.markerPath, `${input.killStage}-durable\n`, {
        mode: 0o600,
    });
    await new Promise(() => {
        setInterval(() => { }, 1_000);
    });
}
async function main() {
    const encoded = process.argv[2];
    if (encoded === undefined)
        throw new Error("missing publication input");
    const input = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const prettyWrite = async (directory, filename, value) => {
        (0, node_fs_1.writeFileSync)(`${directory}/${filename}`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
        await stall(input);
    };
    const canonicalWrite = async (directory, filename, value) => {
        (0, node_fs_1.writeFileSync)(`${directory}/${filename}`, (0, source_contracts_js_1.taskMapContractCanonicalJson)(value), { mode: 0o600 });
        await stall(input);
    };
    const dependencies = input.killStage === "currentness"
        ? { writeCurrentness: prettyWrite }
        : input.killStage === "current-work"
            ? { writeCurrentWork: canonicalWrite }
            : input.killStage === "ranking"
                ? { writeRanking: canonicalWrite }
                : input.killStage === "projection"
                    ? {
                        writeProjection: async () => stall(input),
                    }
                    : input.killStage === "manifest"
                        ? { writeGenerationManifest: canonicalWrite }
                        : { writeGenerationReference: canonicalWrite };
    await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(input.projectionPath, input.currentnessPath, input.journalPath, input.publication, dependencies);
}
void main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
});
