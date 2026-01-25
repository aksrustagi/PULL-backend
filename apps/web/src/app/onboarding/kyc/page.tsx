"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@pull/ui";
import { Input } from "@pull/ui";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pull/ui";

// KYC steps
const steps = [
  { id: "basic", name: "Basic Info", description: "Name and contact details" },
  { id: "identity", name: "Identity", description: "Government ID verification" },
  { id: "selfie", name: "Selfie", description: "Photo verification" },
  { id: "agreements", name: "Agreements", description: "Terms and disclosures" },
];

export default function KYCPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    ssn: "",
    agreements: {
      terms: false,
      privacy: false,
      trading: false,
    },
  });

  const handleNext = async () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Submit KYC
      setIsLoading(true);
      try {
        // TODO: Submit to API
        await new Promise((resolve) => setTimeout(resolve, 2000));
        toast.success("Verification submitted!");
        router.push("/onboarding/funding");
      } catch (error) {
        toast.error("Verification failed. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const renderStepContent = () => {
    switch (steps[currentStep].id) {
      case "basic":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">First Name</label>
                <Input
                  placeholder="John"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Last Name</label>
                <Input
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData({ ...formData, lastName: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Date of Birth</label>
              <Input
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) =>
                  setFormData({ ...formData, dateOfBirth: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Street Address</label>
              <Input
                placeholder="123 Main St"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">City</label>
                <Input
                  placeholder="New York"
                  value={formData.city}
                  onChange={(e) =>
                    setFormData({ ...formData, city: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">State</label>
                <Input
                  placeholder="NY"
                  maxLength={2}
                  value={formData.state}
                  onChange={(e) =>
                    setFormData({ ...formData, state: e.target.value.toUpperCase() })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">ZIP Code</label>
                <Input
                  placeholder="10001"
                  value={formData.zipCode}
                  onChange={(e) =>
                    setFormData({ ...formData, zipCode: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Social Security Number
              </label>
              <Input
                type="password"
                placeholder="XXX-XX-XXXX"
                value={formData.ssn}
                onChange={(e) =>
                  setFormData({ ...formData, ssn: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Required for regulatory compliance. Your SSN is encrypted and secure.
              </p>
            </div>
          </div>
        );

      case "identity":
        return (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <svg
                  className="h-8 w-8 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium mb-2">
                Scan Your Government ID
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                We accept driver's license, state ID, or passport
              </p>

              {/* Persona embed placeholder */}
              <div className="border-2 border-dashed rounded-lg p-8 bg-muted/50">
                <p className="text-muted-foreground">
                  Persona verification widget will load here
                </p>
                <Button variant="outline" className="mt-4">
                  Start ID Verification
                </Button>
              </div>
            </div>
          </div>
        );

      case "selfie":
        return (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <svg
                  className="h-8 w-8 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium mb-2">Take a Selfie</h3>
              <p className="text-sm text-muted-foreground mb-6">
                We'll match your selfie with your ID photo
              </p>

              {/* Camera placeholder */}
              <div className="border-2 border-dashed rounded-lg p-8 bg-muted/50 aspect-square max-w-sm mx-auto">
                <p className="text-muted-foreground">Camera view will appear here</p>
                <Button variant="outline" className="mt-4">
                  Open Camera
                </Button>
              </div>
            </div>
          </div>
        );

      case "agreements":
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="flex items-start space-x-3 p-4 rounded-lg border cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={formData.agreements.terms}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      agreements: {
                        ...formData.agreements,
                        terms: e.target.checked,
                      },
                    })
                  }
                />
                <div>
                  <p className="font-medium">Terms of Service</p>
                  <p className="text-sm text-muted-foreground">
                    I have read and agree to the{" "}
                    <Link href="/terms" className="text-primary underline">
                      Terms of Service
                    </Link>
                  </p>
                </div>
              </label>

              <label className="flex items-start space-x-3 p-4 rounded-lg border cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={formData.agreements.privacy}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      agreements: {
                        ...formData.agreements,
                        privacy: e.target.checked,
                      },
                    })
                  }
                />
                <div>
                  <p className="font-medium">Privacy Policy</p>
                  <p className="text-sm text-muted-foreground">
                    I have read and agree to the{" "}
                    <Link href="/privacy" className="text-primary underline">
                      Privacy Policy
                    </Link>
                  </p>
                </div>
              </label>

              <label className="flex items-start space-x-3 p-4 rounded-lg border cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={formData.agreements.trading}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      agreements: {
                        ...formData.agreements,
                        trading: e.target.checked,
                      },
                    })
                  }
                />
                <div>
                  <p className="font-medium">Trading Disclosures</p>
                  <p className="text-sm text-muted-foreground">
                    I understand the risks of trading prediction markets and
                    fractional assets
                  </p>
                </div>
              </label>
            </div>

            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">
                By clicking "Complete Verification", I certify that all
                information provided is accurate and I consent to identity
                verification and background check processes.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (steps[currentStep].id) {
      case "basic":
        return (
          formData.firstName &&
          formData.lastName &&
          formData.dateOfBirth &&
          formData.address &&
          formData.city &&
          formData.state &&
          formData.zipCode &&
          formData.ssn
        );
      case "identity":
        return true; // Would check Persona completion
      case "selfie":
        return true; // Would check selfie completion
      case "agreements":
        return (
          formData.agreements.terms &&
          formData.agreements.privacy &&
          formData.agreements.trading
        );
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-xl">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {steps.map((step, idx) => (
              <div
                key={step.id}
                className="flex items-center"
              >
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    idx < currentStep
                      ? "bg-primary text-primary-foreground"
                      : idx === currentStep
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {idx < currentStep ? (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`h-1 w-16 sm:w-24 mx-2 ${
                      idx < currentStep ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Step {currentStep + 1} of {steps.length}: {steps[currentStep].name}
          </p>
        </div>

        {/* Content */}
        <Card>
          <CardHeader>
            <CardTitle>{steps[currentStep].name}</CardTitle>
            <CardDescription>{steps[currentStep].description}</CardDescription>
          </CardHeader>
          <CardContent>{renderStepContent()}</CardContent>
          <CardFooter className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canProceed() || isLoading}
            >
              {isLoading
                ? "Submitting..."
                : currentStep === steps.length - 1
                ? "Complete Verification"
                : "Continue"}
            </Button>
          </CardFooter>
        </Card>

        {/* Skip link */}
        <p className="text-center text-sm text-muted-foreground mt-4">
          <Link href="/" className="underline">
            Skip for now
          </Link>{" "}
          (limited features)
        </p>
      </div>
    </div>
  );
}
