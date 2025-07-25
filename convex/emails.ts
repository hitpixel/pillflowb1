import { components, internal } from "./_generated/api";
import { Resend, vEmailId, vEmailEvent } from "@convex-dev/resend";
import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";

// Import email template generators
import { 
  generateWelcomeEmailHTML,
  generateOrganizationInviteEmailHTML,
  generatePasswordResetEmailHTML,
  generateTestEmailHTML,
  generateTestInvitationEmailHTML,
  generateOTPEmailHTML,
  generatePatientAccessGrantEmailHTML
} from "./emailTemplates";

export const resend: Resend = new Resend(components.resend, {
  testMode: false, // Production mode - emails will be sent to real addresses
});

// Handle email status events from webhook
export const handleEmailEvent = internalMutation({
  args: {
    id: vEmailId,
    event: vEmailEvent,
  },
  handler: async (ctx, args) => {
    console.log("Email event received:", args.id, args.event);
    // You can add custom logic here to track email deliverability
  },
});

// Send welcome email to new users
export const sendWelcomeEmail = internalMutation({
  args: {
    userEmail: v.string(),
    userName: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      console.log("Sending welcome email to:", args.userEmail);
      
      // Generate HTML content using template function
      const htmlContent = generateWelcomeEmailHTML(args.userName);
      
      const emailId = await resend.sendEmail(
        ctx,
        "PillFlow Onboarding <onboarding@pillflow.com.au>",
        args.userEmail,
        "Welcome to PillFlow!",
        htmlContent,
        `Welcome to PillFlow, ${args.userName}!
        
Thank you for joining our healthcare medication management platform.

Get started by:
- Completing your professional profile
- Setting up your organization  
- Inviting team members

If you have any questions, feel free to reach out to our support team.

Best regards,
The PillFlow Team`
      );
      
      console.log("Welcome email queued successfully:", emailId);
      return emailId;
    } catch (error) {
      console.error("Failed to send welcome email:", error);
      return null;
    }
  },
});

// Send organization invitation email
export const sendOrganizationInvite = internalMutation({
  args: {
    inviteEmail: v.string(),
    organizationName: v.string(),
    inviterName: v.string(),
    inviteToken: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      console.log("🚀 Starting invitation email process...");
      console.log("📧 Sending organization invite email to:", args.inviteEmail);
      console.log("🏢 Organization:", args.organizationName);
      console.log("👤 Inviter:", args.inviterName);
      console.log("🎫 Token:", args.inviteToken);
      
      const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
      console.log("🌐 Site URL:", siteUrl);
      
      const joinUrl = `${siteUrl}/signin?invite=${args.inviteToken}`;
      console.log("🔗 Join URL:", joinUrl);
      
      console.log("📤 Attempting to send email via Resend...");
      
      // Generate HTML content using template function
      const htmlContent = generateOrganizationInviteEmailHTML({
        organizationName: args.organizationName,
        inviterName: args.inviterName,
        inviteToken: args.inviteToken,
        joinUrl
      });
      
      const emailId = await resend.sendEmail(
        ctx,
        "PillFlow <noreply@pillflow.com.au>",
        args.inviteEmail,
        `You've been invited to join ${args.organizationName} on PillFlow`,
        htmlContent,
        `You've been invited to join ${args.organizationName}

${args.inviterName} has invited you to join their organization on PillFlow.

PillFlow is a healthcare medication management platform designed for medical professionals.

GETTING STARTED:
- If you already have an account: Sign in and you'll automatically join the organization
- If you're new to PillFlow: Create your account and you'll be added to the organization immediately

Your invitation token: ${args.inviteToken}

Accept your invitation by visiting: ${joinUrl}

⏰ Important: This invitation will expire in 7 days. Please accept it soon to join the team!

Best regards,
The PillFlow Team`
      );
      
      console.log("✅ Organization invite email queued successfully! Email ID:", emailId);
      console.log("📊 Email scheduled for delivery to:", args.inviteEmail);
      return emailId;
    } catch (error) {
      console.error("❌ FAILED to send organization invite email:");
      console.error("📧 Email:", args.inviteEmail);
      console.error("🏢 Organization:", args.organizationName);
      console.error("🎫 Token:", args.inviteToken);
      console.error("💥 Error details:", error);
      
      if (error instanceof Error) {
        console.error("📝 Error message:", error.message);
        console.error("📚 Error stack:", error.stack);
      }
      
      return null;
    }
  },
});

