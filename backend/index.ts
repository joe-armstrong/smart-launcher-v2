import Path                   from "path"
import FS                     from "fs"
import express                from "express"
import cors                   from "cors"
import jose                   from "node-jose"
import config                 from "./config"
import fhirServer             from "./routes/fhir"
import authServer             from "./routes/auth"
import launcher               from "./routes/launcher"
import { bool }               from "./lib"
import { globalErrorHandler } from "./middlewares"


const app = express()

// CORS everywhere :)
app.use(cors({ origin: true, credentials: true }))

app.use(express.static(Path.join(__dirname, '../build/')));

app.get("/smart-style.json", (_, res) => {
    res.json({
        color_background    : "#edeae3",
        color_error         : "#9e2d2d",
        color_highlight     : "#69b5ce",
        color_modal_backdrop: "",
        color_success       : "#498e49",
        color_text          : "#303030",
        dim_border_radius   : "6px",
        dim_font_size       : "13px",
        dim_spacing_size    : "20px",
        font_family_body    : "Georgia, Times, 'Times New Roman', serif",
        font_family_heading : "'HelveticaNeue-Light', Helvetica, Arial, 'Lucida Grande', sans-serif;"
    })
})

// Auth server
app.use(["/v/:fhir_release/sim/:sim/auth", "/v/:fhir_release/auth"], authServer)

// FHIR servers
app.use(["/v/:fhir_release/sim/:sim/fhir", "/v/:fhir_release/fhir"], fhirServer)

// The launcher endpoint
app.get("/launcher", launcher);

// Host public keys for backend services JWKS auth
app.get("/keys", async (_, res) => {
    const key = await jose.JWK.asKey(config.privateKeyAsPem, "pem", { alg: "RS256", key_ops: ["verify"] })
    res.json(key.keystore.toJSON(false));
});

// Also host the public key as PEM
app.get("/public_key", (_, res) => {
    FS.readFile(__dirname + "/../public-key.pem", "utf8", (err, key) => {
        if (err) {
            return res.status(500).end("Failed to read public key");
        }
        res.type("text").send(key);
    });
});

// Provide some env variables to the frontend
app.use("/env.js", (_, res) => {
    const out = {
        NODE_ENV                : process.env.NODE_ENV      || "production",
        PICKER_ORIGIN           : process.env.PICKER_ORIGIN || "https://patient-browser.smarthealthit.org",
        
        DISABLE_BACKEND_SERVICES: bool(process.env.DISABLE_BACKEND_SERVICES),
        GOOGLE_ANALYTICS_ID     : process.env.GOOGLE_ANALYTICS_ID,
        CDS_SANDBOX_URL         : process.env.CDS_SANDBOX_URL,
        
        FHIR_SERVER_R2          : process.env.FHIR_SERVER_R2 || "",
        FHIR_SERVER_R3          : process.env.FHIR_SERVER_R3 || "",
        FHIR_SERVER_R4          : process.env.FHIR_SERVER_R4 || "",
    };

    res.type("application/javascript").send(`var ENV = ${JSON.stringify(out, null, 4)};`);
});

// React app - redirect all to ./build/index.html
app.get("*", (_, res) => res.sendFile("index.html", { root: "./build" }));

// Catch all errors
app.use(globalErrorHandler)

// Start the server if ran directly (tests import it and start it manually)
/* istanbul ignore if */
if (require.main?.filename === __filename) {
    app.listen(+config.port, config.host, () => {
        console.log(`SMART launcher listening on port ${config.port}!`)
    });

    if (process.env.SSL_PORT) {
        require('pem').createCertificate({
            days: 100,
            selfSigned: true
        }, (err: Error, keys: any) => {
            if (err) {
                throw err
            }
            require("https").createServer({
                key : keys.serviceKey,
                cert: keys.certificate
            }, app).listen(process.env.SSL_PORT, config.host, () => {
                console.log(`SMART launcher listening on port ${process.env.SSL_PORT}!`)
            });
        });
    }
}

export default app
