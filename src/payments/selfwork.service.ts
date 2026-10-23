import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readAppConfig } from '../config/app-config';

export type SelfworkInitFields = {
  order_id: string;
  amount: string;
  'info[0][name]': string;
  'info[0][quantity]': string;
  'info[0][amount]': string;
  signature: string;
};

export type VerifiedCallback = {
  orderId: string;
  amountKopecks: number;
};

const PAID_STATUSES = new Set(['paid', 'success', 'ok', 'approved', '1']);

@Injectable()
export class SelfworkService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const { apiKey, callbackSecret } = readAppConfig(this.config).selfwork;
    return Boolean(apiKey && callbackSecret);
  }

  buildInitFields(input: {
    orderId: string;
    amountKopecks: number;
    itemName: string;
  }): SelfworkInitFields {
    const { apiKey } = readAppConfig(this.config).selfwork;
    if (!apiKey) {
      throw new Error('SELFWORK_API_KEY is not set');
    }

    const amount = String(input.amountKopecks);
    const quantity = '1';
    const signature = createHash('sha256')
      .update(input.orderId + amount + input.itemName + quantity + amount + apiKey)
      .digest('hex');

    return {
      order_id: input.orderId,
      amount,
      'info[0][name]': input.itemName,
      'info[0][quantity]': quantity,
      'info[0][amount]': amount,
      signature,
    };
  }

  verifyCallback(payload: Record<string, unknown>): VerifiedCallback | null {
    const orderId = this.asString(payload.order_id ?? payload.orderId);
    if (!orderId) {
      return null;
    }

    const status = this.asString(payload.status ?? payload.payment_status);
    if (!status || !PAID_STATUSES.has(status.toLowerCase())) {
      return null;
    }

    const { apiKey, callbackSecret } = readAppConfig(this.config).selfwork;
    if (!callbackSecret) {
      return null;
    }

    // Prefer body token; query is accepted only as fallback for cabinet URL config
    const token = this.asString(payload.token ?? payload.secret);
    if (!token || !this.secureCompare(token, callbackSecret)) {
      return null;
    }

    const amountRaw = this.asString(
      payload.amount ?? payload.payment_amount ?? payload.sum,
    );
    if (!amountRaw) {
      return null;
    }
    const amountKopecks = Number.parseInt(amountRaw, 10);
    if (!Number.isFinite(amountKopecks) || amountKopecks <= 0) {
      return null;
    }

    const signature = this.asString(payload.signature);
    if (apiKey) {
      if (!signature) {
        return null;
      }
      const candidates = [
        createHash('sha256')
          .update(orderId + amountRaw + apiKey)
          .digest('hex'),
        createHash('sha256')
          .update(orderId + String(amountKopecks) + apiKey)
          .digest('hex'),
      ];
      const ok = candidates.some((expected) =>
        this.secureCompare(signature.toLowerCase(), expected.toLowerCase()),
      );
      if (!ok) {
        return null;
      }
    }

    return { orderId, amountKopecks };
  }

  private secureCompare(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) {
      return false;
    }
    return timingSafeEqual(left, right);
  }

  private asString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }
}
