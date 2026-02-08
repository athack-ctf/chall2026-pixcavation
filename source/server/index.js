import express from "express";
import fs from "fs";
import path from "path";
import {Mutex} from "async-mutex";
import Game from "./Game.js";
import {fileURLToPath} from "url";

const app = express();
const PORT = process.env.PORT || 2026;

app.disable("x-powered-by");
app.use(express.json());

// ---------------------------------------------------------------------------------------------------------------------
// ROUTE LOGGING
// ---------------------------------------------------------------------------------------------------------------------
app.use((req, _res, next) => {
    console.log(`[ROUTE] ${req.method} ${req.originalUrl}`);
    next();
});

// ---------------------------------------------------------------------------------------------------------------------
// Serve Vite build (expects built client copied to ./public)
// ---------------------------------------------------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.join(__dirname, "public");

// Serve static assets (js/css/images)
app.use(express.static(WEB_ROOT));

// SPA fallback: anything that's NOT /api/* should return index.html
app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(WEB_ROOT, "index.html"));
});

// ---------------------------------------------------------------------------------------------------------------------
// Mutex (single-process lock)
// ---------------------------------------------------------------------------------------------------------------------
const gameMutex = new Mutex();

// ---------------------------------------------------------------------------------------------------------------------
// Anti-bruteforce primitive (GLOBAL)
// If a wrong submission happens shortly after a game starts,
// delay the next game creation.
// ---------------------------------------------------------------------------------------------------------------------
function createAntiBruteforce({
                                  fastFailMs = 5_000,
                                  penaltyMs = 5_000,
                                  now = () => Date.now(),
                                  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
                              } = {}) {
    let lastGameStartAt = 0;
    let penaltyUntil = 0;

    function onGameStarted() {
        lastGameStartAt = now();
    }

    function onFailedSubmission() {
        const t = now();
        const elapsed = t - lastGameStartAt;

        if (elapsed > 0 && elapsed < fastFailMs) {
            penaltyUntil = Math.max(penaltyUntil, t + penaltyMs);
        }
    }

    async function delayIfPenalized() {
        const waitMs = penaltyUntil - now();
        if (waitMs > 0) {
            console.log(`Brute force attempt detected! Penalizing with delay of ${waitMs}ms.`);
            await sleep(waitMs);
        }
    }

    return {
        onGameStarted,
        onFailedSubmission,
        delayIfPenalized,
    };
}

const antiBrute = createAntiBruteforce();

// ---------------------------------------------------------------------------------------------------------------------
// Flag loading
// ---------------------------------------------------------------------------------------------------------------------
const FLAG_FILE_PATH = path.resolve("./flag.txt");

function loadFlag() {
    try {
        if (fs.existsSync(FLAG_FILE_PATH)) {
            const v = fs.readFileSync(FLAG_FILE_PATH, "utf8").trim();
            if (v) return v;
        }
    } catch (_) {
    }
    return "ATHACKCTF{THIS_IS_A_PLACEHOLDER_FLAG}";
}

// ---------------------------------------------------------------------------------------------------------------------
// Game singleton
// ---------------------------------------------------------------------------------------------------------------------
let game = null;

function requireGame(req, res) {
    if (!game) {
        res.status(400).json({ok: false, error: "No active game. Start a new game first."});
        return false;
    }
    return true;
}

function getNormalizedState() {
    const state = game.getPublicState();
    if (game.flagGranted) {
        state.flag = loadFlag();
    }
    return state;
}

// ---------------------------------------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------------------------------------
app.get("/api/game/exists", (_req, res) => {
    res.json({ok: true, exists: !!game});
});

// ---------------------------------------------------------------------------------------------------------------------
// Game routes (LOCKED)
// ---------------------------------------------------------------------------------------------------------------------

// New game (mutates global state)
app.post("/api/game/new", async (_req, res) => {
    // Anti-bruteforce stays OUT of game/mutex logic
    await antiBrute.delayIfPenalized();

    await gameMutex.runExclusive(async () => {
        antiBrute.onGameStarted();
        game = new Game();
        res.status(201).json({ok: true, state: getNormalizedState()});
    });
});

// Read-only snapshot
app.get("/api/game", async (req, res) => {
    await gameMutex.runExclusive(async () => {
        if (!requireGame(req, res)) return;
        res.json({ok: true, state: getNormalizedState()});
    });
});

// Reveal pixel
app.post("/api/game/reveal", async (req, res) => {
    await gameMutex.runExclusive(async () => {
        if (!requireGame(req, res)) return;

        try {
            const {x, y} = req.body || {};
            const revealed = game.revealPixel(x, y);

            res.json({
                ok: true,
                revealed,
                state: getNormalizedState(),
            });
        } catch (e) {
            res.status(400).json({ok: false, error: e.message});
        }
    });
});

// Submit guess
app.post("/api/game/submit", async (req, res) => {
    await gameMutex.runExclusive(async () => {
        if (!requireGame(req, res)) return;

        try {
            const {guess} = req.body || {};
            const result = game.submitGuess(guess);

            // Explicit signal from Game: correct === false
            if (result?.correct === false) {
                antiBrute.onFailedSubmission();
            }

            res.json({
                ok: true,
                result,
                state: getNormalizedState(),
            });
        } catch (e) {
            res.status(400).json({ok: false, error: e.message});
        }
    });
});

// Give up
app.post("/api/game/giveup", async (req, res) => {
    await gameMutex.runExclusive(async () => {
        if (!requireGame(req, res)) return;

        try {
            const result = game.giveUp();
            res.json({ok: true, result, state: getNormalizedState()});
        } catch (e) {
            res.status(400).json({ok: false, error: e.message});
        }
    });
});

// ---------------------------------------------------------------------------------------------------------------------
// 404 (API only — web app routes handled by SPA fallback above)
// ---------------------------------------------------------------------------------------------------------------------
app.use((req, res) => {
    res.status(404);
    const accepts = req.accepts(["html", "json"]);

    if (accepts === "html") {
        res.type("html")
            .send(`<html><head><title>404</title></head><body><h1>404</h1><p>Nothing to pixcavate here.</p></body></html>`);
        return;
    }

    res.json({ok: false, error: "Not Found"});
});

// ---------------------------------------------------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
