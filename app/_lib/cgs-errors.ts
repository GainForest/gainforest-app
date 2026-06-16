type ErrorPayload = {
  error?: unknown;
  message?: unknown;
};

const OPERATION_PHRASES: Record<string, string> = {
  "role.set": "change member roles",
  "member.add": "add members",
  "member.remove": "remove members",
  "audit.query": "view the audit log",
  "group.destroy": "delete the organization",
  "keys.create": "create API keys",
  "keys.delete": "delete API keys",
  "keys.list": "view API keys",
  createRecord: "create records",
  putRecord: "update records",
  deleteRecord: "delete records",
  uploadBlob: "upload files",
  putAnyRecord: "edit records created by other members",
  deleteAnyRecord: "delete records created by other members",
  putOwnRecord: "edit your own records",
  deleteOwnRecord: "delete your own records",
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parsePayloadMessage(message: string): string {
  if (!message.startsWith("{")) return message;
  try {
    const payload = JSON.parse(message) as ErrorPayload;
    return stringValue(payload.message) ?? stringValue(payload.error) ?? message;
  } catch {
    return message;
  }
}

function friendlyOperationDeniedMessage(role: string, operation: string): string {
  const normalizedRole = role.toLowerCase();
  const normalizedOperation = operation.trim();
  const phrase = OPERATION_PHRASES[normalizedOperation] ?? normalizedOperation.replace(/[._-]+/g, " ");

  switch (normalizedOperation) {
    case "role.set":
      return normalizedRole === "admin"
        ? "Your admin role cannot change member roles. Ask an owner to do this."
        : "Only organization owners can change member roles.";
    case "member.add":
      return normalizedRole === "admin"
        ? "Admins can add regular members, but only owners can add another admin."
        : "Only owners and admins can add members to this organization.";
    case "member.remove":
      return "Only owners and admins can remove members. Organization owners cannot be removed.";
    case "putAnyRecord":
      return "You can only edit records you created. Ask an admin or owner to change another member’s record.";
    case "deleteAnyRecord":
      return "You can only delete records you created. Ask an admin or owner to remove another member’s record.";
    case "audit.query":
      return "Only owners and admins can view this organization’s audit log.";
    case "group.destroy":
      return "Only organization owners can delete an organization.";
    default:
      return `Your ${normalizedRole} role does not allow you to ${phrase}. Ask an organization owner or admin for help.`;
  }
}

function friendlyKnownCgsMessage(message: string, fallback: string): string | null {
  const normalized = message.toLowerCase();

  const roleDenied = message.match(/role\s+['"]?([^'"\s]+)['"]?\s+cannot\s+perform\s+['"]?([^'".\s]+(?:[._-][^'".\s]+)*)['"]?/i);
  if (roleDenied?.[1] && roleDenied[2]) {
    return friendlyOperationDeniedMessage(roleDenied[1], roleDenied[2]);
  }

  if (normalized === "forbidden" || normalized.includes("permission denied")) {
    return "You do not have permission to do that in this organization.";
  }

  if (normalized.includes("unknown group")) {
    return "We could not find that organization. Check the handle or switch to another organization.";
  }

  if (normalized.includes("could not resolve repo to a did")) {
    return "We could not find that organization. Check the organization handle and try again.";
  }

  if (normalized.includes("missing organization identifier") || normalized.includes("missing repo")) {
    return "Choose an organization and try again.";
  }

  if (normalized.includes("please sign in") || normalized.includes("not authenticated") || normalized.includes("unauthorized")) {
    return "Please sign in again, then retry this action.";
  }

  if (normalized.includes("jwt audience does not match service did")) {
    return "This organization request could not be authenticated. Refresh the page and try again.";
  }

  if (normalized.includes("owner") && (normalized.includes("cannot") || normalized.includes("immutable"))) {
    return "Organization owners cannot be changed from this screen.";
  }

  if (normalized.includes("already a member")) {
    return "That account is already a member of this organization.";
  }

  if (normalized.includes("not a member")) {
    return "That account is not a member of this organization.";
  }

  if (normalized.includes("invalid did") || normalized.includes("invalid member")) {
    return "Enter a valid member email or username.";
  }

  if (normalized.includes("failed to fetch") || normalized.includes("networkerror") || normalized === "load failed") {
    return "Could not reach the organization service. Check your connection and try again.";
  }

  if (
    /^\d{3}\s/.test(message) ||
    normalized.includes("xrpc") ||
    normalized.includes("service auth") ||
    normalized.includes("unexpected token") ||
    normalized.includes("unexpected end of json")
  ) {
    return fallback;
  }

  return null;
}

export function formatCgsErrorMessage(error: unknown, fallback = "Organization request failed."): string {
  const raw = error instanceof Error ? error.message : stringValue(error);
  const message = raw ? parsePayloadMessage(raw).trim() : "";
  if (!message) return fallback;

  return friendlyKnownCgsMessage(message, fallback) ?? message;
}
