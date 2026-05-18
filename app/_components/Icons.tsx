type IProps = { className?: string };

export function LeafIcon({ className = "h-4 w-4" }: IProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 3c-5 0-8 4-8 8 0 4 2 7 5 8 0-3 1-6 4-9 0 4-1 7-4 9 2 1 6 1 9-2 3-3 3-9 3-13-3 0-6 0-9-1z"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  );
}

export function GlobeIcon({ className = "h-6 w-6" }: IProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18" />
    </svg>
  );
}

export function LeafCircleIcon({ className = "h-6 w-6" }: IProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 19c0-7 6-13 14-13 0 8-6 14-14 14z" />
      <path d="M5 19c4-3 7-6 9-10" />
    </svg>
  );
}
