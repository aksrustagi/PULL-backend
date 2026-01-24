"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pull/ui";
import { Button } from "@pull/ui";
import { Input } from "@pull/ui";
import { Badge } from "@pull/ui";

// Mock agent data
const agentData = {
  id: "agt_123",
  displayName: "John Smith",
  email: "john.smith@example-realty.com",
  brokerage: {
    name: "Example Realty",
    logoUrl: null,
  },
  status: "active",
  referralCode: "AGT-FL-ABC123",
  referralUrl: "https://pull.app/r/AGT-FL-ABC123",
  stats: {
    totalReferrals: 45,
    activeReferrals: 28,
    pendingReferrals: 8,
    totalEarnings: 2450.0,
    pendingEarnings: 320.0,
    predictionAccuracy: 72.5,
    marketsParticipated: 23,
    pointsBalance: 12500,
  },
  recentReferrals: [
    { id: "ref_1", name: "Sarah Johnson", status: "active_trader", signedUpAt: "2025-01-10", earnings: 125.0 },
    { id: "ref_2", name: "Mike Williams", status: "verified", signedUpAt: "2025-01-08", earnings: 45.0 },
    { id: "ref_3", name: "Emily Brown", status: "signed_up", signedUpAt: "2025-01-05", earnings: 0 },
  ],
  topPredictions: [
    { ticker: "RE-MIA-MEDIAN-Q2", title: "Miami median price > $600K", position: "yes", entryPrice: 0.55, currentPrice: 0.65, pnl: 18.2 },
    { ticker: "RE-RATE-30Y-6PCT", title: "Mortgage rates < 6%", position: "no", entryPrice: 0.62, currentPrice: 0.58, pnl: 6.4 },
  ],
  leads: [
    { userId: "usr_1", name: "Alex Chen", tier: "hot", score: 85, interest: "Miami, luxury homes", lastActive: "2h ago" },
    { userId: "usr_2", name: "Jessica Lee", tier: "warm", score: 68, interest: "Austin, first-time buyer", lastActive: "1d ago" },
    { userId: "usr_3", name: "David Park", tier: "warm", score: 62, interest: "Phoenix, investment", lastActive: "3d ago" },
  ],
};

