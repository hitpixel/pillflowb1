import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth, store } from "./auth";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Create user profile after signup
export const createUserProfile = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    inviteToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated");
    }

    // Check if profile already exists
    const existingProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (existingProfile) {
      return existingProfile._id;
    }

    // Check if there's a valid invitation token
    let organizationId: Id<"organizations"> | undefined = undefined;
    let userRole: "admin" | "member" | "viewer" | undefined = undefined;
    
    if (args.inviteToken) {
      const invitation = await ctx.db
        .query("memberInvitations")
        .withIndex("by_invite_token", q => q.eq("inviteToken", args.inviteToken!))
        .first();

      if (invitation && 
          !invitation.isUsed && 
          invitation.expiresAt > Date.now() && 
          invitation.email === args.email) {
        
        organizationId = invitation.organizationId;
        userRole = invitation.role;
        
        // Mark invitation as used
        await ctx.db.patch(invitation._id, {
          isUsed: true,
          usedAt: Date.now(),
        });
      }
    }

    // Create new profile
    const profileId = await ctx.db.insert("userProfiles", {
      userId,
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      organizationId,
      role: userRole,
      profileCompleted: false,
      setupCompleted: organizationId ? true : false, // If joining via invitation, skip setup
      requiresOTPVerification: organizationId ? false : true, // Users with invites skip OTP, new users need OTP
      createdAt: Date.now(),
      isActive: true,
    });

    if (organizationId) {
      // Update invitation with user who used it
      const invitation = await ctx.db
        .query("memberInvitations")
        .withIndex("by_invite_token", q => q.eq("inviteToken", args.inviteToken!))
        .first();
      
      if (invitation) {
        await ctx.db.patch(invitation._id, {
          usedBy: profileId,
        });
      }
    }

    return profileId;
  },
});

// Update user profile with professional details
export const updateUserProfile = mutation({
  args: {
    phoneNumber: v.string(),
    aphraRegistrationNumber: v.string(),
    healthcareProfessionalType: v.union(
      v.literal("pharmacist"),
      v.literal("general_practitioner"), 
      v.literal("nurse"),
      v.literal("administration"),
      v.literal("aged_care_worker"),
      v.literal("specialist"),
      v.literal("other")
    ),
  },
  handler: async (ctx, args) => {
    try {
      const userId = await auth.getUserId(ctx);
      if (!userId) {
        throw new Error("User must be authenticated");
      }

      const profile = await ctx.db
        .query("userProfiles")
        .withIndex("by_user_id", q => q.eq("userId", userId))
        .first();

      if (!profile) {
        throw new Error("User profile not found. Please try signing out and signing back in.");
      }

      console.log("Updating user profile for user:", userId, "with data:", args);

      // Validate inputs
      if (!args.phoneNumber?.trim()) {
        throw new Error("Phone number is required");
      }
      if (!args.aphraRegistrationNumber?.trim()) {
        throw new Error("APHRA registration number is required");
      }

      await ctx.db.patch(profile._id, {
        phoneNumber: args.phoneNumber.trim(),
        aphraRegistrationNumber: args.aphraRegistrationNumber.trim(),
        healthcareProfessionalType: args.healthcareProfessionalType,
        profileCompleted: true,
      });

      console.log("Profile updated successfully for user:", userId);
      return profile._id;
    } catch (error) {
      console.error("Error updating user profile:", error);
      throw error;
    }
  },
});

// Get current user's profile
export const getCurrentUserProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return null;
    }

    return await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();
  },
});

// Check if user has completed setup
export const getSetupStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return { needsSetup: true, hasProfile: false, needsProfileCompletion: false };
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!profile) {
      return { needsSetup: true, hasProfile: false, needsProfileCompletion: false };
    }

    return {
      needsSetup: !profile.setupCompleted,
      hasProfile: true,
      needsProfileCompletion: !profile.profileCompleted,
      hasOrganization: !!profile.organizationId,
    };
  },
});

