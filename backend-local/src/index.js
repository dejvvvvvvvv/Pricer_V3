import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import multer from "multer";

import { ensureDir, fileExists } from "./util/fsSafe.js";
import { findPrusaSlicerConsole } from "./util/findSlicer.js";
import { runPrusaSlicer } from "./slicer/runPrusaSlicer.js";
import { parseGcodeMetrics } from "./slicer/parseGcode.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(backendRoot, "..");

const isWin = process.platform === "win32";

const PORT = Number(process.env.PORT || 3001);
const WORKSPACE_ROOT = process.env.SLICER_WORKSPACE_ROOT || (isWin ? "C:\\modelpricer\\tmp" : path.join(os.tmpdir(), "modelpricer"));
const DEFAULT_INI = process.env.PRUSA_DEFAULT_INI || "";

const app = express();

// CORS for local dev
const corsOriginsRaw = (process.env.CORS_ORIGINS || "").trim();
const corsOrigins = corsOriginsRaw
  ? corsOriginsRaw.split(",").map((s) => s.trim()).filter(Boolean)
  : ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl/postman
      if (corsOrigins.includes("*")) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true
  })
);

app.get("/api/health", async (_req, res) => {
  res.json({
    ok: true,
    service: "modelpricer-backend-local",
    port: PORT,
    workspaceRoot: WORKSPACE_ROOT,
    projectRoot,
    backendRoot,
    time: new Date().toISOString()
  });
});

