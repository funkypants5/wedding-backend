
import express from "express";
import { body, validationResult } from "express-validator";
import Event from "../models/Event.js";
import User from "../models/User.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

router.get("/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({
      _id: userId,
    })
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found or you don't have access",
      });
    }

    res.json({
      success: true,
      data: {
        user,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching user",
    });
  }
});

export default router