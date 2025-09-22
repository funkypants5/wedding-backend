import express from "express";
import { body, validationResult } from "express-validator";
import Event from "../models/Event.js";
import User from "../models/User.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

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

      // Create new event
      const event = new Event({
        name,
        description,
        eventType,
        eventDate: new Date(eventDate),
        location,
        createdBy: userId,
        members: [{
          user: userId,
          role: "bride", // Default role for creator
          joinedAt: new Date(),
        }],
      });

      await event.save();

      // Populate the event with user details
      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" }
      ]);

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
        isActive: true 
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
        })
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
        { path: "members.user", select: "name email" }
      ]);

      res.json({
        success: true,
        message: "Successfully joined the event",
        data: {
          event,
        },
      })
    };
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
    const userId = req.params.userId
    console.log(req.params)

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
router.get("/:eventId", authenticateToken, async (req, res) => {
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
});

// ------- Guests CRUD within an event -------
// Add guest
router.post(
  "/:eventId/guests",
  authenticateToken,
  [
    body("name").trim().isLength({ min: 1 }).withMessage("Guest name is required"),
    body("relation").optional().isString(),
    body("dietary").optional().isString(),
    body("rsvp").optional().isIn(["Attending", "Not Attending", "Pending"]).withMessage("Invalid RSVP status"),
    body("email").optional().isEmail().withMessage("Invalid email"),
    body("phone").optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: "Validation failed", errors: errors.array() });
      }

      const { eventId } = req.params;
      const userId = req.user._id;
      const { name, relation = "", dietary = "", rsvp = "Pending", email = "", phone = "" } = req.body;

      const event = await Event.findOne({ _id: eventId, "members.user": userId, isActive: true });
      if (!event) {
        return res.status(404).json({ success: false, message: "Event not found or access denied" });
      }

      const newGuest = {
        name,
        relation,
        dietary,
        rsvp,
        email,
        phone,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      event.guests.push(newGuest);
      await event.save();

      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" },
      ]);

      res.status(201).json({ success: true, message: "Guest added", data: { event } });
    } catch (error) {
      console.error("Add guest error:", error);
      res.status(500).json({ success: false, message: "Server error adding guest" });
    }
  }
);

// Update guest
router.put(
  "/:eventId/guests/:guestIndex",
  authenticateToken,
  [
    body("name").optional().isString(),
    body("relation").optional().isString(),
    body("dietary").optional().isString(),
    body("rsvp").optional().isIn(["Attending", "Not Attending", "Pending"]).withMessage("Invalid RSVP status"),
    body("email").optional().isEmail().withMessage("Invalid email"),
    body("phone").optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: "Validation failed", errors: errors.array() });
      }

      const { eventId, guestIndex } = req.params;
      const userId = req.user._id;
      const updates = req.body;

      const event = await Event.findOne({ _id: eventId, "members.user": userId, isActive: true });
      if (!event) {
        return res.status(404).json({ success: false, message: "Event not found or access denied" });
      }

      const index = parseInt(guestIndex, 10);
      if (Number.isNaN(index) || index < 0 || index >= event.guests.length) {
        return res.status(400).json({ success: false, message: "Invalid guest index" });
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
      res.status(500).json({ success: false, message: "Server error updating guest" });
    }
  }
);

// Delete guest
router.delete(
  "/:eventId/guests/:guestIndex",
  authenticateToken,
  async (req, res) => {
    try {
      const { eventId, guestIndex } = req.params;
      const userId = req.user._id;

      const event = await Event.findOne({ _id: eventId, "members.user": userId, isActive: true });
      if (!event) {
        return res.status(404).json({ success: false, message: "Event not found or access denied" });
      }

      const index = parseInt(guestIndex, 10);
      if (Number.isNaN(index) || index < 0 || index >= event.guests.length) {
        return res.status(400).json({ success: false, message: "Invalid guest index" });
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
      res.status(500).json({ success: false, message: "Server error deleting guest" });
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
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          if (key === "eventDate") {
            event[key] = new Date(updates[key]);
          } else {
            event[key] = updates[key];
          }
        }
      });

      await event.save();

      // Populate the event with user details
      await event.populate([
        { path: "createdBy", select: "name email" },
        { path: "members.user", select: "name email" }
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
        message: "Event creator cannot leave the event. Please delete the event instead.",
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

export default router;