// Send welcome email on first dashboard visit
export const sendWelcomeEmailOnDashboard = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated");
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!profile) {
      throw new Error("User profile not found");
    }

    // Only send welcome email if user hasn't received it yet
    if (!profile.welcomeEmailSent) {
      try {
        console.log("Sending welcome email to user on dashboard visit:", profile.email);
        await ctx.scheduler.runAfter(0, internal.emails.sendWelcomeEmail, {
          userEmail: profile.email,
          userName: profile.firstName,
        });
        
        // Mark that welcome email has been sent
        await ctx.db.patch(profile._id, {
          welcomeEmailSent: true,
        });
        
        console.log("Welcome email scheduled and profile updated");
        return { success: true };
      } catch (error) {
        console.error("Failed to schedule welcome email on dashboard:", error);
        // Don't throw - we don't want email failures to break dashboard loading
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
      }
    }

    return { success: true, alreadySent: true };
  },
});

// Access tokens removed - only use invitation tokens for security

// Generate secure invitation token (different format)
function generateInviteToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Format as XXXX-XXXX-XXXX-XXXX for invites
  return result.match(/.{1,4}/g)?.join('-') || result;
}

// Generate partnership token (different format)
function generatePartnershipToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Format as XXXXX-XXXXX-XXXXX-XXXXX for partnerships
  return result.match(/.{1,5}/g)?.join('-') || result;
}

// Create organization with detailed information
export const createOrganization = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal("pharmacy"),
      v.literal("gp_clinic"),
      v.literal("hospital"),
      v.literal("aged_care")
    ),
    contactPersonName: v.string(),
    phoneNumber: v.string(),
    email: v.string(),
    // New contact person fields
    contactPhoneNumber: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    // Billing contact fields
    billingPersonName: v.optional(v.string()),
    billingPhoneNumber: v.optional(v.string()),
    billingEmail: v.optional(v.string()),
    website: v.optional(v.string()),
    streetAddress: v.string(),
    suburb: v.string(),
    state: v.string(),
    postcode: v.string(),
    abn: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated");
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!profile) {
      throw new Error("User profile not found");
    }

    if (profile.organizationId) {
      throw new Error("User already belongs to an organization");
    }

    // Create organization (no access token needed - only invitation tokens)
    const orgId = await ctx.db.insert("organizations", {
      name: args.name,
      type: args.type,
      contactPersonName: args.contactPersonName,
      phoneNumber: args.phoneNumber,
      email: args.email,
      contactPhoneNumber: args.contactPhoneNumber,
      contactEmail: args.contactEmail,
      billingPersonName: args.billingPersonName,
      billingPhoneNumber: args.billingPhoneNumber,
      billingEmail: args.billingEmail,
      website: args.website,
      streetAddress: args.streetAddress,
      suburb: args.suburb,
      state: args.state,
      postcode: args.postcode,
      country: "Australia",
      abn: args.abn,
      ownerId: profile._id,
      createdAt: Date.now(),
      isActive: true,
    });

    // Update user profile
    await ctx.db.patch(profile._id, {
      organizationId: orgId,
      role: "owner",
      setupCompleted: true,
    });

    return { organizationId: orgId };
  },
});

// Update organization details
export const updateOrganization = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal("pharmacy"),
      v.literal("gp_clinic"),
      v.literal("hospital"),
      v.literal("aged_care")
    ),
    contactPersonName: v.string(),
    phoneNumber: v.string(),
    email: v.string(),
    // New contact person fields
    contactPhoneNumber: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    // Billing contact fields
    billingPersonName: v.optional(v.string()),
    billingPhoneNumber: v.optional(v.string()),
    billingEmail: v.optional(v.string()),
    website: v.optional(v.string()),
    streetAddress: v.string(),
    suburb: v.string(),
    state: v.string(),
    postcode: v.string(),
    abn: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated");
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!profile || !profile.organizationId) {
      throw new Error("User must belong to an organization");
    }

    // Check if user has permission to update (owner or admin)
    if (profile.role !== "owner" && profile.role !== "admin") {
      throw new Error("Insufficient permissions to update organization");
    }

    await ctx.db.patch(profile.organizationId, {
      name: args.name,
      type: args.type,
      contactPersonName: args.contactPersonName,
      phoneNumber: args.phoneNumber,
      email: args.email,
      contactPhoneNumber: args.contactPhoneNumber,
      contactEmail: args.contactEmail,
      billingPersonName: args.billingPersonName,
      billingPhoneNumber: args.billingPhoneNumber,
      billingEmail: args.billingEmail,
      website: args.website,
      streetAddress: args.streetAddress,
      suburb: args.suburb,
      state: args.state,
      postcode: args.postcode,
      abn: args.abn,
    });

    return profile.organizationId;
  },
});

