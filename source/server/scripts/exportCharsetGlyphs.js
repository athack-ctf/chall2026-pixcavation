import Game from "../Game.js";
import path from "path";
import {fileURLToPath} from "url";

const IS_PROD = process.env.NODE_ENV === "production";

if (IS_PROD) {
    throw new Error("We're not running this in prod :))")
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

Game.exportCharsetGlyphs({
    savePngs: true,
    pngDir: path.join(__dirname, "../tmp/charset_glyphs/pngs"),
    outPath: path.join(__dirname, "../tmp/charset_glyphs/charset_glyphs.json"),
});
