import express from "express";
import { body, validationResult } from "express-validator";
import multer from "multer";
import path from "path";
import fs from "fs";
import Event from "../models/Event.js";
import User from "../models/User.js";
import { authenticateToken } from "../middleware/auth.js";
import {
  requireEventMember,
  requireOwner,
  requireOwnerOrAdmin,
  blockPendingUsers,
} from "../middleware/authorization.js";

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/vendors";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only images and documents are allowed"));
    }
  },
});

// Create new event
router.post(
  "/create",
  authenticateToken,
  [
    body("name")
      .trim()
      .isLength({ min: 2 })
      .withMessage("Event name must be at least 2 characters long"),
    body("description")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Description cannot exceed 500 characters"),
    body("eventType")
      .isIn(["wedding", "engagement", "anniversary", "other"])
      .withMessage("Please select a valid event type"),
    body("eventDate")
      .isISO8601()
      .withMessage("Please provide a valid event date"),
    body("location")
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage("Location cannot exceed 200 characters"),
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

      const { name, description, eventType, eventDate, location } = req.body;
      const userId = req.user._id;
      const userGender = req.user.gender;

      console.log("BACKEND EVENT CREATION DEBUG:");
      console.log("Request user from token:", req.user);
      console.log("User ID from token:", userId);
      console.log("User gender:", userGender);

      // Create new event
      const event = new Event({
        name,
        description,
        eventType,
        eventDate: new Date(eventDate),
        location,
        createdBy: userId,
        members: [
          {
            user: userId,
            role: userGender === "female" ? "bride" : "groom", // Default role for creator
            permissions: "owner", // Event creator is the owner
            joinedAt: new Date(),
          },
        ],
      });

      await event.save();

      console.log("Event created with members:", event.members);
      console.log("Event createdBy:", event.createdBy);

      // Populate the event with user details
      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" },
      ]);

      console.log("Event after populate:", {
        createdBy: event.createdBy,
        members: event.members,
      });

      res.status(201).json({
        success: true,
        message: "Event created successfully",
        data: {
          event,
        },
      });
    } catch (error) {
      console.error("Event creation error:", error);
      res.status(500).json({
        success: false,
        message: "Server error during event creation",
      });
    }
  }
);


//delet this
router.delete(
  "/:eventId",
  authenticateToken,
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

      const { eventId } = req.params;

      const event = await Event.findOne({
        _id: eventId,
        isActive: true,
      });

      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or access denied",
        });
      }

      await event.deleteOne()

      res.json({ success: true, message: "Event deleted", data: { event } });
    } catch (error) {
      console.error("Delete event error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error deleting event" });
    }
  }
);

// Join event by invite code
router.post(
  "/join",
  authenticateToken,
  [
    body("inviteCode")
      .trim()
      .isLength({ min: 8, max: 8 })
      .withMessage("Invite code must be 8 characters long"),
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

      const { inviteCode } = req.body;
      const userId = req.user._id;

      // Find event by invite code
      const event = await Event.findOne({
        inviteCode: inviteCode.toUpperCase(),
        isActive: true,
      });

      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Invalid invite code or event not found",
        });
      }

      // Check if user is already a member
      if (event.isMember(userId)) {
        res.json({
          success: true,
          message: "Successfully joined the event",
          data: {
            event,
          },
        });
      } else {
        // Add user to event
        const added = event.addMember(userId, "guest");
        if (!added) {
          return res.status(409).json({
            success: false,
            message: "Unable to join event",
          });
        }

        await event.save();

        // Populate the event with user details
        await event.populate([
          { path: "createdBy", select: "name email" },
          { path: "members.user", select: "name email" },
        ]);

        res.json({
          success: true,
          message: "Successfully joined the event",
          data: {
            event,
          },
        });
      }
    } catch (error) {
      console.error("Join event error:", error);
      res.status(500).json({
        success: false,
        message: "Server error during joining event",
      });
    }
  }
);

