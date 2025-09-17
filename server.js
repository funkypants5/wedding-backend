import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/database.js";
import authRoutes from "./routes/auth.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(
  cors({
    origin: [process.env.FRONTEND_URL || "http://localhost:8080"],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Wedding Planner API is running",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("Global error handler:", error);
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Wedding Planner API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔐 Auth endpoints: http://localhost:${PORT}/api/auth`);
});