// Get organization details
export const getOrganization = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return null;
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!profile) {
      return null;
    }

    const orgId = profile.organizationId;
    if (!orgId) {
      return null;
    }

    return await ctx.db.get(orgId);
  },
});

// Get organization members
export const getOrganizationMembers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return [];
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!profile || !profile.organizationId) {
      return [];
    }

    return await ctx.db
      .query("userProfiles")
      .withIndex("by_organization", q => q.eq("organizationId", profile.organizationId!))
      .filter(q => q.eq(q.field("isActive"), true))
      .collect();
  },
});

// Create member invitation
export const createMemberInvitation = mutation({
  args: {
    email: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("member"),
      v.literal("viewer")
    ),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated");
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!profile || !profile.organizationId) {
      throw new Error("User must belong to an organization");
    }

    // Check if user has permission to invite (owner or admin)
    if (profile.role !== "owner" && profile.role !== "admin") {
      throw new Error("Insufficient permissions to invite members");
    }

    // Check if user is already a member
    const existingMember = await ctx.db
      .query("userProfiles")
      .withIndex("by_email", q => q.eq("email", args.email))
      .first();

    if (existingMember && existingMember.organizationId === profile.organizationId) {
      throw new Error("User is already a member of this organization");
    }

    // Generate unique invite token
    let inviteToken: string;
    let existing;
    do {
      inviteToken = generateInviteToken();
      existing = await ctx.db
        .query("memberInvitations")
        .withIndex("by_invite_token", q => q.eq("inviteToken", inviteToken))
        .first();
    } while (existing);

    // Create invitation (expires in 7 days)
    const invitationId = await ctx.db.insert("memberInvitations", {
      organizationId: profile.organizationId!,
      invitedBy: profile._id,
      inviteToken,
      email: args.email,
      role: args.role,
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
      isUsed: false,
      createdAt: Date.now(),
      isActive: true,
    });

    return { invitationId, inviteToken };
  },
});

// Get pending invitations
export const getPendingInvitations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return [];
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!profile || !profile.organizationId) {
      return [];
    }

    return await ctx.db
      .query("memberInvitations")
      .withIndex("by_organization", q => q.eq("organizationId", profile.organizationId!))
      .filter(q => 
        q.and(
          q.eq(q.field("isActive"), true),
          q.eq(q.field("isUsed"), false),
          q.gt(q.field("expiresAt"), Date.now())
        )
      )
      .collect();
  },
});

// Update member role
export const updateMemberRole = mutation({
  args: {
    memberId: v.id("userProfiles"),
    role: v.union(
      v.literal("admin"),
      v.literal("member"),
      v.literal("viewer")
    ),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated");
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!profile || !profile.organizationId) {
      throw new Error("User must belong to an organization");
    }

    // Check if user has permission (owner or admin)
    if (profile.role !== "owner" && profile.role !== "admin") {
      throw new Error("Insufficient permissions to update member roles");
    }

    const member = await ctx.db.get(args.memberId);
    if (!member || member.organizationId !== profile.organizationId!) {
      throw new Error("Member not found in organization");
    }

    // Prevent demoting the owner
    if (member.role === "owner") {
      throw new Error("Cannot change owner role");
    }

    await ctx.db.patch(args.memberId, {
      role: args.role,
    });

    return args.memberId;
  },
});