// Get user's events
router.get("/my-events/:userId", authenticateToken, async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(req.params);

    // Find events where user is a member
    const events = await Event.find({
      "members.user": userId,
      isActive: true,
    })
      .populate("createdBy", "name email")
      .populate("members.user", "name email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        events,
      },
    });
  } catch (error) {
    console.error("Get events error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching events",
    });
  }
});

// Get event details
router.get(
  "/:eventId",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  async (req, res) => {
    try {
      const { eventId } = req.params;
      const userId = req.user._id;

      const event = await Event.findOne({
        _id: eventId,
        "members.user": userId,
        isActive: true,
      })
        .populate("createdBy", "name email")
        .populate("members.user", "name email");

      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or you don't have access",
        });
      }

      res.json({
        success: true,
        data: {
          event,
        },
      });
    } catch (error) {
      console.error("Get event error:", error);
      res.status(500).json({
        success: false,
        message: "Server error fetching event",
      });
    }
  }
);

// Get event members (owner and admin only, for Collaborators page)
router.get(
  "/:eventId/members",
  authenticateToken,
  requireEventMember,
  requireOwnerOrAdmin,
  async (req, res) => {
    try {
      const event = req.event;

      // Populate the members with user details
      await event.populate("members.user", "name email");

      res.json({
        success: true,
        data: {
          members: event.members,
        },
      });
    } catch (error) {
      console.error("Get members error:", error);
      res.status(500).json({
        success: false,
        message: "Server error fetching members",
      });
    }
  }
);

// ------- Expenses CRUD within an event -------
// Add expense
router.post(
  "/:eventId/expenses",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  [
    body("category")
      .trim()
      .isLength({ min: 1 })
      .withMessage("Category is required"),
    body("description")
      .trim()
      .isLength({ min: 1 })
      .withMessage("Description is required"),
    body("budgeted")
      .isNumeric()
      .withMessage("Budgeted amount must be a number"),
    body("actual")
      .optional()
      .isNumeric()
      .withMessage("Actual amount must be a number"),
    body("vendor").optional().isString(),
    body("status")
      .optional()
      .isIn(["planned", "booked", "paid", "completed"])
      .withMessage("Invalid status"),
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

      const { eventId } = req.params;
      const userId = req.user._id;
      const {
        category,
        description,
        budgeted,
        actual = 0,
        vendor = "",
        status = "planned",
      } = req.body;

      const event = await Event.findOne({
        _id: eventId,
        "members.user": userId,
        isActive: true,
      });
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or access denied",
        });
      }

      const newExpense = {
        category,
        description,
        budgeted: Number(budgeted),
        actual: Number(actual),
        vendor,
        status,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      event.expenses.push(newExpense);
      await event.save();

      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" },
      ]);

      res
        .status(201)
        .json({ success: true, message: "Expense added", data: { event } });
    } catch (error) {
      console.error("Add expense error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error adding expense" });
    }
  }
);

// Update expense
router.put(
  "/:eventId/expenses/:expenseIndex",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  [
    body("category").optional().isString(),
    body("description").optional().isString(),
    body("budgeted")
      .optional()
      .isNumeric()
      .withMessage("Budgeted amount must be a number"),
    body("actual")
      .optional()
      .isNumeric()
      .withMessage("Actual amount must be a number"),
    body("vendor").optional().isString(),
    body("status")
      .optional()
      .isIn(["planned", "booked", "paid", "completed"])
      .withMessage("Invalid status"),
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

      const { eventId, expenseIndex } = req.params;
      const userId = req.user._id;
      const updates = req.body;

      const event = await Event.findOne({
        _id: eventId,
        "members.user": userId,
        isActive: true,
      });
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or access denied",
        });
      }

      const index = parseInt(expenseIndex, 10);
      if (Number.isNaN(index) || index < 0 || index >= event.expenses.length) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid expense index" });
      }

      const expense = event.expenses[index];
      Object.keys(updates).forEach((key) => {
        if (updates[key] !== undefined) {
          if (key === "budgeted" || key === "actual") {
            expense[key] = Number(updates[key]);
          } else {
            expense[key] = updates[key];
          }
        }
      });
      expense.updatedAt = new Date();

      await event.save();

      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" },
      ]);

      res.json({ success: true, message: "Expense updated", data: { event } });
    } catch (error) {
      console.error("Update expense error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error updating expense" });
    }
  }
);

