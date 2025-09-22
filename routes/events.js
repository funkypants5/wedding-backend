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
      const userGender = req.user.gender;

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
          role: userGender === "female" ? "bride" : "groom", // Default role for creator
          permissions: "admin",
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

// ------- Expenses CRUD within an event -------
// Add expense
router.post(
  "/:eventId/expenses",
  authenticateToken,
  [
    body("category").trim().isLength({ min: 1 }).withMessage("Category is required"),
    body("description").trim().isLength({ min: 1 }).withMessage("Description is required"),
    body("budgeted").isNumeric().withMessage("Budgeted amount must be a number"),
    body("actual").optional().isNumeric().withMessage("Actual amount must be a number"),
    body("vendor").optional().isString(),
    body("status").optional().isIn(["planned", "booked", "paid", "completed"]).withMessage("Invalid status"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: "Validation failed", errors: errors.array() });
      }

      const { eventId } = req.params;
      const userId = req.user._id;
      const { category, description, budgeted, actual = 0, vendor = "", status = "planned" } = req.body;

      const event = await Event.findOne({ _id: eventId, "members.user": userId, isActive: true });
      if (!event) {
        return res.status(404).json({ success: false, message: "Event not found or access denied" });
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

      res.status(201).json({ success: true, message: "Expense added", data: { event } });
    } catch (error) {
      console.error("Add expense error:", error);
      res.status(500).json({ success: false, message: "Server error adding expense" });
    }
  }
);

// Update expense
router.put(
  "/:eventId/expenses/:expenseIndex",
  authenticateToken,
  [
    body("category").optional().isString(),
    body("description").optional().isString(),
    body("budgeted").optional().isNumeric().withMessage("Budgeted amount must be a number"),
    body("actual").optional().isNumeric().withMessage("Actual amount must be a number"),
    body("vendor").optional().isString(),
    body("status").optional().isIn(["planned", "booked", "paid", "completed"]).withMessage("Invalid status"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: "Validation failed", errors: errors.array() });
      }

      const { eventId, expenseIndex } = req.params;
      const userId = req.user._id;
      const updates = req.body;

      const event = await Event.findOne({ _id: eventId, "members.user": userId, isActive: true });
      if (!event) {
        return res.status(404).json({ success: false, message: "Event not found or access denied" });
      }

      const index = parseInt(expenseIndex, 10);
      if (Number.isNaN(index) || index < 0 || index >= event.expenses.length) {
        return res.status(400).json({ success: false, message: "Invalid expense index" });
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
      res.status(500).json({ success: false, message: "Server error updating expense" });
    }
  }
);

// Delete expense
router.delete(
  "/:eventId/expenses/:expenseIndex",
  authenticateToken,
  async (req, res) => {
    try {
      const { eventId, expenseIndex } = req.params;
      const userId = req.user._id;

      const event = await Event.findOne({ _id: eventId, "members.user": userId, isActive: true });
      if (!event) {
        return res.status(404).json({ success: false, message: "Event not found or access denied" });
      }

      const index = parseInt(expenseIndex, 10);
      if (Number.isNaN(index) || index < 0 || index >= event.expenses.length) {
        return res.status(400).json({ success: false, message: "Invalid expense index" });
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
      res.status(500).json({ success: false, message: "Server error deleting expense" });
    }
  }
);

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

// update member/collaborator perms
router.put(
  "/:eventId/members/:userId/:perms",
  authenticateToken,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: "Validation failed", errors: errors.array() });
      }

      const { eventId, userId, perms } = req.params;

      const event = await Event.findOne({ _id: eventId, isActive: true });
      if (!event) {
        return res.status(404).json({ success: false, message: "Event not found or access denied" });
      }

      //console.log(eventId)
      //console.log(userId)
      //console.log(perms)

      /*Event.findOneAndUpdate({ '_id': eventId, 'members._id': userId },
        {
          '$set': {
            'members.$.permissions': perms
          }
        }
      )
        .then(resp => { console.log(resp) })*/


      //so there's two IDs here and i'm... i'm just gonna update the member one good lord

      Object.keys(event.members).forEach((key) => {
        if (event.members[key].user._id.toString() === userId) {
          event.members[key].permissions = perms
        }
      })
      await event.save()

      res.json({ success: true, message: "member updated", data: { event } });
    } catch (error) {
      console.error("Update member error:", error);
      res.status(500).json({ success: false, message: "Server error updating member" });
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

// Update wedding settings
router.put(
  "/:eventId/settings",
  authenticateToken,
  [
    body("budget").optional().isNumeric().withMessage("Budget must be a number"),
    body("guestPhotoUploads").optional().isBoolean(),
    body("emailNotifications").optional().isBoolean(),
    body("guestListAccess").optional().isBoolean(),
    body("publicGallery").optional().isBoolean(),
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
          message: "Event not found or you don't have permission to edit settings",
        });
      }

      // Update settings
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined && event.settings[key] !== undefined) {
          event.settings[key] = updates[key];
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
router.get("/:eventId/settings", authenticateToken, async (req, res) => {
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

// ------- Seating Arrangements -------
// Save seating arrangement
router.put("/:eventId/seating", authenticateToken, async (req, res) => {
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
});

// Get seating arrangement
router.get("/:eventId/seating", authenticateToken, async (req, res) => {
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
          totalGuests: 0,
          guestPool: [],
          tableGroups: [],
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
});

export default router;