// Send password reset email
export const sendPasswordResetEmail = mutation({
  args: {
    userEmail: v.string(),
    resetToken: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const resetUrl = `${process.env.SITE_URL || 'http://localhost:3000'}/reset-password?token=${args.resetToken}`;
      
      // Generate HTML content using template function
      const htmlContent = generatePasswordResetEmailHTML(resetUrl);
      
      const emailId = await resend.sendEmail(
        ctx,
        "PillFlow <noreply@pillflow.com.au>",
        args.userEmail,
        "Reset your PillFlow password",
        htmlContent,
        `Reset your password

You requested a password reset for your PillFlow account.

Reset your password by visiting: ${resetUrl}

This link will expire in 1 hour. If you didn't request this reset, you can safely ignore this email.

Best regards,
The PillFlow Team`
      );
      
      console.log("Password reset email queued:", emailId);
      return emailId;
    } catch (error) {
      console.error("Failed to send password reset email:", error);
      throw error;
    }
  },
});

// Send patient access grant email
export const sendPatientAccessGrantEmail = mutation({
  args: {
    toEmail: v.string(),
    patientName: v.string(),
    grantedByName: v.string(),
    grantedByOrganization: v.string(),
    permissions: v.array(v.union(
      v.literal("view"),
      v.literal("comment"),
      v.literal("view_medications")
    )),
    expiresAt: v.optional(v.string()),
    accessUrl: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      console.log("Sending patient access grant email to:", args.toEmail);
      
      // Generate HTML content using template function
      const htmlContent = generatePatientAccessGrantEmailHTML({
        patientName: args.patientName,
        grantedByName: args.grantedByName,
        grantedByOrganization: args.grantedByOrganization,
        permissions: args.permissions,
        expiresAt: args.expiresAt,
        accessUrl: args.accessUrl,
      });
      
      const emailId = await resend.sendEmail(
        ctx,
        "PillFlow Access <noreply@pillflow.com.au>",
        args.toEmail,
        `Access Granted to ${args.patientName}`,
        htmlContent,
        `Access Granted to ${args.patientName}

You have been granted access to ${args.patientName}'s medication information by ${args.grantedByName} from ${args.grantedByOrganization}.

Permissions granted:
${args.permissions.map(p => `- ${p}`).join('\n')}

${args.expiresAt ? `This access expires on: ${args.expiresAt}` : 'This access does not expire'}

You can access the patient's information at: ${args.accessUrl}

Best regards,
The PillFlow Team`
      );
      
      console.log("Patient access grant email sent:", emailId);
      return emailId;
    } catch (error) {
      console.error("Failed to send patient access grant email:", error);
      throw error;
    }
  },
});

