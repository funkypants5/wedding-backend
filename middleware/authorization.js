import Event from "../models/Event.js";

/**
 * Middleware to check if user is a member of the event
 */
export const requireEventMember = async (req, res, next) => {
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
        message: "Event not found or you don't have access",
      });
    }

    // Attach event and user's member info to request
    const userMember = event.members.find(
      (m) => m.user.toString() === userId.toString()
    );

    req.event = event;
    req.userMember = userMember;
    next();
  } catch (error) {
    console.error("Event member check error:", error);
    res.status(500).json({
      success: false,
      message: "Server error checking event access",
    });
  }
};

/**
 * Middleware to check if user has owner permission
 */
export const requireOwner = (req, res, next) => {
  if (!req.userMember || req.userMember.permissions !== "owner") {
    return res.status(403).json({
      success: false,
      message: "Only the event owner can perform this action",
    });
  }
  next();
};

/**
 * Middleware to check if user has owner or admin permission
 */
export const requireOwnerOrAdmin = (req, res, next) => {
  if (
    !req.userMember ||
    (req.userMember.permissions !== "owner" &&
      req.userMember.permissions !== "admin")
  ) {
    return res.status(403).json({
      success: false,
      message: "Only event owners or admins can perform this action",
    });
  }
  next();
};

/**
 * Middleware to check if user has at least collaborator permission (not pending)
 */
export const requireCollaborator = (req, res, next) => {
  if (!req.userMember || req.userMember.permissions === "pending_approval") {
    return res.status(403).json({
      success: false,
      message: "Your access is pending approval",
    });
  }
  next();
};

/**
 * Middleware to block pending_approval users from accessing certain routes
 */
export const blockPendingUsers = (req, res, next) => {
  if (req.userMember && req.userMember.permissions === "pending_approval") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Your membership is pending approval.",
    });
  }
  next();
};
