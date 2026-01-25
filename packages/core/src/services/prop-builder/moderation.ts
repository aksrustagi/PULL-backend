/**
 * Prop Builder Moderation
 * Review and moderate user-created props
 */

import {
  UserProp,
  PropStatus,
  ModerationStatus,
  ModerationQueue,
  ModerationItem,
  ModerationAction,
  PropFlag,
  FlagReason,
  CommunityVote,
  PROP_DEFAULTS,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface ModerationConfig {
  autoApprovalEnabled: boolean;
  minVotesForAutoApproval: number;
  autoApprovalThreshold: number;
  maxFlagsBeforeReview: number;
  flagCooldownHours: number;
  escalationThreshold: number;
}

const DEFAULT_CONFIG: ModerationConfig = {
  autoApprovalEnabled: true,
  minVotesForAutoApproval: 10,
  autoApprovalThreshold: 0.8,
  maxFlagsBeforeReview: 3,
  flagCooldownHours: 24,
  escalationThreshold: 5,
};

// ============================================================================
// Content Filter
// ============================================================================

export class ContentFilter {
  private bannedWords: Set<string>;
  private restrictedTopics: Set<string>;

  constructor() {
    this.bannedWords = new Set([
      // Add banned words
    ]);
    this.restrictedTopics = new Set([
      "death",
      "violence",
      "illegal_activity",
      "self_harm",
    ]);
  }

  /**
   * Check content for violations
   */
  checkContent(text: string): {
    passed: boolean;
    violations: string[];
  } {
    const violations: string[] = [];
    const lowerText = text.toLowerCase();

    // Check for banned words
    for (const word of this.bannedWords) {
      if (lowerText.includes(word)) {
        violations.push(`Contains banned word: ${word}`);
      }
    }

    // Check for restricted topics
    for (const topic of this.restrictedTopics) {
      if (lowerText.includes(topic)) {
        violations.push(`References restricted topic: ${topic}`);
      }
    }

    // Check for personal information patterns
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/;
    const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/;

    if (emailPattern.test(text)) {
      violations.push("Contains email address");
    }
    if (phonePattern.test(text)) {
      violations.push("Contains phone number");
    }
    if (ssnPattern.test(text)) {
      violations.push("Contains SSN pattern");
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  /**
   * Check if prop is valid for betting
   */
  validateProp(prop: Partial<UserProp>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Title validation
    if (!prop.title || prop.title.length < 10) {
      errors.push("Title must be at least 10 characters");
    }
    if (prop.title && prop.title.length > 200) {
      errors.push("Title must be less than 200 characters");
    }

    // Description validation
    if (!prop.description || prop.description.length < 50) {
      errors.push("Description must be at least 50 characters");
    }

    // Outcomes validation
    if (!prop.outcomes || prop.outcomes.length < 2) {
      errors.push("Must have at least 2 outcomes");
    }
    if (prop.outcomes && prop.outcomes.length > 10) {
      errors.push("Cannot have more than 10 outcomes");
    }

    // Resolution criteria
    if (!prop.resolutionCriteria || prop.resolutionCriteria.length < 20) {
      errors.push("Resolution criteria must be clearly defined (min 20 chars)");
    }

    // Timing validation
    const now = new Date();
    if (prop.bettingCloses && prop.bettingCloses <= now) {
      errors.push("Betting close time must be in the future");
    }
    if (prop.resolutionDeadline && prop.bettingCloses &&
        prop.resolutionDeadline <= prop.bettingCloses) {
      errors.push("Resolution deadline must be after betting closes");
    }

    // Content filter
    const titleCheck = this.checkContent(prop.title || "");
    const descCheck = this.checkContent(prop.description || "");
    const criteriaCheck = this.checkContent(prop.resolutionCriteria || "");

    errors.push(...titleCheck.violations);
    errors.push(...descCheck.violations);
    errors.push(...criteriaCheck.violations);

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// ============================================================================
// Moderation Service
// ============================================================================

export class PropModerationService {
  private readonly config: ModerationConfig;
  private readonly contentFilter: ContentFilter;

  constructor(config?: Partial<ModerationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.contentFilter = new ContentFilter();
  }

  // ==========================================================================
  // Auto-Moderation
  // ==========================================================================

  /**
   * Run auto-moderation on a prop
   */
  autoModerate(prop: UserProp): {
    action: "approve" | "reject" | "manual_review";
    reason: string;
    issues: string[];
  } {
    const issues: string[] = [];

    // Content validation
    const validation = this.contentFilter.validateProp(prop);
    if (!validation.valid) {
      return {
        action: "reject",
        reason: "Content validation failed",
        issues: validation.errors,
      };
    }

    // Check creator reputation
    // This would typically check the database
    // Simplified for demo

    // Check for duplicate props
    // This would check existing props

    // Check community votes
    if (prop.totalVotes >= this.config.minVotesForAutoApproval) {
      if (prop.approvalPercent >= this.config.autoApprovalThreshold) {
        return {
          action: "approve",
          reason: "Community approved",
          issues: [],
        };
      } else if (prop.approvalPercent < 0.3) {
        return {
          action: "reject",
          reason: "Community rejected",
          issues: ["Low community approval rate"],
        };
      }
    }

    // Check flags
    if (prop.flagCount >= this.config.maxFlagsBeforeReview) {
      return {
        action: "manual_review",
        reason: "Flagged for review",
        issues: prop.flagReasons,
      };
    }

    // Default to manual review for new props
    return {
      action: "manual_review",
      reason: "Awaiting community votes or moderator review",
      issues: [],
    };
  }

  // ==========================================================================
  // Community Voting
  // ==========================================================================

  /**
   * Process community vote on prop
   */
  processVote(
    prop: UserProp,
    vote: CommunityVote
  ): {
    newApprovalPercent: number;
    totalVotes: number;
    recommendedAction?: "approve" | "reject";
  } {
    // Add vote to existing votes
    const updatedVotes = [...prop.communityVotes, vote];

    // Calculate new stats
    const approveVotes = updatedVotes.filter(v => v.vote === "approve").length;
    const rejectVotes = updatedVotes.filter(v => v.vote === "reject").length;
    const totalVotes = approveVotes + rejectVotes; // Flags don't count toward approval

    const newApprovalPercent = totalVotes > 0
      ? approveVotes / totalVotes
      : 0;

    // Determine recommended action
    let recommendedAction: "approve" | "reject" | undefined;

    if (totalVotes >= this.config.minVotesForAutoApproval) {
      if (newApprovalPercent >= this.config.autoApprovalThreshold) {
        recommendedAction = "approve";
      } else if (newApprovalPercent < 0.3) {
        recommendedAction = "reject";
      }
    }

    return {
      newApprovalPercent,
      totalVotes,
      recommendedAction,
    };
  }

  // ==========================================================================
  // Flag Management
  // ==========================================================================

  /**
   * Process a flag report
   */
  processFlag(
    prop: UserProp,
    flag: PropFlag
  ): {
    newFlagCount: number;
    requiresReview: boolean;
    priority: "low" | "normal" | "high" | "urgent";
  } {
    const newFlagCount = prop.flagCount + 1;

    // Determine priority based on flag type and count
    let priority: "low" | "normal" | "high" | "urgent" = "normal";

    if (flag.reason === "illegal" || flag.reason === "personal_information") {
      priority = "urgent";
    } else if (flag.reason === "market_manipulation" || flag.reason === "misleading") {
      priority = "high";
    } else if (newFlagCount >= this.config.escalationThreshold) {
      priority = "high";
    }

    const requiresReview =
      newFlagCount >= this.config.maxFlagsBeforeReview ||
      priority === "urgent" ||
      priority === "high";

    return {
      newFlagCount,
      requiresReview,
      priority,
    };
  }

  /**
   * Get flag reasons summary
   */
  summarizeFlags(flags: PropFlag[]): Record<FlagReason, number> {
    const summary: Record<FlagReason, number> = {
      inappropriate_content: 0,
      misleading: 0,
      duplicate: 0,
      unresolvable: 0,
      market_manipulation: 0,
      personal_information: 0,
      illegal: 0,
      other: 0,
    };

    for (const flag of flags) {
      summary[flag.reason]++;
    }

    return summary;
  }

  // ==========================================================================
  // Queue Management
  // ==========================================================================

  /**
   * Prioritize moderation queue
   */
  prioritizeQueue(items: ModerationItem[]): ModerationItem[] {
    return items.sort((a, b) => {
      // Priority order: urgent > high > normal > low
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };

      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }

      // Within same priority, older items first
      return a.queuedAt.getTime() - b.queuedAt.getTime();
    });
  }

  /**
   * Calculate queue statistics
   */
  calculateQueueStats(items: ModerationItem[]): {
    pendingCount: number;
    flaggedCount: number;
    averageWaitTime: number;
    oldestItem?: Date;
  } {
    const now = Date.now();
    const pendingItems = items.filter(i => i.prop.moderationStatus === "pending");
    const flaggedItems = items.filter(i => i.prop.moderationStatus === "flagged");

    const waitTimes = items.map(i => now - i.queuedAt.getTime());
    const averageWaitTime = waitTimes.length > 0
      ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
      : 0;

    const oldestItem = items.length > 0
      ? new Date(Math.min(...items.map(i => i.queuedAt.getTime())))
      : undefined;

    return {
      pendingCount: pendingItems.length,
      flaggedCount: flaggedItems.length,
      averageWaitTime: averageWaitTime / (1000 * 60 * 60), // Hours
      oldestItem,
    };
  }

  // ==========================================================================
  // Moderation Actions
  // ==========================================================================

  /**
   * Validate moderation action
   */
  validateAction(
    prop: UserProp,
    action: ModerationAction["action"]
  ): { valid: boolean; reason?: string } {
    // Check valid state transitions
    const validTransitions: Record<PropStatus, ModerationAction["action"][]> = {
      draft: [],
      pending_review: ["approve", "reject", "edit", "escalate"],
      approved: ["pause", "cancel"],
      rejected: [],
      active: ["pause", "cancel"],
      paused: ["approve", "cancel"],
      closed: [],
      settling: [],
      settled: [],
      cancelled: [],
      disputed: ["escalate"],
    };

    const allowedActions = validTransitions[prop.status] || [];

    if (!allowedActions.includes(action)) {
      return {
        valid: false,
        reason: `Cannot perform '${action}' on prop with status '${prop.status}'`,
      };
    }

    return { valid: true };
  }

  /**
   * Determine new status after action
   */
  getNewStatus(
    currentStatus: PropStatus,
    action: ModerationAction["action"]
  ): PropStatus {
    const statusTransitions: Record<ModerationAction["action"], PropStatus> = {
      approve: "approved",
      reject: "rejected",
      edit: currentStatus, // Keep same status
      pause: "paused",
      cancel: "cancelled",
      escalate: "disputed",
    };

    return statusTransitions[action];
  }

  /**
   * Get moderation status from prop status
   */
  getModerationStatus(propStatus: PropStatus): ModerationStatus {
    const mapping: Record<PropStatus, ModerationStatus> = {
      draft: "pending",
      pending_review: "in_review",
      approved: "approved",
      rejected: "rejected",
      active: "approved",
      paused: "flagged",
      closed: "approved",
      settling: "approved",
      settled: "approved",
      cancelled: "rejected",
      disputed: "escalated",
    };

    return mapping[propStatus] || "pending";
  }
}

// Export singleton instance
export const propModerationService = new PropModerationService();
export const contentFilter = new ContentFilter();
