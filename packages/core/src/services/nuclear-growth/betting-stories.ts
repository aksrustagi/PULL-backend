/**
 * NUCLEAR GROWTH FEATURE #1: Betting Stories
 *
 * Ephemeral, shareable betting content like Instagram Stories.
 * Creates FOMO, social proof, and viral sharing loops.
 *
 * WHY IT'S NUCLEAR:
 * - Stories are the most engaged content format
 * - Creates urgency (24-hour expiry)
 * - Easy to share outside platform
 * - Showcases wins without bragging
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const StoryTypeSchema = z.enum([
  "bet_placed",      // Just placed a bet
  "bet_won",         // Bet won - celebration
  "bet_lost",        // Bet lost - support needed
  "parlay_building", // Building a parlay live
  "live_sweat",      // Sweating a live bet
  "cash_out",        // Cashed out - drama
  "streak_update",   // Streak milestone
  "bracket_pick",    // Bracket selection
  "hot_take",        // Opinion/prediction
  "poll",            // Ask followers
  "challenge",       // Challenge followers
]);

export type StoryType = z.infer<typeof StoryTypeSchema>;

export interface BettingStory {
  id: string;
  userId: string;
  username: string;
  avatarUrl?: string;
  type: StoryType;

  // Content
  content: StoryContent;
  caption?: string;
  hashtags: string[];

  // Engagement
  views: number;
  reactions: StoryReaction[];
  replies: StoryReply[];
  shares: number;

  // Betting context
  betId?: string;
  odds?: number;
  amount?: number;
  potentialWin?: number;
  result?: "pending" | "won" | "lost" | "pushed";

  // Interactive elements
  poll?: StoryPoll;
  challenge?: StoryChallenge;
  countdown?: number; // Timestamp for game start

  // Settings
  allowReactions: boolean;
  allowReplies: boolean;
  isPublic: boolean;

  // Timing
  createdAt: number;
  expiresAt: number; // 24 hours by default
}

export interface StoryContent {
  template: StoryTemplate;
  backgroundColor?: string;
  backgroundGradient?: string[];
  backgroundImage?: string;
  textColor?: string;
  accentColor?: string;

  // Dynamic data
  team1?: TeamDisplay;
  team2?: TeamDisplay;
  odds?: string;
  amount?: string;
  potential?: string;
  sport?: string;
  league?: string;

  // Animation
  animation?: "confetti" | "fire" | "money" | "crying" | "sweat" | "none";
  soundEffect?: string;
}

export interface TeamDisplay {
  name: string;
  abbreviation: string;
  logo?: string;
  color?: string;
  score?: number;
}

export type StoryTemplate =
  | "bet_slip"
  | "win_celebration"
  | "loss_commiseration"
  | "parlay_card"
  | "live_tracker"
  | "streak_badge"
  | "bracket_pick"
  | "hot_take"
  | "poll"
  | "challenge"
  | "countdown"
  | "custom";

export interface StoryReaction {
  userId: string;
  emoji: string;
  createdAt: number;
}

export interface StoryReply {
  id: string;
  userId: string;
  username: string;
  message: string;
  createdAt: number;
}

export interface StoryPoll {
  question: string;
  options: PollOption[];
  endsAt: number;
  totalVotes: number;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
  percentage: number;
}

export interface StoryChallenge {
  type: "tail_bet" | "fade_bet" | "beat_odds" | "parlay_challenge";
  description: string;
  reward?: string;
  participants: string[];
  deadline: number;
}

export interface StoryHighlight {
  id: string;
  userId: string;
  name: string;
  coverImage?: string;
  stories: string[]; // Story IDs
  createdAt: number;
}

export interface StoryFeed {
  following: BettingStory[];
  trending: BettingStory[];
  forYou: BettingStory[];
  nearby?: BettingStory[];
}

// ============================================================================
// STORY TEMPLATES
// ============================================================================

export const STORY_TEMPLATES: Record<StoryTemplate, {
  name: string;
  description: string;
  requiredFields: string[];
  defaultAnimation?: string;
}> = {
  bet_slip: {
    name: "Bet Slip",
    description: "Share your bet with odds and potential win",
    requiredFields: ["team1", "team2", "odds", "amount"],
    defaultAnimation: "none",
  },
  win_celebration: {
    name: "Winner!",
    description: "Celebrate your winning bet",
    requiredFields: ["amount", "potential"],
    defaultAnimation: "confetti",
  },
  loss_commiseration: {
    name: "Tough Loss",
    description: "Share the pain of a close loss",
    requiredFields: ["team1", "team2"],
    defaultAnimation: "crying",
  },
  parlay_card: {
    name: "Parlay Card",
    description: "Show off your multi-leg parlay",
    requiredFields: ["odds"],
    defaultAnimation: "money",
  },
  live_tracker: {
    name: "Live Sweat",
    description: "Real-time updates on your live bet",
    requiredFields: ["team1", "team2"],
    defaultAnimation: "sweat",
  },
  streak_badge: {
    name: "Streak Badge",
    description: "Show off your winning streak",
    requiredFields: [],
    defaultAnimation: "fire",
  },
  bracket_pick: {
    name: "Bracket Pick",
    description: "Share your bracket selection",
    requiredFields: ["team1", "team2"],
    defaultAnimation: "none",
  },
  hot_take: {
    name: "Hot Take",
    description: "Share your prediction or opinion",
    requiredFields: [],
    defaultAnimation: "fire",
  },
  poll: {
    name: "Poll",
    description: "Ask your followers for their opinion",
    requiredFields: [],
    defaultAnimation: "none",
  },
  challenge: {
    name: "Challenge",
    description: "Challenge followers to tail or fade",
    requiredFields: [],
    defaultAnimation: "none",
  },
  countdown: {
    name: "Countdown",
    description: "Countdown to game time",
    requiredFields: ["countdown"],
    defaultAnimation: "none",
  },
  custom: {
    name: "Custom",
    description: "Create your own story",
    requiredFields: [],
    defaultAnimation: "none",
  },
};

// ============================================================================
// BETTING STORIES SERVICE
// ============================================================================

export class BettingStoriesService {
  /**
   * Create a new story
   */
  createStory(
    userId: string,
    username: string,
    type: StoryType,
    content: StoryContent,
    options: {
      caption?: string;
      hashtags?: string[];
      betId?: string;
      odds?: number;
      amount?: number;
      potentialWin?: number;
      poll?: Omit<StoryPoll, "totalVotes">;
      challenge?: StoryChallenge;
      countdown?: number;
      isPublic?: boolean;
      expiryHours?: number;
    } = {}
  ): BettingStory {
    const now = Date.now();
    const expiryHours = options.expiryHours ?? 24;

    return {
      id: `story_${now}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      username,
      type,
      content,
      caption: options.caption,
      hashtags: options.hashtags ?? [],
      views: 0,
      reactions: [],
      replies: [],
      shares: 0,
      betId: options.betId,
      odds: options.odds,
      amount: options.amount,
      potentialWin: options.potentialWin,
      result: options.betId ? "pending" : undefined,
      poll: options.poll ? { ...options.poll, totalVotes: 0 } : undefined,
      challenge: options.challenge,
      countdown: options.countdown,
      allowReactions: true,
      allowReplies: true,
      isPublic: options.isPublic ?? true,
      createdAt: now,
      expiresAt: now + (expiryHours * 60 * 60 * 1000),
    };
  }

  /**
   * Create story from bet
   */
  createBetStory(
    userId: string,
    username: string,
    bet: {
      id: string;
      team1: TeamDisplay;
      team2: TeamDisplay;
      odds: number;
      amount: number;
      potentialWin: number;
      sport: string;
      league: string;
      isParlay?: boolean;
      legs?: number;
    }
  ): BettingStory {
    const template: StoryTemplate = bet.isParlay ? "parlay_card" : "bet_slip";

    const content: StoryContent = {
      template,
      backgroundColor: "#1a1a2e",
      backgroundGradient: ["#1a1a2e", "#16213e"],
      textColor: "#ffffff",
      accentColor: "#00ff88",
      team1: bet.team1,
      team2: bet.team2,
      odds: this.formatOdds(bet.odds),
      amount: `$${bet.amount.toFixed(2)}`,
      potential: `$${bet.potentialWin.toFixed(2)}`,
      sport: bet.sport,
      league: bet.league,
      animation: "none",
    };

    const hashtags = [
      bet.sport.toLowerCase(),
      bet.league.toLowerCase().replace(/\s/g, ""),
      bet.team1.abbreviation.toLowerCase(),
    ];

    if (bet.isParlay) {
      hashtags.push("parlay", `${bet.legs}legparlay`);
    }

    return this.createStory(userId, username, "bet_placed", content, {
      betId: bet.id,
      odds: bet.odds,
      amount: bet.amount,
      potentialWin: bet.potentialWin,
      hashtags,
      caption: bet.isParlay
        ? `${bet.legs}-leg parlay locked in! 🔒`
        : `Locked in on ${bet.team1.name} 🎯`,
    });
  }

  /**
   * Create win celebration story
   */
  createWinStory(
    userId: string,
    username: string,
    bet: {
      id: string;
      team1: TeamDisplay;
      team2: TeamDisplay;
      odds: number;
      amount: number;
      winnings: number;
      isParlay?: boolean;
      isUpset?: boolean;
    }
  ): BettingStory {
    const content: StoryContent = {
      template: "win_celebration",
      backgroundColor: "#0f4c3a",
      backgroundGradient: ["#0f4c3a", "#1a6b4f", "#00ff88"],
      textColor: "#ffffff",
      accentColor: "#ffd700",
      team1: bet.team1,
      team2: bet.team2,
      odds: this.formatOdds(bet.odds),
      amount: `$${bet.amount.toFixed(2)}`,
      potential: `$${bet.winnings.toFixed(2)}`,
      animation: bet.isUpset ? "money" : "confetti",
      soundEffect: "cha-ching",
    };

    const hashtags = ["winner", "cashedout"];
    if (bet.isUpset) hashtags.push("upset", "underdog");
    if (bet.isParlay) hashtags.push("parlaywin");
    if (bet.winnings >= 1000) hashtags.push("bigwin");

    let caption = `💰 WINNER! +$${bet.winnings.toFixed(2)}`;
    if (bet.isUpset) caption = `🔥 UPSET SPECIAL! +$${bet.winnings.toFixed(2)}`;
    if (bet.winnings >= 1000) caption = `🚀 MASSIVE WIN! +$${bet.winnings.toFixed(2)}`;

    return this.createStory(userId, username, "bet_won", content, {
      betId: bet.id,
      odds: bet.odds,
      amount: bet.amount,
      potentialWin: bet.winnings,
      hashtags,
      caption,
    });
  }

  /**
   * Create poll story
   */
  createPollStory(
    userId: string,
    username: string,
    question: string,
    options: string[],
    durationHours: number = 12
  ): BettingStory {
    const content: StoryContent = {
      template: "poll",
      backgroundColor: "#2d1b4e",
      backgroundGradient: ["#2d1b4e", "#1a1a2e"],
      textColor: "#ffffff",
      accentColor: "#9b59b6",
      animation: "none",
    };

    const poll: StoryPoll = {
      question,
      options: options.map((text, idx) => ({
        id: `opt_${idx}`,
        text,
        votes: 0,
        percentage: 0,
      })),
      endsAt: Date.now() + (durationHours * 60 * 60 * 1000),
      totalVotes: 0,
    };

    return this.createStory(userId, username, "poll", content, {
      poll,
      caption: question,
      hashtags: ["poll", "whoyougot"],
    });
  }

  /**
   * Add reaction to story
   */
  addReaction(story: BettingStory, userId: string, emoji: string): BettingStory {
    // Remove existing reaction from user
    const reactions = story.reactions.filter(r => r.userId !== userId);

    return {
      ...story,
      reactions: [...reactions, { userId, emoji, createdAt: Date.now() }],
    };
  }

  /**
   * Vote on poll
   */
  votePoll(story: BettingStory, userId: string, optionId: string): BettingStory {
    if (!story.poll) return story;

    const poll = { ...story.poll };
    const option = poll.options.find(o => o.id === optionId);
    if (!option) return story;

    option.votes++;
    poll.totalVotes++;

    // Recalculate percentages
    poll.options = poll.options.map(o => ({
      ...o,
      percentage: poll.totalVotes > 0 ? (o.votes / poll.totalVotes) * 100 : 0,
    }));

    return { ...story, poll };
  }

  /**
   * Get story feed for user
   */
  generateFeed(
    stories: BettingStory[],
    userId: string,
    following: string[]
  ): StoryFeed {
    const now = Date.now();
    const activeStories = stories.filter(s => s.expiresAt > now);

    // Following feed - stories from people user follows
    const followingStories = activeStories
      .filter(s => following.includes(s.userId))
      .sort((a, b) => b.createdAt - a.createdAt);

    // Trending - most engaged stories
    const trendingStories = activeStories
      .filter(s => s.isPublic)
      .sort((a, b) => {
        const scoreA = a.views + (a.reactions.length * 5) + (a.shares * 10);
        const scoreB = b.views + (b.reactions.length * 5) + (b.shares * 10);
        return scoreB - scoreA;
      })
      .slice(0, 50);

    // For You - personalized based on interests
    const forYouStories = activeStories
      .filter(s => s.isPublic && s.userId !== userId)
      .sort((a, b) => {
        // Boost stories with wins, high odds, parlays
        let scoreA = 0;
        let scoreB = 0;

        if (a.result === "won") scoreA += 100;
        if (b.result === "won") scoreB += 100;
        if (a.odds && a.odds > 300) scoreA += 50;
        if (b.odds && b.odds > 300) scoreB += 50;
        if (a.type === "parlay_building") scoreA += 30;
        if (b.type === "parlay_building") scoreB += 30;

        scoreA += a.reactions.length * 2;
        scoreB += b.reactions.length * 2;

        return scoreB - scoreA;
      })
      .slice(0, 100);

    return {
      following: followingStories,
      trending: trendingStories,
      forYou: forYouStories,
    };
  }

  /**
   * Generate shareable story link
   */
  generateShareLink(story: BettingStory, platform: "twitter" | "instagram" | "tiktok" | "copy"): string {
    const baseUrl = "https://app.pull.bet/story";
    const storyUrl = `${baseUrl}/${story.id}`;

    const text = this.generateShareText(story);

    switch (platform) {
      case "twitter":
        return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(storyUrl)}`;
      case "instagram":
      case "tiktok":
      case "copy":
      default:
        return storyUrl;
    }
  }

  /**
   * Get trending hashtags
   */
  getTrendingHashtags(stories: BettingStory[], limit: number = 10): Array<{
    hashtag: string;
    count: number;
    trending: boolean;
  }> {
    const hashtagCounts: Record<string, number> = {};

    for (const story of stories) {
      for (const tag of story.hashtags) {
        hashtagCounts[tag] = (hashtagCounts[tag] ?? 0) + 1;
      }
    }

    return Object.entries(hashtagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([hashtag, count], idx) => ({
        hashtag,
        count,
        trending: idx < 3,
      }));
  }

  private formatOdds(odds: number): string {
    if (odds >= 0) return `+${odds}`;
    return odds.toString();
  }

  private generateShareText(story: BettingStory): string {
    switch (story.type) {
      case "bet_won":
        return `Just hit on @PullBet! 💰 ${story.caption ?? "Winner!"}`;
      case "bet_placed":
        return `Locked in on @PullBet 🔒 ${story.caption ?? "Let's ride!"}`;
      case "streak_update":
        return `${story.caption ?? "On a heater"} 🔥 @PullBet`;
      case "poll":
        return `${story.poll?.question ?? "What do you think?"} Vote on @PullBet`;
      default:
        return `Check out my story on @PullBet! ${story.caption ?? ""}`;
    }
  }
}

// ============================================================================
// SUGGESTED REACTIONS
// ============================================================================

export const STORY_REACTIONS = [
  "🔥", // Fire - hot take/bet
  "💰", // Money - nice win
  "🎯", // Target - good pick
  "😤", // Tough - bad beat
  "🤑", // Rich - big win
  "👀", // Eyes - interesting
  "🙏", // Pray - sweating
  "💀", // Dead - RIP
  "🐐", // GOAT - legendary
  "🚀", // Rocket - to the moon
];

// ============================================================================
// FACTORY
// ============================================================================

export function createBettingStoriesService(): BettingStoriesService {
  return new BettingStoriesService();
}
