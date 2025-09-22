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
    permissions:{
      type: String,
      enum: ["admin", "collaborator", "pending_approval"],
      default:"pending_approval"
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
  // Wedding settings
  settings: {
    budget: {
      type: Number,
      default: 0,
    },
    guestPhotoUploads: {
      type: Boolean,
      default: true,
    },
    emailNotifications: {
      type: Boolean,
      default: true,
    },
    guestListAccess: {
      type: Boolean,
      default: false,
    },
    publicGallery: {
      type: Boolean,
      default: true,
    },
    budgetSharing: {
      type: Boolean,
      default: false,
    },
    rsvpReminders: {
      type: Boolean,
      default: true,
    },
  },
  // Budget expenses persisted per event
  expenses: [
    {
      category: { type: String, required: true, trim: true },
      description: { type: String, required: true, trim: true },
      budgeted: { type: Number, required: true, min: 0 },
      actual: { type: Number, default: 0, min: 0 },
      vendor: { type: String, default: "", trim: true },
      date: { type: Date, default: Date.now },
      status: {
        type: String,
        enum: ["planned", "booked", "paid", "completed"],
        default: "planned",
      },
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
  ],
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
  // Seating arrangements
  seating: {
    totalGuests: { type: Number, default: 0 },
    guestPool: [{
      id: { type: String, required: true },
      name: { type: String, required: true },
      isPlaceholder: { type: Boolean, default: false },
      tableId: { type: String, default: null },
      relation: { type: String, default: "" },
      dietary: { type: String, default: "" },
    }],
    tableGroups: [{
      id: { type: String, required: true },
      name: { type: String, required: true },
      color: { type: String, required: true },
      tables: [{
        id: { type: String, required: true },
        label: { type: String, required: true },
        capacity: { type: Number, required: true },
        groupId: { type: String, required: true },
        guests: [{
          id: { type: String, required: true },
          name: { type: String, required: true },
          isPlaceholder: { type: Boolean, default: false },
          tableId: { type: String, default: null },
          relation: { type: String, default: "" },
          dietary: { type: String, default: "" },
        }],
      }],
    }],
    lastUpdated: { type: Date, default: Date.now },
  },
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
eventSchema.methods.addMember = function (userId, role = "guest", permission = "pending_approval") {
  const existingMember = this.members.find(member => 
    member.user.toString() === userId.toString()
  );
  
  if (!existingMember) {
    this.members.push({
      user: userId,
      role: role,
      permission: permission,
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
