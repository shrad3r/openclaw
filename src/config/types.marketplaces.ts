// Defines marketplace feed and package source profile configuration types.
export type MarketplaceFeedRefreshConfig = {
  onStartup?: "never" | "always" | "if-stale";
  interval?: string;
  jitter?: string;
  timeout?: string;
  maxStale?: string;
};

export type MarketplaceFeedVerificationConfig = {
  mode: "unsigned";
};

export type MarketplaceFeedProfileConfig = {
  url: string;
  refresh?: MarketplaceFeedRefreshConfig;
  verification?: MarketplaceFeedVerificationConfig;
};

export type MarketplaceSourceProfileConfig =
  | {
      type: "npm";
    }
  | {
      type: "clawhub";
    }
  | {
      type: "git";
    };

export type MarketplacesConfig = {
  feeds?: Record<string, MarketplaceFeedProfileConfig>;
  sources?: Record<string, MarketplaceSourceProfileConfig>;
};
