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

interface SignInFormProps {
  className?: string;
}

export function SignInForm({ className }: SignInFormProps) {
  const { signIn } = useAuthActions();
  const acceptInvitation = useMutation(api.users.acceptInvitation);
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const token = searchParams.get('invite');
    if (token) {
      setInviteToken(token);
    }
  }, [searchParams]);

  const getErrorMessage = (error: unknown): string => {
    if (typeof error === 'string') {
      return error;
    }
    
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      const message = error.message.toLowerCase();
      
      if (message.includes('invalid credentials') || message.includes('invalid email or password')) {
        return "Invalid email or password. Please check your credentials and try again.";
      }
      
      if (message.includes('invalid format') || message.includes('invalid email')) {
        return "Please enter a valid email address.";
      }
      
      return error.message as string;
    }
    
    return "Failed to sign in. Please check your credentials and try again.";
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    if (!acceptTerms) {
      setError("You must accept the terms and conditions to sign in.");
      setIsLoading(false);
      return;
    }
    
    const formData = new FormData(e.target as HTMLFormElement);
    formData.set("flow", "signIn");
    
    try {
      await signIn("password", formData);
      
      if (inviteToken) {
        try {
          await acceptInvitation({ inviteToken });
          router.push("/");
          return;
        } catch (inviteError) {
          console.error("Failed to accept invitation:", inviteError);
        }
      }
      
      router.push("/");
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
          Sign in
        </h1>
      </div>

      {inviteToken && (
        <div className="mb-4 p-3 bg-blue-50 rounded-md border border-blue-200">
          <p className="text-sm" style={{ color: '#000000' }}>
                      <strong>✉️ Organisation Invitation Active</strong><br />
          You&apos;ll automatically join the organisation after signing in.
          </p>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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
              placeholder="Enter your password"
              required
              disabled={isLoading}
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
             By signing in, I have read and I understand and agree to the PillFlow&nbsp;
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
        
                 {/* Sign in button */}
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
           {isLoading ? "Loading..." : "Sign in"}
         </Button>
             </form>

      {/* Don't have account link */}
      <div className="text-center">
        <p style={{ color: '#000000', fontSize: '16px', lineHeight: '24px' }}>
          Don&apos;t have an account?{" "}
          <a 
            href="/signup"
            className="underline hover:no-underline"
            style={{ color: '#000000' }}
          >
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
} 