// Test email sending function
export const sendTestEmail = mutation({
  args: {
    testEmail: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      console.log("Sending test email to:", args.testEmail);
      
      const timestamp = new Date().toISOString();
      const siteUrl = process.env.SITE_URL;
      const hasResendKey = !!process.env.RESEND_API_KEY;
      
      // Generate HTML content using template function
      const htmlContent = generateTestEmailHTML({ 
        timestamp, 
        siteUrl, 
        hasResendKey 
      });
      
      const emailId = await resend.sendEmail(
        ctx,
        "PillFlow <noreply@pillflow.com.au>",
        args.testEmail,
        "PillFlow Email Test",
        htmlContent,
        `Email Test Successful!

This is a test email from PillFlow to verify that email sending is working correctly.

If you received this email, then:
- Resend API is configured correctly
- Email sending functionality is working
- Your email domain is verified

Time sent: ${timestamp}

Best regards,
The PillFlow Team`
      );
      
      console.log("Test email sent successfully:", emailId);
      return { success: true, emailId };
    } catch (error) {
      console.error("Failed to send test email:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

// Test invitation email sending function
export const sendTestInvitationEmail = mutation({
  args: {
    testEmail: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      console.log("Sending test invitation email to:", args.testEmail);
      
      const testToken = "TEST-1234-5678-9012";
      const joinUrl = `${process.env.SITE_URL || 'http://localhost:3000'}/signin?invite=${testToken}`;
      const timestamp = new Date().toISOString();
      
      // Generate HTML content using template function
      const htmlContent = generateTestInvitationEmailHTML({ 
        joinUrl, 
        timestamp 
      });
      
      const emailId = await resend.sendEmail(
        ctx,
        "PillFlow <noreply@pillflow.com.au>",
        args.testEmail,
        "Test Invitation to PillFlow",
        htmlContent,
        `Test Invitation Email

This is a test invitation email to verify that the invitation system is working correctly.

In a real invitation, you would be joining an organization on PillFlow.

HOW IT WORKS:
- If you already have an account: Sign in and you'll automatically join the organization
- If you're new to PillFlow: Create your account and you'll be added to the organization immediately

Test invitation link: ${joinUrl}

✅ If you received this email, the invitation system is working correctly!

Time sent: ${timestamp}

Best regards,
The PillFlow Team`
      );
      
      console.log("Test invitation email sent successfully:", emailId);
      return { success: true, emailId };
    } catch (error) {
      console.error("Failed to send test invitation email:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

// Debug function to check email sending and Resend configuration
export const debugEmailSystem = mutation({
  args: {
    testEmail: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      console.log("🔍 DEBUG: Email System Check");
      console.log("📧 Test email:", args.testEmail);
      
      // Check environment variables
      const siteUrl = process.env.SITE_URL;
      const resendKey = process.env.RESEND_API_KEY;
      const timestamp = new Date().toISOString();
      
      console.log("🌐 SITE_URL:", siteUrl || "NOT SET");
      console.log("🔑 RESEND_API_KEY:", resendKey ? "SET (length: " + resendKey.length + ")" : "NOT SET");
      
      // Try to send a simple test email
      console.log("📤 Testing basic email sending...");
      
      // Generate HTML content using template function
      const htmlContent = generateTestEmailHTML({ 
        timestamp, 
        siteUrl: siteUrl || "NOT SET", 
        hasResendKey: !!resendKey 
      });
      
      const emailId = await resend.sendEmail(
        ctx,
        "PillFlow Debug <noreply@pillflow.com.au>",
        args.testEmail,
        "🔍 Debug: Email System Test",
        htmlContent,
        `Email System Debug Test

This is a debug email to test the email system configuration.

Configuration Check:
- SITE_URL: ${siteUrl || "NOT SET"}
- Resend API Key: ${resendKey ? "✅ Configured" : "❌ Not Set"}
- Test Mode: ${process.env.NODE_ENV !== 'production' ? 'Development' : 'Production'}
- Timestamp: ${timestamp}

If you received this email, the basic email system is working!`
      );
      
      console.log("✅ Debug email sent successfully! Email ID:", emailId);
      
      return {
        success: true,
        emailId,
        config: {
          siteUrl: siteUrl || "NOT SET",
          hasResendKey: !!resendKey,
          resendKeyLength: resendKey?.length || 0,
          timestamp
        }
      };
    } catch (error) {
      console.error("❌ Debug email failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        config: {
          siteUrl: process.env.SITE_URL || "NOT SET",
          hasResendKey: !!process.env.RESEND_API_KEY,
          resendKeyLength: process.env.RESEND_API_KEY?.length || 0,
          timestamp: new Date().toISOString()
        }
      };
    }
  },
});

// Direct invitation email sending function - can be called manually
export const sendInvitationEmailDirect = mutation({
  args: {
    inviteEmail: v.string(),
    organizationName: v.string(),
    inviterName: v.string(),
    inviteToken: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      console.log("📧 DIRECT: Sending invitation email to:", args.inviteEmail);
      console.log("🏢 Organization:", args.organizationName);
      console.log("👤 Inviter:", args.inviterName);
      console.log("🎫 Token:", args.inviteToken);
      
      const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
      const joinUrl = `${siteUrl}/signin?invite=${args.inviteToken}`;
      
      console.log("🔗 Join URL:", joinUrl);
      console.log("📤 Sending via Resend...");
      
      // Generate HTML content using template function
      const htmlContent = generateOrganizationInviteEmailHTML({
        organizationName: args.organizationName,
        inviterName: args.inviterName,
        inviteToken: args.inviteToken,
        joinUrl
      });
      
      const emailId = await resend.sendEmail(
        ctx,
        "PillFlow Invitation <invitations@pillflow.com.au>",
        args.inviteEmail,
        `🎉 You've been invited to join ${args.organizationName} on PillFlow`,
        htmlContent,
        `You've been invited to join ${args.organizationName}

${args.inviterName} has invited you to join their organization on PillFlow.

PillFlow is a healthcare medication management platform designed for medical professionals.

GETTING STARTED:
- If you already have an account: Sign in and you'll automatically join the organization
- If you're new to PillFlow: Create your account and you'll be added to the organization immediately

Your invitation token: ${args.inviteToken}

Accept your invitation by visiting: ${joinUrl}

⏰ Important: This invitation will expire in 7 days. Please accept it soon to join the team!

Best regards,
The PillFlow Team`
      );
      
      console.log("✅ DIRECT: Invitation email sent successfully! Email ID:", emailId);
      
      return {
        success: true,
        emailId,
        details: {
          email: args.inviteEmail,
          organization: args.organizationName,
          inviter: args.inviterName,
          token: args.inviteToken,
          joinUrl,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error("❌ DIRECT: Failed to send invitation email:");
      console.error("📧 Email:", args.inviteEmail);
      console.error("🏢 Organization:", args.organizationName);
      console.error("🎫 Token:", args.inviteToken);
      console.error("💥 Error details:", error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        details: {
          email: args.inviteEmail,
          organization: args.organizationName,
          inviter: args.inviterName,
          token: args.inviteToken,
          timestamp: new Date().toISOString()
        }
      };
    }
  },
});

// Batch send invitation emails (for when multiple invites need to be sent)
export const sendBatchInvitationEmails = mutation({
  args: {
    invitations: v.array(v.object({
      inviteEmail: v.string(),
      organizationName: v.string(),
      inviterName: v.string(),
      inviteToken: v.string(),
    })),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    totalSent: number;
    totalFailed: number;
    results: Array<{
      email: string;
      success: boolean;
      emailId?: string;
      error?: string;
    }>;
  }> => {
    console.log("📧 BATCH: Sending", args.invitations.length, "invitation emails");
    
    const results: Array<{
      email: string;
      success: boolean;
      emailId?: string;
      error?: string;
    }> = [];
    
    for (const invitation of args.invitations) {
      try {
        // Call the function logic directly to avoid circular reference
        const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
        const joinUrl = `${siteUrl}/signin?invite=${invitation.inviteToken}`;
        
        const htmlContent = generateOrganizationInviteEmailHTML({
          organizationName: invitation.organizationName,
          inviterName: invitation.inviterName,
          inviteToken: invitation.inviteToken,
          joinUrl
        });
        
        const emailId = await resend.sendEmail(
          ctx,
          "PillFlow Invitation <invitations@pillflow.com.au>",
          invitation.inviteEmail,
          `🎉 You've been invited to join ${invitation.organizationName} on PillFlow`,
          htmlContent,
          `You've been invited to join ${invitation.organizationName}

${invitation.inviterName} has invited you to join their organization on PillFlow.

Your invitation token: ${invitation.inviteToken}
Accept your invitation: ${joinUrl}

Best regards,
The PillFlow Team`
        );
        
        results.push({
          email: invitation.inviteEmail,
          success: true,
          emailId
        });
        
        // Small delay between emails to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.push({
          email: invitation.inviteEmail,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
    
    const successCount: number = results.filter(r => r.success).length;
    const failCount: number = results.filter(r => !r.success).length;
    
    console.log(`✅ BATCH: Completed - ${successCount} successful, ${failCount} failed`);
    
    return {
      success: failCount === 0,
      totalSent: successCount,
      totalFailed: failCount,
      results
    };
  },
});

// Send OTP verification email
export const sendOTPEmail = mutation({
  args: {
    userEmail: v.string(),
    otp: v.string(),
    userName: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      console.log("Sending OTP email to:", args.userEmail);
      
      // Generate HTML content using template function
      const htmlContent = generateOTPEmailHTML({
        userName: args.userName,
        otp: args.otp,
      });
      
      const emailId = await resend.sendEmail(
        ctx,
        "PillFlow Verification <noreply@pillflow.com.au>",
        args.userEmail,
        "Your PillFlow Verification Code",
        htmlContent,
        `Your PillFlow Verification Code

Hi ${args.userName},

Your verification code is: ${args.otp}

Please enter this code to complete your account setup. This code will expire in 10 minutes.

If you didn't request this code, you can safely ignore this email.

Best regards,
The PillFlow Team`
      );
      
      console.log("OTP email queued successfully:", emailId);
      return emailId;
    } catch (error) {
      console.error("Failed to send OTP email:", error);
      throw error;
    }
  },
});