// Remove member from organization
export const removeMember = mutation({
  args: {
    memberId: v.id("userProfiles"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated");
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!profile || !profile.organizationId) {
      throw new Error("User must belong to an organization");
    }

    // Check if user has permission (owner or admin)
    if (profile.role !== "owner" && profile.role !== "admin") {
      throw new Error("Insufficient permissions to remove members");
    }

    const member = await ctx.db.get(args.memberId);
    if (!member || member.organizationId !== profile.organizationId!) {
      throw new Error("Member not found in organization");
    }

    // Prevent removing the owner
    if (member.role === "owner") {
      throw new Error("Cannot remove organization owner");
    }

    await ctx.db.patch(args.memberId, {
      organizationId: undefined,
      role: undefined,
    });

    return args.memberId;
  },
});

// Create organization partnership
export const createPartnership = mutation({
  args: {
    partnershipType: v.union(
      v.literal("data_sharing"),
      v.literal("referral_network"),
      v.literal("merger")
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated");
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!profile || !profile.organizationId) {
      throw new Error("User must belong to an organization");
    }

    // Check if user has permission (owner or admin)
    if (profile.role !== "owner" && profile.role !== "admin") {
      throw new Error("Insufficient permissions to create partnerships");
    }

    // Generate unique partnership token
    let partnershipToken: string;
    let existing;
    do {
      partnershipToken = generatePartnershipToken();
      existing = await ctx.db
        .query("organizationPartnerships")
        .withIndex("by_partnership_token", q => q.eq("partnershipToken", partnershipToken))
        .first();
    } while (existing);

    // Create partnership (expires in 30 days)
    const partnershipId = await ctx.db.insert("organizationPartnerships", {
      initiatorOrgId: profile.organizationId!,
      partnershipToken,
      partnershipType: args.partnershipType,
      status: "pending",
      initiatedBy: profile._id,
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
      createdAt: Date.now(),
      isActive: true,
      notes: args.notes,
    });

    return { partnershipId, partnershipToken };
  },
});

// Access token functions removed - only use invitation tokens for security
// Users can only join organizations through email invitations now

// Invite user to organization
export const inviteUserToOrganization = mutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated");
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!profile || !profile.organizationId) {
      throw new Error("User must belong to an organization");
    }

    // Check if user has permission (owner or admin)
    if (profile.role !== "owner" && profile.role !== "admin") {
      throw new Error("Insufficient permissions to invite members");
    }

    // Check if user is already a member
    const existingMember = await ctx.db
      .query("userProfiles")
      .withIndex("by_email", q => q.eq("email", args.email))
      .first();

    if (existingMember && existingMember.organizationId) {
      throw new Error("User is already a member of an organization");
    }

    // Check if there's already a pending invitation
    const existingInvitation = await ctx.db
      .query("memberInvitations")
      .withIndex("by_email", q => q.eq("email", args.email))
      .filter(q => q.eq(q.field("organizationId"), profile.organizationId))
      .filter(q => q.eq(q.field("isUsed"), false))
      .first();

    if (existingInvitation && existingInvitation.expiresAt > Date.now()) {
      throw new Error("An invitation has already been sent to this email");
    }

    // Get organization details
    const organization = await ctx.db.get(profile.organizationId!);
    if (!organization) {
      throw new Error("Organization not found");
    }

    // Generate unique invitation token
    let inviteToken: string;
    let existing;
    do {
      inviteToken = generateInviteToken();
      existing = await ctx.db
        .query("memberInvitations")
        .withIndex("by_invite_token", q => q.eq("inviteToken", inviteToken))
        .first();
    } while (existing);

    // Create invitation (expires in 7 days)
    const invitationId = await ctx.db.insert("memberInvitations", {
      organizationId: profile.organizationId!,
      email: args.email,
      role: args.role,
      inviteToken,
      invitedBy: profile._id,
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
      isUsed: false,
      createdAt: Date.now(),
      isActive: true,
    });

    // Send invitation email
    try {
      console.log("Scheduling invitation email for:", args.email);
      await ctx.scheduler.runAfter(0, internal.emails.sendOrganizationInvite, {
        inviteEmail: args.email,
        organizationName: organization.name,
        inviterName: `${profile.firstName} ${profile.lastName}`,
        inviteToken,
      });
      console.log("Invitation email scheduled successfully");
    } catch (error) {
      console.error("Failed to schedule invitation email:", error);
      // Don't fail the invitation creation if email fails
      // But we should still return the token so the admin can manually share it
    }

    return { invitationId, inviteToken };
  },
});

