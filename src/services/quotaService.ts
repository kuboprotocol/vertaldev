/**
 * Quota Management Service
 * Tracks free conversations (5/day) and credit usage
 */

export interface QuotaStatus {
  freeConversationsToday: number;
  freeConversationsRemaining: number;
  freeLimit: number;
  resetTime: string;
  canUseFree: boolean;
  creditsAvailable: number;
}

export interface ConversationUsage {
  id: string;
  userId: string;
  date: string;
  isFree: boolean;
  creditsUsed: number;
  messageCount: number;
  tokensUsed: number;
  createdAt: string;
}

const STORAGE_KEY = 'kubo_free_quota';
const FREE_LIMIT = 5; // 5 free conversations per day

export class QuotaService {
  /**
   * Get today's quota status
   */
  getQuotaStatus(userId: string, creditsAvailable: number): QuotaStatus {
    const today = this.getTodayString();
    const quota = this.getQuotaFromStorage();

    // Reset if day changed
    if (quota.date !== today) {
      quota.count = 0;
      quota.date = today;
      this.saveQuotaToStorage(quota);
    }

    const freeConversationsToday = quota.count;
    const freeConversationsRemaining = Math.max(0, FREE_LIMIT - freeConversationsToday);
    const canUseFree = freeConversationsRemaining > 0;

    return {
      freeConversationsToday,
      freeConversationsRemaining,
      freeLimit: FREE_LIMIT,
      resetTime: this.getResetTime(),
      canUseFree,
      creditsAvailable,
    };
  }

  /**
   * Use a free conversation
   */
  useFreConversation(): boolean {
    const quota = this.getQuotaFromStorage();
    const today = this.getTodayString();

    // Reset if day changed
    if (quota.date !== today) {
      quota.count = 0;
      quota.date = today;
    }

    // Check if can use
    if (quota.count >= FREE_LIMIT) {
      return false;
    }

    // Increment and save
    quota.count += 1;
    this.saveQuotaToStorage(quota);
    return true;
  }

  /**
   * Check if can use free conversation
   */
  canUseFree(): boolean {
    const quota = this.getQuotaFromStorage();
    const today = this.getTodayString();

    // Reset if day changed
    if (quota.date !== today) {
      return true; // New day, can use free
    }

    return quota.count < FREE_LIMIT;
  }

  /**
   * Get quota from localStorage
   */
  private getQuotaFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed;
      }
    } catch (err) {
      console.warn('Failed to read quota from storage:', err);
    }

    return {
      date: this.getTodayString(),
      count: 0,
    };
  }

  /**
   * Save quota to localStorage
   */
  private saveQuotaToStorage(quota: any) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(quota));
    } catch (err) {
      console.warn('Failed to save quota to storage:', err);
    }
  }

  /**
   * Get today's date string (YYYY-MM-DD)
   */
  private getTodayString(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  /**
   * Get reset time (UTC midnight next day)
   */
  private getResetTime(): string {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.toISOString();
  }

  /**
   * Get remaining time until reset (in minutes)
   */
  getMinutesUntilReset(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const minutesLeft = Math.floor((tomorrow.getTime() - now.getTime()) / 60000);
    return Math.max(0, minutesLeft);
  }

  /**
   * Clear quota (for testing)
   */
  clearQuota(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Get quota info for display
   */
  getQuotaInfo(quotaStatus: QuotaStatus): string {
    if (quotaStatus.freeConversationsRemaining > 0) {
      return `${quotaStatus.freeConversationsRemaining} free conversations left today`;
    }

    if (quotaStatus.creditsAvailable > 0) {
      return `Use ${quotaStatus.creditsAvailable} credits for more conversations`;
    }

    return 'No free conversations left. Buy credits to continue.';
  }
}

export const quotaService = new QuotaService();
