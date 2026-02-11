import {createCanvas, registerFont} from "canvas";
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Game {
    // -----------------------------------------------------------------------------------------------------------------
    // Constants and configurations
    // -----------------------------------------------------------------------------------------------------------------

    static IS_PROD = process.env.NODE_ENV === "production";

    static CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    static TEXT_LINE_LENGTH = 12;
    static TEXT_LINE_COUNT = 4;

    static FONTS_PATH = path.join(__dirname, "./fonts");

    static FONT_FILE = "PIXY.otf"; // GOOD

    static FONT_SIZE = 10;
    static FONT_FAMILY = `__fam__${Game.FONT_FILE}__`;

    static TMP_DIR = path.join(__dirname, "./tmp");

    static PIXEL_BUDGET_PER_CHAR = Math.ceil(Math.log2(Game.CHARSET.length));
    static MAX_REVEALED_PIXELS = Game.PIXEL_BUDGET_PER_CHAR * Game.TEXT_LINE_LENGTH * Game.TEXT_LINE_COUNT;

    // Rendering defaults (centralized)
    static DEFAULT_LINE_HEIGHT_MULT = 1.2;
    static DEFAULT_BACKGROUND = "white";
    static DEFAULT_FOREGROUND = "black";
    static BW_THRESHOLD = 128;

    // -----------------------------------------------------------------------------------------------------------------
    // Reusable render helpers
    // -----------------------------------------------------------------------------------------------------------------

    static _ensureFontRegistered() {
        registerFont(path.join(Game.FONTS_PATH, Game.FONT_FILE), {
            family: Game.FONT_FAMILY,
        });
    }

    static _measureCharBox({lineHeightMult = Game.DEFAULT_LINE_HEIGHT_MULT} = {}) {
        const measureCanvas = createCanvas(10, 10);
        const measureCtx = measureCanvas.getContext("2d");
        measureCtx.font = `${Game.FONT_SIZE}px "${Game.FONT_FAMILY}"`;

        // For monospace fonts: "M" is typically the full advance width
        const charWidth = Math.max(1, Math.ceil(measureCtx.measureText("M").width));
        const charHeight = Math.max(1, Math.ceil(Game.FONT_SIZE * lineHeightMult));

        return {charWidth, charHeight};
    }

    /**
     * Strict grid: NO padding, NO extra pixels.
     * width  = charWidth  * lineLen
     * height = charHeight * lineCount
     */
    static _getStrictCanvasDims({charWidth, charHeight, lineLen, lineCount}) {
        const width = charWidth * lineLen;
        const height = charHeight * lineCount;

        return {width, height, cellWidth: charWidth, cellHeight: charHeight};
    }

    static _renderTextMatrixToBinary({
                                         textMatrix,
                                         lineLen,
                                         lineCount,
                                         threshold = Game.BW_THRESHOLD,
                                         lineHeightMult = Game.DEFAULT_LINE_HEIGHT_MULT,
                                         background = Game.DEFAULT_BACKGROUND,
                                         foreground = Game.DEFAULT_FOREGROUND,
                                     } = {}) {
        Game._ensureFontRegistered();

        const {charWidth, charHeight} = Game._measureCharBox({lineHeightMult});
        const {width, height, cellWidth, cellHeight} = Game._getStrictCanvasDims({
            charWidth,
            charHeight,
            lineLen,
            lineCount,
        });

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");

        // Background
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);

        // Text
        ctx.fillStyle = foreground;
        ctx.font = `${Game.FONT_SIZE}px "${Game.FONT_FAMILY}"`;
        ctx.textBaseline = "top";

        // STRICT placement: top-left of each cell
        for (let y = 0; y < lineCount; y++) {
            for (let x = 0; x < lineLen; x++) {
                const ch = textMatrix?.[y]?.[x] ?? "";
                ctx.fillText(ch, x * cellWidth, y * cellHeight);
            }
        }

        // Threshold + pixelMatrix (same logic as you had)
        const img = ctx.getImageData(0, 0, width, height);
        const d = img.data;

        const pixelMatrix = [];
        for (let yy = 0; yy < height; yy++) {
            const row = [];
            for (let xx = 0; xx < width; xx++) {
                const i = (yy * width + xx) * 4;

                const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                const isBlack = lum < threshold;

                const v = isBlack ? 0 : 255;
                d[i] = d[i + 1] = d[i + 2] = v;
                d[i + 3] = 255;

                row.push(isBlack ? 1 : 0);
            }
            pixelMatrix.push(row);
        }

        ctx.putImageData(img, 0, 0);

        return {
            canvas,
            ctx,
            pixelMatrix,
            width,
            height,
            charWidth,
            charHeight,
            cellWidth,
            cellHeight,
            threshold,
            lineLen,
            lineCount,
        };
    }

    static exportCharsetGlyphs({
                                   outPath = path.join(Game.TMP_DIR, "charset_glyphs/charset_glyphs.json"),
                                   savePngs = false,
                                   pngDir = path.join(Game.TMP_DIR, "charset_glyphs/pngs"),
                                   threshold = Game.BW_THRESHOLD,
                                   lineHeightMult = Game.DEFAULT_LINE_HEIGHT_MULT,
                               } = {}) {
        Game._ensureFontRegistered();

        const lineLen = 1;
        const lineCount = 1;

        const glyphs = {};

        if (savePngs) {
            if (!fs.existsSync(pngDir)) fs.mkdirSync(pngDir, {recursive: true});
        }

        const probe = Game._renderTextMatrixToBinary({
            textMatrix: [["A"]],
            lineLen,
            lineCount,
            threshold,
            lineHeightMult,
        });

        for (const ch of Game.CHARSET) {
            const r = Game._renderTextMatrixToBinary({
                textMatrix: [[ch]],
                lineLen,
                lineCount,
                threshold,
                lineHeightMult,
            });

            glyphs[ch] = r.pixelMatrix;

            if (savePngs) {
                fs.writeFileSync(path.join(pngDir, `${ch}.png`), r.canvas.toBuffer("image/png"));
            }
        }

        const outDir = path.dirname(outPath);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, {recursive: true});

        const payload = {
            meta: {
                width: probe.width,
                height: probe.height,
                cellWidth: probe.cellWidth,
                cellHeight: probe.cellHeight,
                fontFile: Game.FONT_FILE,
                fontSize: Game.FONT_SIZE,
                threshold,
                lineHeightMult,
                charset: Game.CHARSET,
            },
            glyphs,
        };

        fs.writeFileSync(outPath, JSON.stringify(payload), "utf8");

        return {
            outPath,
            pngDir: savePngs ? pngDir : null,
            count: Game.CHARSET.length,
        };
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------------------------------------------------

    constructor() {
        this._init();
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Public APIs
    // -----------------------------------------------------------------------------------------------------------------

    getDimensions() {
        return {
            width: this.pixelMatrix[0]?.length ?? 0,
            height: this.pixelMatrix.length,
        };
    }

    getRemainingReveals() {
        const remaining = Game.MAX_REVEALED_PIXELS - this.revealedPixels.size;
        return remaining > 0 ? remaining : 0;
    }

    hasExceededBudget() {
        return this.revealedPixels.size > Game.MAX_REVEALED_PIXELS;
    }

    getPublicState() {
        const {width, height} = this.getDimensions();

        const state = {
            width,
            height,

            textLineLength: Game.TEXT_LINE_LENGTH,
            textLineCount: Game.TEXT_LINE_COUNT,

            maxReveals: Game.MAX_REVEALED_PIXELS,
            remainingReveals: this.getRemainingReveals(),
            revealedCount: this.revealedPixels.size,
            exceededBudget: this.hasExceededBudget(),

            finished: this.finished,
            forfeited: this.forfeited,

            hasSubmitted: this.hasSubmitted,
            submission: this.submission,

            flagGranted: this.flagGranted,

            revealedPixels: this.getRevealedPixels(),
        };

        if (this.finished) {
            state.text = this.text;
            state.pixelMatrix = this.pixelMatrix;
        }

        return state;
    }

    revealPixel(x, y) {
        x = Number(x);
        y = Number(y);

        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isInteger(x) || !Number.isInteger(y)) {
            throw new Error("Invalid pixel coordinates");
        }

        const {width, height} = this.getDimensions();
        if (x < 0 || y < 0 || y >= height || x >= width) {
            throw new Error("Pixel out of bounds");
        }

        // Stop all interaction after the single attempt (submit or give up)
        if (this.finished) {
            throw new Error("Game is finished!");
        }

        if (this.forfeited) {
            throw new Error("Fully revealed already!");
        }

        const key = `${x},${y}`;

        if (this.revealedPixels.has(key)) {
            return {
                x,
                y,
                pixelVal: this.pixelMatrix[y][x],
                remainingReveals: this.getRemainingReveals(),
                alreadyRevealed: true,
                exceededBudget: this.hasExceededBudget(),
            };
        }

        this.revealedPixels.add(key);

        return {
            x,
            y,
            pixelVal: this.pixelMatrix[y][x],
            remainingReveals: this.getRemainingReveals(),
            alreadyRevealed: false,
            exceededBudget: this.hasExceededBudget(),
        };
    }

    submitGuess(guess) {

        if (this.forfeited) {
            throw new Error("Fully revealed already!");
        }

        if (this.hasSubmitted) {
            throw new Error("Only one submission is allowed!");
        }

        if (this.finished) {
            throw new Error("This game is finished!");
        }

        const g = String(guess ?? "").toUpperCase();
        const correct = g === this.text;

        const withinBudgetAtSubmit = this.revealedPixels.size <= Game.MAX_REVEALED_PIXELS;

        this.hasSubmitted = true;
        this.finished = true;

        this.flagGranted = Boolean(correct && withinBudgetAtSubmit);

        // Rename from lastSubmission -> submission, no counters
        this.submission = {
            correct,
            flagGranted: this.flagGranted,
            withinBudget: withinBudgetAtSubmit,
            revealedCount: this.revealedPixels.size,
            attemptedGuess: g,
        };

        return this.submission;
    }

    giveUp() {
        // Giving up is also the one attempt
        if (this.hasSubmitted || this.finished) {
            throw new Error("Only one attempt is allowed!");
        }

        this.finished = true;
        this.forfeited = true;
        this.flagGranted = false;

        this.hasSubmitted = true;

        this.submission = {
            correct: false,
            flagGranted: false,
            withinBudget: this.revealedPixels.size <= Game.MAX_REVEALED_PIXELS,
            revealedCount: this.revealedPixels.size,
            attemptedGuess: "",
        };

        return {forfeited: true};
    }

    getRevealedPixels() {
        return Array.from(this.revealedPixels, (key) => {
            const [x, y] = key.split(",").map(Number);
            return {x, y, pixelVal: this.pixelMatrix[y][x]};
        });
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Internal methods
    // -----------------------------------------------------------------------------------------------------------------

    _init() {
        Game._ensureFontRegistered();

        const totalLength = Game.TEXT_LINE_LENGTH * Game.TEXT_LINE_COUNT;

        this.text = Array.from({length: totalLength}, () =>
            Game.CHARSET[Math.floor(Math.random() * Game.CHARSET.length)]
        ).join("");

        this.textMatrix = [];
        for (let y = 0; y < Game.TEXT_LINE_COUNT; y++) {
            const row = [];
            for (let x = 0; x < Game.TEXT_LINE_LENGTH; x++) {
                row.push(this.text[y * Game.TEXT_LINE_LENGTH + x]);
            }
            this.textMatrix.push(row);
        }

        this.revealedPixels = new Set();

        this.hasSubmitted = false;
        this.submission = null;

        this.finished = false;
        this.forfeited = false;

        this.flagGranted = false;

        this._renderText();
        if (!Game.IS_PROD) {
            this._saveDebugInfoToTmp();
        }
    }

    _renderText() {
        const r = Game._renderTextMatrixToBinary({
            textMatrix: this.textMatrix,
            lineLen: Game.TEXT_LINE_LENGTH,
            lineCount: Game.TEXT_LINE_COUNT,
            threshold: Game.BW_THRESHOLD,
            lineHeightMult: Game.DEFAULT_LINE_HEIGHT_MULT,
            background: Game.DEFAULT_BACKGROUND,
            foreground: Game.DEFAULT_FOREGROUND,
        });

        this.charWidth = r.charWidth;
        this.charHeight = r.charHeight;
        this.cellWidth = r.cellWidth;
        this.cellHeight = r.cellHeight;

        this.canvas = r.canvas;
        this.pixelMatrix = r.pixelMatrix;
    }

    _saveDebugInfoToTmp() {
        if (!fs.existsSync(Game.TMP_DIR)) {
            fs.mkdirSync(Game.TMP_DIR, {recursive: true});
        }

        const stamp = Date.now();
        const rand = Math.random().toString(36).slice(2, 6);
        const baseName = `game_${stamp}_${rand}`;

        const imgFileName = `${baseName}.png`;
        const txtFileName = `${baseName}.txt`;

        const imgPath = path.join(Game.TMP_DIR, imgFileName);
        const txtPath = path.join(Game.TMP_DIR, txtFileName);

        const buffer = this.canvas.toBuffer("image/png");
        fs.writeFileSync(imgPath, buffer);

        fs.writeFileSync(txtPath, this.text, "utf8");
    }
}

export default Game;