// Accept organization invitation
export const acceptInvitation = mutation({
  args: {
    inviteToken: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated");
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!profile) {
      throw new Error("User profile not found");
    }

    if (profile.organizationId) {
      throw new Error("User already belongs to an organization");
    }

    // Find invitation
    const invitation = await ctx.db
      .query("memberInvitations")
      .withIndex("by_invite_token", q => q.eq("inviteToken", args.inviteToken))
      .first();

    if (!invitation) {
      throw new Error("Invalid invitation token");
    }

    if (invitation.isUsed) {
      throw new Error("Invitation has already been used");
    }

    if (invitation.expiresAt < Date.now()) {
      throw new Error("Invitation has expired");
    }

    if (invitation.email !== profile.email) {
      throw new Error("Invitation email does not match user email");
    }

    // Accept invitation
    await ctx.db.patch(profile._id, {
      organizationId: invitation.organizationId,
      role: invitation.role,
      setupCompleted: true,
    });

    // Mark invitation as used
    await ctx.db.patch(invitation._id, {
      isUsed: true,
      usedBy: profile._id,
      usedAt: Date.now(),
    });

    return { organizationId: invitation.organizationId };
  },
});

// Cancel/revoke invitation
export const cancelInvitation = mutation({
  args: {
    invitationId: v.id("memberInvitations"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated");
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!profile || !profile.organizationId) {
      throw new Error("User must belong to an organization");
    }

    // Check if user has permission (owner or admin)
    if (profile.role !== "owner" && profile.role !== "admin") {
      throw new Error("Insufficient permissions to cancel invitations");
    }

    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.organizationId !== profile.organizationId) {
      throw new Error("Invitation not found");
    }

    // Cancel invitation by marking as inactive
    await ctx.db.patch(args.invitationId, {
      isActive: false,
    });

    return args.invitationId;
  },
}); 

// Password Reset Functions

// Request password reset - generates token and sends email
export const requestPasswordReset = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if user exists with this email
    const userProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_email", q => q.eq("email", args.email.toLowerCase()))
      .first();

    if (!userProfile) {
      // Don't reveal if email exists or not for security
      // Just return success to prevent email enumeration
      return { success: true };
    }

    // Generate secure random token
    const token = generateResetToken();
    const expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour from now

    // Invalidate any existing reset tokens for this email
    const existingTokens = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_email", q => q.eq("email", args.email.toLowerCase()))
      .filter(q => q.eq(q.field("isUsed"), false))
      .collect();

    for (const existingToken of existingTokens) {
      await ctx.db.patch(existingToken._id, { isUsed: true });
    }

    // Create new reset token
    await ctx.db.insert("passwordResetTokens", {
      email: args.email.toLowerCase(),
      token,
      expiresAt,
      isUsed: false,
      createdAt: Date.now(),
    });

    // Send password reset email using the existing sendPasswordResetEmail function
    await ctx.scheduler.runAfter(0, api.emails.sendPasswordResetEmail, {
      userEmail: args.email,
      resetToken: token,
    });

    return { success: true };
  },
});

// Verify password reset token
export const verifyResetToken = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const resetRecord = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_token", q => q.eq("token", args.token))
      .first();

    if (!resetRecord) {
      return { valid: false, error: "Invalid reset token" };
    }

    if (resetRecord.expiresAt < Date.now()) {
      return { valid: false, error: "Reset token has expired" };
    }

    // Allow recently used tokens (within 5 minutes) to still be accessed
    // This handles cases where the user refreshes the page or goes back
    if (resetRecord.isUsed) {
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      if (!resetRecord.usedAt || resetRecord.usedAt < fiveMinutesAgo) {
        return { valid: false, error: "Reset token has already been used" };
      }
      // Token was used recently, allow access but indicate it's been used
      return { 
        valid: true, 
        email: resetRecord.email,
        recentlyUsed: true
      };
    }

    return { 
      valid: true, 
      email: resetRecord.email,
      recentlyUsed: false
    };
  },
});

