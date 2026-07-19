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
          <rect x="42" y="246" width="132" height="78" rx="10" />
          <circle className="brand-reveal__accent" cx="59" cy="266" r="5" />
          <text className="brand-reveal__label brand-reveal__status-old" x="71" y="269">PENDING</text>
          <text className="brand-reveal__label brand-reveal__status-new" x="71" y="269">ASSIGNED</text>
          <path d="M57 286H153M57 300H126" />
          <rect x="56" y="307" width="37" height="10" rx="5" />
          <text className="brand-reveal__micro-label" x="63" y="315">HIGH</text>
          <path d="M139 307L145 313L155 302" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--task-right">
          <rect x="510" y="42" width="54" height="98" rx="11" />
          <path d="M530 52H544" />
          <rect x="519" y="67" width="36" height="34" rx="7" />
          <path d="M526 78H548M526 88H542" />
          <path d="M535 101L530 108V101" />
          <circle className="brand-reveal__accent brand-reveal__pulse" cx="552" cy="62" r="5" />
          <text className="brand-reveal__micro-label" x="519" y="127">DUE 16:30</text>
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

        <g className="brand-reveal__piece brand-reveal__piece--message-secondary">
          <path d="M398 178H442C451 178 458 171 458 162V145C458 136 451 129 442 129H408C399 129 392 136 392 145V188L405 178H398Z" />
          <path d="M408 147H441M408 160H431" />
          <circle className="brand-reveal__accent" cx="441" cy="160" r="2.5" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--proof">
          <rect x="288" y="25" width="54" height="43" rx="7" />
          <rect x="362" y="25" width="54" height="43" rx="7" />
          <circle cx="331" cy="36" r="4" />
          <circle className="brand-reveal__accent" cx="405" cy="36" r="4" />
          <path d="M295 59L307 46L316 54L324 47L336 60M369 59L380 49L388 55L398 43L410 60" />
          <path className="brand-reveal__connector" d="M345 47H359" />
          <path d="M354 43L359 47L354 51" />
          <text className="brand-reveal__micro-label" x="296" y="79">BEFORE</text>
          <text className="brand-reveal__micro-label" x="372" y="79">AFTER</text>
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--report">
          <rect x="499" y="329" width="70" height="52" rx="8" />
          <path d="M513 363V350M528 363V342M543 363V347" />
          <path d="M511 369H548" />
          <path d="M553 340V355M547 349L553 355L559 349" />
          <text className="brand-reveal__micro-label" x="510" y="378">CSV</text>
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
          <path className="brand-reveal__connector" d="M420 48C452 48 470 60 498 78" />
          <path d="M489 77L498 78L495 69" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--movement">
          <path className="brand-reveal__trace" d="M114 350C141 325 164 333 184 316C201 302 214 309 231 293" />
          <circle className="brand-reveal__pulse" cx="114" cy="350" r="5" />
          <circle cx="231" cy="293" r="5" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--status">
          <rect x="493" y="174" width="76" height="20" rx="10" />
          <text className="brand-reveal__micro-label brand-reveal__status-old" x="506" y="187">UNVERIFIED</text>
          <g className="brand-reveal__verified-chip">
            <rect className="brand-reveal__status-verified" x="507" y="201" width="62" height="20" rx="10" />
            <path d="M516 211L520 215L526 207" />
            <text className="brand-reveal__micro-label" x="532" y="214">VERIFIED</text>
          </g>
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--collector">
          <rect x="35" y="342" width="132" height="58" rx="10" />
          <circle cx="57" cy="367" r="11" />
          <path d="M48 386C50 378 55 375 62 375C69 375 74 379 76 386" />
          <text className="brand-reveal__label" x="82" y="362">COLLECTOR</text>
          <text className="brand-reveal__micro-label" x="82" y="377">ID 024 · ZONE 3</text>
          <circle className="brand-reveal__accent brand-reveal__pulse" cx="151" cy="388" r="4" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--dashboard">
          <rect x="190" y="24" width="68" height="54" rx="8" />
          <rect x="199" y="33" width="20" height="15" rx="3" />
          <rect x="227" y="33" width="22" height="15" rx="3" />
          <rect x="199" y="55" width="50" height="14" rx="3" />
          <circle className="brand-reveal__accent" cx="243" cy="62" r="3" />
        </g>

        <g className="brand-reveal__piece brand-reveal__piece--metrics">
          <rect x="344" y="350" width="67" height="20" rx="10" />
          <text className="brand-reveal__micro-label" x="357" y="363">PLASTIC</text>
          <rect x="419" y="350" width="62" height="20" rx="10" />
          <text className="brand-reveal__micro-label" x="432" y="363">18.4 KG</text>
          <path className="brand-reveal__connector" d="M378 343V329H450V343" />
          <circle cx="378" cy="329" r="4" />
          <circle className="brand-reveal__accent" cx="450" cy="329" r="4" />
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
              style={{ animationDelay: `${4.7 + index * 0.055}s` }}
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
