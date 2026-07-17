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

        <g className="brand-reveal__piece brand-reveal__piece--proof">
          <rect x="273" y="42" width="78" height="56" rx="8" />
          <circle cx="333" cy="59" r="5" />
          <path d="M283 86L300 68L313 79L322 70L341 89" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--report">
          <rect x="510" y="326" width="58" height="46" rx="8" />
          <path d="M524 359V347M539 359V339M554 359V345" />
          <path d="M522 366H557" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--audit">
          <path className="brand-reveal__connector" d="M33 184V238" />
          <circle cx="33" cy="184" r="7" />
          <circle cx="33" cy="211" r="7" />
          <circle cx="33" cy="238" r="7" />
          <path d="M48 184H71M48 211H63M48 238H76" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--assignment">
          <circle cx="221" cy="357" r="12" />
          <path d="M216 357L220 361L227 353" />
          <path className="brand-reveal__connector" d="M236 357H258" />
          <rect x="261" y="344" width="48" height="27" rx="6" />
          <path d="M271 354H298M271 362H288" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--workflow">
          <rect x="370" y="47" width="29" height="23" rx="5" />
          <rect x="432" y="47" width="29" height="23" rx="5" />
          <path className="brand-reveal__connector" d="M402 58H429" />
          <path d="M423 53L429 58L423 63" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--movement">
          <path className="brand-reveal__trace" d="M114 350C141 325 164 333 184 316C201 302 214 309 231 293" />
          <circle className="brand-reveal__pulse" cx="114" cy="350" r="5" />
          <circle cx="231" cy="293" r="5" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--status">
          <circle cx="559" cy="204" r="15" />
          <circle className="brand-reveal__pulse" cx="559" cy="204" r="5" />
          <path d="M559 180V172M559 236V228M535 204H527M591 204H583" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--dots">
          <circle cx="315" cy="64" r="5" />
          <circle cx="344" cy="82" r="4" />
          <circle cx="548" cy="201" r="5" />
          <circle cx="76" cy="190" r="4" />
          <circle cx="282" cy="345" r="5" />
        </g>
      </svg>

      <div className="brand-reveal__identity">
        <h1 className="brand-reveal__wordmark" aria-label="Polis Systems">
          {"POLIS SYSTEMS".split("").map((character, index) => (
            <span
              aria-hidden="true"
              key={`${character}-${index}`}
              className="brand-reveal__letter"
              style={{ animationDelay: `${2.05 + index * 0.06}s` }}
            >
              {character === " " ? "\u00A0" : character}
            </span>
          ))}
        </h1>
        <p className="brand-reveal__tagline">Cleaner Cities. Better Work.</p>
      </div>
    </div>
  );
}
