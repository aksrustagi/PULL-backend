"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pull/ui";
import { Button } from "@pull/ui";
import { Input } from "@pull/ui";
import { Badge } from "@pull/ui";

// Filter options
const gradingCompanies = ["All", "PSA", "BGS", "CGC"];
const priceRanges = [
  { label: "All Prices", min: 0, max: Infinity },
  { label: "Under $100", min: 0, max: 100 },
  { label: "$100 - $500", min: 100, max: 500 },
  { label: "$500 - $1000", min: 500, max: 1000 },
  { label: "$1000+", min: 1000, max: Infinity },
];

// Placeholder listings
const listings = [
  {
    id: "1",
    name: "Charizard Base Set",
    setName: "Base Set",
    year: 1999,
    grade: 9,
    gradingCompany: "PSA",
    certNumber: "12345678",
    imageUrl: "/cards/charizard.png",
    pricePerShare: 250,
    totalShares: 100,
    availableShares: 45,
    totalValue: 25000,
  },
  {
    id: "2",
    name: "Pikachu Illustrator",
    setName: "Promo",
    year: 1998,
    grade: 8.5,
    gradingCompany: "BGS",
    certNumber: "87654321",
    imageUrl: "/cards/pikachu.png",
    pricePerShare: 5000,
    totalShares: 100,
    availableShares: 20,
    totalValue: 500000,
  },
];

export default function CollectiblesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGrading, setSelectedGrading] = useState("All");
  const [selectedPriceRange, setSelectedPriceRange] = useState(priceRanges[0]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeTab, setActiveTab] = useState<"marketplace" | "collection">("marketplace");

  const filteredListings = listings.filter((listing) => {
    const matchesSearch =
      listing.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      listing.setName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGrading =
      selectedGrading === "All" || listing.gradingCompany === selectedGrading;
    const matchesPrice =
      listing.pricePerShare >= selectedPriceRange.min &&
      listing.pricePerShare <= selectedPriceRange.max;
    return matchesSearch && matchesGrading && matchesPrice;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Collectibles</h1>
          <p className="text-muted-foreground">
            Trade fractional shares of graded Pokemon cards
          </p>
        </div>
        <Button>List Your Card</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b">
        <button
          onClick={() => setActiveTab("marketplace")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "marketplace"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Marketplace
        </button>
        <button
          onClick={() => setActiveTab("collection")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "collection"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          My Collection
        </button>
      </div>

      {activeTab === "marketplace" ? (
        <>
          {/* Search and filters */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <Input
                placeholder="Search cards..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {/* Grading filter */}
              <select
                className="px-3 py-2 rounded-md border bg-background text-sm"
                value={selectedGrading}
                onChange={(e) => setSelectedGrading(e.target.value)}
              >
                {gradingCompanies.map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </select>
              {/* Price filter */}
              <select
                className="px-3 py-2 rounded-md border bg-background text-sm"
                value={selectedPriceRange.label}
                onChange={(e) => {
                  const range = priceRanges.find((r) => r.label === e.target.value);
                  if (range) setSelectedPriceRange(range);
                }}
              >
                {priceRanges.map((range) => (
                  <option key={range.label} value={range.label}>
                    {range.label}
                  </option>
                ))}
              </select>
              {/* View toggle */}
              <div className="flex border rounded-md">
                <button
                  className={`px-3 py-2 ${
                    viewMode === "grid" ? "bg-muted" : ""
                  }`}
                  onClick={() => setViewMode("grid")}
                >
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
                      d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                    />
                  </svg>
                </button>
                <button
                  className={`px-3 py-2 ${
                    viewMode === "list" ? "bg-muted" : ""
                  }`}
                  onClick={() => setViewMode("list")}
                >
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
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Featured cards */}
          <Card>
            <CardHeader>
              <CardTitle>Featured Cards</CardTitle>
              <CardDescription>High-value cards with available shares</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={
                  viewMode === "grid"
                    ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                    : "space-y-4"
                }
              >
                {filteredListings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/collectibles/${listing.id}`}
                    className={`block rounded-lg border bg-card hover:bg-muted transition-colors overflow-hidden ${
                      viewMode === "list" ? "flex items-center" : ""
                    }`}
                  >
                    {/* Card image placeholder */}
                    <div
                      className={`bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center ${
                        viewMode === "grid" ? "aspect-[3/4]" : "w-24 h-32 flex-shrink-0"
                      }`}
                    >
                      <span className="text-4xl">🃏</span>
                    </div>

                    <div className={`p-4 ${viewMode === "list" ? "flex-1" : ""}`}>
                      <div className="flex items-start justify-between mb-2">
                        <Badge
                          variant="outline"
                          className={
                            listing.gradingCompany === "PSA"
                              ? "border-red-500 text-red-500"
                              : listing.gradingCompany === "BGS"
                              ? "border-blue-500 text-blue-500"
                              : "border-green-500 text-green-500"
                          }
                        >
                          {listing.gradingCompany} {listing.grade}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          #{listing.certNumber}
                        </span>
                      </div>

                      <h3 className="font-medium mb-1">{listing.name}</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {listing.setName} ({listing.year})
                      </p>

                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-lg font-bold">
                            ${listing.pricePerShare.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">per share</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {listing.availableShares}/{listing.totalShares}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            shares left
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {filteredListings.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No cards found matching your criteria</p>
                  <Button
                    variant="link"
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedGrading("All");
                      setSelectedPriceRange(priceRanges[0]);
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <p className="mb-4">You don't own any collectible shares yet</p>
              <Button onClick={() => setActiveTab("marketplace")}>
                Browse Marketplace
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