// Delete expense
router.delete(
  "/:eventId/expenses/:expenseIndex",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  async (req, res) => {
    try {
      const { eventId, expenseIndex } = req.params;
      const userId = req.user._id;

      const event = await Event.findOne({
        _id: eventId,
        "members.user": userId,
        isActive: true,
      });
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or access denied",
        });
      }

      const index = parseInt(expenseIndex, 10);
      if (Number.isNaN(index) || index < 0 || index >= event.expenses.length) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid expense index" });
      }

      event.expenses.splice(index, 1);
      await event.save();

      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" },
      ]);

      res.json({ success: true, message: "Expense deleted", data: { event } });
    } catch (error) {
      console.error("Delete expense error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error deleting expense" });
    }
  }
);

// ------- Guests CRUD within an event -------
// Add guest
router.post(
  "/:eventId/guests",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  [
    body("name")
      .trim()
      .isLength({ min: 1 })
      .withMessage("Guest name is required"),
    body("relation").optional().isString(),
    body("side")
      .optional()
      .isIn(["bride", "groom", "mutual"])
      .withMessage("Invalid side value"),
    body("dietary").optional().isString(),
    body("rsvp")
      .optional()
      .isIn(["Attending", "Not Attending", "Pending"])
      .withMessage("Invalid RSVP status"),
    body("email").optional().isEmail().withMessage("Invalid email"),
    body("phone").optional().isString(),
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

      const { eventId } = req.params;
      const userId = req.user._id;
      const {
        name,
        relation = "",
        side = "mutual",
        dietary = "",
        rsvp = "Pending",
        email = "",
        phone = "",
      } = req.body;

      const event = await Event.findOne({
        _id: eventId,
        "members.user": userId,
        isActive: true,
      });
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or access denied",
        });
      }

      const newGuest = {
        name,
        relation,
        side,
        dietary,
        rsvp,
        email,
        phone,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      event.guests.push(newGuest);

      // Retry save operation to handle version conflicts
      let retries = 3;
      let saved = false;

      while (retries > 0 && !saved) {
        try {
          await event.save();
          saved = true;
        } catch (error) {
          if (error.name === "VersionError" && retries > 1) {
            // Reload the document and retry
            const freshEvent = await Event.findOne({
              _id: eventId,
              "members.user": userId,
              isActive: true,
            });

            if (freshEvent) {
              freshEvent.guests.push(newGuest);
              event = freshEvent;
              retries--;
            } else {
              throw error;
            }
          } else {
            throw error;
          }
        }
      }

      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" },
      ]);

      res
        .status(201)
        .json({ success: true, message: "Guest added", data: { event } });
    } catch (error) {
      console.error("Add guest error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error adding guest" });
    }
  }
);

// Update guest
router.put(
  "/:eventId/guests/:guestIndex",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  [
    body("name").optional().isString(),
    body("relation").optional().isString(),
    body("side")
      .optional()
      .isIn(["bride", "groom", "mutual"])
      .withMessage("Invalid side value"),
    body("dietary").optional().isString(),
    body("rsvp")
      .optional()
      .isIn(["Attending", "Not Attending", "Pending"])
      .withMessage("Invalid RSVP status"),
    body("email").optional().isEmail().withMessage("Invalid email"),
    body("phone").optional().isString(),
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

      const { eventId, guestIndex } = req.params;
      const userId = req.user._id;
      const updates = req.body;

      const event = await Event.findOne({
        _id: eventId,
        "members.user": userId,
        isActive: true,
      });
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or access denied",
        });
      }

      const index = parseInt(guestIndex, 10);
      if (Number.isNaN(index) || index < 0 || index >= event.guests.length) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid guest index" });
      }

      const guest = event.guests[index];
      Object.keys(updates).forEach((key) => {
        if (updates[key] !== undefined) {
          guest[key] = updates[key];
        }
      });
      guest.updatedAt = new Date();

      await event.save();

      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" },
      ]);

      res.json({ success: true, message: "Guest updated", data: { event } });
    } catch (error) {
      console.error("Update guest error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error updating guest" });
    }
  }
);