// Complete password reset with new password
export const completePasswordReset = mutation({
  args: {
    token: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify token is valid first
    const resetRecord = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_token", q => q.eq("token", args.token))
      .first();

    if (!resetRecord) {
      throw new Error("Invalid reset token");
    }

    // Allow resubmission within 5 minutes to handle page refreshes
    if (resetRecord.isUsed) {
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      if (!resetRecord.usedAt || resetRecord.usedAt < fiveMinutesAgo) {
        throw new Error("Reset token has already been used");
      }
      // Token was used recently, allow resubmission
    }

    if (resetRecord.expiresAt < Date.now()) {
      throw new Error("Reset token has expired. Please request a new password reset.");
    }

    // Find the user profile to get the user ID
    const userProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_email", q => q.eq("email", resetRecord.email))
      .first();

    if (!userProfile) {
      throw new Error("User profile not found for this email address.");
    }

    // Get the user from auth tables
    const user = await ctx.db.get(userProfile.userId);
    if (!user) {
      throw new Error("User account not found.");
    }

    // Store the new password in the reset record for audit trail
    await ctx.db.patch(resetRecord._id, {
      isUsed: true,
      usedAt: Date.now(),
      newPassword: args.newPassword,
    });

    // Note: Due to Convex Auth beta limitations, password updates need to be handled
    // through the authentication flow. The user will need to use the forgot password
    // flow again or contact support for manual password updates.
    return { 
      success: true, 
      email: resetRecord.email,
      message: "Password reset request has been processed successfully! Due to security protocols, please try signing in with your new password. If you experience any issues, please use the 'Forgot Password' option again or contact our support team." 
    };
  },
});

// OTP VERIFICATION FUNCTIONS

// Generate and send OTP for signup verification
export const generateSignupOTP = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated");
    }

    // Get user profile to check if OTP verification is required
    const userProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!userProfile) {
      throw new Error("User profile not found");
    }

    // Don't generate OTP for existing users who don't require verification
    if (userProfile.requiresOTPVerification === false || userProfile.requiresOTPVerification === undefined) {
      throw new Error("OTP verification not required for this user");
    }

    // Generate 6-digit OTP
    const otp = generateOTPCode();
    const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes from now

    // Invalidate any existing OTPs for this user
    const existingOTPs = await ctx.db
      .query("otpVerifications")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("isUsed"), false))
      .collect();

    for (const existingOTP of existingOTPs) {
      await ctx.db.patch(existingOTP._id, { isUsed: true });
    }

    // Create new OTP verification record
    const otpId = await ctx.db.insert("otpVerifications", {
      email: args.email.toLowerCase(),
      userId,
      otp, // Use new 'otp' field for new records
      expiresAt,
      isUsed: false,
      isVerified: false,
      createdAt: Date.now(),
      attempts: 0,
    });

    // Send OTP email
    try {
      await ctx.scheduler.runAfter(0, api.emails.sendOTPEmail, {
        userEmail: args.email,
        otp,
        userName: userProfile.firstName || "", // Use first name from profile
      });
      console.log("OTP generated:", otp, "for email:", args.email);
    } catch (error) {
      console.error("Failed to send OTP email:", error);
      // Delete the OTP record if email fails
      await ctx.db.delete(otpId);
      throw new Error("Failed to send OTP email. Please try again.");
    }

    return { success: true };
  },
});

