import { ConfigService } from '@nestjs/config';

function required(config: ConfigService, key: string): string {
  const value = config.get<string>(key)?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

function optional(config: ConfigService, key: string): string | undefined {
  const value = config.get<string>(key)?.trim();
  return value ? value : undefined;
}

function truthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function isLocalPublicUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1'
    );
  } catch {
    return false;
  }
}

export function readAppConfig(config: ConfigService) {
  const ownerIds = (config.get<string>('OWNER_TELEGRAM_IDS') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const priceRub = Number.parseInt(
    config.get<string>('COURSE_PRICE_RUB') ?? '3000',
    10,
  );

  const selfworkApiKey = optional(config, 'SELFWORK_API_KEY');
  const callbackSecret = optional(config, 'SELFWORK_CALLBACK_SECRET');
  const mockPayFlag = truthy(optional(config, 'ENABLE_MOCK_PAY'));
  const isProd =
    (optional(config, 'NODE_ENV') ?? process.env.NODE_ENV) === 'production';
  const publicUrl = (
    optional(config, 'PUBLIC_URL') ?? 'http://localhost:3000'
  ).replace(/\/$/, '');

  return {
    botToken: required(config, 'BOT_TOKEN'),
    ownerIds,
    channelId: optional(config, 'CHANNEL_ID'),
    courseTitle:
      optional(config, 'COURSE_TITLE') ?? 'Начальный курс танцев',
    coursePriceRub: Number.isFinite(priceRub) && priceRub > 0 ? priceRub : 3000,
    publicUrl,
    port: Number.parseInt(config.get<string>('PORT') ?? '3000', 10) || 3000,
    /**
     * Mock pay only when:
     * - ENABLE_MOCK_PAY=1
     * - not production
     * - Selfwork not fully configured
     * - PUBLIC_URL is localhost (blocks accidental deploy with mock on)
     */
    mockPayEnabled:
      mockPayFlag &&
      !isProd &&
      !(selfworkApiKey && callbackSecret) &&
      isLocalPublicUrl(publicUrl),
    selfwork: {
      apiKey: selfworkApiKey,
      initUrl:
        optional(config, 'SELFWORK_INIT_URL') ??
        'https://pro.selfwork.ru/merchant/v1/init',
      origin: optional(config, 'SELFWORK_ORIGIN'),
      callbackSecret,
      siteVerify: optional(config, 'SELFWORK_SITE_VERIFY'),
    },
  };
}

export type AppConfig = ReturnType<typeof readAppConfig>;