// Delete guest
router.delete(
  "/:eventId/guests/:guestIndex",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  async (req, res) => {
    try {
      const { eventId, guestIndex } = req.params;
      const userId = req.user._id;

      const event = await Event.findOne({
        _id: eventId,
        "members.user": userId,
        isActive: true,
      });
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or access denied",
        });
      }

      const index = parseInt(guestIndex, 10);
      if (Number.isNaN(index) || index < 0 || index >= event.guests.length) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid guest index" });
      }

      event.guests.splice(index, 1);
      await event.save();

      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" },
      ]);

      res.json({ success: true, message: "Guest deleted", data: { event } });
    } catch (error) {
      console.error("Delete guest error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error deleting guest" });
    }
  }
);

// update member/collaborator perms
router.put(
  "/:eventId/members/:userId/:perms",
  authenticateToken,
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

      const { eventId, userId, perms } = req.params;
      const requestingUserId = req.user._id;

      const event = await Event.findOne({ _id: eventId, isActive: true });
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or access denied",
        });
      }

      // Check if the requesting user is owner or admin
      const requestingMember = event.members.find(
        (m) => m.user._id.toString() === requestingUserId.toString()
      );

      if (
        !requestingMember ||
        (requestingMember.permissions !== "owner" &&
          requestingMember.permissions !== "admin")
      ) {
        return res.status(403).json({
          success: false,
          message: "Only event owners or admins can change member permissions",
        });
      }

      // Find the target member
      const targetMember = event.members.find(
        (m) => m.user._id.toString() === userId
      );

      if (!targetMember) {
        return res.status(404).json({
          success: false,
          message: "Member not found in this event",
        });
      }

      // Prevent changing the owner's permission
      if (targetMember.permissions === "owner") {
        return res.status(403).json({
          success: false,
          message: "Cannot change the owner's permission",
        });
      }

      // Prevent setting someone else as owner
      if (perms === "owner") {
        return res.status(403).json({
          success: false,
          message:
            "Cannot assign owner permission. There can only be one owner.",
        });
      }

      // Only owner can promote to admin
      if (perms === "admin" && requestingMember.permissions !== "owner") {
        return res.status(403).json({
          success: false,
          message: "Only the owner can promote users to admin",
        });
      }

      // Admins cannot change other admin permissions (except owner can change any admin)
      if (
        targetMember.permissions === "admin" &&
        requestingMember.permissions !== "owner" &&
        perms === "admin"
      ) {
        return res.status(403).json({
          success: false,
          message: "Only the owner can change admin permissions",
        });
      }

      // Update the member's permission
      console.log("Backend permission update:", {
        requestingUserId,
        requestingMemberPermission: requestingMember.permissions,
        targetUserId: userId,
        targetMemberPermission: targetMember.permissions,
        newPermission: perms,
      });

      Object.keys(event.members).forEach((key) => {
        if (event.members[key].user._id.toString() === userId) {
          event.members[key].permissions = perms;
        }
      });
      await event.save();

      console.log("Permission updated successfully:", {
        updatedMember: event.members.find(
          (m) => m.user._id.toString() === userId
        ),
      });

      res.json({ success: true, message: "member updated", data: { event } });
    } catch (error) {
      console.error("Update member error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error updating member" });
    }
  }
);