app.get("/api/health/prusa", async (_req, res) => {
  try {
    const slicerCmd = await resolveSlicerCmd();
    if (!slicerCmd) {
      return res.status(500).json({
        ok: false,
        error: "PRUSA_SLICER_CMD not set and auto-detect failed.",
        hint: `Put PrusaSlicer portable into ${path.join(projectRoot, "tools", "prusaslicer")} and/or set PRUSA_SLICER_CMD in backend-local/.env`
      });
    }

    if (!(await fileExists(slicerCmd))) {
      return res.status(500).json({ ok: false, error: `Slicer not found at: ${slicerCmd}` });
    }

    // Quick check: some builds don't support --version (Windows portable often doesn't).
    // Try --version first, fallback to --help.
    let checkMethod = "--version";
    let first = await runSimple(slicerCmd, ["--version"], 15000);
    let final = first;

    if (first.exitCode !== 0) {
      checkMethod = "--help";
      final = await runSimple(slicerCmd, ["--help"], 15000);
    }

    const stdout = truncate(final.stdout.trim(), 2000);
    const stderr = truncate(final.stderr.trim(), 2000);

    res.json({
      ok: final.exitCode === 0,
      slicerCmd,
      checkMethod,
      exitCode: final.exitCode,
      stdout,
      stderr,
      // Useful when --version failed
      initialExitCode: first.exitCode,
      initialStderr: truncate(first.stderr.trim(), 500)
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ===== Upload & slice =====

await ensureDir(WORKSPACE_ROOT);

app.post(
  "/api/slice",
  createJobMiddleware,
  createUploader().fields([
    { name: "model", maxCount: 1 },
    { name: "ini", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const slicerCmd = await resolveSlicerCmd();
      if (!slicerCmd) {
        return res.status(500).json({
          success: false,
          error: "PrusaSlicer CLI not configured.",
          hint: "Set PRUSA_SLICER_CMD in backend-local/.env or place portable in ../tools/prusaslicer"
        });
      }

      const modelFile = req.files?.model?.[0];
      if (!modelFile?.path) {
        return res.status(400).json({ success: false, error: "Missing file field 'model' (multipart)." });
      }

      const iniFile = req.files?.ini?.[0];
      const iniPath = iniFile?.path || DEFAULT_INI;
      if (!iniPath) {
        return res.status(400).json({
          success: false,
          error: "No .ini profile provided.",
          hint: "Upload an 'ini' file OR set PRUSA_DEFAULT_INI in backend-local/.env (export from PrusaSlicer GUI)."
        });
      }
      if (!(await fileExists(iniPath))) {
        return res.status(400).json({ success: false, error: `INI not found: ${iniPath}` });
      }

      const run = await runPrusaSlicer({
        slicerCmd,
        modelPath: modelFile.path,
        iniPath,
        outDir: req.jobOutputDir,
        timeoutMs: 300000
      });

      // Persist slicer stderr for debugging
      if (run.stderr) {
        await fs.writeFile(path.join(req.jobDir, "prusa_stderr.log"), run.stderr, "utf8").catch(() => {});
      }
      if (run.stdout) {
        await fs.writeFile(path.join(req.jobDir, "prusa_stdout.log"), run.stdout, "utf8").catch(() => {});
      }

      if (run.exitCode !== 0) {
        return res.status(500).json({
          success: false,
          error: "PrusaSlicer returned non-zero exit code.",
          exitCode: run.exitCode,
          jobId: req.jobId,
          jobDir: req.jobDir,
          stderr: run.stderr.slice(0, 5000)
        });
      }

      if (!(await fileExists(run.outGcodePath))) {
        return res.status(500).json({
          success: false,
          error: "out.gcode was not produced.",
          jobId: req.jobId,
          jobDir: req.jobDir,
          stderr: run.stderr.slice(0, 5000)
        });
      }

      const gcodeText = await fs.readFile(run.outGcodePath, "utf8");
      const metrics = parseGcodeMetrics(gcodeText);

      res.json({
        success: true,
        jobId: req.jobId,
        jobDir: req.jobDir,
        outGcodePath: run.outGcodePath,
        durationMs: run.durationMs,
        slicerCmd,
        iniUsed: iniPath,
        modelUsed: modelFile.originalname,
        metrics
      });
    } catch (e) {
      res.status(500).json({
        success: false,
        jobId: req.jobId,
        jobDir: req.jobDir,
        error: String(e?.message || e)
      });
    }
  }
);

// ===== Error handler (CORS etc.) =====
app.use((err, _req, res, _next) => {
  res.status(500).json({ success: false, error: String(err?.message || err) });
});

app.listen(PORT, () => {
  console.log(`[backend-local] listening on http://127.0.0.1:${PORT}`);
  console.log(`[backend-local] workspace: ${WORKSPACE_ROOT}`);
});

// ===== Helpers =====

async function resolveSlicerCmd() {
  const fromEnv = (process.env.PRUSA_SLICER_CMD || "").trim();
  if (fromEnv) return fromEnv;
  // Try auto-detect inside project root
  const found = await findPrusaSlicerConsole(projectRoot);
  return found || "";
}

function createJobMiddleware(req, _res, next) {
  const jobId = `job-${nanoid(10)}`;
  req.jobId = jobId;
  req.jobDir = path.join(WORKSPACE_ROOT, jobId);
  req.jobInputDir = path.join(req.jobDir, "input");
  req.jobOutputDir = path.join(req.jobDir, "output");

  Promise.all([ensureDir(req.jobInputDir), ensureDir(req.jobOutputDir)])
    .then(() => next())
    .catch(next);
}

function createUploader() {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, req.jobInputDir);
    },
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9\._-]/g, "_");
      cb(null, safe);
    }
  });

  const fileFilter = (_req, file, cb) => {
    const name = (file.originalname || "").toLowerCase();
    const ok = name.endsWith(".stl") || name.endsWith(".obj") || name.endsWith(".3mf") || name.endsWith(".amf") || name.endsWith(".ini");
    if (!ok) return cb(new Error(`Unsupported file type: ${file.originalname}`));
    cb(null, true);
  };

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: 250 * 1024 * 1024 // 250MB
    }
  });
}

async function runSimple(cmd, args, timeoutMs) {
  // Minimal runner for health check
  const { spawn } = await import("node:child_process");
  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += String(d)));
    child.stderr?.on("data", (d) => (stderr += String(d)));

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmd} ${args.join(" ")}`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}

function truncate(s, maxLen) {
  if (!s) return "";
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + `\n... (truncated ${s.length - maxLen} chars)`;
}
