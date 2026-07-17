import { useEffect, useRef } from "react";

let brandRevealHasPlayed = false;

export function LandingBrandReveal() {
  const shouldAnimate = useRef(!brandRevealHasPlayed);

  useEffect(() => {
    if (shouldAnimate.current) brandRevealHasPlayed = true;
  }, []);

  return (
    <div
      className={`brand-reveal ${shouldAnimate.current ? "brand-reveal--playing" : "brand-reveal--complete"}`}
      role="img"
      aria-label="Polis Systems. Cleaner Cities. Better Work."
    >
      <div aria-hidden="true" className="brand-reveal__grid" />
      <svg aria-hidden="true" className="brand-reveal__art" viewBox="0 0 600 420" fill="none">
        <g className="brand-reveal__piece brand-reveal__piece--route">
          <path className="brand-reveal__draw" d="M42 92C104 39 164 121 238 69" />
          <circle cx="42" cy="92" r="6" />
          <circle cx="238" cy="69" r="6" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--task-left">
          <rect x="62" y="250" width="92" height="62" rx="10" />
          <path d="M80 270H132M80 287H118" />
          <circle cx="135" cy="289" r="5" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--task-right">
          <rect x="452" y="84" width="88" height="60" rx="10" />
          <path d="M469 104H522M469 121H505" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--pin">
          <path d="M500 269C500 285 479 304 479 304S458 285 458 269C458 257.4 467.4 248 479 248C490.6 248 500 257.4 500 269Z" />
          <circle cx="479" cy="269" r="6" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--check">
          <circle cx="183" cy="170" r="24" />
          <path className="brand-reveal__draw" d="M171 170L180 179L196 160" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--message">
          <path d="M375 292H427C438 292 447 283 447 272V248C447 237 438 228 427 228H389C378 228 369 237 369 248V306L385 292H375Z" />
          <path d="M389 250H427M389 268H416" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--dots">
          <circle cx="315" cy="64" r="5" />
          <circle cx="344" cy="82" r="4" />
          <circle cx="548" cy="201" r="5" />
          <circle cx="76" cy="190" r="4" />
          <circle cx="282" cy="345" r="5" />
        </g>
      </svg>

      <div aria-hidden="true" className="brand-reveal__identity">
        <div className="brand-reveal__mark">P</div>
        <div className="brand-reveal__wordmark" aria-hidden="true">
          {"POLIS SYSTEMS".split("").map((character, index) => (
            <span
              key={`${character}-${index}`}
              className="brand-reveal__letter"
              style={{ animationDelay: `${2.15 + index * 0.045}s` }}
            >
              {character === " " ? "\u00A0" : character}
            </span>
          ))}
        </div>
        <p className="brand-reveal__tagline">Cleaner Cities. Better Work.</p>
      </div>

      <div aria-hidden="true" className="brand-reveal__status">
        <span /> Operations connected
      </div>
    </div>
  );
}