// Remove/reject a member from event (owner and admin only)
router.delete(
  "/:eventId/members/:userId",
  authenticateToken,
  requireEventMember,
  requireOwnerOrAdmin,
  async (req, res) => {
    try {
      const { eventId, userId } = req.params;
      const event = req.event; // Attached by requireEventMember middleware

      // Find the target member
      const targetMember = event.members.find(
        (m) => m.user._id.toString() === userId
      );

      if (!targetMember) {
        return res.status(404).json({
          success: false,
          message: "Member not found in this event",
        });
      }

      // Prevent removing the owner
      if (targetMember.permissions === "owner") {
        return res.status(403).json({
          success: false,
          message: "Cannot remove the event owner",
        });
      }

      // Only owner can remove admins
      if (
        targetMember.permissions === "admin" &&
        req.userMember.permissions !== "owner"
      ) {
        return res.status(403).json({
          success: false,
          message: "Only the owner can remove admins",
        });
      }

      // Remove the member from the event
      event.members = event.members.filter(
        (m) => m.user._id.toString() !== userId
      );

      await event.save();

      // Populate the event with user details
      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" },
      ]);

      res.json({
        success: true,
        message: "Member removed successfully",
        data: { event },
      });
    } catch (error) {
      console.error("Remove member error:", error);
      res.status(500).json({
        success: false,
        message: "Server error removing member",
      });
    }
  }
);

// Update event
router.put(
  "/:eventId",
  authenticateToken,
  [
    body("name")
      .optional()
      .trim()
      .isLength({ min: 2 })
      .withMessage("Event name must be at least 2 characters long"),
    body("description")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Description cannot exceed 500 characters"),
    body("eventType")
      .optional()
      .isIn(["wedding", "engagement", "anniversary", "other"])
      .withMessage("Please select a valid event type"),
    body("eventDate")
      .optional()
      .isISO8601()
      .withMessage("Please provide a valid event date"),
    body("location")
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage("Location cannot exceed 200 characters"),
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

      const { eventId } = req.params;
      const userId = req.user._id;
      const updates = req.body;

      const event = await Event.findOne({
        _id: eventId,
        createdBy: userId,
        isActive: true,
      });

      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or you don't have permission to edit",
        });
      }

      // Update event fields
      Object.keys(updates).forEach((key) => {
        if (updates[key] !== undefined) {
          if (key === "eventDate") {
            event[key] = new Date(updates[key]);
          } else if (key === "budget") {
            // Update budget in settings
            event.settings.budget = updates[key];
          } else {
            event[key] = updates[key];
          }
        }
      });

      await event.save();

      // Populate the event with user details
      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" },
      ]);

      res.json({
        success: true,
        message: "Event updated successfully",
        data: {
          event,
        },
      });
    } catch (error) {
      console.error("Update event error:", error);
      res.status(500).json({
        success: false,
        message: "Server error updating event",
      });
    }
  }
);

// Leave event
router.delete("/:eventId/leave", authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user._id;

    const event = await Event.findOne({
      _id: eventId,
      "members.user": userId,
      isActive: true,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or you are not a member",
      });
    }

    // Check if user is the creator
    if (event.createdBy.toString() === userId) {
      return res.status(400).json({
        success: false,
        message:
          "Event creator cannot leave the event. Please delete the event instead.",
      });
    }

    // Remove user from event
    event.removeMember(userId);
    await event.save();

    res.json({
      success: true,
      message: "Successfully left the event",
    });
  } catch (error) {
    console.error("Leave event error:", error);
    res.status(500).json({
      success: false,
      message: "Server error leaving event",
    });
  }
});

// Update wedding settings
router.put(
  "/:eventId/settings",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  [
    body("budget")
      .optional()
      .isNumeric()
      .withMessage("Budget must be a number"),
    body("categoryBudgets").optional().isObject(),
    body("emailNotifications").optional().isBoolean(),
    body("guestListAccess").optional().isBoolean(),
    body("budgetSharing").optional().isBoolean(),
    body("rsvpReminders").optional().isBoolean(),
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

      const { eventId } = req.params;
      const userId = req.user._id;
      const updates = req.body;

      const event = await Event.findOne({
        _id: eventId,
        createdBy: userId,
        isActive: true,
      });

      if (!event) {
        return res.status(404).json({
          success: false,
          message:
            "Event not found or you don't have permission to edit settings",
        });
      }

      // Update settings
      Object.keys(updates).forEach((key) => {
        if (updates[key] !== undefined && event.settings[key] !== undefined) {
          event.settings[key] = updates[key];
        }
      });

      await event.save();

      // Populate the event with user details
      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" },
      ]);

      res.json({
        success: true,
        message: "Wedding settings updated successfully",
        data: {
          event,
        },
      });
    } catch (error) {
      console.error("Update wedding settings error:", error);
      res.status(500).json({
        success: false,
        message: "Server error updating wedding settings",
      });
    }
  }
);

