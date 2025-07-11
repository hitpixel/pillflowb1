"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff } from "lucide-react";

interface SignUpFormProps {
  className?: string;
}

export function SignUpForm({ className }: SignUpFormProps) {
  const { signIn } = useAuthActions();
  const createUserProfile = useMutation(api.users.createUserProfile);
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordsMatch, setPasswordsMatch] = useState(true);

  useEffect(() => {
    const token = searchParams.get('invite');
    if (token) {
      setInviteToken(token);
    }
  }, [searchParams]);

  // Check if passwords match whenever they change
  useEffect(() => {
    if (confirmPassword === "") {
      setPasswordsMatch(true); // Don't show error when confirm field is empty
    } else {
      setPasswordsMatch(password === confirmPassword);
    }
  }, [password, confirmPassword]);

  const getErrorMessage = (error: unknown): string => {
    if (typeof error === 'string') {
      return error;
    }
    
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      const message = error.message.toLowerCase();
      
      if (message.includes('email already exists') || message.includes('account already exists')) {
        return "An account with this email already exists. Please try signing in instead.";
      }
      
      if (message.includes('password')) {
        if (message.includes('too short')) {
          return "Password must be at least 8 characters long.";
        }
        if (message.includes('too weak')) {
          return "Password is too weak. Please use a stronger password with letters, numbers, and symbols.";
        }
      }
      
      if (message.includes('invalid format') || message.includes('invalid email')) {
        return "Please enter a valid email address.";
      }
      
      return error.message as string;
    }
    
    return "Failed to create account. Please check your information and try again.";
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    if (!acceptTerms) {
      setError("You must accept the terms and conditions to create an account.");
      setIsLoading(false);
      return;
    }

    if (!passwordsMatch) {
      setError("Passwords do not match. Please make sure both password fields are identical.");
      setIsLoading(false);
      return;
    }
    
    const formData = new FormData(e.target as HTMLFormElement);
    formData.set("flow", "signUp");
    
    try {
      await signIn("password", formData);
      
      try {
        await createUserProfile({
          firstName: formData.get("name") as string,
          lastName: formData.get("lastName") as string,
          email: formData.get("email") as string,
          inviteToken: inviteToken || undefined,
        });
        
        if (inviteToken) {
          router.push("/");
          return;
        }
      } catch (profileError) {
        console.error("Profile creation failed:", profileError);
      }
      
      router.push("/setup");
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {/* Header - 56px height */}
      <div className="text-center" style={{ height: '56px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h1 className="font-bold" style={{ fontSize: '56px', lineHeight: '56px', color: '#000000' }}>
          Sign up
        </h1>
      </div>

      {inviteToken && (
        <div className="mb-4 p-3 bg-blue-50 rounded-md border border-blue-200">
          <p className="text-sm" style={{ color: '#000000' }}>
                      <strong>✉️ Organisation Invitation Active</strong><br />
          You&apos;ll automatically join the organisation after creating your account.
          </p>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* First Name and Last Name */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="firstName" style={{ color: '#000000', fontSize: '16px', lineHeight: '24px' }}>
              First Name*
            </Label>
            <Input 
              id="firstName"
              name="name"
              type="text"
              placeholder="John"
              required
              disabled={isLoading}
              minLength={2}
              style={{ 
                fontSize: '16px', 
                lineHeight: '24px', 
                color: '#000000',
                backgroundColor: 'white'
              }}
              className="border-gray-300"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lastName" style={{ color: '#000000', fontSize: '16px', lineHeight: '24px' }}>
              Last Name*
            </Label>
            <Input 
              id="lastName"
              name="lastName"
              type="text"
              placeholder="Doe"
              required
              disabled={isLoading}
              minLength={2}
              style={{ 
                fontSize: '16px', 
                lineHeight: '24px', 
                color: '#000000',
                backgroundColor: 'white'
              }}
              className="border-gray-300"
            />
          </div>
        </div>
        
        {/* Email */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="email" style={{ color: '#000000', fontSize: '16px', lineHeight: '24px' }}>
            Email*
          </Label>
          <Input 
            id="email"
            name="email"
            type="email"
            placeholder="john.doe@example.com"
            required
            disabled={isLoading}
            style={{ 
              fontSize: '16px', 
              lineHeight: '24px', 
              color: '#000000',
              backgroundColor: 'white'
            }}
            className="border-gray-300"
          />
        </div>
        
                 {/* Password */}
         <div className="flex flex-col gap-2">
           <Label htmlFor="password" style={{ color: '#000000', fontSize: '16px', lineHeight: '24px' }}>
             Password*
           </Label>
           <div className="relative">
             <Input 
               id="password"
               name="password"
               type={showPassword ? "text" : "password"}
               placeholder="Create a password (min 8 characters)"
               required
               disabled={isLoading}
               minLength={8}
               value={password}
               onChange={(e) => setPassword(e.target.value)}
               style={{ 
                 fontSize: '16px', 
                 lineHeight: '24px', 
                 color: '#000000',
                 backgroundColor: 'white',
                 paddingRight: '40px'
               }}
               className="border-gray-300"
             />
             <button
               type="button"
               onClick={() => setShowPassword(!showPassword)}
               className="absolute right-3 top-1/2 transform -translate-y-1/2"
               disabled={isLoading}
             >
               {showPassword ? (
                 <EyeOff className="h-4 w-4" style={{ color: '#000000' }} />
               ) : (
                 <Eye className="h-4 w-4" style={{ color: '#000000' }} />
               )}
             </button>
           </div>
         </div>

         {/* Confirm Password */}
         <div className="flex flex-col gap-2">
           <Label htmlFor="confirmPassword" style={{ color: '#000000', fontSize: '16px', lineHeight: '24px' }}>
             Confirm Password*
           </Label>
           <div className="relative">
             <Input 
               id="confirmPassword"
               name="confirmPassword"
               type={showConfirmPassword ? "text" : "password"}
               placeholder="Confirm your password"
               required
               disabled={isLoading}
               minLength={8}
               value={confirmPassword}
               onChange={(e) => setConfirmPassword(e.target.value)}
               style={{ 
                 fontSize: '16px', 
                 lineHeight: '24px', 
                 color: '#000000',
                 backgroundColor: 'white',
                 paddingRight: '40px'
               }}
               className={`${!passwordsMatch ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
             />
             <button
               type="button"
               onClick={() => setShowConfirmPassword(!showConfirmPassword)}
               className="absolute right-3 top-1/2 transform -translate-y-1/2"
               disabled={isLoading}
             >
               {showConfirmPassword ? (
                 <EyeOff className="h-4 w-4" style={{ color: '#000000' }} />
               ) : (
                 <Eye className="h-4 w-4" style={{ color: '#000000' }} />
               )}
             </button>
           </div>
           {!passwordsMatch && confirmPassword !== "" && (
             <p className="text-xs text-red-600 mt-1">
               Passwords do not match
             </p>
           )}
         </div>
         
                  {/* Terms and conditions */}
         <div className="flex items-start space-x-2">
           <Checkbox 
             id="terms"
             checked={acceptTerms}
             onCheckedChange={(checked) => setAcceptTerms(checked === true)}
             disabled={isLoading}
             className="mt-1"
           />
           <label 
             htmlFor="terms" 
             className="flex flex-wrap items-center gap-1 text-xs leading-4 select-none font-normal text-black"
           >
             By signing up, I have read and I understand and agree to the PillFlow&nbsp;
             <a href="#" className="underline hover:no-underline break-words" onClick={(e) => e.preventDefault()}>Terms of Use</a>
             &nbsp;and&nbsp;
             <a href="#" className="underline hover:no-underline break-words" onClick={(e) => e.preventDefault()}>Data Privacy Notice</a>.
           </label>
         </div>
        
        {error && (
          <div className="text-sm bg-red-50 p-3 rounded-md border border-red-200">
            <p className="font-medium" style={{ color: '#000000' }}>Error:</p>
            <p style={{ color: '#000000' }}>{error}</p>
          </div>
        )}
        
                 {/* Sign up button */}
         <Button 
           type="submit" 
           className="w-full text-white font-bold"
           style={{ 
             backgroundColor: '#000000',
             fontSize: '16px',
             lineHeight: '24px',
             height: '48px'
           }}
           disabled={isLoading}
         >
           {isLoading ? "Loading..." : "Sign up"}
         </Button>
             </form>

      {/* Already have account link */}
      <div className="text-center">
        <p style={{ color: '#000000', fontSize: '16px', lineHeight: '24px' }}>
          Already have an account?{" "}
          <a 
            href="/signin"
            className="underline hover:no-underline"
            style={{ color: '#000000' }}
          >
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
} 