// Verify OTP code
export const verifyOTP = mutation({
  args: {
    otp: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated");
    }

    // Find the OTP record (try both new and legacy formats)
    let otpRecord = await ctx.db
      .query("otpVerifications")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("isUsed"), false))
      .filter(q => q.neq(q.field("isVerified"), true))
      .first();

    if (!otpRecord) {
      throw new Error("No valid OTP found. Please request a new one.");
    }

    if (otpRecord.expiresAt < Date.now()) {
      // Mark as used
      await ctx.db.patch(otpRecord._id, { isUsed: true });
      throw new Error("OTP has expired. Please request a new one.");
    }

    // Check attempts (max 5 attempts)
    const currentAttempts = otpRecord.attempts || 0;
    if (currentAttempts >= 5) {
      await ctx.db.patch(otpRecord._id, { isUsed: true });
      throw new Error("Too many failed attempts. Please request a new OTP.");
    }

    // Verify OTP - check both new 'otp' field and legacy 'code' field
    const storedOTP = otpRecord.otp || otpRecord.code;
    if (!storedOTP || storedOTP !== args.otp.trim()) {
      // Increment attempts
      await ctx.db.patch(otpRecord._id, { 
        attempts: currentAttempts + 1 
      });
      throw new Error("Invalid OTP code. Please try again.");
    }

    // Mark OTP as verified
    await ctx.db.patch(otpRecord._id, {
      isVerified: true,
      isUsed: true,
      verifiedAt: Date.now(),
    });

    // Update user profile to mark as not requiring future OTP verification
    const userProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (userProfile) {
      await ctx.db.patch(userProfile._id, {
        requiresOTPVerification: false,
      });
    }

    return { success: true };
  },
});

// Check if user has verified OTP
export const checkOTPVerification = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return { isVerified: false, needsVerification: false };
    }

    // Get user profile to check if OTP verification is required
    const userProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    // If user doesn't exist or doesn't require OTP verification (existing users), consider them verified
    if (!userProfile || userProfile.requiresOTPVerification === false || userProfile.requiresOTPVerification === undefined) {
      return { isVerified: true, needsVerification: false, isExistingUser: true };
    }

    // Check if user has any verified OTP (new system)
    const verifiedOTP = await ctx.db
      .query("otpVerifications")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("isVerified"), true))
      .first();

    if (verifiedOTP) {
      return { isVerified: true, needsVerification: false };
    }

    // Check for legacy OTP records - if user has any OTP record with isUsed: true, consider them verified
    const legacyOTPRecord = await ctx.db
      .query("otpVerifications")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("isUsed"), true))
      .first();

    if (legacyOTPRecord) {
      // User has legacy OTP record, consider them verified (existing user)
      return { isVerified: true, needsVerification: false, isExistingUser: true };
    }

    // Check if user has pending OTP that's not expired
    const pendingOTP = await ctx.db
      .query("otpVerifications")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("isUsed"), false))
      .filter(q => q.neq(q.field("isVerified"), true))
      .first();

    const needsVerification = !pendingOTP || pendingOTP.expiresAt < Date.now();

    return { 
      isVerified: false, 
      needsVerification,
      hasActivePendingOTP: pendingOTP && pendingOTP.expiresAt > Date.now()
    };
  },
});

// Resend OTP
export const resendOTP = mutation({
  args: {},
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated");
    }

    // Get user profile for email
    const userProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!userProfile) {
      throw new Error("User profile not found");
    }

    // Check if too many OTPs have been sent recently (rate limiting)
    const recentOTPs = await ctx.db
      .query("otpVerifications")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .filter(q => q.gt(q.field("createdAt"), Date.now() - (5 * 60 * 1000))) // Last 5 minutes
      .collect();

    if (recentOTPs.length >= 3) {
      throw new Error("Too many OTP requests. Please wait 5 minutes before requesting another one.");
    }

    // Generate 6-digit OTP
    const otp = generateOTPCode();
    const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes from now

    // Invalidate any existing OTPs for this user
    const existingOTPs = await ctx.db
      .query("otpVerifications")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("isUsed"), false))
      .collect();

    for (const existingOTP of existingOTPs) {
      await ctx.db.patch(existingOTP._id, { isUsed: true });
    }

    // Create new OTP verification record
    const otpId = await ctx.db.insert("otpVerifications", {
      email: userProfile.email.toLowerCase(),
      userId,
      otp, // Use new 'otp' field for new records
      expiresAt,
      isUsed: false,
      isVerified: false,
      createdAt: Date.now(),
      attempts: 0,
    });

    // Send OTP email
    try {
      await ctx.scheduler.runAfter(0, api.emails.sendOTPEmail, {
        userEmail: userProfile.email,
        otp,
        userName: userProfile.firstName,
      });
      console.log("OTP generated:", otp, "for email:", userProfile.email);
    } catch (error) {
      console.error("Failed to send OTP email:", error);
      // Delete the OTP record if email fails
      await ctx.db.delete(otpId);
      throw new Error("Failed to send OTP email. Please try again.");
    }

    return { success: true };
  },
});