// Get wedding settings
router.get(
  "/:eventId/settings",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  async (req, res) => {
    try {
      const { eventId } = req.params;
      const userId = req.user._id;

      const event = await Event.findOne({
        _id: eventId,
        "members.user": userId,
        isActive: true,
      }).select("settings name");

      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or you don't have access",
        });
      }

      res.json({
        success: true,
        data: {
          settings: event.settings,
          eventName: event.name,
        },
      });
    } catch (error) {
      console.error("Get wedding settings error:", error);
      res.status(500).json({
        success: false,
        message: "Server error fetching wedding settings",
      });
    }
  }
);

// Delete event (only creator)
router.delete("/:eventId", authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user._id;

    const event = await Event.findOne({
      _id: eventId,
      createdBy: userId,
      isActive: true,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or you don't have permission to delete",
      });
    }

    // Soft delete by setting isActive to false
    event.isActive = false;
    await event.save();

    res.json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("Delete event error:", error);
    res.status(500).json({
      success: false,
      message: "Server error deleting event",
    });
  }
});

// ------- Seating Arrangements -------
// Save seating arrangement
router.put(
  "/:eventId/seating",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  async (req, res) => {
    try {
      const { eventId } = req.params;
      const userId = req.user._id;
      const { seatingData } = req.body;

      // Verify user has access to this event
      const event = await Event.findOne({
        _id: eventId,
        "members.user": userId,
        isActive: true,
      });

      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or you don't have access",
        });
      }

      // Update seating data
      event.seating = {
        ...seatingData,
        lastUpdated: new Date(),
      };

      await event.save();

      res.json({
        success: true,
        message: "Seating arrangement saved successfully",
        data: {
          seating: event.seating,
        },
      });
    } catch (error) {
      console.error("Save seating error:", error);
      res.status(500).json({
        success: false,
        message: "Server error saving seating arrangement",
      });
    }
  }
);

// Get seating arrangement
router.get(
  "/:eventId/seating",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  async (req, res) => {
    try {
      const { eventId } = req.params;
      const userId = req.user._id;

      // Verify user has access to this event
      const event = await Event.findOne({
        _id: eventId,
        "members.user": userId,
        isActive: true,
      });

      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or you don't have access",
        });
      }

      res.json({
        success: true,
        data: {
          seating: event.seating || {
            groups: [],
            lastUpdated: new Date(),
          },
        },
      });
    } catch (error) {
      console.error("Get seating error:", error);
      res.status(500).json({
        success: false,
        message: "Server error fetching seating arrangement",
      });
    }
  }
);

