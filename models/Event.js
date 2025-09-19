import mongoose from "mongoose";

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Event name is required"],
    trim: true,
    minlength: [2, "Event name must be at least 2 characters long"],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, "Description cannot exceed 500 characters"],
  },
  eventType: {
    type: String,
    required: [true, "Event type is required"],
    enum: ["wedding", "engagement", "anniversary", "other"],
    default: "wedding",
  },
  eventDate: {
    type: Date,
    required: [true, "Event date is required"],
  },
  location: {
    type: String,
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Event creator is required"],
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["bride", "groom", "family", "friend", "guest"],
      default: "guest",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  inviteCode: {
    type: String,
    unique: true,
    required: false, // Will be generated in pre-save hook
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  // Guests persisted per event
  guests: [
    {
      name: { type: String, required: true, trim: true },
      relation: { type: String, default: "", trim: true },
      dietary: { type: String, default: "", trim: true },
      rsvp: {
        type: String,
        enum: ["Attending", "Not Attending", "Pending"],
        default: "Pending",
      },
      email: { type: String, default: "", trim: true },
      phone: { type: String, default: "", trim: true },
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
  ],
});

// Generate unique invite code before saving
eventSchema.pre("save", async function (next) {
  if (this.isNew && !this.inviteCode) {
    let inviteCode;
    let isUnique = false;
    
    // Keep generating until we get a unique code
    while (!isUnique) {
      inviteCode = this.generateInviteCode();
      const existingEvent = await this.constructor.findOne({ inviteCode });
      if (!existingEvent) {
        isUnique = true;
      }
    }
    
    this.inviteCode = inviteCode;
  }
  next();
});

// Update updatedAt field before saving
eventSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Method to generate invite code
eventSchema.methods.generateInviteCode = function () {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Method to add member to event
eventSchema.methods.addMember = function (userId, role = "guest") {
  const existingMember = this.members.find(member => 
    member.user.toString() === userId.toString()
  );
  
  if (!existingMember) {
    this.members.push({
      user: userId,
      role: role,
      joinedAt: new Date(),
    });
    return true;
  }
  return false;
};

// Method to remove member from event
eventSchema.methods.removeMember = function (userId) {
  this.members = this.members.filter(member => 
    member.user.toString() !== userId.toString()
  );
};

// Method to check if user is member
eventSchema.methods.isMember = function (userId) {
  return this.members.some(member => 
    member.user.toString() === userId.toString()
  );
};

// Method to get member role
eventSchema.methods.getMemberRole = function (userId) {
  const member = this.members.find(member => 
    member.user.toString() === userId.toString()
  );
  return member ? member.role : null;
};

const Event = mongoose.model("Event", eventSchema);

export default Event;
