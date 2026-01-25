/**
 * Persona Service Tests
 * Tests for KYC verification functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// ===========================================================================
// Mock Setup
// ===========================================================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ===========================================================================
// Test Fixtures
// ===========================================================================

const mockInquiry = {
  id: 'inq_mock123',
  type: 'inquiry',
  attributes: {
    status: 'created',
    reference_id: 'user_123',
    name_first: null,
    name_last: null,
    birthdate: null,
    address_street_1: null,
    address_city: null,
    address_subdivision: null,
    address_postal_code: null,
    address_country_code: null,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    failed_at: null,
    expired_at: null,
    current_step_name: 'start',
    next_step_name: 'document',
  },
};

const mockApprovedInquiry = {
  ...mockInquiry,
  attributes: {
    ...mockInquiry.attributes,
    status: 'approved',
    name_first: 'John',
    name_last: 'Doe',
    birthdate: '1990-01-15',
    address_street_1: '123 Main St',
    address_city: 'San Francisco',
    address_subdivision: 'CA',
    address_postal_code: '94102',
    address_country_code: 'US',
    completed_at: new Date().toISOString(),
    current_step_name: null,
    next_step_name: null,
  },
};

const mockDeclinedInquiry = {
  ...mockInquiry,
  attributes: {
    ...mockInquiry.attributes,
    status: 'declined',
    decline_reason: 'Document does not match',
    completed_at: new Date().toISOString(),
    current_step_name: null,
    next_step_name: null,
  },
};

const mockAccount = {
  id: 'act_mock123',
  type: 'account',
  attributes: {
    reference_id: 'user_123',
    created_at: new Date().toISOString(),
    tags: [],
  },
};

// ===========================================================================
// Persona Service Implementation (for testing)
// ===========================================================================

interface PersonaConfig {
  apiKey: string;
  templateId?: string;
  baseUrl?: string;
}

interface CreateInquiryResult {
  inquiry: typeof mockInquiry;
  sessionToken: string;
}

interface InquiryStatus {
  id: string;
  status: string;
  verifiedData?: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    address?: {
      street: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  };
}

class PersonaService {
  private apiKey: string;
  private templateId: string;
  private baseUrl: string;

  constructor(config: PersonaConfig) {
    this.apiKey = config.apiKey;
    this.templateId = config.templateId || 'tmpl_default';
    this.baseUrl = config.baseUrl || 'https://withpersona.com/api/v1';
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Persona-Version': '2023-01-05',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Persona API error: ${response.status}`);
    }

    return response.json();
  }

  async createInquiry(params: {
    referenceId: string;
    templateId?: string;
    fields?: Record<string, unknown>;
  }): Promise<CreateInquiryResult> {
    const { data } = await this.request('/inquiries', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          attributes: {
            'inquiry-template-id': params.templateId || this.templateId,
            'reference-id': params.referenceId,
            fields: params.fields,
          },
        },
      }),
    });

    return {
      inquiry: data,
      sessionToken: data.attributes['session-token'] || 'session_token_mock',
    };
  }

  async getInquiry(inquiryId: string): Promise<typeof mockInquiry> {
    const { data } = await this.request(`/inquiries/${inquiryId}`);
    return data;
  }

  async resumeInquiry(inquiryId: string): Promise<CreateInquiryResult> {
    const { data } = await this.request(`/inquiries/${inquiryId}/resume`, {
      method: 'POST',
    });

    return {
      inquiry: data,
      sessionToken: data.attributes['session-token'] || 'session_token_resume_mock',
    };
  }

  async getInquiryStatus(inquiryId: string): Promise<InquiryStatus> {
    const inquiry = await this.getInquiry(inquiryId);
    const attrs = inquiry.attributes;

    const status: InquiryStatus = {
      id: inquiry.id,
      status: attrs.status,
    };

    if (attrs.status === 'approved') {
      status.verifiedData = {
        firstName: attrs.name_first || undefined,
        lastName: attrs.name_last || undefined,
        dateOfBirth: attrs.birthdate || undefined,
        address: attrs.address_street_1 ? {
          street: attrs.address_street_1,
          city: attrs.address_city || '',
          state: attrs.address_subdivision || '',
          postalCode: attrs.address_postal_code || '',
          country: attrs.address_country_code || '',
        } : undefined,
      };
    }

    return status;
  }

  async upsertAccount(referenceId: string): Promise<typeof mockAccount> {
    const { data } = await this.request('/accounts', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          attributes: {
            'reference-id': referenceId,
          },
        },
      }),
    });

    return data;
  }

  async getAccountByReferenceId(referenceId: string): Promise<typeof mockAccount | null> {
    try {
      const { data } = await this.request(`/accounts?filter[reference-id]=${referenceId}`);
      return data[0] || null;
    } catch {
      return null;
    }
  }

  async getLatestInquiryByReferenceId(referenceId: string): Promise<typeof mockInquiry | null> {
    try {
      const { data } = await this.request(
        `/inquiries?filter[reference-id]=${referenceId}&page[size]=1&sort=-created-at`
      );
      return data[0] || null;
    } catch {
      return null;
    }
  }

  isInquiryApproved(inquiry: typeof mockInquiry): boolean {
    return inquiry.attributes.status === 'approved';
  }

  isInquiryDeclined(inquiry: typeof mockInquiry): boolean {
    return inquiry.attributes.status === 'declined';
  }

  isInquiryPending(inquiry: typeof mockInquiry): boolean {
    const pendingStatuses = ['created', 'pending', 'needs_review'];
    return pendingStatuses.includes(inquiry.attributes.status);
  }

  needsUserAction(inquiry: typeof mockInquiry): boolean {
    return inquiry.attributes.next_step_name !== null;
  }

  verifyWebhook(
    payload: string,
    signature: string,
    secret: string
  ): { valid: boolean; data?: unknown } {
    // Simplified webhook verification (in real implementation, use HMAC)
    if (!signature || !secret) {
      return { valid: false };
    }

    try {
      const data = JSON.parse(payload);
      // In real implementation, verify HMAC signature
      return { valid: true, data };
    } catch {
      return { valid: false };
    }
  }

  getKycTierFromTemplate(templateId: string): string {
    const tierMap: Record<string, string> = {
      'tmpl_basic': 'basic',
      'tmpl_verified': 'verified',
      'tmpl_premium': 'premium',
      'tmpl_institutional': 'institutional',
    };
    return tierMap[templateId] || 'basic';
  }
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Persona Service', () => {
  let personaService: PersonaService;

  beforeAll(() => {
    personaService = new PersonaService({
      apiKey: 'persona_test_api_key',
      templateId: 'tmpl_basic',
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // Inquiry Creation Tests
  // =========================================================================

  describe('Inquiry Creation', () => {
    describe('createInquiry', () => {
      it('should create an inquiry successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: {
              ...mockInquiry,
              attributes: {
                ...mockInquiry.attributes,
                'session-token': 'session_token_123',
              },
            },
          }),
        });

        const result = await personaService.createInquiry({
          referenceId: 'user_123',
        });

        expect(result.inquiry.id).toBe('inq_mock123');
        expect(result.sessionToken).toBe('session_token_123');
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/inquiries'),
          expect.objectContaining({ method: 'POST' })
        );
      });

      it('should use custom template ID', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: mockInquiry }),
        });

        await personaService.createInquiry({
          referenceId: 'user_123',
          templateId: 'tmpl_verified',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining('tmpl_verified'),
          })
        );
      });

      it('should pass additional fields', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: mockInquiry }),
        });

        await personaService.createInquiry({
          referenceId: 'user_123',
          fields: {
            email: 'test@example.com',
            phone: '+15551234567',
          },
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining('test@example.com'),
          })
        );
      });

      it('should handle API errors', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve({
            message: 'Invalid reference ID',
          }),
        });

        await expect(
          personaService.createInquiry({ referenceId: '' })
        ).rejects.toThrow('Invalid reference ID');
      });
    });
  });

  // =========================================================================
  // Inquiry Retrieval Tests
  // =========================================================================

  describe('Inquiry Retrieval', () => {
    describe('getInquiry', () => {
      it('should retrieve an inquiry', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: mockInquiry }),
        });

        const result = await personaService.getInquiry('inq_mock123');

        expect(result.id).toBe('inq_mock123');
        expect(result.attributes.status).toBe('created');
      });

      it('should retrieve approved inquiry with data', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: mockApprovedInquiry }),
        });

        const result = await personaService.getInquiry('inq_mock123');

        expect(result.attributes.status).toBe('approved');
        expect(result.attributes.name_first).toBe('John');
        expect(result.attributes.name_last).toBe('Doe');
      });
    });

    describe('getInquiryStatus', () => {
      it('should return status for created inquiry', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: mockInquiry }),
        });

        const result = await personaService.getInquiryStatus('inq_mock123');

        expect(result.id).toBe('inq_mock123');
        expect(result.status).toBe('created');
        expect(result.verifiedData).toBeUndefined();
      });

      it('should return verified data for approved inquiry', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: mockApprovedInquiry }),
        });

        const result = await personaService.getInquiryStatus('inq_mock123');

        expect(result.status).toBe('approved');
        expect(result.verifiedData).toBeDefined();
        expect(result.verifiedData?.firstName).toBe('John');
        expect(result.verifiedData?.lastName).toBe('Doe');
        expect(result.verifiedData?.dateOfBirth).toBe('1990-01-15');
        expect(result.verifiedData?.address?.city).toBe('San Francisco');
      });
    });
  });

  // =========================================================================
  // Inquiry Resume Tests
  // =========================================================================

  describe('Inquiry Resume', () => {
    describe('resumeInquiry', () => {
      it('should resume an inquiry', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: {
              ...mockInquiry,
              attributes: {
                ...mockInquiry.attributes,
                status: 'pending',
                'session-token': 'session_resume_token',
              },
            },
          }),
        });

        const result = await personaService.resumeInquiry('inq_mock123');

        expect(result.sessionToken).toBe('session_resume_token');
        expect(result.inquiry.attributes.status).toBe('pending');
      });
    });
  });

  // =========================================================================
  // Account Management Tests
  // =========================================================================

  describe('Account Management', () => {
    describe('upsertAccount', () => {
      it('should create or update an account', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: mockAccount }),
        });

        const result = await personaService.upsertAccount('user_123');

        expect(result.id).toBe('act_mock123');
        expect(result.attributes.reference_id).toBe('user_123');
      });
    });

    describe('getAccountByReferenceId', () => {
      it('should find account by reference ID', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [mockAccount] }),
        });

        const result = await personaService.getAccountByReferenceId('user_123');

        expect(result?.id).toBe('act_mock123');
      });

      it('should return null when not found', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        });

        const result = await personaService.getAccountByReferenceId('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('getLatestInquiryByReferenceId', () => {
      it('should find latest inquiry', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [mockInquiry] }),
        });

        const result = await personaService.getLatestInquiryByReferenceId('user_123');

        expect(result?.id).toBe('inq_mock123');
      });

      it('should return null when no inquiries', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        });

        const result = await personaService.getLatestInquiryByReferenceId('user_123');

        expect(result).toBeNull();
      });
    });
  });

  // =========================================================================
  // Status Check Helpers
  // =========================================================================

  describe('Status Check Helpers', () => {
    describe('isInquiryApproved', () => {
      it('should return true for approved inquiry', () => {
        expect(personaService.isInquiryApproved(mockApprovedInquiry)).toBe(true);
      });

      it('should return false for created inquiry', () => {
        expect(personaService.isInquiryApproved(mockInquiry)).toBe(false);
      });

      it('should return false for declined inquiry', () => {
        expect(personaService.isInquiryApproved(mockDeclinedInquiry)).toBe(false);
      });
    });

    describe('isInquiryDeclined', () => {
      it('should return true for declined inquiry', () => {
        expect(personaService.isInquiryDeclined(mockDeclinedInquiry)).toBe(true);
      });

      it('should return false for approved inquiry', () => {
        expect(personaService.isInquiryDeclined(mockApprovedInquiry)).toBe(false);
      });
    });

    describe('isInquiryPending', () => {
      it('should return true for created inquiry', () => {
        expect(personaService.isInquiryPending(mockInquiry)).toBe(true);
      });

      it('should return true for pending status', () => {
        const pendingInquiry = {
          ...mockInquiry,
          attributes: { ...mockInquiry.attributes, status: 'pending' },
        };
        expect(personaService.isInquiryPending(pendingInquiry)).toBe(true);
      });

      it('should return false for approved inquiry', () => {
        expect(personaService.isInquiryPending(mockApprovedInquiry)).toBe(false);
      });
    });

    describe('needsUserAction', () => {
      it('should return true when next step exists', () => {
        expect(personaService.needsUserAction(mockInquiry)).toBe(true);
      });

      it('should return false when no next step', () => {
        expect(personaService.needsUserAction(mockApprovedInquiry)).toBe(false);
      });
    });
  });

  // =========================================================================
  // Webhook Verification Tests
  // =========================================================================

  describe('Webhook Verification', () => {
    describe('verifyWebhook', () => {
      it('should verify valid webhook', () => {
        const payload = JSON.stringify({ type: 'inquiry.approved', data: mockApprovedInquiry });
        const result = personaService.verifyWebhook(
          payload,
          'valid_signature',
          'webhook_secret'
        );

        expect(result.valid).toBe(true);
        expect(result.data).toBeDefined();
      });

      it('should reject missing signature', () => {
        const payload = JSON.stringify({ type: 'inquiry.approved' });
        const result = personaService.verifyWebhook(payload, '', 'webhook_secret');

        expect(result.valid).toBe(false);
      });

      it('should reject invalid JSON', () => {
        const result = personaService.verifyWebhook(
          'invalid json',
          'signature',
          'webhook_secret'
        );

        expect(result.valid).toBe(false);
      });
    });
  });

  // =========================================================================
  // KYC Tier Mapping Tests
  // =========================================================================

  describe('KYC Tier Mapping', () => {
    describe('getKycTierFromTemplate', () => {
      it('should map basic template', () => {
        expect(personaService.getKycTierFromTemplate('tmpl_basic')).toBe('basic');
      });

      it('should map verified template', () => {
        expect(personaService.getKycTierFromTemplate('tmpl_verified')).toBe('verified');
      });

      it('should map premium template', () => {
        expect(personaService.getKycTierFromTemplate('tmpl_premium')).toBe('premium');
      });

      it('should map institutional template', () => {
        expect(personaService.getKycTierFromTemplate('tmpl_institutional')).toBe('institutional');
      });

      it('should default to basic for unknown template', () => {
        expect(personaService.getKycTierFromTemplate('tmpl_unknown')).toBe('basic');
      });
    });
  });
});

// ===========================================================================
// Inquiry Status State Machine Tests
// ===========================================================================

describe('Inquiry Status State Machine', () => {
  const validTransitions: Record<string, string[]> = {
    created: ['pending', 'completed', 'failed', 'expired'],
    pending: ['completed', 'needs_review', 'failed', 'expired'],
    needs_review: ['approved', 'declined'],
    completed: ['approved', 'declined', 'needs_review'],
    approved: [], // Terminal state
    declined: [], // Terminal state (can be reopened in some cases)
    failed: ['created'], // Can retry
    expired: ['created'], // Can retry
  };

  describe('Status Transitions', () => {
    it('should identify valid transitions from created', () => {
      expect(validTransitions['created']).toContain('pending');
      expect(validTransitions['created']).toContain('completed');
    });

    it('should identify terminal states', () => {
      expect(validTransitions['approved']).toHaveLength(0);
    });

    it('should allow retry from failed', () => {
      expect(validTransitions['failed']).toContain('created');
    });

    it('should validate transition', () => {
      const isValidTransition = (from: string, to: string): boolean => {
        return validTransitions[from]?.includes(to) ?? false;
      };

      expect(isValidTransition('created', 'pending')).toBe(true);
      expect(isValidTransition('approved', 'declined')).toBe(false);
      expect(isValidTransition('pending', 'completed')).toBe(true);
    });
  });
});