export default function AgentPortalPage() {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [showInviteForm, setShowInviteForm] = useState(false);

  const copyReferralLink = () => {
    navigator.clipboard.writeText(agentData.referralUrl);
    // TODO: Show toast notification
  };

  const handleInvite = () => {
    // TODO: Submit invite
    setShowInviteForm(false);
    setInviteEmail("");
    setInviteFirstName("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Agent Portal</h1>
          <p className="text-muted-foreground">
            Manage your referrals, track leads, and view market insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{agentData.brokerage.name}</Badge>
          <Badge variant="default" className="bg-green-600">
            {agentData.status.toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Referrals</p>
                <p className="text-3xl font-bold">{agentData.stats.totalReferrals}</p>
                <p className="text-xs text-muted-foreground">
                  {agentData.stats.activeReferrals} active
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Earnings</p>
                <p className="text-3xl font-bold">${agentData.stats.totalEarnings.toLocaleString()}</p>
                <p className="text-xs text-green-500">
                  +${agentData.stats.pendingEarnings} pending
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Prediction Accuracy</p>
                <p className="text-3xl font-bold">{agentData.stats.predictionAccuracy}%</p>
                <p className="text-xs text-muted-foreground">
                  {agentData.stats.marketsParticipated} markets
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Points Balance</p>
                <p className="text-3xl font-bold">{agentData.stats.pointsBalance.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  <Link href="/rewards" className="text-primary hover:underline">
                    Redeem rewards
                  </Link>
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                <svg className="h-6 w-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Referral Link & Invite */}
      <Card>
        <CardHeader>
          <CardTitle>Invite Clients</CardTitle>
          <CardDescription>
            Share your referral link or send personalized invites
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <Input value={agentData.referralUrl} readOnly className="bg-muted" />
            </div>
            <Button onClick={copyReferralLink}>
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy Link
            </Button>
            <Button variant="outline" onClick={() => setShowInviteForm(!showInviteForm)}>
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Send Invite
            </Button>
          </div>

          {showInviteForm && (
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-muted-foreground">First Name</label>
                  <Input
                    placeholder="Client's first name"
                    value={inviteFirstName}
                    onChange={(e) => setInviteFirstName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Email</label>
                  <Input
                    type="email"
                    placeholder="client@email.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowInviteForm(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleInvite}>
                  Send Invitation
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Your referral code: <span className="font-mono font-medium">{agentData.referralCode}</span>
          </p>
        </CardContent>
      </Card>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Referrals */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Referrals</CardTitle>
              <CardDescription>Your latest client referrals</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/agent/referrals">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {agentData.recentReferrals.map((referral) => (
                <div
                  key={referral.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center font-medium">
                      {referral.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{referral.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Signed up {new Date(referral.signedUpAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant={
                        referral.status === "active_trader"
                          ? "default"
                          : referral.status === "verified"
                          ? "secondary"
                          : "outline"
                      }
                      className="text-xs"
                    >
                      {referral.status.replace("_", " ")}
                    </Badge>
                    {referral.earnings > 0 && (
                      <p className="text-xs text-green-500 mt-1">
                        +${referral.earnings.toFixed(0)} earned
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Hot Leads */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top Leads</CardTitle>
              <CardDescription>Based on trading behavior</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/agent/leads">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {agentData.leads.map((lead) => (
                <div
                  key={lead.userId}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center font-medium ${
                        lead.tier === "hot"
                          ? "bg-red-500/10 text-red-500"
                          : lead.tier === "warm"
                          ? "bg-orange-500/10 text-orange-500"
                          : "bg-blue-500/10 text-blue-500"
                      }`}
                    >
                      {lead.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{lead.name}</p>
                      <p className="text-xs text-muted-foreground">{lead.interest}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant={lead.tier === "hot" ? "destructive" : "secondary"}
                      className="text-xs capitalize"
                    >
                      {lead.tier} • {lead.score}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">{lead.lastActive}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Your Predictions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Your Predictions</CardTitle>
            <CardDescription>Track your market positions</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/real-estate">Explore Markets</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 font-medium text-muted-foreground">Market</th>
                  <th className="pb-3 font-medium text-muted-foreground text-center">Position</th>
                  <th className="pb-3 font-medium text-muted-foreground text-right">Entry</th>
                  <th className="pb-3 font-medium text-muted-foreground text-right">Current</th>
                  <th className="pb-3 font-medium text-muted-foreground text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {agentData.topPredictions.map((pred) => (
                  <tr key={pred.ticker} className="border-b last:border-0">
                    <td className="py-4">
                      <Link href={`/real-estate/${pred.ticker}`} className="hover:underline">
                        <p className="font-medium text-sm">{pred.title}</p>
                        <p className="text-xs text-muted-foreground">{pred.ticker}</p>
                      </Link>
                    </td>
                    <td className="py-4 text-center">
                      <Badge variant={pred.position === "yes" ? "default" : "secondary"}>
                        {pred.position.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-4 text-right">
                      {(pred.entryPrice * 100).toFixed(0)}¢
                    </td>
                    <td className="py-4 text-right">
                      {(pred.currentPrice * 100).toFixed(0)}¢
                    </td>
                    <td
                      className={`py-4 text-right font-medium ${
                        pred.pnl >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {pred.pnl >= 0 ? "+" : ""}
                      {pred.pnl.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Market Insights CTA */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold mb-1">Share Market Insights with Clients</h3>
              <p className="text-sm text-muted-foreground">
                Generate shareable insights based on your prediction track record
              </p>
            </div>
            <Button>
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Generate Insight Report
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