// ------- Vendor Management CRUD -------
// Add vendor
router.post(
  "/:eventId/vendors",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  [
    body("category")
      .trim()
      .isLength({ min: 1 })
      .withMessage("Category is required"),
    body("name")
      .trim()
      .isLength({ min: 1 })
      .withMessage("Vendor name is required"),
    body("contactInfo").optional().isObject(),
    body("contactInfo.phone").optional().isString(),
    body("contactInfo.email")
      .optional()
      .custom((value) => {
        if (!value || value === "") return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      })
      .withMessage("Invalid email"),
    body("contactInfo.website")
      .optional()
      .custom((value) => {
        if (!value || value === "") return true;
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      })
      .withMessage("Invalid website URL"),
    body("pricing").optional().isObject(),
    body("pricing.type")
      .optional()
      .isIn(["fixed", "per_person", "range"])
      .withMessage("Invalid pricing type"),
    body("pricing.amount")
      .optional()
      .isNumeric()
      .withMessage("Amount must be a number"),
    body("pricing.rangeMin")
      .optional()
      .isNumeric()
      .withMessage("Range min must be a number"),
    body("pricing.rangeMax")
      .optional()
      .isNumeric()
      .withMessage("Range max must be a number"),
    body("notes").optional().isString(),
    body("status")
      .optional()
      .isIn(["considering", "contacted", "quoted", "selected", "rejected"])
      .withMessage("Invalid status"),
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

      const { eventId } = req.params;
      const userId = req.user._id;
      const vendorData = req.body;

      const event = await Event.findOne({
        _id: eventId,
        "members.user": userId,
        isActive: true,
      });
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or access denied",
        });
      }

      const newVendor = {
        ...vendorData,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      event.vendors.push(newVendor);
      await event.save();

      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" },
      ]);

      res
        .status(201)
        .json({ success: true, message: "Vendor added", data: { event } });
    } catch (error) {
      console.error("Add vendor error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error adding vendor" });
    }
  }
);

// Get all vendors for an event
router.get(
  "/:eventId/vendors",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  async (req, res) => {
    try {
      const { eventId } = req.params;
      const userId = req.user._id;

      const event = await Event.findOne({
        _id: eventId,
        "members.user": userId,
        isActive: true,
      }).select("vendors");
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or access denied",
        });
      }

      res.json({ success: true, data: { vendors: event.vendors } });
    } catch (error) {
      console.error("Get vendors error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error fetching vendors" });
    }
  }
);

// Update vendor
router.put(
  "/:eventId/vendors/:vendorId",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  [
    body("category").optional().isString(),
    body("name").optional().isString(),
    body("contactInfo").optional().isObject(),
    body("contactInfo.phone").optional().isString(),
    body("contactInfo.email")
      .optional()
      .custom((value) => {
        if (!value || value === "") return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      })
      .withMessage("Invalid email"),
    body("contactInfo.website")
      .optional()
      .custom((value) => {
        if (!value || value === "") return true;
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      })
      .withMessage("Invalid website URL"),
    body("pricing").optional().isObject(),
    body("pricing.type")
      .optional()
      .isIn(["fixed", "per_person", "range"])
      .withMessage("Invalid pricing type"),
    body("pricing.amount")
      .optional()
      .isNumeric()
      .withMessage("Amount must be a number"),
    body("pricing.rangeMin")
      .optional()
      .isNumeric()
      .withMessage("Range min must be a number"),
    body("pricing.rangeMax")
      .optional()
      .isNumeric()
      .withMessage("Range max must be a number"),
    body("notes").optional().isString(),
    body("status")
      .optional()
      .isIn(["considering", "contacted", "quoted", "selected", "rejected"])
      .withMessage("Invalid status"),
    body("actualSpent")
      .optional()
      .isNumeric()
      .withMessage("Actual spent must be a number"),
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

      const { eventId, vendorId } = req.params;
      const userId = req.user._id;
      const updates = req.body;

      const event = await Event.findOne({
        _id: eventId,
        "members.user": userId,
        isActive: true,
      });
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or access denied",
        });
      }

      const vendor = event.vendors.id(vendorId);
      if (!vendor) {
        return res
          .status(404)
          .json({ success: false, message: "Vendor not found" });
      }

      Object.keys(updates).forEach((key) => {
        if (updates[key] !== undefined) {
          if (key === "contactInfo" || key === "pricing") {
            Object.keys(updates[key]).forEach((subKey) => {
              if (updates[key][subKey] !== undefined) {
                vendor[key][subKey] = updates[key][subKey];
              }
            });
          } else {
            vendor[key] = updates[key];
          }
        }
      });
      vendor.updatedAt = new Date();

      await event.save();

      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" },
      ]);

      res.json({ success: true, message: "Vendor updated", data: { event } });
    } catch (error) {
      console.error("Update vendor error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error updating vendor" });
    }
  }
);