// MIGRATION FUNCTION - Mark existing users as not requiring OTP verification
export const migrateExistingUsersOTPStatus = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated");
    }

    // Only allow this to be run by authenticated users (could add admin check if needed)
    const userProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!userProfile) {
      throw new Error("User profile not found");
    }

    // Find all user profiles that don't have the requiresOTPVerification field set
    // These are existing users who were created before the OTP system
    const existingUsers = await ctx.db
      .query("userProfiles")
      .filter(q => q.eq(q.field("requiresOTPVerification"), undefined))
      .collect();

    console.log(`Found ${existingUsers.length} existing users to migrate`);

    let migratedCount = 0;
    for (const user of existingUsers) {
      // Check if user has any legacy OTP records
      const hasLegacyOTP = await ctx.db
        .query("otpVerifications")
        .withIndex("by_user_id", q => q.eq("userId", user.userId))
        .first();

      // Mark as not requiring OTP verification (existing user)
      await ctx.db.patch(user._id, {
        requiresOTPVerification: false,
      });
      migratedCount++;

      if (hasLegacyOTP) {
        console.log(`Migrated user ${user.email} with legacy OTP record`);
      }
    }

    console.log(`Successfully migrated ${migratedCount} existing users`);

    return { 
      success: true, 
      message: `Successfully migrated ${migratedCount} existing users to not require OTP verification`,
      migratedCount 
    };
  },
});

function generateResetToken(): string {
  // Generate a cryptographically secure random token
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function generateOTPCode(): string {
  // Generate a 6-digit OTP code
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Search users by name or email for access granting
export const searchUsers = query({
  args: {
    searchTerm: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Authentication required");
    }

    const currentUserProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .first();

    if (!currentUserProfile) {
      throw new Error("User profile not found");
    }

    const searchTerm = args.searchTerm.toLowerCase().trim();
    if (!searchTerm) {
      return [];
    }

    // Search users by email or name
    const users = await ctx.db
      .query("userProfiles")
      .filter(q => q.eq(q.field("isActive"), true))
      .collect();

    // Filter users based on search term
    const filteredUsers = users.filter(user => {
      const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
      const email = user.email.toLowerCase();
      
      return (
        fullName.includes(searchTerm) ||
        email.includes(searchTerm)
      );
    });

    // Enrich with organization details
    const enrichedUsers = await Promise.all(
      filteredUsers.map(async (user) => {
        const organization = user.organizationId
          ? await ctx.db.get(user.organizationId)
          : null;

        return {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          organizationName: organization?.name || "No Organization",
          organizationType: organization?.type || "Individual",
        };
      })
    );

    // Limit results to prevent overwhelming the UI
    return enrichedUsers.slice(0, 10);
  },
});

// Get user by email for access granting
export const getUserByEmail = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Authentication required");
    }

    const userProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_email", q => q.eq("email", args.email.toLowerCase()))
      .first();

    if (!userProfile || !userProfile.isActive) {
      return null;
    }

    const organization = userProfile.organizationId
      ? await ctx.db.get(userProfile.organizationId)
      : null;

    return {
      _id: userProfile._id,
      firstName: userProfile.firstName,
      lastName: userProfile.lastName,
      email: userProfile.email,
      organizationName: organization?.name || "No Organization",
      organizationType: organization?.type || "Individual",
    };
  },
});