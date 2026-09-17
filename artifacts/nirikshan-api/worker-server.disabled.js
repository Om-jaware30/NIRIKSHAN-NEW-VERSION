import app from "./server.js";
import { httpServerHandler } from "cloudflare:node";

app.listen(3000);

export default httpServerHandler({ port: 3000 });
