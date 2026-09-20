import { createHash } from 'node:crypto';
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

@Injectable()
export class SelfworkService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(readAppConfig(this.config).selfwork.apiKey);
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

  verifyCallback(payload: Record<string, unknown>): string | null {
    const orderId = this.asString(payload.order_id ?? payload.orderId);
    if (!orderId) {
      return null;
    }

    const status = this.asString(payload.status ?? payload.payment_status);
    if (status && !['paid', 'success', 'ok', 'approved', '1'].includes(status.toLowerCase())) {
      return null;
    }

    const { apiKey, callbackSecret } = readAppConfig(this.config).selfwork;
    const signature = this.asString(payload.signature);
    if (signature && apiKey) {
      const amount = this.asString(payload.amount);
      const expected = [
        createHash('sha256')
          .update(orderId + (amount ?? '') + apiKey)
          .digest('hex'),
        amount
          ? createHash('sha256')
              .update(orderId + amount + apiKey)
              .digest('hex')
          : '',
      ];
      if (!expected.includes(signature.toLowerCase())) {
        return null;
      }
    } else if (callbackSecret) {
      const token = this.asString(payload.token ?? payload.secret);
      if (token !== callbackSecret) {
        return null;
      }
    }

    return orderId;
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
