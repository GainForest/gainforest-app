"use client";

import { useEffect, useMemo } from "react";
import { useLocale } from "next-intl";
import { messagesByLocale } from "@/messages/locales";
import { DEFAULT_LANGUAGE, isSupportedLanguageCode, type SupportedLanguageCode } from "@/lib/i18n/languages";

type MessageTree = string | number | boolean | null | MessageTree[] | { [key: string]: MessageTree };

const TRANSLATABLE_ATTRIBUTES = ["aria-label", "title", "placeholder", "alt"] as const;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"]);

function collectLiteralPairs(
  source: MessageTree,
  target: MessageTree,
  pairs: Map<string, string>,
) {
  if (typeof source === "string" && typeof target === "string") {
    const sourceText = source.trim();
    const targetText = target.trim();
    if (sourceText && targetText && sourceText !== targetText) pairs.set(sourceText, targetText);
    return;
  }

  if (Array.isArray(source) && Array.isArray(target)) {
    source.forEach((item, index) => collectLiteralPairs(item, target[index], pairs));
    return;
  }

  if (
    source &&
    target &&
    typeof source === "object" &&
    typeof target === "object" &&
    !Array.isArray(source) &&
    !Array.isArray(target)
  ) {
    for (const key of Object.keys(source)) {
      collectLiteralPairs(source[key], (target as Record<string, MessageTree>)[key], pairs);
    }
  }
}

function replacementFor(value: string, pairs: Map<string, string>): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const translated = pairs.get(trimmed);
  if (!translated || translated === trimmed) return null;
  return value.replace(trimmed, translated);
}

function shouldSkipNode(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  if (SKIP_TAGS.has(parent.tagName)) return true;
  if (parent.closest("[data-no-dom-translate]")) return true;
  return false;
}

function translateElement(root: ParentNode, pairs: Map<string, string>) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT;
      return node.textContent && pairs.has(node.textContent.trim())
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });

  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  for (const node of textNodes) {
    const next = replacementFor(node.data, pairs);
    if (next) node.data = next;
  }

  const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll("*"))] : Array.from(root.querySelectorAll("*"));
  for (const element of elements) {
    if (SKIP_TAGS.has(element.tagName) || element.closest("[data-no-dom-translate]")) continue;
    for (const attribute of TRANSLATABLE_ATTRIBUTES) {
      const current = element.getAttribute(attribute);
      if (!current) continue;
      const next = replacementFor(current, pairs);
      if (next) element.setAttribute(attribute, next);
    }
  }
}

/**
 * Safety net for legacy UI that still contains literal English strings after the
 * i18n port. Components should still use next-intl directly, but this prevents
 * stragglers from being displayed untranslated while the app is migrated.
 */
export function DomTranslationFallback() {
  const rawLocale = useLocale();
  const locale: SupportedLanguageCode = isSupportedLanguageCode(rawLocale) ? rawLocale : DEFAULT_LANGUAGE;
  const pairs = useMemo(() => {
    const map = new Map<string, string>();
    if (locale !== DEFAULT_LANGUAGE) {
      collectLiteralPairs(
        messagesByLocale[DEFAULT_LANGUAGE] as MessageTree,
        messagesByLocale[locale] as MessageTree,
        map,
      );
    }
    return map;
  }, [locale]);

  useEffect(() => {
    if (pairs.size === 0) return;

    const run = (root: ParentNode = document.body) => translateElement(root, pairs);
    run();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const target = mutation.target;
          if (target instanceof Element) translateElement(target, pairs);
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            translateElement(node.parentElement, pairs);
          } else if (node instanceof Element) {
            translateElement(node, pairs);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });

    return () => observer.disconnect();
  }, [pairs]);

  return null;
}
