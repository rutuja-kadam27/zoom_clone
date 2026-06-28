import express from "express";
import { createServer } from "node:http";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { connectToSocket } from "./controllers/socketManager.js";
import userRoutes from "./routes/users.routes.js";

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = connectToSocket(server);

const PORT = process.env.PORT || 8000;
app.set("port", PORT);

app.use(cors());
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }));

app.get("/", (req, res) => {
    res.json({ message: "MeetSphere Backend is running successfully!" });
});

app.use("/api/v1/users", userRoutes);

const start = async () => {
    try {
        const mongoUrl = process.env.MONGO_URL || "mongodb+srv://rutujakadam2727_db_user:HmSQP1m0ECQMM34R@clustervc.xwhgwpb.mongodb.net/?appName=ClusterVc";
        const connectionDb = await mongoose.connect(mongoUrl);
        console.log(`MONGO Connected DB Host: ${connectionDb.connection.host}`);

        server.listen(PORT, () => {
            console.log(`LISTENING ON PORT ${PORT}`);
        });
    } catch (error) {
        console.error("Error starting server:", error);
        process.exit(1);
    }
};

start();