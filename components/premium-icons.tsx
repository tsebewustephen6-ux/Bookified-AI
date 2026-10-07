import type { SVGProps } from "react";

function IconFrame({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ReadingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconFrame {...props}>
      <path d="M8 13c6-2 11-1 16 3v24c-5-4-10-5-16-3V13Z" fill="#e9dfcd" />
      <path d="M40 13c-6-2-11-1-16 3v24c5-4 10-5 16-3V13Z" fill="#f9f5ec" />
      <path
        d="M12 8c5 0 9 2 12 6 3-4 7-6 12-6v24c-5 0-9 2-12 6-3-4-7-6-12-6V8Z"
        fill="#fbf8f1"
      />
      <path
        d="M24 14v24M16 14c2 .6 3.3 1.4 5 3M16 20c2 .6 3.3 1.4 5 3M16 26c2 .6 3.3 1.4 5 3"
        stroke="#b39973"
      />
      <path d="m31 11 3-1v11l-1.5-1.5L31 22V11Z" fill="#b39973" stroke="none" />
    </IconFrame>
  );
}

export function ListeningIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconFrame {...props}>
      <path d="M9 28v-6a15 15 0 0 1 30 0v6" strokeWidth="2.2" />
      <path d="M13 20v-1a11 11 0 0 1 22 0v1" stroke="#b39973" />
      <rect x="7" y="22" width="8" height="15" rx="3.5" fill="#e9dfcd" />
      <rect x="33" y="22" width="8" height="15" rx="3.5" fill="#e9dfcd" />
      <path
        d="M11 27v5M37 27v5M20 26v7M24 22v15M28 26v7"
        stroke="#b39973"
        strokeWidth="2.2"
      />
      <path d="M36 38c-2 3-5 4-9 4" />
      <rect
        x="22"
        y="40"
        width="6"
        height="3"
        rx="1.5"
        fill="currentColor"
        stroke="none"
      />
    </IconFrame>
  );
}

export function DiscoveryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconFrame {...props}>
      <circle cx="22" cy="27" r="15" fill="#f9f5ec" />
      <circle cx="22" cy="27" r="11" stroke="#d6c5a8" strokeDasharray="1 4" />
      <path d="m28 20-3 10-9 5 3-10 9-5Z" fill="#e9dfcd" />
      <path d="m28 20-9 5 3 2 6-7Z" fill="#b39973" stroke="none" />
      <circle cx="22" cy="27" r="1.5" fill="currentColor" stroke="none" />
      <path
        d="M36 5c0 5-2 7-6 8 4 1 6 3 6 7 1-4 3-6 7-7-4-1-6-3-7-8Z"
        fill="#e9dfcd"
      />
      <path d="M12 7v4M10 9h4" stroke="#b39973" />
    </IconFrame>
  );
}
