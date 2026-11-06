import { useId } from "react";

const RES_SHAPES = {
  politicalCapital: <path d="M2 9.5 12 3l10 6.5zM4 11h3v7H4zm4.5 0h3v7h-3zm4.5 0h3v7h-3zm4.5 0h3v7h-3zM2 19h20v2.5H2z"/>,
  economy: <g><rect x="3" y="17.5" width="14" height="3.5" rx="1.6"/><rect x="5" y="13" width="14" height="3.5" rx="1.6"/><rect x="3.5" y="8.5" width="14" height="3.5" rx="1.6"/><rect x="6" y="4" width="14" height="3.5" rx="1.6"/></g>,
  military: <path d="M12 2 20.5 5v6.2c0 5.2-3.6 9.6-8.5 10.8-4.9-1.2-8.5-5.6-8.5-10.8V5zm0 5.2-1.3 2.9-3.1.3 2.3 2.1-.7 3.1 2.8-1.6 2.8 1.6-.7-3.1 2.3-2.1-3.1-.3z" fillRule="evenodd"/>,
  externalReputation: <path d="M4 2h2.2v20H4zm2.2 1.4c3-1.6 5.4 1.4 8.2 0 2.2-1.1 4-1 6 0v9.4c-2-1-3.8-1.1-6 0-2.8 1.4-5.2-1.6-8.2 0z"/>,
  internalLegitimacy: <g><circle cx="6.5" cy="8.5" r="2.7"/><circle cx="17.5" cy="8.5" r="2.7"/><circle cx="12" cy="6.5" r="3.2"/><path d="M1.5 20.5a5 5.6 0 0 1 10 0zm11 0a5 5.6 0 0 1 10 0z"/><path d="M5.8 21.5a6.2 7.4 0 0 1 12.4 0z"/></g>,
  personalResource: <path d="M7 7a5 5 0 1 1 0 10A5 5 0 0 1 7 7zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm4.6.8H22v2.6h-2v3.2h-2.4v-3.2h-1.4v2.2h-2.4v-2.2h-2.2z" fillRule="evenodd"/>,
};
export default function ResIcon({ k, value = 100, size = 24, color = "currentColor", dim = "var(--bdr2)" }) {
  const id = useId();
  const shape = RES_SHAPES[k];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ display:"block", flexShrink:0 }}>
      <defs><clipPath id={id}><rect x="0" y={24 * (1 - Math.max(0, Math.min(100, value)) / 100)} width="24" height="24"/></clipPath></defs>
      <g fill={dim}>{shape}</g>
      <g fill={color} clipPath={`url(#${id})`}>{shape}</g>
    </svg>
  );
}

