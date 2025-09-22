import express from "express";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";
import User from "../models/User.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// Register new user
router.post(
  "/register",
  [
    body("name")
      .trim()
      .isLength({ min: 2 })
      .withMessage("Name must be at least 2 characters long"),
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long"),
    body("confirmPassword").custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Password confirmation does not match password");
      }
      return true;
    }),
    body("gender")
      .isIn(["male", "female"])
      .withMessage("Please select a valid gender option"),
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { name, email, password, gender } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "User with this email already exists",
        });
      }

      // Create new user
      const user = new User({
        name,
        email,
        password,
        gender,
      });

      await user.save();

      // Generate JWT token
      const token = generateToken(user._id);

      res.status(201).json({
        success: true,
        message: "User created successfully",
        data: {
          user: user.toJSON(),
          token,
        },
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({
        success: false,
        message: "Server error during registration",
      });
    }
  }
);

// Login user
router.post(
  "/login",
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { email, password } = req.body;

      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      // Check password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      // Generate JWT token
      const token = generateToken(user._id);

      res.json({
        success: true,
        message: "Login successful",
        data: {
          user: user.toJSON(),
          token,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({
        success: false,
        message: "Server error during login",
      });
    }
  }
);

// Get current user profile
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: req.user,
      },
    });
  } catch (error) {
    console.error("Profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching profile",
    });
  }
});

// Verify token endpoint
router.get("/verify", authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: "Token is valid",
    data: {
      user: req.user,
    },
  });
});

// Update user profile
router.put(
  "/profile",
  authenticateToken,
  [
    body("name")
      .optional()
      .trim()
      .isLength({ min: 2 })
      .withMessage("Name must be at least 2 characters long"),
    body("phone")
      .optional()
      .trim()
      .isLength({ max: 20 })
      .withMessage("Phone number cannot exceed 20 characters"),
    body("bio")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Bio cannot exceed 500 characters"),
    body("location")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Location cannot exceed 100 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const userId = req.user._id;
      const updates = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Update profile fields
      if (updates.name) user.name = updates.name;
      if (updates.phone) user.profile.phone = updates.phone;
      if (updates.bio) user.profile.bio = updates.bio;
      if (updates.location) user.profile.location = updates.location;

      await user.save();

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: {
          user: user.toJSON(),
        },
      });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({
        success: false,
        message: "Server error updating profile",
      });
    }
  }
);

// Update user preferences
router.put(
  "/preferences",
  authenticateToken,
  [
    body("emailNotifications").optional().isBoolean(),
    body("rsvpReminders").optional().isBoolean(),
    body("guestPhotoUploads").optional().isBoolean(),
    body("publicGallery").optional().isBoolean(),
    body("guestListAccess").optional().isBoolean(),
    body("budgetSharing").optional().isBoolean(),
    body("theme").optional().isIn(["light", "dark", "auto"]),
    body("language").optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const userId = req.user._id;
      const updates = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Update preferences
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined && user.preferences[key] !== undefined) {
          user.preferences[key] = updates[key];
        }
      });

      await user.save();

      res.json({
        success: true,
        message: "Preferences updated successfully",
        data: {
          user: user.toJSON(),
        },
      });
    } catch (error) {
      console.error("Update preferences error:", error);
      res.status(500).json({
        success: false,
        message: "Server error updating preferences",
      });
    }
  }
);

export default router;