// Delete vendor
router.delete(
  "/:eventId/vendors/:vendorId",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  async (req, res) => {
    try {
      const { eventId, vendorId } = req.params;
      const userId = req.user._id;

      const event = await Event.findOne({
        _id: eventId,
        "members.user": userId,
        isActive: true,
      });
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or access denied",
        });
      }

      const vendor = event.vendors.id(vendorId);
      if (!vendor) {
        return res
          .status(404)
          .json({ success: false, message: "Vendor not found" });
      }

      event.vendors.pull(vendorId);
      await event.save();

      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" },
      ]);

      res.json({ success: true, message: "Vendor deleted", data: { event } });
    } catch (error) {
      console.error("Delete vendor error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error deleting vendor" });
    }
  }
);

// Upload vendor documents
router.post(
  "/:eventId/vendors/:vendorId/upload",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  upload.array("documents", 5),
  async (req, res) => {
    try {
      const { eventId, vendorId } = req.params;
      const userId = req.user._id;
      const files = req.files;

      if (!files || files.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "No files uploaded" });
      }

      const event = await Event.findOne({
        _id: eventId,
        "members.user": userId,
        isActive: true,
      });
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or access denied",
        });
      }

      const vendor = event.vendors.id(vendorId);
      if (!vendor) {
        return res
          .status(404)
          .json({ success: false, message: "Vendor not found" });
      }

      // Add new documents to vendor
      const newDocuments = files.map((file) => ({
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
      }));

      vendor.documents.push(...newDocuments);
      vendor.updatedAt = new Date();

      await event.save();

      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" },
      ]);

      res.json({
        success: true,
        message: "Documents uploaded successfully",
        data: {
          event,
          uploadedFiles: newDocuments,
        },
      });
    } catch (error) {
      console.error("Upload documents error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error uploading documents" });
    }
  }
);

// Serve vendor documents
router.get(
  "/:eventId/vendors/:vendorId/documents/:filename",
  authenticateToken,
  requireEventMember,
  blockPendingUsers,
  async (req, res) => {
    try {
      const { eventId, vendorId, filename } = req.params;
      const userId = req.user._id;

      const event = await Event.findOne({
        _id: eventId,
        "members.user": userId,
        isActive: true,
      });
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or access denied",
        });
      }

      const vendor = event.vendors.id(vendorId);
      if (!vendor) {
        return res
          .status(404)
          .json({ success: false, message: "Vendor not found" });
      }

      const document = vendor.documents.find(
        (doc) => doc.filename === filename
      );
      if (!document) {
        return res
          .status(404)
          .json({ success: false, message: "Document not found" });
      }

      const filePath = path.join("uploads/vendors", filename);

      if (!fs.existsSync(filePath)) {
        return res
          .status(404)
          .json({ success: false, message: "File not found on server" });
      }

      // Set appropriate headers for inline viewing
      res.setHeader("Content-Type", document.mimeType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${document.originalName}"`
      );
      res.setHeader("Cache-Control", "public, max-age=3600"); // Cache for 1 hour

      res.sendFile(path.resolve(filePath));
    } catch (error) {
      console.error("Serve document error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error serving document" });
    }
  }
);

// Migration endpoint to add side field to existing guests
router.post("/:eventId/migrate-guests", authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user._id;

    const event = await Event.findOne({
      _id: eventId,
      "members.user": userId,
      isActive: true,
    });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or access denied",
      });
    }

    // Update guests that don't have a side field
    let updatedCount = 0;
    event.guests.forEach((guest) => {
      if (!guest.side) {
        guest.side = "mutual"; // Default to mutual for existing guests
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      await event.save();
    }

    await event.populate([
      { path: "createdBy", select: "name email" },
      { path: "members.user", select: "name email" },
    ]);

    res.json({
      success: true,
      message: `Updated ${updatedCount} guests with side field`,
      data: { event },
    });
  } catch (error) {
    console.error("Migrate guests error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error migrating guests" });
  }
});

export default router;
