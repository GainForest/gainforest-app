import { describe, expect, it } from "vitest";
import { getProxyBlockResult, isBlockedBotUserAgent } from "./proxy-guards";

describe("isBlockedBotUserAgent", () => {
  it("blocks known AI crawler user agents", () => {
    expect(isBlockedBotUserAgent("Mozilla/5.0 ClaudeBot/1.0")).toBe(true);
    expect(isBlockedBotUserAgent("ChatGPT-User/1.0")).toBe(true);
    expect(isBlockedBotUserAgent("Mozilla/5.0 (compatible; Google-Extended)")).toBe(true);
  });

  it("blocks generic crawler user agents", () => {
    expect(isBlockedBotUserAgent("Example Crawler/1.0")).toBe(true);
    expect(isBlockedBotUserAgent("Mozilla/5.0 some-scraper")).toBe(true);
  });

  it("allows trusted link preview bots", () => {
    expect(
      isBlockedBotUserAgent(
        "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      ),
    ).toBe(false);
    expect(isBlockedBotUserAgent("facebookexternalhit/1.1")).toBe(false);
  });

  it("allows trusted search crawler user agents", () => {
    expect(
      isBlockedBotUserAgent(
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      ),
    ).toBe(false);
    expect(
      isBlockedBotUserAgent("AdsBot-Google (+http://www.google.com/adsbot.html)"),
    ).toBe(false);
    expect(
      isBlockedBotUserAgent(
        "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      ),
    ).toBe(false);
  });
});

describe("getProxyBlockResult", () => {
  it("skips API routes and non-read methods", () => {
    expect(
      getProxyBlockResult({
        method: "GET",
        pathname: "/api/status",
        userAgent: "ClaudeBot/1.0",
      }),
    ).toBeNull();

    expect(
      getProxyBlockResult({
        method: "POST",
        pathname: "/account/not-a-did",
        userAgent: "ClaudeBot/1.0",
      }),
    ).toBeNull();
  });

  it("blocks bots before route validation", () => {
    expect(
      getProxyBlockResult({
        method: "GET",
        pathname: "/cert/did:plc:alice/rkey",
        userAgent: "ClaudeBot/1.0",
      }),
    ).toEqual({
      status: 403,
      reason: "blocked-bot-user-agent",
    });
  });

  it("rejects malformed account route identifiers", () => {
    expect(
      getProxyBlockResult({
        method: "GET",
        pathname: "/account/not-a-did",
        userAgent: "Mozilla/5.0",
      }),
    ).toEqual({
      status: 404,
      reason: "invalid-account-did-or-handle",
    });
  });

  it("rejects malformed localized account route identifiers", () => {
    expect(
      getProxyBlockResult({
        method: "HEAD",
        pathname: "/es/account/not-a-did",
        userAgent: "Mozilla/5.0",
      }),
    ).toEqual({
      status: 404,
      reason: "invalid-account-did-or-handle",
    });
  });

  it("allows DID and handle account route identifiers", () => {
    expect(
      getProxyBlockResult({
        method: "GET",
        pathname: "/account/did%3Aplc%3Aalice123",
        userAgent: "Mozilla/5.0",
      }),
    ).toBeNull();

    expect(
      getProxyBlockResult({
        method: "GET",
        pathname: "/account/organization.bsky.social/projects",
        userAgent: "Mozilla/5.0",
      }),
    ).toBeNull();
  });

  it("allows valid record detail identifiers", () => {
    expect(
      getProxyBlockResult({
        method: "GET",
        pathname: "/cert/did%3Aplc%3Aalice123/rkey_123~value",
        userAgent: "Mozilla/5.0",
      }),
    ).toBeNull();

    expect(
      getProxyBlockResult({
        method: "GET",
        pathname: "/es/observations/organization.bsky.social/record-123",
        userAgent: "Mozilla/5.0",
      }),
    ).toBeNull();
  });

  it("rejects malformed record keys", () => {
    expect(
      getProxyBlockResult({
        method: "GET",
        pathname: "/projects/did:plc:alice123/%2Fbad",
        userAgent: "Mozilla/5.0",
      }),
    ).toEqual({
      status: 404,
      reason: "invalid-record-rkey",
    });
  });
});
