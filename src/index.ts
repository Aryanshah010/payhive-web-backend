import express, { Application, Request, Response } from 'express';
import dotenv from 'dotenv';
import bodyparser from 'body-parser'
import { PORT } from "./configs";
import { connectDb } from "./database/mongodb";
import authRouters from "./routes/auth.route";

dotenv.config();
console.log(process.env.PORT);


const app: Application = express();
app.use(bodyparser.json())
app.use("/api/auth", authRouters);


app.get("/", (req: Request, res: Response) => {
    res.send("Hello, World!")
});

async function startServer() {
    await connectDb();

    app.listen(PORT, () => {
        console.log(`Sever: http://localhost:${PORT}`)
    })
}

startServer();
